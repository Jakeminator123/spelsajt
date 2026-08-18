-- Durable transaction boundary for the authoritative v2 command service.
-- The backend connects directly to Postgres; none of these tables are exposed
-- through the Data API or granted to browser roles.

create table game_private.game_tables (
  table_id text primary key,
  user_id uuid not null references auth.users (id) on delete restrict,
  game text,
  revision integer not null default 0,
  last_sequence integer not null default 0,
  next_nonce bigint not null default 0,
  round_state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_tables_id_length
    check (char_length(table_id) between 1 and 128),
  constraint game_tables_supported_game
    check (game is null or game in ('blackjack', 'roulette')),
  constraint game_tables_non_negative_revision check (revision >= 0),
  constraint game_tables_non_negative_sequence check (last_sequence >= 0),
  constraint game_tables_non_negative_nonce check (next_nonce >= 0),
  constraint game_tables_round_requires_game
    check (round_state is null or game is not null)
);

create index game_tables_user_updated_idx
  on game_private.game_tables (user_id, updated_at desc);

create table game_private.game_commands (
  command_id uuid primary key,
  table_id text not null
    references game_private.game_tables (table_id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  fingerprint text not null,
  ack jsonb not null,
  created_at timestamptz not null default now(),
  constraint game_commands_fingerprint_not_empty
    check (char_length(fingerprint) > 0)
);

create index game_commands_table_created_idx
  on game_private.game_commands (table_id, created_at desc);

alter table game_private.game_rounds
  add column table_id text
    references game_private.game_tables (table_id) on delete restrict;

alter table game_private.game_rounds
  alter column ruleset_version set default 'mvp-v2',
  alter column wager set default 0;

alter table game_private.game_rounds
  drop constraint game_rounds_positive_wager;

alter table game_private.game_rounds
  add constraint game_rounds_non_negative_wager check (wager >= 0);

create index game_rounds_table_created_idx
  on game_private.game_rounds (table_id, created_at desc);

alter table game_private.game_events
  add column event_id uuid,
  add column table_id text
    references game_private.game_tables (table_id) on delete restrict,
  add column revision integer,
  add column event jsonb;

alter table game_private.game_events
  drop constraint game_events_round_sequence_unique;

alter table game_private.game_events
  add constraint game_events_event_id_unique unique (event_id),
  add constraint game_events_table_sequence_unique unique (table_id, sequence),
  add constraint game_events_non_negative_revision
    check (revision is null or revision >= 0);

create index game_events_table_sequence_idx
  on game_private.game_events (table_id, sequence);

alter table game_private.fairness_records
  alter column algorithm set default 'pf-v1',
  alter column client_seed drop not null;

alter table game_private.fairness_records
  drop constraint fairness_client_seed_length,
  drop constraint fairness_reveal_consistency;

alter table game_private.fairness_records
  add constraint fairness_client_seed_length
    check (client_seed is null or char_length(client_seed) between 1 and 128),
  add constraint fairness_reveal_consistency
    check (revealed_at is null or (server_seed is not null and client_seed is not null));

alter table game_private.ledger_transactions
  drop constraint ledger_transactions_supported_type;

alter table game_private.ledger_transactions
  add constraint ledger_transactions_supported_type
    check (transaction_type in (
      'grant',
      'game-command',
      'wager',
      'payout',
      'refund',
      'adjustment'
    ));

alter table game_private.ledger_entries
  add column entry_index integer not null default 0,
  add column entry_type text not null default 'adjustment',
  add column metadata jsonb not null default '{}'::jsonb;

alter table game_private.ledger_entries
  drop constraint ledger_entries_transaction_account_unique;

alter table game_private.ledger_entries
  add constraint ledger_entries_non_negative_index check (entry_index >= 0),
  add constraint ledger_entries_transaction_index_unique
    unique (transaction_id, entry_index);

alter table game_private.game_tables enable row level security;
alter table game_private.game_commands enable row level security;

revoke all on table game_private.game_tables from public, anon, authenticated;
revoke all on table game_private.game_commands from public, anon, authenticated;

comment on table game_private.game_tables is
  'Authoritative per-table engine state and monotonic revision/sequence cursor.';
comment on table game_private.game_commands is
  'Global command-id receipts used for atomic idempotent replay.';
