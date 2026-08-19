# Spelsajt – MVP-plan

Version 1.1 – 19 augusti 2026

## Målbild

Bygg en smal men tekniskt högklassig play-money-MVP för enspelare. Användaren ska kunna logga in eller prova direkt, få testkrediter, spela blackjack och europeisk roulette samt verifiera varje resultat. Frontend ska kännas modern, responsiv och levande genom 3D, ljud och händelsestyrda avatarreaktioner.

MVP:n innehåller inga riktiga pengar, insättningar, uttag, köpbara marker, externa wallets eller överföringar.

## Så används planen

Det här dokumentet låser produktomfattning, ansvar och ordningen mot privat alpha. Det är inte en checklista över aktuell runtime. Faktisk implementations- och verifieringsstatus finns i [System canvas](SYSTEM_CANVAS.md) och den validerade modellen i `packages/system-model/models/play-money-mvp.json`. Auktoritativa källor per område finns i [Engineeringavtalet](ENGINEERING.md).

Procentestimat är kommunikation och kan ändras. En funktion räknas som implementerad först när systemkartan kan peka på runtimekod och relevant verifiering.

## Nuläge

- Den auktoritativa spelkedjan är implementerad för blackjack och europeisk roulette: autentiserade v2-commands, deterministiska motorer, fairness, atomisk Postgres-ledger, idempotens, snapshots och sekvensnumrerade realtime-events.
- `/blackjack` och `/roulette` konsumerar liveevents. Presentationen har textfallback, reduced motion och uttömmande event-till-cue-mappning. `/3d-lab` finns för isolerad granskning av dealer-GLB och klipp.
- `/konto` är den enda kontoappen och deployas tillsammans med `apps/web`. Den tidigare `apps/player-account` är en pensionerad designprototyp och ska inte hostas separat. Profil-RLS, manual identity linking samt produktions-/lokala redirect-URL:er är verifierade i produktion; Google-providercredentials och OAuth-flödet behöver fortfarande verifieras end-to-end.
- Kontoöversikten hämtar verkligt PLAY-saldo, aggregerad statistik och senaste rundor från ett bearer-skyddat, Zod-validerat account-summary-read-model i game-servern. Den parallella frontendens exempeldata används inte i den publika appen.
- Nuvarande 3D-dealers är testmaterial eller procedurfallback. En produktionsgodkänd dealer med fingerben och riktiga dealerklipp återstår; kort, marker, bord och roulettehjul ska fortsätta vara separata scenobjekt.

## Aktiv leveransordning mot privat alpha

1. **Stäng kontospåret.** Behåll `/konto` i den enda Vercel-appen, konfigurera OAuth och redirects i avsedda driftmiljöer och kör login/logout/linking samt det hostade account-summary-flödet end-to-end.
2. **Leverera dealer-slicen.** Godkänn en versionslåst och optimerad GLB i `/3d-lab`; kräv stabil rigg, fingerben och klippen `idle`, `deal_left`, `deal_right`, `reveal` samt diskreta vinst-/förlustreaktioner. Koppla klippen via frontendens befintliga cues och behåll procedurfallback.
3. **Kör sammanhållen alpha-polish.** Verifiera hela resan konto → spel → reconnect → settlement → fairness på desktop och mobil. Stäng kända gap i tillgänglighet, laddning, felstatus, assetprestanda och visuell konsekvens innan feature freeze.

Jakob leder normalt backend, fairness, databas och säkra API:er. Emil leder normalt webb, 3D, ljud och Animation Director. Båda granskar kontrakt och end-to-end-flöden; ingen frontendleverans får skapa en parallell spelmotor.

Milstolparna nedan bevarar de funktionella målgrindarna. Läs inte deras punktlistor som nulägesstatus; använd systemkartan för det.

## Produktomfattning

- Supabase Auth med konto och anonymt prova-direkt-läge.
- 10 000 PLAY-krediter per nytt konto och en kontrollerad återställning när saldot är slut.
- Blackjack med sex lekar, ny shuffle per hand, S17, 3:2, hit, stand, double och en split.
- Europeisk roulette med 0-36 och vanliga inside- och outside-bets.
- Commit/reveal-baserad fairness och en verifierare som körs i webbläsaren.
- En responsiv 3D-scen per spel med reduced-motion-alternativ.
- Enspelarrundor. Multiplayer och gemensamma bord kommer efter MVP.

## Arkitektur

```text
Spelare
  -> Next.js + React Three Fiber
  -> autentiserat command med idempotency key
  -> Fastify game-server
  -> deterministisk game-core + fairness-kärna
  -> atomisk Postgres-transaktion
  -> sekvensnumrerade domänevent via Socket.IO
  -> frontendens animation director
```

Frontend skickar bara commands som `PLACE_BET`, `HIT`, `STAND`, `DOUBLE` och `SPIN`. Backend är alltid auktoritativ för regler, resultat och saldo. Alla tillståndsändringar får ett unikt command-ID så att retry eller dubbelklick inte kan debiteras två gånger.

Backend skickar semantiska events, aldrig GLB-filnamn. Ett `round.settled` med utfallet `loss` kan exempelvis översättas av frontend till en sympatisk dealerreaktion. Ett valfritt AI-lager får välja bland godkända presentationer men får aldrig påverka RNG, regler eller ledger.

## Fairness

1. Servern skapar ett kryptografiskt 32-byte server seed.
2. SHA-256-commitment skickas innan insatsen accepteras.
3. Klienten skapar därefter ett client seed.
4. Ett unikt nonce reserveras atomiskt.
5. HMAC-SHA256 skapar en deterministisk byte stream.
6. Blackjack använder Fisher-Yates med rejection sampling.
7. Roulette mappar unbiased till ett heltal 0-36.
8. Server seed avslöjas efter settlement.
9. Verifieraren reproducerar deck eller roulettnummer lokalt.

Ingen spelkod får använda `Math.random`, flyttal för saldon eller modulo-mappning som skapar bias.

## Milstolpe 1 - vertikal slice

Jakob bygger repo, CI, JWT-verifiering, ledger, delade eventkontrakt, minimal blackjack-state-machine och första commit/reveal-flödet.

Emil bygger login, lobby, saldo, blackjackskal, inspelade event-fixtures och en placeholder-GLB som reagerar på `round.settled`.

Klart när en användare kan logga in, få krediter, satsa, spela en hand, få atomiskt settlement, se en 3D-reaktion och verifiera rundan.

## Milstolpe 2 - komplett blackjack

- Hit, stand, double, split, dealerlogik och ess.
- Sekvensnummer, snapshot och reconnect.
- Komplett kort-, marker- och kontroll-UI.
- Deal-, reveal-, bust-, win- och loss-animationer.
- Golden vectors, regeltester och ledger-invariants.

Klart när refresh, retry eller tappat nätverk inte kan duplicera krediter eller låsa en runda.

## Milstolpe 3 - europeisk roulette

- State machine: accepting bets, locked, spinning och settled.
- Straight, split, street, corner, six-line, column, dozen, red/black, odd/even och low/high.
- Exhaustiva payout-tester för samtliga 37 möjliga utfall.
- Satsningsmatta, chip stacking, clear och rebet.
- Hjul och boll animeras mot serverns redan bestämda resultat.
- Gemensam verifierare och rundhistorik.

Klart när visuellt utfall, verifierare, ledger och serverresultat alltid visar samma nummer.

## Milstolpe 4 - polish och privat alpha

- Rate limits, strikt inputvalidering och säker nyckelhantering.
- Strukturerade loggar med user-, command- och round-ID.
- E2E-test för login, båda spelen, saldo, refresh och reconnect.
- Responsiv mobilvy, tangentbord och reduced motion.
- Asset-preloading, adaptiv kvalitet och tydliga fel- och reconnectlägen.
- Feature freeze följt av stabilisering på staging.

Klart när de två huvudsakliga användarresorna fungerar på staging utan manuella databasändringar och inga kända fel kan duplicera krediter eller ändra ett utfall.

## Ansvar

Jakob äger normalt `apps/game-server`, `packages/game-core`, `packages/fairness` och Supabase-migrations. Emil äger `apps/web`, 3D-assets, ljud och animation director. Båda granskar `packages/contracts` och end-to-end-flöden.

## GitHub-flöde

- Ett repo med skyddad `main`.
- Kortlivade `feat/...`-brancher, inga permanenta frontend-/backendbrancher.
- Pull request krävs för merge.
- CI måste klara lint, TypeScript, tester och build.
- Ändringar i eventkontrakt granskas av både Jakob och Emil.

## Deploystrategi

`apps/web` deployas till Vercel och får automatiska preview-URL:er från GitHub. `apps/game-server` körs som en separat långlivad Node-process eftersom Socket.IO och auktoritativ spelstate behöver förutsägbar livscykel. Supabase levererar Auth och Postgres.

## Efter MVP

- Multiplayer och gemensamma bord.
- Insurance, surrender, resplit och side bets.
- La partage, en prison, racetrack och neighbor bets.
- Runtime-genererad AI-dialog, röst och avancerad avatarstyrning.
- Bonusar, kampanjer, turneringar och komplett adminpanel.
- Riktiga wallets eller andra ekonomiska funktioner.

## Kvalitetsgrind

- Webbläsaren kan aldrig skriva ledger eller bestämma utfall.
- Samma command kan inte settle:a mer än en gång.
- Samma seed, nonce och ruleset ger alltid samma resultat.
- Frontend kan återställa state från snapshot och eventsekvens.
- Desktop och mobil har fungerande reduced-motion-fallback.
- `pnpm check` är grön före merge.
