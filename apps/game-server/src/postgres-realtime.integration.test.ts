import { randomUUID } from "node:crypto";

import {
  gameEventV2Schema,
  gameSnapshotV2Schema,
  tableSubscriptionAckV2Schema,
  type GameEventV2,
  type GameSnapshotV2,
  type TableSubscriptionAckV2,
} from "@spelsajt/contracts";
import { Pool } from "pg";
import { io as createSocket, type Socket } from "socket.io-client";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app";
import type { FairnessSource } from "./application";
import type { AuthVerifier } from "./auth";
import { PostgresGameEventBus } from "./postgres-event-bus";
import { PostgresGameRepository } from "./postgres-repository";
import { attachRealtime, type GameRealtimeServer } from "./realtime";

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const admin = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const authHeaders = { authorization: "Bearer integration-token" };
const issuedAt = "2026-08-18T10:00:00.000Z";
const openApps = new Set<ReturnType<typeof buildApp>>();
const openRealtime = new Set<GameRealtimeServer>();
const openSockets = new Set<Socket>();

const deterministicFairness: FairnessSource = {
  createServerSeed: () => "44".repeat(32),
  roulettePocket: () => 17,
  shuffleBlackjack: () => [
    { cardId: "relay:player-1", rank: "5", suit: "hearts" },
    { cardId: "relay:dealer-up", rank: "9", suit: "clubs" },
    { cardId: "relay:player-2", rank: "6", suit: "diamonds" },
    { cardId: "relay:dealer-hole", rank: "7", suit: "spades" },
    { cardId: "relay:player-hit", rank: "2", suit: "clubs" },
    { cardId: "relay:dealer-hit", rank: "K", suit: "hearts" },
  ],
};

function authenticatedAs(userId: string): AuthVerifier {
  return { verify: async (token) => token === "integration-token" ? userId : null };
}

function commandBase(commandId: string, tableId: string, expectedRevision: number) {
  return { commandId, expectedRevision, issuedAt, schemaVersion: 2 as const, tableId };
}

async function createServer(userId: string) {
  if (!databaseUrl) throw new Error("SUPABASE_DATABASE_URL is required.");
  const eventBus = new PostgresGameEventBus({ connectionString: databaseUrl });
  const app = buildApp({
    authVerifier: authenticatedAs(userId),
    clock: () => issuedAt,
    eventBus,
    fairness: deterministicFairness,
    repository: new PostgresGameRepository({ connectionString: databaseUrl }),
  });
  openApps.add(app);
  await eventBus.start();
  const realtime = attachRealtime(app);
  openRealtime.add(realtime);
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  return { address, app };
}

async function connect(address: string): Promise<Socket> {
  const socket = createSocket(address, {
    auth: { accessToken: "integration-token", schemaVersion: 2 },
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

function subscribe(socket: Socket, tableId: string): Promise<TableSubscriptionAckV2> {
  return new Promise((resolve) => {
    socket.emit("table.subscribe", {
      lastSequence: 0,
      schemaVersion: 2,
      tableId,
    }, (payload: unknown) => resolve(tableSubscriptionAckV2Schema.parse(payload)));
  });
}

afterEach(async () => {
  for (const socket of openSockets) socket.close();
  openSockets.clear();
  await Promise.all([...openRealtime].map((io) => new Promise<void>((resolve) => {
    io.close(() => resolve());
  })));
  openRealtime.clear();
  await Promise.all([...openApps].map((app) => app.close()));
  openApps.clear();
});

afterAll(async () => {
  await admin?.end();
});

databaseDescribe("Postgres realtime relay", () => {
  it("streams one committed event sequence from server A to a socket on server B", async () => {
    if (!admin) throw new Error("Database pool is unavailable.");
    const userId = randomUUID();
    const tableId = `db-relay-${randomUUID()}`;
    await admin.query(
      "insert into auth.users (id, email) values ($1, $2)",
      [userId, `${userId}@example.test`],
    );
    const serverA = await createServer(userId);
    const serverB = await createServer(userId);

    const prepare = await serverA.app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(randomUUID(), tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    expect(prepare.statusCode).toBe(200);
    const roundId = prepare.json().snapshot.round.roundId as string;

    const remoteSocket = await connect(serverB.address);
    const snapshotPromise = snapshotOnce(remoteSocket);
    const subscription = await subscribe(remoteSocket, tableId);
    const snapshot = await snapshotPromise;
    expect(subscription).toMatchObject({ status: "accepted", tableId });
    expect(snapshot).toMatchObject({ lastSequence: 1, revision: 1, tableId });

    const localEvents: GameEventV2[] = [];
    const unsubscribeLocal = serverA.app.gameServices.eventBus.subscribe(tableId, (events) => {
      localEvents.push(...events);
    });
    const remoteEvents: GameEventV2[] = [];
    const remoteTurnChanged = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for relayed blackjack events.")),
        5_000,
      );
      remoteSocket.on("game.event", (payload: unknown) => {
        const event = gameEventV2Schema.parse(payload);
        remoteEvents.push(event);
        if (event.type === "blackjack.turn.changed") {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    const betCommand = {
      ...commandBase(randomUUID(), tableId, 1),
      type: "BLACKJACK_PLACE_BET",
      payload: {
        amount: "100",
        clientSeed: "postgres-relay-seed",
        currency: "PLAY",
        roundId,
      },
    };
    const bet = await serverA.app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(bet.statusCode).toBe(200);
    await remoteTurnChanged;

    expect(remoteEvents.map((event) => event.sequence)).toEqual(
      remoteEvents.map((_, index) => snapshot.lastSequence + index + 1),
    );
    const hidden = remoteEvents.find(
      (event) => event.type === "blackjack.card.dealt" && event.payload.faceUp === false,
    );
    expect(hidden?.payload).toEqual({
      faceUp: false,
      handId: "dealer",
      recipient: "dealer",
    });
    expect(JSON.stringify(hidden)).not.toContain("cardId");

    const replay = await serverA.app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(replay.json()).toMatchObject({ status: "replayed" });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(localEvents.map((event) => event.sequence)).toEqual(
      remoteEvents.map((event) => event.sequence),
    );
    expect(new Set(remoteEvents.map((event) => event.sequence)).size).toBe(remoteEvents.length);
    unsubscribeLocal();
  });
});
