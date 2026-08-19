# Spelsajt

Modern play-money-plattform för blackjack och europeisk roulette. Projektet är ett pnpm/Turborepo-monorepo där webb, spelserver och deterministiska domänpaket kan utvecklas och testas tillsammans men deployas separat.

Produktionswebb: [spelsajt.vercel.app](https://spelsajt.vercel.app)

Publika routes: [blackjack](https://spelsajt.vercel.app/blackjack), [roulette](https://spelsajt.vercel.app/roulette) och [systemkarta](https://spelsajt.vercel.app/system).

## Struktur

```text
apps/web                 Next.js 16, React 19 och React Three Fiber
apps/game-server         Fastify och Socket.IO
packages/contracts       Versionslåsta commands och events
packages/system-model    Validerad integrationskarta och textscenarier
packages/game-core       Deterministiska spelregler
packages/fairness        Commit/reveal och unbiased RNG-mappning
packages/config          Delad konfiguration
supabase                 Lokal konfiguration och migrations
docs                     MVP-plan, arkitektur och regler
output/pdf               Delbar projektplan
```

## Förutsättningar

- Node 24.19.0 och pnpm 11.22.0, automatiskt pinnade via `mise.toml`.
- Ett Supabase-projekt när auth och databas ska kopplas in.
- Vercel används för `apps/web`. Spelservern har en verifierad, host-neutral container och en Render Blueprint för en separat långlivad process.

## Kom igång

```powershell
pnpm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/game-server/.env.example apps/game-server/.env.local
pnpm dev
```

Webbappen startar normalt på `http://localhost:3000` och spelservern på `http://localhost:4000`.

De spelbara borden finns på [http://localhost:3000/blackjack](http://localhost:3000/blackjack) och [http://localhost:3000/roulette](http://localhost:3000/roulette). De återanvänder en persisterad anonym Supabase-session, skickar kontraktsvaliderade v2-commands till spelservern och återankrar från snapshots över Socket.IO. Om publik Supabase-konfiguration eller spelserver-URL saknas visas ett uttryckligt konfigurationsfel; webben faller aldrig tillbaka till lokalt beräknade utfall.

Den levande systemkartan finns på [http://localhost:3000/system](http://localhost:3000/system). Den visar blackjack- och rouletteflöden från command till presentation och markerar separat vad som är implementerat, kontrakterat och planerat. Samma modell finns maskinläsbart i [`packages/system-model/models/play-money-mvp.json`](packages/system-model/models/play-money-mvp.json).

## Kvalitetskontroll

```powershell
pnpm check
```

Kommandot kontrollerar genererade JSON Schema-filer och kör lint, TypeScript, tester samt produktionsbyggen för hela repot.

När lokal Supabase är startad körs databasens migrationer, pgTAP-regressioner och lint med:

```powershell
pnpm db:verify
```

## Dokument

- [System canvas – börja här för arkitektur och integrationsstatus](docs/SYSTEM_CANVAS.md)
- [MVP-plan](docs/MVP_PLAN.md)
- [Aktiva MVP-regler v2](docs/rulesets/mvp-v2.md)
- [Historiska MVP-regler v1](docs/rulesets/mvp-v1.md)
- [Engineeringavtal och source of truth](docs/ENGINEERING.md)
- [Spelmotor, 3D-avatarer och AI](docs/PRESENTATION_AI.md)
- [Kom-ihåg-material och arbetsspecifikationer](övrigt/README.md)
- [Specifikation för eventstyrd dealeravatar med OpenAI-personlighet](övrigt/DEALER_AVATAR_SPEC.md)
- Den delbara PDF-versionen genereras i `output/pdf/`.

## Deploy

Webbappen länkas som ett Vercel-projekt med root directory `apps/web`. Koppla därefter GitHub-repot för automatiska previewdeployments på varje pull request. `.vercel/` och alla hemligheter är ignorerade av Git.

Spelserverns produktionsimage byggs från reporoten och kan köras på en valfri långlivad containerhost:

```powershell
docker build --file apps/game-server/Dockerfile --tag spelsajt-game-server .
docker run --rm --publish 4000:4000 --env-file apps/game-server/.env.local --env GAME_SERVER_HOST=0.0.0.0 spelsajt-game-server
```

Render-konfigurationen finns i `render.yaml`. Blueprinten bygger den befintliga Docker-imagen från monorepots rot, använder en Starter-webbtjänst i Frankfurt, testar `/ready` och har en exakt allowlist för produktionswebben och den stabila `troubleshooting-support`-previewen. Samma image kan i stället skapas manuellt som en vanlig Render Web Service: välj Docker, lämna root directory tom, använd `./apps/game-server/Dockerfile`, Docker context `.`, branch `main`, region Frankfurt, Starter och health check `/ready`. Servern läser Renders vanliga `PORT` automatiskt.

Oavsett installationssätt ska `WEB_ORIGIN` innehålla en kommaseparerad lista med exakta `http`-/`https`-originer; wildcard, URL-sökvägar och credentials avvisas vid serverstart. För hostad drift är listan `https://spelsajt.vercel.app,https://spelsajt-git-troubleshooting-support-jakeminator123s-projects.vercel.app`. Render frågar även efter `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` och `SUPABASE_DATABASE_URL`; den senare ska vara Supabases session-pooleranslutning på port 5432 för en långlivad IPv4-process. Servern uppgraderar Supabase-anslutningen till `sslmode=verify-full` och verifierar värdnamnet mot det bundlade Supabase Root 2021 CA-certifikatet. Värdena är Render-secrets och hör aldrig hemma i Git.

Starter-instansen hålls varm för den hostade MVP:n. Klientens reconnect- och snapshotflöde återankrar ändå från Postgres efter transportavbrott eller processomstart. Tjänsten kan senare skalas vertikalt genom att byta instance type utan att ändra spelarkitekturen.

När Render visar en grön deploy kan den hostade processen, databasen, CORS-gränsen, fail-closed auth och WebSocket-transporten verifieras utan användarhemligheter:

```bash
pnpm verify:hosted -- https://spelsajt-game-server.onrender.com
```

Ett opt-in-test går hela vägen genom publik Supabase Auth och båda produktionsspelen. Det skapar en isolerad anonym PLAY-session, verifierar command-replay utan dubbel saldoeffekt, realtime-event, avsiktlig socketfrånkoppling, reconnect-snapshot och settlement med heltalssaldo. Endast de publika webbnycklarna används; service-role eller databaslösenord ska inte lämnas till testet.

```bash
HOSTED_SUPABASE_URL=https://<project-ref>.supabase.co \
HOSTED_SUPABASE_PUBLISHABLE_KEY=<public-key> \
pnpm verify:hosted -- https://spelsajt-game-server.onrender.com --gameplay
```

Imagen kör som en icke-privilegierad användare, lyssnar på `0.0.0.0:4000` och har `/health` för processhälsa samt `/ready` för migrerat Postgres-schema och eventreläberedskap. `NODE_ENV=production` är satt i imagen, så komplett `SUPABASE_URL`, publishable/secret key och `SUPABASE_DATABASE_URL` krävs; produktionsservern startar inte med den tillfälliga minnesadaptern. CI bygger och health-startprovar imagen mot en isolerad tom Postgres och verifierar att `/ready` svarar 503 där; databasjobbet verifierar 200 och relayåterhämtning mot det migrerade schemat. CI publicerar inte imagen, medan den granskade `main`-branchen deployas till den konfigurerade Render-tjänsten.

Om Postgres `LISTEN`-sessionen bryts blir instansen oreado och kopplar ned sockets. Servern försöker därefter upprätta en ny anslutning varje sekund med fem sekunders anslutningstak och blir inte redo förrän en ny `LISTEN` har lyckats; klienten återankrar då via snapshot.

Postgresanslutningar har fem sekunders anslutningstak och command-, snapshot- och reläfrågor avbryts efter tio sekunder som standard. `GAME_SERVER_POSTGRES_CONNECTION_TIMEOUT_MS` och `GAME_SERVER_POSTGRES_STATEMENT_TIMEOUT_MS` kan justera gränserna till heltal mellan `100` och `300000`; ogiltig konfiguration stoppar serverstarten. CI verifierar mot riktig Postgres att en låst command-transaktion avbryts inom gränsen och att repositoryt kan användas efteråt.

Socket.IO-sessioner omverifieras server-side var 60:e sekund. `GAME_SERVER_SOCKET_AUTH_REVALIDATION_MS` kan justera intervallet till ett positivt heltal på minst `10000`; ogiltig konfiguration stoppar serverstarten.
