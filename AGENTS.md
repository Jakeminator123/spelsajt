# Spelsajt – arbetsinstruktioner för Codex

## Uppdrag och gränser

- Bygg en högkvalitativ play-money-plattform för blackjack och europeisk roulette.
- Riktiga pengar, köpbara krediter, insättningar, uttag och externa wallets ligger utanför nuvarande produktgräns.
- Backend är auktoritativ för spelregler, utfall, fairness och saldo. Frontend presenterar semantiska events och får aldrig bestämma utfall.
- AI får välja bland godkända presentationer men får aldrig påverka RNG, regler, ledger eller behörighet.

## Källor som gäller

1. `packages/config/rulesets/*.json` är maskinläsbar sanning för frysta spelregler.
2. Zod-scheman i `packages/contracts/src/` är runtime-sanning för commands, events och snapshots. JSON Schema-filer i `packages/contracts/schemas/` är genererade artefakter och får inte handredigeras.
3. `supabase/migrations/` är enda sanningen för databasschemat. Manuella Dashboard-ändringar ska återskapas som migration innan de betraktas som giltiga.
4. Golden vectors, fixtures och tester låser observerbart beteende. En avsiktlig kompatibilitetsbrytning kräver ny schema-, ruleset- eller algoritmversion.
5. Markdown i `docs/` förklarar avsikt och beslut men får inte motsäga de körbara källorna ovan.

Se `docs/ENGINEERING.md` för den korta ändringsprocessen.

## Arbetsflöde

- Använd pnpm och de versioner som är pinnade i `mise.toml` och `package.json`.
- Gör små, fokuserade ändringar och bevara användarens orelaterade worktree-ändringar.
- Lägg aldrig hemligheter, service-role/secret keys, databaslösenord eller `.env`-filer i Git.
- Ändra ett Zod-kontrakt först, kör sedan `pnpm schemas:generate`, uppdatera fixtures och verifiera kompatibilitet.
- Skapa nya Supabase-migrationer med `pnpm supabase migration new <namn>`; hitta inte på filnamn manuellt.
- Kör `pnpm check` före commit. Vid databasändringar ska även lokal reset, pgTAP och databaslint vara gröna.

## Regressionsregler

- Ingen produktionskod får använda `Math.random` för spelutfall.
- Samma fairness-input måste ge identiskt resultat i Node och Web Crypto.
- Belopp lagras och transporteras som heltal; använd aldrig flyttal för PLAY-saldo.
- Commands ska vara idempotenta och event ska ha stigande sekvensnummer.
- En frontendändring får inte hårdkoda ett visuellt utfall som konkurrerar med ett backend-event.
- Nya tabeller i exponerade scheman måste ha explicita grants, RLS och negativa åtkomsttester.

## Kodgranskning

- Flagga kontraktsändringar utan schema-/fixtureuppdatering.
- Flagga ändringar i en fryst ruleset utan nytt versions-ID och nya golden vectors.
- Flagga databasändringar utanför migrationer eller åtkomst utan uttrycklig RLS/privilegieanalys.
- Flagga frontendkod som importerar serverhemligheter eller försöker räkna fram auktoritativt saldo/utfall.
- Låt CI sköta stil- och typkontroller; håll manuella reviewregler fokuserade på beteende och säkerhet.
