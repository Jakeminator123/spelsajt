-- Let an authenticated Supabase identity create exactly its own lightweight
-- public profile. Anonymous sign-ins also use the authenticated database role;
-- linking Google later keeps the same auth user id and therefore the same row.

grant insert on table public.profiles to authenticated;

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
