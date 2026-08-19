# @spelsajt/player-account (pensionerad prototyp)

Den publika kontoupplevelsen finns nu på `/konto` i `apps/web`. Den här appen
bevaras tillfälligt som designreferens men startas inte av rotens `pnpm dev`,
deployas inte och får inte länkas från produkten.

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

Prototypens saldo, statistik och historik är fortfarande **tydligt märkt exempeldata** och
ska inte kopplas till produktion. Det autentiserade account-summary-read-modelet konsumeras
i stället av den publika `/konto`-sidan i `apps/web`. Frontend får aldrig räkna fram eller
ändra saldo.

## Miljö

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` eller äldre `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- valfri `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` för en fast preview-callback
- valfri `NEXT_PUBLIC_GAME_APP_URL` för länkar tillbaka till spelappen

Om prototypen behöver jämföras visuellt kan den startas uttryckligen med
`pnpm --filter @spelsajt/player-account dev:prototype`.
