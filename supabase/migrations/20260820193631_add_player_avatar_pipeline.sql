-- Player avatars are cosmetic presentation data. Meshy provider state is
-- carried in a server-signed token; this owner-scoped row only keeps the
-- resumable token and private Vercel Blob pathnames.

create table public.player_avatars (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state text not null default 'empty',
  active_job_token text,
  model_path text,
  animation_paths jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_avatars_state
    check (state in ('empty', 'image', 'rigging', 'animating', 'storing', 'ready', 'failed')),
  constraint player_avatars_job_token_length
    check (active_job_token is null or char_length(active_job_token) between 64 and 12000),
  constraint player_avatars_model_path_length
    check (model_path is null or char_length(model_path) between 1 and 512),
  constraint player_avatars_animation_paths_object
    check (jsonb_typeof(animation_paths) = 'object'),
  constraint player_avatars_error_length
    check (error_message is null or char_length(error_message) between 1 and 240),
  constraint player_avatars_ready_assets
    check (state <> 'ready' or (model_path is not null and animation_paths ? 'idle'))
);

alter table public.player_avatars enable row level security;

revoke all on table public.player_avatars from anon;
revoke all on table public.player_avatars from authenticated;
grant select, insert, update on table public.player_avatars to authenticated;

create policy "player_avatars_select_own"
  on public.player_avatars
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
  );

create policy "player_avatars_insert_own"
  on public.player_avatars
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
  );

create policy "player_avatars_update_own"
  on public.player_avatars
  for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
  )
  with check (
    (select auth.uid()) = user_id
    and coalesce((select (auth.jwt() ->> 'is_anonymous')::boolean), false) is false
  );

-- Cost claims are server-observed accounting and never exposed as rows through
-- the Data API. An authenticated user can consume only their own allowance;
-- doing so without calling the server can at worst exhaust that user's quota,
-- never spend Meshy credits or affect another identity.
create table game_private.player_avatar_generation_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index player_avatar_generation_claims_user_created_idx
  on game_private.player_avatar_generation_claims (user_id, created_at desc);

alter table game_private.player_avatar_generation_claims enable row level security;

revoke all on table game_private.player_avatar_generation_claims from public;
revoke all on table game_private.player_avatar_generation_claims from anon;
revoke all on table game_private.player_avatar_generation_claims from authenticated;

create function public.claim_player_avatar_generation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Du behöver vara inloggad.' using errcode = 'P0001';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Säkra gästkontot innan du skapar en personlig avatar.' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(current_user_id::text, 179153)
  );

  if exists (
    select 1
    from game_private.player_avatar_generation_claims
    where user_id = current_user_id
      and created_at > pg_catalog.now() - interval '1 hour'
  ) then
    raise exception 'Vänta en timme innan du startar en ny kostnadsbelagd avatar.'
      using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from game_private.player_avatar_generation_claims
    where user_id = current_user_id
      and created_at > pg_catalog.now() - interval '30 days'
  ) >= 3 then
    raise exception 'Kontot har nått gränsen på tre avatarer under 30 dagar.'
      using errcode = 'P0001';
  end if;

  insert into game_private.player_avatar_generation_claims (user_id)
  values (current_user_id)
  returning id into claimed_id;

  return claimed_id;
end;
$$;

revoke all on function public.claim_player_avatar_generation() from public;
revoke all on function public.claim_player_avatar_generation() from anon;
grant execute on function public.claim_player_avatar_generation() to authenticated;

comment on table public.player_avatars is
  'Owner-scoped cosmetic avatar metadata; files are private Vercel Blobs and never authoritative game state.';
comment on function public.claim_player_avatar_generation() is
  'Atomically reserves one owner-scoped Meshy generation allowance.';
