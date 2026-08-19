# Konto- och OAuth-notering

Status 2026-08-19: `/konto` finns lokalt i webbappen. Sidan återanvänder Supabase-sessionen som redan används av `/blackjack` och `/roulette`, skapar spelarens egen `profiles`-rad och kan länka en gästidentitet till Google.

## Valt flöde

1. En ny spelare kan fortsätta med Google eller starta som gäst.
2. Gästen får en riktig Supabase-användare och ett stabilt user-id.
3. Profil, privata bord och PLAY-data knyts till detta user-id.
4. `linkIdentity({ provider: "google" })` säkrar samma gästidentitet; en ny spelare skapas inte.
5. `signInWithOAuth` används separat när spelaren redan har ett tidigare Google-konto.

Detta är medvetet enklare än lösenord, återställningsmail och en egen sessionslösning. Supabase sköter identiteten; Spelsajt behåller RLS och serververifiering.

## Databas

Migrationen `20260819011808_allow_owned_profile_creation.sql` ger rollen `authenticated` rätt att skapa en profil endast när `user_id = auth.uid()`. Select och update är fortfarande ägarisolerade och delete är inte tillåtet från browsern.

Anonyma Supabase-användare använder också Postgres-rollen `authenticated`. Det är avsiktligt här: gästen ska kunna ha ett spelarnamn före Google-länkningen. `is_anonymous` ska kontrolleras separat om framtida funktioner bara får användas av permanenta konton.

## Driftinställningar som återstår

I Supabase-projektet måste följande aktiveras innan Google-knappen fungerar hela vägen:

- Anonymous Sign-Ins.
- Google provider med client id och client secret.
- Manual identity linking.
- redirect-allowlist för `https://spelsajt.vercel.app/konto` och preview-URL:en.
- Googles auktoriserade callback till Supabase-projektets `/auth/v1/callback`.

Inga providerhemligheter ska ligga i Git eller i `NEXT_PUBLIC_*`. Webben behöver bara befintlig Supabase URL och publishable key.

Aktuella Supabase-referenser: [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking) och [Google Login](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Medvetet kvar

- Automatisk sammanslagning av en aktiv gästs data med ett redan existerande permanent konto. UI:t varnar därför innan vanlig Google-inloggning från en gästsession.
- Ett säkert account-summary-endpoint om kontosidan ska visa faktiskt PLAY-saldo och historik från `game_private`.
- Turnstile/CAPTCHA och städning av gamla anonyma användare innan större publik trafik.
- E2E-verifiering av Google-redirect i preview och produktion efter provideraktivering.
