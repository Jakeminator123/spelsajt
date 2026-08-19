# Övrigt

Den här mappen är till för kom-ihåg-material, arbetsspecifikationer, research och beslutsskisser som är värdefulla under utvecklingen men inte är körbar systemsanning.

## Innehåll

- [Dealeravatar med AI-personlighet](DEALER_AVATAR_SPEC.md) – asset-, rigg-, animations- och AI-specifikation för dealerlagret.
- [Aktuell agent-handoff](AGENT_HANDOFF_2026-08-19.md) – verifierat utgångsläge, Meshy-beslut, assetprioritering och nästa arbetsordning.
- [Plan för att förena Emils repo med Spelsajt](EMIL_REPO_SAMMANSLAGNING.md) – granskning av `EmaCodeHero/ava-live-blackjack` och rekommenderad målstruktur.
- [Konto- och OAuth-notering](KONTO_OAUTH_NOTERING.md) – valt gäst-till-Google-flöde, driftinställningar och kvarvarande identitetsfrågor.

## Viktig gräns

Material här får aldrig användas som bevis för att något redan är implementerat. För aktuell status och källor till sanning gäller fortfarande:

1. `packages/config/rulesets/*.json` för spelregler.
2. `packages/contracts/src/` för transportkontrakt.
3. `supabase/migrations/` för databasen.
4. `packages/system-model/models/play-money-mvp.json` och `docs/SYSTEM_CANVAS.md` för integrationskartan och faktisk mognad.

Nya lösa anteckningar kan läggas här som Markdown. Stora binära arbetsfiler bör ligga i ett tydligt asset-/source-spår och inte blandas med produktionens webbfiler.
