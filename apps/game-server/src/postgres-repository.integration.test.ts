import { randomUUID } from "node:crypto";

import { Pool } from "pg";
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { buildApp } from "./app";
import type { FairnessSource } from "./application";
import type { AuthVerifier } from "./auth";
import { PostgresGameRepository } from "./postgres-repository";

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const issuedAt = "2026-08-18T10:00:00.000Z";
const authHeaders = { authorization: "Bearer integration-token" };
const openApps = new Set<ReturnType<typeof buildApp>>();
const admin = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;

const deterministicFairness: FairnessSource = {
  createServerSeed: () => "22".repeat(32),
  roulettePocket: () => 17,
  shuffleBlackjack: () => [
    { cardId: "db:player-1", rank: "5", suit: "hearts" },
    { cardId: "db:dealer-up", rank: "9", suit: "clubs" },
    { cardId: "db:player-2", rank: "6", suit: "diamonds" },
    { cardId: "db:dealer-hole", rank: "7", suit: "spades" },
    { cardId: "db:player-hit", rank: "2", suit: "clubs" },
    { cardId: "db:dealer-hit", rank: "K", suit: "hearts" },
  ],
};

function authenticatedAs(userId: string): AuthVerifier {
  return { verify: async (token) => token === "integration-token" ? userId : null };
}

function commandBase(commandId: string, tableId: string, expectedRevision: number) {
  return { commandId, expectedRevision, issuedAt, schemaVersion: 2 as const, tableId };
}

function createApp(userId: string) {
  if (!databaseUrl) throw new Error("SUPABASE_DATABASE_URL is required.");
  const app = buildApp({
    authVerifier: authenticatedAs(userId),
    clock: () => issuedAt,
    fairness: deterministicFairness,
    repository: new PostgresGameRepository({ connectionString: databaseUrl }),
  });
  openApps.add(app);
  return app;
}

afterEach(async () => {
  await Promise.all([...openApps].map((app) => app.close()));
  openApps.clear();
});

afterAll(async () => {
  await admin?.end();
});

databaseDescribe("Postgres game repository", () => {
  it("cancels a blocked transaction at the configured statement timeout and remains usable", async () => {
    if (!admin || !databaseUrl) throw new Error("Database pool is unavailable.");
    const tableId = `db-timeout-${randomUUID()}`;
    const repository = new PostgresGameRepository({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 500,
      query_timeout: 500,
      statement_timeout: 100,
    });
    const blocker = await admin.connect();
    try {
      await blocker.query("begin");
      await blocker.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`table:${tableId}`],
      );
      const startedAt = Date.now();

      await expect(repository.transact(
        randomUUID(),
        tableId,
        randomUUID(),
        () => {
          throw new Error("The mutation must not run while the table lock is held.");
        },
      )).rejects.toMatchObject({ code: "57014" });
      const elapsedMs = Date.now() - startedAt;
      expect(elapsedMs).toBeGreaterThanOrEqual(50);
      expect(elapsedMs).toBeLessThan(2_000);

      await blocker.query("rollback");
      await expect(repository.ping()).resolves.toBeUndefined();
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      blocker.release();
      await repository.close();
    }
  });

  it("persists an idempotent blackjack command, state, fairness, events and ledger atomically", async () => {
    if (!admin) throw new Error("Database pool is unavailable.");
    const userId = randomUUID();
    const tableId = `db-blackjack-${randomUUID()}`;
    const prepareId = randomUUID();
    const betId = randomUUID();
    const hitId = randomUUID();
    const standId = randomUUID();
    await admin.query(
      "insert into auth.users (id, email) values ($1, $2)",
      [userId, `${userId}@example.test`],
    );

    const firstApp = createApp(userId);
    const prepare = await firstApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(prepareId, tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    expect(prepare.statusCode).toBe(200);
    const roundId = prepare.json().snapshot.round.roundId as string;
    const betCommand = {
      ...commandBase(betId, tableId, 1),
      type: "BLACKJACK_PLACE_BET",
      payload: {
        amount: "100",
        clientSeed: "postgres-reconnect-seed",
        currency: "PLAY",
        roundId,
      },
    };
    const bet = await firstApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(bet.statusCode).toBe(200);
    expect(bet.json()).toMatchObject({
      revision: 2,
      snapshot: { balance: "9900", round: { phase: "player" } },
    });
    expect(JSON.stringify(bet.json())).not.toContain("db:dealer-hole");
    expect(JSON.stringify(bet.json())).not.toContain("22".repeat(32));
    await firstApp.close();
    openApps.delete(firstApp);

    const reconnectedApp = createApp(userId);
    const snapshot = await reconnectedApp.inject({
      headers: authHeaders,
      method: "GET",
      url: `/v2/tables/${tableId}/snapshot`,
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json()).toMatchObject({
      balance: "9900",
      revision: 2,
      round: { phase: "player" },
    });

    const hit = await reconnectedApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(hitId, tableId, 2),
        type: "BLACKJACK_ACTION",
        payload: { action: "hit", handId: "hand-1", roundId },
      },
    });
    expect(hit.statusCode).toBe(200);
    const stand = await reconnectedApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(standId, tableId, 3),
        type: "BLACKJACK_ACTION",
        payload: { action: "stand", handId: "hand-1", roundId },
      },
    });
    expect(stand.statusCode).toBe(200);
    expect(stand.json()).toMatchObject({
      revision: 4,
      snapshot: { balance: "10100", round: { phase: "settled" } },
    });

    const beforeReplay = await admin.query<{ readonly count: string }>(
      "select count(*) from game_private.game_events where table_id = $1",
      [tableId],
    );
    const replay = await reconnectedApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ revision: 2, status: "replayed" });

    const persisted = await admin.query<{
      readonly balance: string;
      readonly command_count: string;
      readonly event_count: string;
      readonly last_sequence: number;
      readonly ledger_amounts: string[];
      readonly revision: number;
    }>(
      `select w.balance,
              t.revision,
              t.last_sequence,
              (select count(*) from game_private.game_commands c where c.table_id = t.table_id) command_count,
              (select count(*) from game_private.game_events e where e.table_id = t.table_id) event_count,
              (select array_agg(le.amount::text order by le.created_at, le.id)
                 from game_private.ledger_entries le
                 join game_private.ledger_transactions lt on lt.id = le.transaction_id
                where lt.user_id = t.user_id) ledger_amounts
         from game_private.game_tables t
         join game_private.wallet_accounts w on w.user_id = t.user_id and w.currency = 'PLAY'
        where t.table_id = $1`,
      [tableId],
    );
    expect(persisted.rows[0]).toMatchObject({
      balance: "10100",
      command_count: "4",
      event_count: beforeReplay.rows[0]?.count,
      ledger_amounts: ["10000", "-100", "200"],
      revision: 4,
    });
    expect(persisted.rows[0]?.last_sequence).toBe(Number(persisted.rows[0]?.event_count));

    const hiddenEvent = await admin.query<{ readonly event: unknown }>(
      `select event
         from game_private.game_events
        where table_id = $1
          and event_type = 'blackjack.card.dealt'
          and payload->>'faceUp' = 'false'`,
      [tableId],
    );
    expect(hiddenEvent.rows[0]?.event).toMatchObject({
      payload: { faceUp: false, handId: "dealer", recipient: "dealer" },
    });
    expect(JSON.stringify(hiddenEvent.rows[0]?.event)).not.toContain("cardId");

    const fairness = await admin.query<{
      readonly client_seed: string;
      readonly revealed_at: Date;
      readonly server_seed: string;
    }>(
      "select client_seed, server_seed, revealed_at from game_private.fairness_records where round_id = $1",
      [roundId],
    );
    expect(fairness.rows[0]).toMatchObject({
      client_seed: "postgres-reconnect-seed",
      server_seed: "22".repeat(32),
    });
    expect(fairness.rows[0]?.revealed_at).toBeInstanceOf(Date);
  });

  it("persists roulette prepare, bets, spin, settlement and replay across a restart", async () => {
    if (!admin) throw new Error("Database pool is unavailable.");
    const userId = randomUUID();
    const tableId = `db-roulette-${randomUUID()}`;
    await admin.query(
      "insert into auth.users (id, email) values ($1, $2)",
      [userId, `${userId}@example.test`],
    );

    const firstApp = createApp(userId);
    const prepare = await firstApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(randomUUID(), tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "roulette" },
      },
    });
    expect(prepare.statusCode).toBe(200);
    const roundId = prepare.json().snapshot.round.roundId as string;
    const bets = await firstApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(randomUUID(), tableId, 1),
        type: "ROULETTE_PLACE_BETS",
        payload: {
          bets: [
            {
              amount: "10",
              betId: "db-straight-17",
              currency: "PLAY",
              selection: { pocket: 17, type: "straight" },
            },
            {
              amount: "20",
              betId: "db-red",
              currency: "PLAY",
              selection: { colour: "red", type: "red-black" },
            },
          ],
          clientSeed: "postgres-roulette-seed",
          roundId,
        },
      },
    });
    expect(bets.statusCode).toBe(200);
    expect(bets.json()).toMatchObject({
      revision: 2,
      snapshot: { balance: "9970", round: { totalWager: "30" } },
    });
    await firstApp.close();
    openApps.delete(firstApp);

    const reconnectedApp = createApp(userId);
    const reconnect = await reconnectedApp.inject({
      headers: authHeaders,
      method: "GET",
      url: `/v2/tables/${tableId}/snapshot`,
    });
    expect(reconnect.json()).toMatchObject({
      balance: "9970",
      revision: 2,
      round: { phase: "betting", totalWager: "30" },
    });
    const spinCommand = {
      ...commandBase(randomUUID(), tableId, 2),
      type: "ROULETTE_SPIN",
      payload: { roundId },
    };
    const spin = await reconnectedApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: spinCommand,
    });
    expect(spin.statusCode).toBe(200);
    expect(spin.json()).toMatchObject({
      revision: 3,
      snapshot: {
        balance: "10330",
        round: { phase: "settled", result: { colour: "black", pocket: 17 } },
      },
    });
    const replay = await reconnectedApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: spinCommand,
    });
    expect(replay.json()).toMatchObject({ revision: 3, status: "replayed" });

    const persisted = await admin.query<{
      readonly balance: string;
      readonly command_count: string;
      readonly event_count: string;
      readonly last_sequence: number;
      readonly ledger_amounts: string[];
      readonly payout: string;
      readonly revision: number;
      readonly status: string;
      readonly wager: string;
    }>(
      `select w.balance,
              t.revision,
              t.last_sequence,
              r.status,
              r.wager,
              r.payout,
              (select count(*) from game_private.game_commands c where c.table_id = t.table_id) command_count,
              (select count(*) from game_private.game_events e where e.table_id = t.table_id) event_count,
              (select array_agg(le.amount::text order by le.created_at, le.id)
                 from game_private.ledger_entries le
                 join game_private.ledger_transactions lt on lt.id = le.transaction_id
                where lt.user_id = t.user_id) ledger_amounts
         from game_private.game_tables t
         join game_private.wallet_accounts w on w.user_id = t.user_id and w.currency = 'PLAY'
         join game_private.game_rounds r on r.id = (t.round_state->>'roundId')::uuid
        where t.table_id = $1`,
      [tableId],
    );
    expect(persisted.rows[0]).toMatchObject({
      balance: "10330",
      command_count: "3",
      event_count: "11",
      ledger_amounts: ["10000", "-10", "-20", "360"],
      payout: "360",
      revision: 3,
      status: "settled",
      wager: "30",
    });
    expect(persisted.rows[0]?.last_sequence).toBe(11);

    const result = await admin.query<{ readonly payload: unknown }>(
      `select payload
         from game_private.game_events
        where table_id = $1 and event_type = 'roulette.result'`,
      [tableId],
    );
    expect(result.rows[0]?.payload).toEqual({ colour: "black", pocket: 17 });
  });

  it("serializes duplicate command retries and competing revisions across repository instances", async () => {
    if (!admin) throw new Error("Database pool is unavailable.");
    const userId = randomUUID();
    const tableId = `db-concurrency-${randomUUID()}`;
    await admin.query(
      "insert into auth.users (id, email) values ($1, $2)",
      [userId, `${userId}@example.test`],
    );
    const firstApp = createApp(userId);
    const secondApp = createApp(userId);
    const prepare = await firstApp.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(randomUUID(), tableId, 0),
        type: "PREPARE_ROUND",
        payload: { game: "blackjack" },
      },
    });
    const roundId = prepare.json().snapshot.round.roundId as string;
    const betCommand = {
      ...commandBase(randomUUID(), tableId, 1),
      type: "BLACKJACK_PLACE_BET",
      payload: {
        amount: "100",
        clientSeed: "postgres-concurrency-seed",
        currency: "PLAY",
        roundId,
      },
    };

    const duplicateResponses = await Promise.all([firstApp, secondApp].map((app) => app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: betCommand,
    })));
    expect(duplicateResponses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(duplicateResponses.map((response) => response.json().status).toSorted())
      .toEqual(["accepted", "replayed"]);

    const competingResponses = await Promise.all([
      { action: "hit", app: firstApp },
      { action: "stand", app: secondApp },
    ].map(({ action, app }) => app.inject({
      headers: authHeaders,
      method: "POST",
      url: `/v2/tables/${tableId}/commands`,
      payload: {
        ...commandBase(randomUUID(), tableId, 2),
        type: "BLACKJACK_ACTION",
        payload: { action, handId: "hand-1", roundId },
      },
    })));
    const accepted = competingResponses.filter((response) => response.json().status === "accepted");
    const rejected = competingResponses.filter((response) => response.json().status === "rejected");
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.json()).toMatchObject({ error: { code: "STALE_REVISION" } });

    const persisted = await admin.query<{
      readonly balance: string;
      readonly command_count: string;
      readonly credit_count: string;
      readonly event_count: string;
      readonly last_sequence: number;
      readonly revision: number;
      readonly wager_count: string;
    }>(
      `select w.balance,
              t.revision,
              t.last_sequence,
              (select count(*) from game_private.game_commands c where c.table_id = t.table_id) command_count,
              (select count(*) from game_private.game_events e where e.table_id = t.table_id) event_count,
              (select count(*)
                 from game_private.ledger_entries le
                 join game_private.ledger_transactions lt on lt.id = le.transaction_id
                where lt.user_id = t.user_id and le.amount = -100) wager_count,
              (select count(*)
                 from game_private.ledger_entries le
                 join game_private.ledger_transactions lt on lt.id = le.transaction_id
                where lt.user_id = t.user_id and le.amount = 200) credit_count
         from game_private.game_tables t
         join game_private.wallet_accounts w on w.user_id = t.user_id and w.currency = 'PLAY'
        where t.table_id = $1`,
      [tableId],
    );
    expect(persisted.rows[0]).toMatchObject({
      command_count: "4",
      revision: 3,
      wager_count: "1",
    });
    expect(["9900", "10100"]).toContain(persisted.rows[0]?.balance);
    expect(["0", "1"]).toContain(persisted.rows[0]?.credit_count);
    expect(persisted.rows[0]?.last_sequence).toBe(Number(persisted.rows[0]?.event_count));
  });
});
