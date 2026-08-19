# @spelsajt/player-account

Fristående spelar-dashboard för Spelsajts play-money-konton. Appen härstammar från
`player-ac-site`, men bank-, betalnings- och adminmallar har tagits bort.

## Implementerat

- `/login` utan dashboard-chrome
- Google OAuth via Supabase
- anonymt gästkonto via Supabase
- logout tillbaka till `/login`
- skyddad dashboardyta för aktiv session
- profilskapning och profiluppdatering under RLS
- länkning av gästidentitet till Google
- sajtens Inter Tight/Bricolage Grotesque och lime/violetta designsystem

Dashboardens saldo, statistik och historik är ännu **tydligt märkt exempeldata**. Den får
inte betraktas som auktoritativ förrän spelservern exponerar ett autentiserat,
kontrakterat account-summary-read-model. Frontend får aldrig räkna fram eller ändra saldo.

## Miljö

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` eller äldre `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- valfri `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` för en fast preview-callback
- valfri `NEXT_PUBLIC_GAME_APP_URL` för länkar tillbaka till spelappen

Kopiera `.env.example` till `.env.local` och kör lokalt med
`pnpm --filter @spelsajt/player-account dev`.
