import { EventEmitter } from "node:events";

import type { Client, ClientConfig, QueryResult } from "pg";
import { describe, expect, it } from "vitest";

import { PostgresGameEventBus } from "./postgres-event-bus";

class FakeClient extends EventEmitter {
  readonly queries: string[] = [];
  ended = false;

  constructor(readonly connectError?: Error) {
    super();
  }

  async connect(): Promise<void> {
    if (this.connectError) throw this.connectError;
  }

  async end(): Promise<void> {
    this.ended = true;
    this.emit("end");
  }

  async query(text: string): Promise<QueryResult<Record<string, unknown>>> {
    this.queries.push(text);
    return {
      command: "SELECT",
      fields: [],
      oid: 0,
      rowCount: 0,
      rows: [],
    };
  }

  asPgClient(): Client {
    return this as unknown as Client;
  }
}

function clientFactory(clients: readonly FakeClient[]) {
  let index = 0;
  return (_config: ClientConfig): Client => {
    const client = clients[index++];
    if (!client) throw new Error("No fake Postgres client remains.");
    return client.asPgClient();
  };
}

describe("Postgres game event bus", () => {
  it("reconnects with a fresh client after an established relay fails", async () => {
    const first = new FakeClient();
    const second = new FakeClient();
    const errors: unknown[] = [];
    const bus = new PostgresGameEventBus({
      clientFactory: clientFactory([first, second]),
      connectionString: "postgresql://example.invalid/postgres",
      onError: (error) => errors.push(error),
      reconnectDelayMs: 5,
    });

    await bus.start();
    expect(bus.isReady()).toBe(true);
    expect(first.queries).toEqual(["listen spelsajt_game_events_v2"]);

    const disconnectError = new Error("relay disconnected");
    first.emit("error", disconnectError);
    expect(bus.isReady()).toBe(false);

    await expect.poll(() => bus.isReady(), { interval: 5, timeout: 1_000 }).toBe(true);
    expect(errors).toEqual([disconnectError]);
    expect(first.ended).toBe(true);
    expect(second.queries).toEqual(["listen spelsajt_game_events_v2"]);

    await bus.close();
    expect(second.ended).toBe(true);
  });

  it("keeps retrying failed reconnects and stops retrying after close", async () => {
    const first = new FakeClient();
    const failedReconnect = new FakeClient(new Error("database unavailable"));
    const recovered = new FakeClient();
    const bus = new PostgresGameEventBus({
      clientFactory: clientFactory([first, failedReconnect, recovered]),
      connectionString: "postgresql://example.invalid/postgres",
      onError: () => undefined,
      reconnectDelayMs: 5,
    });

    await bus.start();
    first.emit("error", new Error("relay disconnected"));

    await expect.poll(() => bus.isReady(), { interval: 5, timeout: 1_000 }).toBe(true);
    expect(failedReconnect.ended).toBe(true);
    expect(recovered.queries).toEqual(["listen spelsajt_game_events_v2"]);

    await bus.close();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(bus.isReady()).toBe(false);
  });

  it("rejects an invalid reconnect delay before opening a client", () => {
    expect(() => new PostgresGameEventBus({
      connectionString: "postgresql://example.invalid/postgres",
      reconnectDelayMs: 0,
    })).toThrow("reconnectDelayMs must be a positive safe integer");
  });
});
