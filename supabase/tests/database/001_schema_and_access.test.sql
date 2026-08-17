begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;

select plan(25);

select has_schema('game_private', 'server-only schema exists');
select has_table('public', 'profiles', 'public profile table exists');
select has_table('game_private', 'wallet_accounts', 'wallet accounts exist');
select has_table('game_private', 'game_rounds', 'game rounds exist');
select has_table('game_private', 'game_events', 'game events exist');
select has_table('game_private', 'fairness_records', 'fairness records exist');
select has_table('game_private', 'ledger_transactions', 'ledger transactions exist');
select has_table('game_private', 'ledger_entries', 'ledger entries exist');

select col_is_pk('public', 'profiles', 'user_id', 'profile identity is the auth user id');

select ok(
  (select c.relrowsecurity
   from pg_catalog.pg_class c
   join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'profiles'),
  'profiles has RLS enabled'
);

select results_eq(
  $$
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'game_private'
      and c.relname in (
        'wallet_accounts',
        'game_rounds',
        'game_events',
        'fairness_records',
        'ledger_transactions',
        'ledger_entries'
      )
      and c.relrowsecurity
  $$,
  array[6::bigint],
  'all server-only tables have RLS enabled'
);

select policies_are(
  'public',
  'profiles',
  array['profiles_select_own', 'profiles_update_own'],
  'profiles exposes only the two owner policies'
);

select ok(
  not has_schema_privilege('anon', 'game_private', 'usage'),
  'anon cannot use the private schema'
);
select ok(
  not has_schema_privilege('authenticated', 'game_private', 'usage'),
  'authenticated cannot use the private schema'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'select'),
  'anon cannot select profiles'
);
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'select'),
  'authenticated can select profiles subject to RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'update'),
  'authenticated can update profiles subject to RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'insert'),
  'authenticated cannot insert profiles directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'delete'),
  'authenticated cannot delete profiles directly'
);

select ok(
  to_regclass('game_private.ledger_transactions_round_idx') is not null,
  'ledger round foreign key is indexed'
);
select ok(
  to_regclass('game_private.game_rounds_user_created_idx') is not null,
  'round ownership lookup is indexed'
);
select ok(
  to_regclass('game_private.ledger_entries_account_created_idx') is not null,
  'ledger account history lookup is indexed'
);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'owner-one@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'owner-two@example.test');

insert into public.profiles (user_id, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'Spelare ett'),
  ('10000000-0000-4000-8000-000000000002', 'Spelare två');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$select user_id from public.profiles order by user_id$$,
  $$values ('10000000-0000-4000-8000-000000000001'::uuid)$$,
  'an authenticated user sees only their own profile'
);

select results_eq(
  $$
    update public.profiles
    set display_name = 'Otillåten ändring'
    where user_id = '10000000-0000-4000-8000-000000000002'::uuid
    returning user_id
  $$,
  $$select null::uuid where false$$,
  'an authenticated user cannot update another profile'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501',
  'permission denied for table profiles',
  'anon cannot query profiles'
);

reset role;
select * from finish();
rollback;
