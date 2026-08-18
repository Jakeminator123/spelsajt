import {
  gameEventV2Schema,
  gameSnapshotV2Schema,
  tableSubscriptionAckV2Schema,
  type GameEventV2,
  type GameSnapshotV2,
  type TableSubscriptionAckV2,
  type TableSubscriptionV2,
} from "@spelsajt/contracts";
import { io as createSocket, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import type { FairnessSource } from "./application";
import { buildApp } from "./app";
import type { AuthVerifier } from "./auth";
import { GameEventBus, type GameEventListener } from "./event-bus";
import { attachRealtime, type GameRealtimeServer } from "./realtime";

const issuedAt = "2026-08-18T10:00:00.000Z";
const userOne = "10000000-0000-4000-8000-000000000001";
const userTwo = "10000000-0000-4000-8000-000000000002";
const authHeaders = { authorization: "Bearer owner-token" };
const openApps = new Set<ReturnType<typeof buildApp>>();
const openRealtime = new Set<GameRealtimeServer>();
const openSockets = new Set<Socket>();

const authVerifier: AuthVerifier = {
  verify: async (token) => token === "owner-token"
    ? userOne
    : token === "other-token"
      ? userTwo
      : null,
};

const deterministicFairness: FairnessSource = {
  createServerSeed: () => "33".repeat(32),
  roulettePocket: () => 17,
  shuffleBlackjack: () => [
    { cardId: "live:player-1", rank: "5", suit: "hearts" },
    { cardId: "live:dealer-up", rank: "9", suit: "clubs" },
    { cardId: "live:player-2", rank: "6", suit: "diamonds" },
    { cardId: "live:dealer-hole", rank: "7", suit: "spades" },
    { cardId: "live:player-hit", rank: "2", suit: "clubs" },
    { cardId: "live:dealer-hit", rank: "K", suit: "hearts" },
  ],
};

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function sequentialIds(): () => string {
  let value = 1;
  return () => uuid(value++);
}

function commandBase(commandId: number, tableId: string, expectedRevision: number) {
  return {
    commandId: uuid(commandId),
    expectedRevision,
    issuedAt,
    schemaVersion: 2 as const,
    tableId,
  };
}

async function connect(address: string, token: string): Promise<Socket> {
  const socket = createSocket(address, {
    auth: { accessToken: token, schemaVersion: 2 },
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  openSockets.add(socket);
  await eventOnce(socket, "connect");
  return socket;
}

function eventOnce(socket: Socket, event: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}.`)), 5_000);
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function snapshotOnce(socket: Socket): Promise<GameSnapshotV2> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for table.snapshot.")), 5_000);
    socket.once("table.snapshot", (payload: unknown) => {
      clearTimeout(timer);
      resolve(gameSnapshotV2Schema.parse(payload));
    });
  });
}

function subscribe(socket: Socket, input: TableSubscriptionV2): Promise<TableSubscriptionAckV2> {
  return new Promise((resolve) => {
    socket.emit("table.subscribe", input, (payload: unknown) => {
      resolve(tableSubscriptionAckV2Schema.parse(payload));
    });
  });
}

class ReorderingEventBus extends GameEventBus {
  readonly batches: GameEventV2[][] = [];
  readonly #listeners = new Map<string, Set<GameEventListener>>();

  override publish(events: readonly GameEventV2[]): void {
    this.batches.push([...events]);
  }

  override subscribe(tableId: string, listener: GameEventListener): () => void {
    const listeners = this.#listeners.get(tableId) ?? new Set<GameEventListener>();
    listeners.add(listener);
    this.#listeners.set(tableId, listeners);
    return () => listeners.delete(listener);
  }

  release(batchIndex: number): void {
    const events = this.batches[batchIndex] ?? [];
    const tableId = events[0]?.tableId;
    if (!tableId) throw new Error(`Event batch ${batchIndex} does not exist.`);
    for (const listener of this.#listeners.get(tableId) ?? []) listener(events);
  }
}

afterEach(async () => {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
  await Promise.all([...openRealtime].map((io) => new Promise<void>((resolve) => io.close(() => resolve()))));
  openRealtime.clear();
  await Promise.all([...openApps].map((app) => app.close()));
  openApps.clear();
});

describe("game realtime", () => {
  it("repairs a sequence gap when committed publish batches arrive out of order", async () => {
    const eventBus = new ReorderingEventBus();
    const app = buildApp({
      authVerifier,
      clock: () => issuedAt,
      eventBus,
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
    });
    openApps.add(app);
    const io = attachRealtime(app);
    openRealtime.add(io);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const tableId = "reordered-realtime-blackjack";

    const prepare = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(701, tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    const roundId = prepare.json().snapshot.round.roundId as string;
    const socket = await connect(address, "owner-token");
    const snapshotPromise = snapshotOnce(socket);
    const ack = await subscribe(socket, { lastSequence: 0, schemaVersion: 2, tableId });
    const snapshot = await snapshotPromise;
    expect(ack.status).toBe("accepted");

    const received: GameEventV2[] = [];
    socket.on("game.event", (payload: unknown) => {
      received.push(gameEventV2Schema.parse(payload));
    });
    const bet = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(702, tableId, 1),
        type: "BLACKJACK_PLACE_BET",
        payload: {
          amount: "100",
          clientSeed: "reordered-publish-seed",
          currency: "PLAY",
          roundId,
        },
      },
    });
    const hit = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(703, tableId, 2),
        type: "BLACKJACK_ACTION",
        payload: { action: "hit", handId: "hand-1", roundId },
      },
    });
    expect(bet.statusCode).toBe(200);
    expect(hit.statusCode).toBe(200);

    const expected = [...(eventBus.batches[1] ?? []), ...(eventBus.batches[2] ?? [])]
      .toSorted((left, right) => left.sequence - right.sequence);
    const finalSequence = expected.at(-1)?.sequence;
    if (!finalSequence) throw new Error("Commands did not produce realtime events.");
    const repaired = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for repaired events.")), 5_000);
      socket.on("game.event", (payload: unknown) => {
        if (gameEventV2Schema.parse(payload).sequence === finalSequence) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    eventBus.release(2);
    await repaired;
    expect(received.map((event) => event.sequence)).toEqual(
      expected.map((event) => event.sequence),
    );
    expect(received[0]?.sequence).toBe(snapshot.lastSequence + 1);

    eventBus.release(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toHaveLength(expected.length);
  });

  it("anchors with a snapshot, streams committed events and reconnects without leaking hidden cards", async () => {
    const app = buildApp({
      authVerifier,
      clock: () => issuedAt,
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
    });
    openApps.add(app);
    const io = attachRealtime(app);
    openRealtime.add(io);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const tableId = "realtime-blackjack";

    const prepare = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(601, tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    expect(prepare.statusCode).toBe(200);
    const roundId = prepare.json().snapshot.round.roundId as string;

    const socket = await connect(address, "owner-token");
    const firstSnapshotPromise = snapshotOnce(socket);
    const firstAck = await subscribe(socket, {
      lastSequence: 0,
      schemaVersion: 2,
      tableId,
    });
    const firstSnapshot = await firstSnapshotPromise;
    expect(firstAck).toMatchObject({
      lastSequence: 1,
      status: "accepted",
      tableId,
    });
    expect(firstSnapshot).toMatchObject({ lastSequence: 1, revision: 1, tableId });

    const liveEvents: GameEventV2[] = [];
    const turnChanged = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for live blackjack events.")), 5_000);
      socket.on("game.event", (payload: unknown) => {
        const event = gameEventV2Schema.parse(payload);
        liveEvents.push(event);
        if (event.type === "blackjack.turn.changed") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const betCommand = {
      ...commandBase(602, tableId, 1),
      type: "BLACKJACK_PLACE_BET",
      payload: {
        amount: "100",
        clientSeed: "realtime-browser-seed",
        currency: "PLAY",
        roundId,
      },
    };
    const bet = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(bet.statusCode).toBe(200);
    await turnChanged;
    expect(liveEvents.map((event) => event.sequence)).toEqual(
      liveEvents.map((_, index) => index + 2),
    );
    const hidden = liveEvents.find(
      (event) => event.type === "blackjack.card.dealt" && event.payload.faceUp === false,
    );
    expect(hidden?.payload).toEqual({
      faceUp: false,
      handId: "dealer",
      recipient: "dealer",
    });
    expect(JSON.stringify(hidden)).not.toContain("cardId");

    const eventCountBeforeReplay = liveEvents.length;
    const replay = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ status: "replayed" });
    expect(liveEvents).toHaveLength(eventCountBeforeReplay);

    const disconnectedAt = liveEvents.at(-1)?.sequence ?? 0;
    socket.close();
    openSockets.delete(socket);
    const hit = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(603, tableId, 2),
        type: "BLACKJACK_ACTION",
        payload: { action: "hit", handId: "hand-1", roundId },
      },
    });
    expect(hit.statusCode).toBe(200);

    const reconnected = await connect(address, "owner-token");
    const reconnectSnapshotPromise = snapshotOnce(reconnected);
    const reconnectAck = await subscribe(reconnected, {
      lastSequence: disconnectedAt,
      schemaVersion: 2,
      tableId,
    });
    const reconnectSnapshot = await reconnectSnapshotPromise;
    expect(reconnectAck.status).toBe("accepted");
    expect(reconnectSnapshot.revision).toBe(3);
    expect(reconnectSnapshot.lastSequence).toBeGreaterThan(disconnectedAt);

    const other = await connect(address, "other-token");
    const denied = await subscribe(other, {
      lastSequence: 0,
      schemaVersion: 2,
      tableId,
    });
    expect(denied).toMatchObject({
      error: { code: "TABLE_NOT_FOUND" },
      status: "rejected",
    });
  });

  it("rejects a socket without a verified access token", async () => {
    const app = buildApp({ authVerifier });
    openApps.add(app);
    const io = attachRealtime(app);
    openRealtime.add(io);
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const socket = createSocket(address, {
      auth: { accessToken: "invalid-token", schemaVersion: 2 },
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    openSockets.add(socket);

    const error = await eventOnce(socket, "connect_error") as Error;
    expect(error.message).toBe("UNAUTHENTICATED");
    expect(socket.connected).toBe(false);
  });
});
