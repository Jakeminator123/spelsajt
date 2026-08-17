-- Play-money-only MVP schema.
-- Public data is deliberately minimal. Authoritative game state, fairness data,
-- balances and the append-only ledger live outside the Data API schemas.

create schema if not exists game_private;

revoke all on schema game_private from public;
revoke all on schema game_private from anon;
revoke all on schema game_private from authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Spelare',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length
    check (char_length(display_name) between 2 and 32)
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select, update on table public.profiles to authenticated;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table game_private.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null default 'PLAY',
  balance bigint not null default 10000,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_accounts_play_currency check (currency = 'PLAY'),
  constraint wallet_accounts_non_negative_balance check (balance >= 0),
  constraint wallet_accounts_positive_version check (version > 0),
  constraint wallet_accounts_user_currency_unique unique (user_id, currency)
);

create table game_private.game_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  game text not null,
  status text not null default 'created',
  ruleset_version text not null default 'mvp-v1',
  wager bigint not null,
  payout bigint not null default 0,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint game_rounds_supported_game check (game in ('blackjack', 'roulette')),
  constraint game_rounds_supported_status
    check (status in ('created', 'active', 'settled', 'cancelled')),
  constraint game_rounds_positive_wager check (wager > 0),
  constraint game_rounds_non_negative_payout check (payout >= 0),
  constraint game_rounds_settlement_consistency check (
    (status = 'settled' and settled_at is not null)
    or (status <> 'settled' and settled_at is null)
  )
);

create index game_rounds_user_created_idx
  on game_private.game_rounds (user_id, created_at desc);

create table game_private.game_events (
  id bigint generated always as identity primary key,
  round_id uuid not null references game_private.game_rounds (id) on delete cascade,
  sequence integer not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint game_events_positive_sequence check (sequence > 0),
  constraint game_events_round_sequence_unique unique (round_id, sequence)
);

create table game_private.fairness_records (
  round_id uuid primary key references game_private.game_rounds (id) on delete restrict,
  algorithm text not null default 'hmac-sha256-v1',
  server_commitment text not null,
  client_seed text not null,
  nonce bigint not null,
  server_seed text,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fairness_commitment_hex
    check (server_commitment ~ '^[0-9a-f]{64}$'),
  constraint fairness_client_seed_length
    check (char_length(client_seed) between 1 and 128),
  constraint fairness_non_negative_nonce check (nonce >= 0),
  constraint fairness_server_seed_hex
    check (server_seed is null or server_seed ~ '^[0-9a-f]{64}$'),
  constraint fairness_reveal_consistency check (
    (server_seed is null and revealed_at is null)
    or (server_seed is not null and revealed_at is not null)
  )
);

create table game_private.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  command_id uuid not null unique,
  user_id uuid not null references auth.users (id) on delete restrict,
  round_id uuid references game_private.game_rounds (id) on delete restrict,
  transaction_type text not null,
  created_at timestamptz not null default now(),
  constraint ledger_transactions_supported_type
    check (transaction_type in ('grant', 'wager', 'payout', 'refund', 'adjustment'))
);

create index ledger_transactions_user_created_idx
  on game_private.ledger_transactions (user_id, created_at desc);

create table game_private.ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null
    references game_private.ledger_transactions (id) on delete restrict,
  account_id uuid not null
    references game_private.wallet_accounts (id) on delete restrict,
  amount bigint not null,
  balance_after bigint not null,
  created_at timestamptz not null default now(),
  constraint ledger_entries_non_zero_amount check (amount <> 0),
  constraint ledger_entries_non_negative_balance check (balance_after >= 0),
  constraint ledger_entries_transaction_account_unique unique (transaction_id, account_id)
);

create index ledger_entries_account_created_idx
  on game_private.ledger_entries (account_id, created_at desc);

revoke all on all tables in schema game_private from public;
revoke all on all tables in schema game_private from anon;
revoke all on all tables in schema game_private from authenticated;
revoke all on all sequences in schema game_private from public;
revoke all on all sequences in schema game_private from anon;
revoke all on all sequences in schema game_private from authenticated;

comment on schema game_private is
  'Server-only state for game rounds, provable fairness and the play-money ledger.';
