# Engineeringavtal

Det här är den korta kartan för hur Jakob, Emil och Codex ändrar projektet utan att dokumentation, frontend, backend och databas glider isär.

## Codex motsvarighet till `.cursor`

Codex läser `AGENTS.md` från reporoten och därefter närmare instruktioner i den katalog som berörs. Rotfilen innehåller gemensamma regler; `apps/web`, `apps/game-server`, `packages/contracts` och `supabase` kompletterar endast med lokala krav.

## Source of truth

| Område | Auktoritativ källa | Härledd eller förklarande källa |
| --- | --- | --- |
| Spelregler | `packages/config/rulesets/*.json` | `docs/rulesets/`, status-API och UI-text |
| Nätverksformat | Zod i `packages/contracts/src/` | Genererad JSON Schema och JSON-fixtures |
| Databasschema | `supabase/migrations/` | Genererade typer och databasdiagram |
| Fairness | Kod + golden vectors i `packages/fairness/` | Verifierings-UI och förklarande text |
| Produktomfattning | `docs/MVP_PLAN.md` | README och presentationsmaterial |

Markdown beskriver varför. Körbara scheman, migrationer och tester avgör vad systemet faktiskt accepterar.

## Ändringsprotokoll

1. Ändra den auktoritativa källan.
2. Generera härledda JSON Schema-filer i stället för att handredigera dem.
3. Lägg till eller uppdatera en fixture, golden vector eller pgTAP-test som visar önskat beteende.
4. Uppdatera kort relevant dokumentation när användarbeteende eller ansvar ändras.
5. Kör `pnpm check`; för databasändringar kör även `pnpm db:verify` mot lokal Supabase.

## Vad vi regressionslåser

- Frysta ruleset-värden och deras semantiska hash.
- Commands, events och snapshots inklusive nekande av okända fält.
- Deterministiska fairness-resultat mellan server och webbläsare.
- Blackjack- och roulettinvarianter i `game-core`.
- Databasobjekt, foreign-key-index, RLS-policies och privata privilegier med pgTAP.
- Bygg, lint, TypeScript och tester på varje pull request.

UI-pixlar och pågående 3D-experiment låses inte med breda snapshots. Där används små komponenttester och senare visuella end-to-end-kontroller för stabila användarflöden.

## Miljöer

- Lokalt: Supabase CLI-konfigurationen under `supabase/` och endast play-money-testdata.
- Moln: ett dedikerat Supabase-projekt `spelsajt` i teamorganisationen och region `eu-north-1`.
- Webb: Vercel-projektet `spelsajt-web` under teamscope `jakeminator123s-projects`.

Projekt-ID:n och nycklar injiceras som miljövariabler och är inte dokumentationens source of truth.
