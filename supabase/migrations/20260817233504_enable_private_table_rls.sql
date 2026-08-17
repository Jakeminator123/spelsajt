-- Defense in depth for server-only game state. These tables deliberately have
-- no anon/authenticated grants or policies; privileged backend access bypasses
-- RLS while accidental client grants still fail closed.

alter table game_private.wallet_accounts enable row level security;
alter table game_private.game_rounds enable row level security;
alter table game_private.game_events enable row level security;
alter table game_private.fairness_records enable row level security;
alter table game_private.ledger_transactions enable row level security;
alter table game_private.ledger_entries enable row level security;
