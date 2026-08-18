# Spelsajt

Modern play-money-plattform för blackjack och europeisk roulette. Projektet är ett pnpm/Turborepo-monorepo där webb, spelserver och deterministiska domänpaket kan utvecklas och testas tillsammans men deployas separat.

Live scaffold: [spelsajt-web.vercel.app](https://spelsajt-web.vercel.app)

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
- Vercel används för `apps/web`. Spelservern körs lokalt tills en långlivad Node-host väljs.

## Kom igång

```powershell
pnpm install
Copy-Item apps/web/.env.example apps/web/.env.local
Copy-Item apps/game-server/.env.example apps/game-server/.env.local
pnpm dev
```

Webbappen startar normalt på `http://localhost:3000` och spelservern på `http://localhost:4000`.

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
- Den delbara PDF-versionen genereras i `output/pdf/`.

## Deploy

Webbappen länkas som ett Vercel-projekt med root directory `apps/web`. Koppla därefter GitHub-repot för automatiska previewdeployments på varje pull request. `.vercel/` och alla hemligheter är ignorerade av Git.
