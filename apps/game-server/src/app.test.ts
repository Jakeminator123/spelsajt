import { afterEach, describe, expect, it } from "vitest";

import type { FairnessSource } from "./application";
import { buildApp } from "./app";
import type { AuthVerifier } from "./auth";
import { GameEventBus } from "./event-bus";
import { InMemoryGameRepository } from "./in-memory-repository";

const openApps: ReturnType<typeof buildApp>[] = [];
const issuedAt = "2026-08-18T10:00:00.000Z";
const userOne = "10000000-0000-4000-8000-000000000001";
const userTwo = "10000000-0000-4000-8000-000000000002";
const authHeaders = { authorization: "Bearer valid-token" };

const authenticatedAs = (userId: string): AuthVerifier => ({
  verify: async (token) => token === "valid-token" ? userId : null,
});

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}

function sequentialIds(): () => string {
  let value = 1;
  return () => uuid(value++);
}

const deterministicFairness: FairnessSource = {
  createServerSeed: () => "11".repeat(32),
  roulettePocket: () => 17,
  shuffleBlackjack: () => [
    { cardId: "test:player-1", rank: "5", suit: "hearts" },
    { cardId: "test:dealer-up", rank: "9", suit: "clubs" },
    { cardId: "test:player-2", rank: "6", suit: "diamonds" },
    { cardId: "test:dealer-hole", rank: "7", suit: "spades" },
    { cardId: "test:player-hit", rank: "2", suit: "clubs" },
    { cardId: "test:dealer-hit", rank: "K", suit: "hearts" },
  ],
};

class TinyEventPageRepository extends InMemoryGameRepository {
  readonly pageSizes: number[] = [];

  override async readEvents(
    userId: string,
    tableId: string,
    firstSequence: number,
    lastSequence: number,
    limit: number,
  ) {
    const events = await super.readEvents(
      userId,
      tableId,
      firstSequence,
      lastSequence,
      Math.min(limit, 2),
    );
    this.pageSizes.push(events.length);
    return events;
  }
}

class RecordingEventBus extends GameEventBus {
  readonly batches: number[][] = [];

  override publish(events: Parameters<GameEventBus["publish"]>[0]): void {
    this.batches.push(events.map((event) => event.sequence));
    super.publish(events);
  }
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

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("game server", () => {
  it("allows only configured browser origins over HTTP", async () => {
    const productionOrigin = "https://spelsajt.example";
    const previewOrigin = "https://preview.spelsajt.example";
    const app = buildApp({ webOrigins: [productionOrigin, previewOrigin] });
    openApps.push(app);

    const preview = await app.inject({
      headers: {
        "access-control-request-method": "GET",
        origin: previewOrigin,
      },
      method: "OPTIONS",
      url: "/health",
    });
    const unknown = await app.inject({
      headers: {
        "access-control-request-method": "GET",
        origin: "https://unknown.example",
      },
      method: "OPTIONS",
      url: "/health",
    });

    expect(preview.headers["access-control-allow-origin"]).toBe(previewOrigin);
    expect(unknown.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("reports a healthy play-money service", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      service: "game-server",
      status: "ok",
    });

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({
      service: "game-server",
      status: "ready",
    });
  });

  it("stays alive but rejects readiness while a durable dependency is unavailable", async () => {
    class UnavailableRepository extends InMemoryGameRepository {
      override async ping(): Promise<void> {
        throw new Error("database unavailable");
      }
    }
    const app = buildApp({ repository: new UnavailableRepository() });
    openApps.push(app);

    const health = await app.inject({ method: "GET", url: "/health" });
    const ready = await app.inject({ method: "GET", url: "/ready" });

    expect(health.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({
      service: "game-server",
      status: "not-ready",
    });
  });

  it("publishes the frozen MVP rulesets", async () => {
    const app = buildApp();
    openApps.push(app);

    const response = await app.inject({ method: "GET", url: "/v1/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      games: {
        blackjack: { decks: 6, rulesetId: "mvp-v2" },
        roulette: { pockets: 37, rulesetId: "mvp-v2" },
      },
      mode: "play-money",
    });
  });

  it("publishes committed command events through bounded sequence pages", async () => {
    const repository = new TinyEventPageRepository();
    const eventBus = new RecordingEventBus();
    const app = buildApp({
      authVerifier: authenticatedAs(userOne),
      clock: () => issuedAt,
      eventBus,
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
      repository,
    });
    openApps.push(app);
    const tableId = "paged-blackjack";

    const prepare = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(901, tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    const roundId = prepare.json().snapshot.round.roundId as string;
    const bet = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(902, tableId, 1),
        type: "BLACKJACK_PLACE_BET",
        payload: {
          amount: "100",
          clientSeed: "paged-event-read",
          currency: "PLAY",
          roundId,
        },
      },
    });

    expect(prepare.statusCode).toBe(200);
    expect(bet.statusCode).toBe(200);
    expect(repository.pageSizes).toEqual([1, 2, 2, 2, 1]);
    expect(eventBus.batches.flat()).toEqual(
      Array.from({ length: bet.json().lastSequence as number }, (_, index) => index + 1),
    );
  });

  it("plays blackjack through prepare, bet, hit, stand, replay and reconnect", async () => {
    const repository = new InMemoryGameRepository();
    const app = buildApp({
      authVerifier: authenticatedAs(userOne),
      clock: () => issuedAt,
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
      repository,
    });
    openApps.push(app);
    const tableId = "table-blackjack-integration";

    const prepareResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(101, tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    expect(prepareResponse.statusCode).toBe(200);
    const prepareAck = prepareResponse.json();
    expect(prepareAck).toMatchObject({
      revision: 1,
      snapshot: {
        balance: "10000",
        game: "blackjack",
        round: { phase: "prepared" },
      },
      status: "accepted",
    });
    const roundId = prepareAck.snapshot.round.roundId as string;

    const betCommand = {
      ...commandBase(102, tableId, 1),
      type: "BLACKJACK_PLACE_BET",
      payload: {
        amount: "100",
        clientSeed: "blackjack-browser-seed",
        currency: "PLAY",
        roundId,
      },
    };
    const betResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(betResponse.statusCode).toBe(200);
    expect(betResponse.json()).toMatchObject({
      revision: 2,
      snapshot: {
        balance: "9900",
        round: {
          activeHandId: "hand-1",
          dealerCards: [
            { card: { cardId: "test:dealer-up" }, faceUp: true },
            { faceUp: false },
          ],
          phase: "player",
        },
      },
      status: "accepted",
    });

    const staleResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(103, tableId, 1),
        type: "BLACKJACK_ACTION",
        payload: { action: "hit", handId: "hand-1", roundId },
      },
    });
    expect(staleResponse.statusCode).toBe(409);
    expect(staleResponse.json()).toMatchObject({
      error: { code: "STALE_REVISION" },
      revision: 2,
      status: "rejected",
    });

    const hitResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(104, tableId, 2),
        type: "BLACKJACK_ACTION",
        payload: { action: "hit", handId: "hand-1", roundId },
      },
    });
    expect(hitResponse.statusCode).toBe(200);
    expect(hitResponse.json()).toMatchObject({
      revision: 3,
      snapshot: { round: { phase: "player" } },
    });

    const standResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(105, tableId, 3),
        type: "BLACKJACK_ACTION",
        payload: { action: "stand", handId: "hand-1", roundId },
      },
    });
    expect(standResponse.statusCode).toBe(200);
    expect(standResponse.json()).toMatchObject({
      revision: 4,
      snapshot: {
        balance: "10100",
        round: { phase: "settled" },
      },
    });

    const beforeReplay = await repository.read(userOne, tableId);
    const replayResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json()).toMatchObject({ revision: 2, status: "replayed" });
    const afterReplay = await repository.read(userOne, tableId);
    expect(afterReplay?.balance).toBe(beforeReplay?.balance);
    expect(afterReplay?.events).toEqual(beforeReplay?.events);
    expect(afterReplay?.revision).toBe(4);

    const conflictResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...betCommand,
        payload: { ...betCommand.payload, amount: "200" },
      },
    });
    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      revision: 4,
      status: "rejected",
    });

    const snapshotResponse = await app.inject({
      headers: authHeaders,
      method: "GET",
      url: `/v2/tables/${tableId}/snapshot`,
    });
    expect(snapshotResponse.statusCode).toBe(200);
    expect(snapshotResponse.json()).toMatchObject({
      balance: "10100",
      lastSequence: afterReplay?.lastSequence,
      revision: 4,
      round: { phase: "settled" },
    });

    const events = afterReplay?.events ?? [];
    expect(events.map((event) => event.sequence)).toEqual(
      events.map((_, index) => index + 1),
    );
    expect(events.map((event) => event.revision)).toEqual(
      [...events.map((event) => event.revision)].sort((left, right) => left - right),
    );
    const hiddenDeal = events.find(
      (event) => event.type === "blackjack.card.dealt" && event.payload.faceUp === false,
    );
    expect(hiddenDeal).toBeDefined();
    expect(hiddenDeal?.payload).toEqual({
      faceUp: false,
      handId: "dealer",
      recipient: "dealer",
    });
  });

  it("plays roulette through open, batched bets, lock, spin and settlement", async () => {
    const repository = new InMemoryGameRepository();
    const app = buildApp({
      authVerifier: authenticatedAs(userOne),
      clock: () => issuedAt,
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
      repository,
    });
    openApps.push(app);
    const tableId = "table-roulette-integration";

    const prepareResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(201, tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "roulette" },
      },
    });
    const prepareAck = prepareResponse.json();
    expect(prepareResponse.statusCode).toBe(200);
    expect(prepareAck).toMatchObject({
      revision: 1,
      snapshot: { round: { phase: "betting", totalWager: "0" } },
    });
    const roundId = prepareAck.snapshot.round.roundId as string;

    const betsResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(202, tableId, 1),
        type: "ROULETTE_PLACE_BETS",
        payload: {
          bets: [
            {
              amount: "10",
              betId: "straight-17",
              currency: "PLAY",
              selection: { pocket: 17, type: "straight" },
            },
            {
              amount: "20",
              betId: "red",
              currency: "PLAY",
              selection: { colour: "red", type: "red-black" },
            },
          ],
          clientSeed: "roulette-browser-seed",
          roundId,
        },
      },
    });
    expect(betsResponse.statusCode).toBe(200);
    expect(betsResponse.json()).toMatchObject({
      revision: 2,
      snapshot: { balance: "9970", round: { totalWager: "30" } },
    });

    const spinCommand = {
      ...commandBase(203, tableId, 2),
      type: "ROULETTE_SPIN",
      payload: { roundId },
    };
    const spinResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: spinCommand,
    });
    expect(spinResponse.statusCode).toBe(200);
    expect(spinResponse.json()).toMatchObject({
      revision: 3,
      snapshot: {
        balance: "10330",
        round: { phase: "settled", result: { colour: "black", pocket: 17 } },
      },
      status: "accepted",
    });

    const stored = await repository.read(userOne, tableId);
    expect(stored?.events.map((event) => event.type)).toEqual([
      "round.prepared",
      "roulette.betting.opened",
      "roulette.bet.placed",
      "roulette.bet.placed",
      "round.started",
      "roulette.bets.locked",
      "roulette.spin.started",
      "roulette.result",
      "roulette.bet.settled",
      "roulette.bet.settled",
      "round.settled",
    ]);

    const replayResponse = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: spinCommand,
    });
    expect(replayResponse.statusCode).toBe(200);
    expect(replayResponse.json()).toMatchObject({ revision: 3, status: "replayed" });
    expect((await repository.read(userOne, tableId))?.events).toEqual(stored?.events);
  });

  it("rejects a command whose body targets another table", async () => {
    const app = buildApp({ authVerifier: authenticatedAs(userOne) });
    openApps.push(app);

    const response = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: "/v2/tables/table-a/commands",
      payload: {
        ...commandBase(301, "table-b", 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
      status: "rejected",
    });
  });

  it("requires a verified bearer token for v2 state", async () => {
    const app = buildApp({ authVerifier: authenticatedAs(userOne) });
    openApps.push(app);

    const missing = await app.inject({
      method: "GET",
      url: "/v2/tables/private-table/snapshot",
    });
    const invalid = await app.inject({
      headers: { authorization: "Bearer invalid-token" },
      method: "GET",
      url: "/v2/tables/private-table/snapshot",
    });

    expect(missing.statusCode).toBe(401);
    expect(invalid.statusCode).toBe(401);
  });

  it("does not reveal a table owned by another authenticated user", async () => {
    const repository = new InMemoryGameRepository();
    const ownerApp = buildApp({
      authVerifier: authenticatedAs(userOne),
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
      repository,
    });
    const otherApp = buildApp({
      authVerifier: authenticatedAs(userTwo),
      repository,
    });
    openApps.push(ownerApp, otherApp);
    const tableId = "owner-isolated-table";

    const created = await ownerApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(401, tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    const hidden = await otherApp.inject({
      headers: authHeaders,
      method: "GET",
      url: `/v2/tables/${tableId}/snapshot`,
    });

    expect(created.statusCode).toBe(200);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual({ error: "TABLE_NOT_FOUND" });
  });

  it("rejects commandId reuse on another table without creating state", async () => {
    const app = buildApp({
      authVerifier: authenticatedAs(userOne),
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
    });
    openApps.push(app);
    const commandId = 501;

    const first = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: "/v2/tables/idempotency-a/commands",
      payload: {
        ...commandBase(commandId, "idempotency-a", 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    const conflict = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: "/v2/tables/idempotency-b/commands",
      payload: {
        ...commandBase(commandId, "idempotency-b", 0),
        type: "PREPARE_ROUND",
        payload: { game: "roulette" },
      },
    });
    const missing = await app.inject({
      headers: authHeaders,
      method: "GET",
      url: "/v2/tables/idempotency-b/snapshot",
    });

    expect(first.statusCode).toBe(200);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
      status: "rejected",
    });
    expect(missing.statusCode).toBe(404);
  });

  it("preserves one shared PLAY balance when the same user opens another table", async () => {
    const app = buildApp({
      authVerifier: authenticatedAs(userOne),
      fairness: deterministicFairness,
      idGenerator: sequentialIds(),
    });
    openApps.push(app);
    const firstTableId = "shared-wallet-a";
    const secondTableId = "shared-wallet-b";

    const firstPrepare = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${firstTableId}/commands`,
      payload: {
        ...commandBase(601, firstTableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    const roundId = firstPrepare.json().snapshot.round.roundId as string;
    const wager = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${firstTableId}/commands`,
      payload: {
        ...commandBase(602, firstTableId, 1),
        type: "BLACKJACK_PLACE_BET",
        payload: {
          amount: "100",
          clientSeed: "shared-wallet-test",
          currency: "PLAY",
          roundId,
        },
      },
    });
    const secondPrepare = await app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${secondTableId}/commands`,
      payload: {
        ...commandBase(603, secondTableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "roulette" },
      },
    });
    const firstSnapshot = await app.inject({
      headers: authHeaders,
      method: "GET",
      url: `/v2/tables/${firstTableId}/snapshot`,
    });

    expect(firstPrepare.statusCode).toBe(200);
    expect(wager.statusCode).toBe(200);
    expect(wager.json().snapshot.balance).toBe("9900");
    expect(secondPrepare.statusCode).toBe(200);
    expect(secondPrepare.json().snapshot.balance).toBe("9900");
    expect(firstSnapshot.json().balance).toBe("9900");
  });
});
