# Supabase- och Postgresinstruktioner

- `migrations/` är enda källan för schema och policies. Undvik permanent Dashboard-drift.
- Skapa migrationer med Supabase CLI:s `migration new`; redigera därefter den skapade filen.
- Exponerade tabeller kräver explicita grants, RLS och pgTAP-test av både tillåten och nekad åtkomst.
- `game_private` är server-only: ge inte `anon` eller `authenticated` schema- eller tabellåtkomst.
- Indexera foreign keys och kolumner som används i RLS eller frekventa uppslag.
- Använd `(select auth.uid())` i RLS och både `USING` samt `WITH CHECK` vid ägarstyrd update.
- Använd aldrig `user_metadata` för behörighetsbeslut och lägg aldrig `SECURITY DEFINER` i ett exponerat schema.
- Efter schemaändring: reset, `supabase test db`, databaslint och Supabase advisors.
