import { gameEventV2Schema, type GameEventV2 } from "@spelsajt/contracts";
import { Client, type ClientConfig } from "pg";

import {
  GameEventBus,
  type GameEventBusPort,
  type GameEventListener,
} from "./event-bus";
import {
  parsePostgresGameEventNotification,
  postgresGameEventChannel,
} from "./postgres-event-notification";

export interface PostgresGameEventBusOptions extends ClientConfig {
  readonly connectionString: string;
  readonly onError?: (error: unknown) => void;
}

/**
 * Cross-process relay for events whose NOTIFY is committed with the event row.
 * The notification contains only a table/sequence cursor; the validated event
 * is always loaded from the durable private table before socket fan-out.
 */
export class PostgresGameEventBus implements GameEventBusPort {
  readonly #client: Client;
  readonly #local = new GameEventBus();
  readonly #lastSequence = new Map<string, number>();
  readonly #onError: (error: unknown) => void;
  #closed = false;
  #pending: Promise<void> = Promise.resolve();
  #ready = false;
  #startPromise: Promise<void> | null = null;

  constructor(options: PostgresGameEventBusOptions) {
    const { onError, ...clientConfig } = options;
    this.#client = new Client(clientConfig);
    this.#onError = onError ?? ((error) => {
      process.emitWarning(error instanceof Error ? error : String(error));
    });
    this.#client.on("error", (error) => {
      this.#ready = false;
      this.#onError(error);
    });
    this.#client.on("notification", (notification) => {
      if (this.#closed) return;
      if (notification.channel !== postgresGameEventChannel || !notification.payload) return;
      this.#pending = this.#pending
        .then(() => this.#loadAndPublish(notification.payload!))
        .catch((error: unknown) => {
          this.#onError(error);
        });
    });
  }

  start(): Promise<void> {
    if (this.#closed) return Promise.reject(new Error("The Postgres event bus is closed."));
    this.#startPromise ??= this.#connect();
    return this.#startPromise;
  }

  isReady(): boolean {
    return this.#ready;
  }

  publish(events: readonly GameEventV2[]): void {
    const ordered = events
      .map((event) => gameEventV2Schema.parse(event))
      .toSorted((left, right) => left.sequence - right.sequence);
    const unseen: GameEventV2[] = [];
    for (const event of ordered) {
      const lastSequence = this.#lastSequence.get(event.tableId) ?? 0;
      if (event.sequence <= lastSequence) continue;
      this.#lastSequence.set(event.tableId, event.sequence);
      unseen.push(event);
    }
    this.#local.publish(unseen);
  }

  subscribe(tableId: string, listener: GameEventListener): () => void {
    return this.#local.subscribe(tableId, listener);
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#ready = false;
    await this.#pending;
    if (this.#startPromise) {
      try {
        await this.#startPromise;
      } catch {
        // Preserve the startup error already reported by the caller.
      }
      await this.#client.end();
    }
  }

  async #connect(): Promise<void> {
    await this.#client.connect();
    await this.#client.query(`listen ${postgresGameEventChannel}`);
    this.#ready = true;
  }

  async #loadAndPublish(payload: string): Promise<void> {
    const notification = parsePostgresGameEventNotification(payload);
    const result = await this.#client.query<{ readonly event: unknown }>(
      `select event
         from game_private.game_events
        where table_id = $1 and sequence = $2`,
      [notification.tableId, notification.sequence],
    );
    const stored = result.rows[0]?.event;
    if (!stored) {
      throw new Error(
        `Committed game event ${notification.tableId}:${notification.sequence} was not found.`,
      );
    }
    this.publish([gameEventV2Schema.parse(stored)]);
  }
}
