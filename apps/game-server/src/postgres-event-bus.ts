import { gameEventV2Schema, type GameEventV2 } from "@spelsajt/contracts";
import { Client, type ClientConfig } from "pg";

import {
  GameEventBus,
  type GameEventBusPort,
  type GameEventBusReadinessListener,
  type GameEventListener,
} from "./event-bus";
import {
  parsePostgresGameEventNotification,
  postgresGameEventChannel,
} from "./postgres-event-notification";

export interface PostgresGameEventBusOptions extends ClientConfig {
  readonly connectionString: string;
  readonly clientFactory?: (config: ClientConfig) => Client;
  readonly closeTimeoutMs?: number;
  readonly onError?: (error: unknown) => void;
  readonly reconnectDelayMs?: number;
}

const defaultPostgresConnectionTimeoutMs = 5_000;
const defaultPostgresOperationTimeoutMs = 10_000;
const defaultPostgresRelayCloseTimeoutMs = 5_000;

/**
 * Cross-process relay for events whose NOTIFY is committed with the event row.
 * The notification contains only a table/sequence cursor; the validated event
 * is always loaded from the durable private table before socket fan-out.
 */
export class PostgresGameEventBus implements GameEventBusPort {
  readonly #clientConfig: ClientConfig;
  readonly #createClient: (config: ClientConfig) => Client;
  readonly #closeTimeoutMs: number;
  readonly #local = new GameEventBus();
  readonly #lastSequence = new Map<string, number>();
  readonly #onError: (error: unknown) => void;
  readonly #readinessListeners = new Set<GameEventBusReadinessListener>();
  readonly #reconnectDelayMs: number;
  #client: Client | null = null;
  #closed = false;
  #connecting: Promise<void> | null = null;
  #hasConnected = false;
  #pending: Promise<void> = Promise.resolve();
  #ready = false;
  #reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: PostgresGameEventBusOptions) {
    const {
      clientFactory,
      closeTimeoutMs = defaultPostgresRelayCloseTimeoutMs,
      onError,
      reconnectDelayMs = 1_000,
      ...clientConfig
    } = options;
    if (!Number.isSafeInteger(closeTimeoutMs) || closeTimeoutMs <= 0) {
      throw new Error("closeTimeoutMs must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(reconnectDelayMs) || reconnectDelayMs <= 0) {
      throw new Error("reconnectDelayMs must be a positive safe integer.");
    }
    this.#clientConfig = {
      connectionTimeoutMillis: defaultPostgresConnectionTimeoutMs,
      query_timeout: defaultPostgresOperationTimeoutMs,
      statement_timeout: defaultPostgresOperationTimeoutMs,
      ...clientConfig,
    };
    this.#createClient = clientFactory ?? ((config) => new Client(config));
    this.#closeTimeoutMs = closeTimeoutMs;
    this.#onError = onError ?? ((error) => {
      process.emitWarning(error instanceof Error ? error : String(error));
    });
    this.#reconnectDelayMs = reconnectDelayMs;
  }

  start(): Promise<void> {
    if (this.#closed) return Promise.reject(new Error("The Postgres event bus is closed."));
    if (this.#ready) return Promise.resolve();
    return this.#connect();
  }

  isReady(): boolean {
    return this.#ready;
  }

  onReadinessChange(listener: GameEventBusReadinessListener): () => void {
    this.#readinessListeners.add(listener);
    return () => this.#readinessListeners.delete(listener);
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
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#setReady(false);
    const client = this.#client;
    this.#client = null;
    const cleanup = [this.#pending];
    if (this.#connecting) cleanup.push(this.#connecting);
    if (client) cleanup.push(endClient(client));
    await settleWithin(Promise.allSettled(cleanup), this.#closeTimeoutMs);
  }

  #connect(): Promise<void> {
    if (this.#closed) return Promise.reject(new Error("The Postgres event bus is closed."));
    if (this.#connecting) return this.#connecting;
    const connecting = this.#connectClient();
    this.#connecting = connecting;
    void connecting.then(
      () => {
        if (this.#connecting === connecting) this.#connecting = null;
      },
      () => {
        if (this.#connecting === connecting) this.#connecting = null;
      },
    );
    return connecting;
  }

  async #connectClient(): Promise<void> {
    const client = this.#createClient(this.#clientConfig);
    this.#client = client;
    client.on("error", (error) => this.#failClient(client, error));
    client.on("end", () => {
      this.#failClient(client, new Error("The Postgres event relay connection ended."));
    });
    client.on("notification", (notification) => {
      if (this.#closed || this.#client !== client) return;
      if (notification.channel !== postgresGameEventChannel || !notification.payload) return;
      this.#pending = this.#pending
        .then(() => this.#loadAndPublish(client, notification.payload!))
        .catch((error: unknown) => this.#failClient(client, error));
    });
    try {
      await client.connect();
      await client.query(`listen ${postgresGameEventChannel}`);
    } catch (error) {
      if (this.#client === client) this.#client = null;
      await endClient(client);
      throw error;
    }
    if (this.#closed || this.#client !== client) {
      if (this.#client === client) this.#client = null;
      await endClient(client);
      throw new Error("The Postgres event bus closed while connecting.");
    }
    this.#hasConnected = true;
    this.#setReady(true);
  }

  #failClient(client: Client, error: unknown): void {
    if (this.#closed || this.#client !== client) return;
    this.#client = null;
    this.#setReady(false);
    this.#reportError(error);
    void endClient(client);
    if (this.#hasConnected) this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#ready || this.#reconnectTimer) return;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#connect().catch((error: unknown) => {
        if (this.#closed) return;
        this.#reportError(error);
        this.#scheduleReconnect();
      });
    }, this.#reconnectDelayMs);
    this.#reconnectTimer.unref();
  }

  #reportError(error: unknown): void {
    try {
      this.#onError(error);
    } catch {
      // Error reporting must not disable reconnect or crash the event loop.
    }
  }

  #setReady(ready: boolean): void {
    if (this.#ready === ready) return;
    this.#ready = ready;
    for (const listener of this.#readinessListeners) {
      try {
        listener(ready);
      } catch {
        // A faulty observer must not hide relay availability from other observers.
      }
    }
  }

  async #loadAndPublish(client: Client, payload: string): Promise<void> {
    if (this.#client !== client || !this.#ready) return;
    const notification = parsePostgresGameEventNotification(payload);
    const result = await client.query<{ readonly event: unknown }>(
      `select event
         from game_private.game_events
        where table_id = $1 and sequence = $2`,
      [notification.tableId, notification.sequence],
    );
    if (this.#closed || this.#client !== client || !this.#ready) return;
    const stored = result.rows[0]?.event;
    if (!stored) {
      throw new Error(
        `Committed game event ${notification.tableId}:${notification.sequence} was not found.`,
      );
    }
    this.publish([gameEventV2Schema.parse(stored)]);
  }
}

async function settleWithin(operation: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | null = null;
  await Promise.race([
    operation,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

async function endClient(client: Client): Promise<void> {
  try {
    await client.end();
  } catch {
    // A broken relay connection is already unavailable; cleanup is best effort.
  }
}
