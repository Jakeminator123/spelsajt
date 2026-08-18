import { mvpRuleset } from "@spelsajt/config";
import {
  commandAckV2Schema,
  gameEventV2Schema,
  type CommandAckV2,
  type GameEventV2,
} from "@spelsajt/contracts";
import { Pool, type PoolClient, type PoolConfig } from "pg";

import {
  CommandIdConflictError,
  TableOwnershipError,
  type GameRepository,
  type RepositoryMutation,
  type StoredCommandReceipt,
  type StoredLedgerEntry,
  type StoredRound,
  type StoredTable,
} from "./repository";
import {
  encodePostgresGameEventNotification,
  postgresGameEventChannel,
} from "./postgres-event-notification";

const startingBalance = Number(mvpRuleset.currency.startingBalance);
const defaultPostgresConnectionTimeoutMs = 5_000;
const defaultPostgresOperationTimeoutMs = 10_000;

interface TableRow {
  readonly game: "blackjack" | "roulette" | null;
  readonly last_sequence: number;
  readonly next_nonce: string;
  readonly revision: number;
  readonly round_state: StoredRound | null;
  readonly table_id: string;
  readonly user_id: string;
}

interface WalletRow {
  readonly balance: string;
  readonly id: string;
}

export interface PostgresGameRepositoryOptions extends PoolConfig {
  readonly connectionString: string;
}

/** Direct-Postgres adapter for the server-only game_private schema. */
export class PostgresGameRepository implements GameRepository {
  readonly #pool: Pool;

  constructor(options: PostgresGameRepositoryOptions) {
    this.#pool = new Pool({
      connectionTimeoutMillis: defaultPostgresConnectionTimeoutMs,
      query_timeout: defaultPostgresOperationTimeoutMs,
      statement_timeout: defaultPostgresOperationTimeoutMs,
      ...options,
    });
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }

  async ping(): Promise<void> {
    const result = await this.#pool.query<{ readonly ready: boolean }>(
      `with required_columns (table_name, column_name) as (
         values
           ('game_tables', 'table_id'),
           ('game_tables', 'user_id'),
           ('game_tables', 'game'),
           ('game_tables', 'revision'),
           ('game_tables', 'last_sequence'),
           ('game_tables', 'next_nonce'),
           ('game_tables', 'round_state'),
           ('game_commands', 'command_id'),
           ('game_commands', 'table_id'),
           ('game_commands', 'user_id'),
           ('game_commands', 'fingerprint'),
           ('game_commands', 'ack'),
           ('game_events', 'event_id'),
           ('game_events', 'table_id'),
           ('game_events', 'round_id'),
           ('game_events', 'sequence'),
           ('game_events', 'revision'),
           ('game_events', 'event_type'),
           ('game_events', 'payload'),
           ('game_events', 'occurred_at'),
           ('game_events', 'event'),
           ('game_rounds', 'id'),
           ('game_rounds', 'table_id'),
           ('game_rounds', 'user_id'),
           ('game_rounds', 'game'),
           ('game_rounds', 'ruleset_version'),
           ('game_rounds', 'status'),
           ('game_rounds', 'wager'),
           ('game_rounds', 'payout'),
           ('game_rounds', 'outcome'),
           ('fairness_records', 'round_id'),
           ('fairness_records', 'commitment'),
           ('fairness_records', 'server_seed'),
           ('fairness_records', 'client_seed'),
           ('fairness_records', 'nonce'),
           ('fairness_records', 'algorithm'),
           ('fairness_records', 'revealed_at'),
           ('wallet_accounts', 'id'),
           ('wallet_accounts', 'user_id'),
           ('wallet_accounts', 'currency'),
           ('wallet_accounts', 'balance'),
           ('ledger_transactions', 'id'),
           ('ledger_transactions', 'user_id'),
           ('ledger_transactions', 'round_id'),
           ('ledger_transactions', 'transaction_type'),
           ('ledger_transactions', 'idempotency_key'),
           ('ledger_transactions', 'metadata'),
           ('ledger_entries', 'id'),
           ('ledger_entries', 'transaction_id'),
           ('ledger_entries', 'account_id'),
           ('ledger_entries', 'amount'),
           ('ledger_entries', 'entry_index'),
           ('ledger_entries', 'entry_type'),
           ('ledger_entries', 'metadata')
       )
       select count(columns.column_name) = (select count(*) from required_columns) as ready
         from required_columns required
         left join information_schema.columns columns
           on columns.table_schema = 'game_private'
          and columns.table_name = required.table_name
          and columns.column_name = required.column_name`,
    );
    if (result.rows[0]?.ready !== true) {
      throw new Error("The Postgres game schema is not fully migrated.");
    }
  }

  async read(userId: string, tableId: string): Promise<StoredTable | null> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      const table = await selectTable(client, tableId);
      if (!table) {
        await client.query("commit");
        return null;
      }
      assertOwner(table, userId);
      const stored = await hydrateTable(client, table);
      await client.query("commit");
      return stored;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async transact<T>(
    userId: string,
    tableId: string,
    commandId: string,
    operation: (
      current: StoredTable | null,
      currentBalance: number | null,
    ) => RepositoryMutation<T>,
  ): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query("begin");
      await advisoryLock(client, `command:${commandId}`);
      await advisoryLock(client, `user:${userId}`);
      await advisoryLock(client, `table:${tableId}`);

      const table = await selectTable(client, tableId);
      if (table) assertOwner(table, userId);
      const current = table ? await hydrateTable(client, table, true) : null;
      const currentBalance = current?.balance
        ?? safeInteger((await ensureWallet(client, userId, false))?.balance ?? startingBalance, "wallet balance");

      const usedCommand = await client.query<{ readonly table_id: string }>(
        `select table_id
           from game_private.game_commands
          where command_id = $1`,
        [commandId],
      );
      const usedTableId = usedCommand.rows[0]?.table_id;
      if (usedTableId && usedTableId !== tableId) {
        throw new CommandIdConflictError(commandId, current);
      }

      const mutation = operation(current, currentBalance);
      assertMutation(tableId, current, mutation.next);
      await persistMutation(client, userId, current, mutation);
      await client.query("commit");
      return mutation.result;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function advisoryLock(client: PoolClient, key: string): Promise<void> {
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [key]);
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original transaction error.
  }
}

async function selectTable(client: PoolClient, tableId: string): Promise<TableRow | null> {
  const result = await client.query<TableRow>(
    `select table_id, user_id, game, revision, last_sequence, next_nonce, round_state
       from game_private.game_tables
      where table_id = $1`,
    [tableId],
  );
  return result.rows[0] ?? null;
}

function assertOwner(table: TableRow, userId: string): void {
  if (table.user_id !== userId) throw new TableOwnershipError(table.table_id);
}

async function hydrateTable(
  client: PoolClient,
  table: TableRow,
  lockWallet = false,
): Promise<StoredTable> {
  const wallet = await client.query<WalletRow>(
    `select id, balance
       from game_private.wallet_accounts
      where user_id = $1 and currency = 'PLAY'
      ${lockWallet ? "for update" : ""}`,
    [table.user_id],
  );
  const events = await client.query<{ readonly event: unknown }>(
    `select event
       from game_private.game_events
      where table_id = $1
      order by sequence`,
    [table.table_id],
  );
  const commands = await client.query<{
    readonly ack: unknown;
    readonly command_id: string;
    readonly fingerprint: string;
  }>(
    `select command_id, fingerprint, ack
       from game_private.game_commands
      where table_id = $1
      order by created_at, command_id`,
    [table.table_id],
  );

  const receipts: Record<string, StoredCommandReceipt> = {};
  for (const row of commands.rows) {
    receipts[row.command_id] = {
      ack: commandAckV2Schema.parse(row.ack),
      fingerprint: row.fingerprint,
    };
  }

  return {
    balance: safeInteger(wallet.rows[0]?.balance ?? startingBalance, "wallet balance"),
    events: events.rows.map((row) => gameEventV2Schema.parse(row.event)),
    game: table.game,
    lastSequence: table.last_sequence,
    nextNonce: safeInteger(table.next_nonce, "fairness nonce"),
    receipts,
    revision: table.revision,
    round: table.round_state,
    tableId: table.table_id,
  };
}

function assertMutation(tableId: string, current: StoredTable | null, next: StoredTable): void {
  if (next.tableId !== tableId) throw new Error("Repository mutation changed tableId.");
  if (next.revision < (current?.revision ?? 0)) {
    throw new Error("Repository mutation decreased revision.");
  }
  if (next.lastSequence < (current?.lastSequence ?? 0)) {
    throw new Error("Repository mutation decreased event sequence.");
  }
  if (!Number.isSafeInteger(next.balance) || next.balance < 0) {
    throw new Error("Repository mutation produced an invalid PLAY balance.");
  }
}

async function persistMutation<T>(
  client: PoolClient,
  userId: string,
  current: StoredTable | null,
  mutation: RepositoryMutation<T>,
): Promise<void> {
  const next = mutation.next;
  const currentReceipts = current?.receipts ?? {};
  const receiptEntries = Object.entries(next.receipts)
    .filter(([commandId]) => !(commandId in currentReceipts));
  const newEvents = next.events.filter(
    (event) => event.sequence > (current?.lastSequence ?? 0),
  );
  const coreChanged = current === null || stateFingerprint(current) !== stateFingerprint(next);

  if (!coreChanged && receiptEntries.length === 0 && newEvents.length === 0) return;

  const wallet = await ensureWallet(client, userId, next.game !== null);
  const walletBalance = wallet
    ? safeInteger(wallet.balance, "wallet balance")
    : startingBalance;
  if (next.balance !== walletBalance) {
    if (!wallet) throw new Error("A balance mutation requires a PLAY wallet.");
    await client.query(
      `update game_private.wallet_accounts
          set balance = $2, version = version + 1, updated_at = now()
        where id = $1`,
      [wallet.id, next.balance],
    );
  }

  await client.query(
    `insert into game_private.game_tables (
       table_id, user_id, game, revision, last_sequence, next_nonce, round_state
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)
     on conflict (table_id) do update
       set game = excluded.game,
           revision = excluded.revision,
           last_sequence = excluded.last_sequence,
           next_nonce = excluded.next_nonce,
           round_state = excluded.round_state,
           updated_at = now()
     where game_private.game_tables.user_id = excluded.user_id`,
    [
      next.tableId,
      userId,
      next.game,
      next.revision,
      next.lastSequence,
      next.nextNonce,
      json(next.round),
    ],
  );

  if (next.round) await persistRound(client, userId, next);

  for (const event of newEvents) {
    await insertEvent(client, event);
  }
  for (const [commandId, receipt] of receiptEntries) {
    await client.query(
      `insert into game_private.game_commands (
         command_id, table_id, user_id, fingerprint, ack
       ) values ($1, $2, $3, $4, $5::jsonb)`,
      [commandId, next.tableId, userId, receipt.fingerprint, json(receipt.ack)],
    );
  }

  const commandId = receiptEntries[0]?.[0];
  if (commandId && wallet) {
    const entries: StoredLedgerEntry[] = [];
    if (wallet.inserted) {
      entries.push({
        amount: startingBalance,
        balanceAfter: startingBalance,
        entryType: "play-money.initial-grant",
        metadata: { currency: "PLAY", source: "mvp-starting-balance" },
      });
    }
    entries.push(...(mutation.ledgerEntries ?? []));
    if (entries.length > 0) {
      await persistLedger(client, userId, commandId, next, wallet.id, entries);
    }
  }
}

async function ensureWallet(
  client: PoolClient,
  userId: string,
  create: boolean,
): Promise<(WalletRow & { readonly inserted: boolean }) | null> {
  let inserted = false;
  if (create) {
    const created = await client.query<WalletRow>(
      `insert into game_private.wallet_accounts (user_id, currency, balance)
       values ($1, 'PLAY', $2)
       on conflict (user_id, currency) do nothing
       returning id, balance`,
      [userId, startingBalance],
    );
    inserted = created.rowCount === 1;
  }
  const wallet = await client.query<WalletRow>(
    `select id, balance
       from game_private.wallet_accounts
      where user_id = $1 and currency = 'PLAY'
      for update`,
    [userId],
  );
  const row = wallet.rows[0];
  return row ? { ...row, inserted } : null;
}

async function persistRound(client: PoolClient, userId: string, table: StoredTable): Promise<void> {
  const round = table.round;
  if (!round) return;
  const settled = round.state.phase === "settled";
  const wager = round.game === "blackjack" ? round.state.totalWager : round.state.totalStake;
  const payout = round.game === "blackjack"
    ? round.state.totalGrossReturn
    : (round.state.settlement?.totalReturn ?? 0);
  await client.query(
    `insert into game_private.game_rounds (
       id, user_id, table_id, game, status, ruleset_version, wager, payout, result, settled_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     on conflict (id) do update
       set status = excluded.status,
           wager = excluded.wager,
           payout = excluded.payout,
           result = excluded.result,
           settled_at = excluded.settled_at`,
    [
      round.roundId,
      userId,
      table.tableId,
      round.game,
      settled ? "settled" : wager > 0 ? "active" : "created",
      mvpRuleset.id,
      wager,
      payout,
      json(round.state),
      settled ? new Date().toISOString() : null,
    ],
  );
  await client.query(
    `insert into game_private.fairness_records (
       round_id, algorithm, server_commitment, client_seed, nonce, server_seed, revealed_at
     ) values ($1, 'pf-v1', $2, $3, $4, $5, $6)
     on conflict (round_id) do update
       set client_seed = excluded.client_seed,
           server_seed = excluded.server_seed,
           revealed_at = excluded.revealed_at`,
    [
      round.roundId,
      round.fairness.commitment,
      round.clientSeed,
      round.fairness.nonce,
      round.fairness.serverSeed,
      settled ? new Date().toISOString() : null,
    ],
  );
}

async function insertEvent(client: PoolClient, event: GameEventV2): Promise<void> {
  await client.query(
    `insert into game_private.game_events (
       event_id, table_id, round_id, sequence, revision, event_type, payload, occurred_at, event
     ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb)`,
    [
      event.eventId,
      event.tableId,
      event.roundId,
      event.sequence,
      event.revision,
      event.type,
      json(event.payload),
      event.occurredAt,
      json(event),
    ],
  );
  await client.query("select pg_notify($1, $2)", [
    postgresGameEventChannel,
    encodePostgresGameEventNotification({
      schemaVersion: 1,
      sequence: event.sequence,
      tableId: event.tableId,
    }),
  ]);
}

async function persistLedger(
  client: PoolClient,
  userId: string,
  commandId: string,
  table: StoredTable,
  accountId: string,
  entries: readonly StoredLedgerEntry[],
): Promise<void> {
  const transaction = await client.query<{ readonly id: string }>(
    `insert into game_private.ledger_transactions (
       command_id, user_id, round_id, transaction_type
     ) values ($1, $2, $3, $4)
     returning id`,
    [
      commandId,
      userId,
      table.round?.roundId ?? null,
      entries.length === 1 && entries[0]?.entryType === "play-money.initial-grant"
        ? "grant"
        : "game-command",
    ],
  );
  const transactionId = transaction.rows[0]?.id;
  if (!transactionId) throw new Error("Ledger transaction insert returned no id.");
  for (const [index, entry] of entries.entries()) {
    await client.query(
      `insert into game_private.ledger_entries (
         transaction_id, account_id, entry_index, entry_type, amount, balance_after, metadata
       ) values ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        transactionId,
        accountId,
        index,
        entry.entryType,
        entry.amount,
        entry.balanceAfter,
        json(entry.metadata),
      ],
    );
  }
}

function stateFingerprint(table: StoredTable): string {
  return JSON.stringify({
    balance: table.balance,
    game: table.game,
    lastSequence: table.lastSequence,
    nextNonce: table.nextNonce,
    revision: table.revision,
    round: table.round,
  });
}

function safeInteger(value: string | number, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Database ${label} is outside the supported integer range.`);
  }
  return parsed;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}
