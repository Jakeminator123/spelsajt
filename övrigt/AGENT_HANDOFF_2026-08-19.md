# Agent-handoff 2026-08-19

Det här dokumentet är startpunkten för nästa agent efter konto-/OAuth-integrationen och
innan externa 3D-tillgångar importeras. Kontrollera alltid aktuell `main`, CI och
[`docs/SYSTEM_CANVAS.md`](../docs/SYSTEM_CANVAS.md) innan statusen nedan återanvänds.

## Utgångsläge

- Senast verifierade `main`: `dc9d70be4ebc612084640e21501cc14f8e7ca233`.
- PR #32 innehåller konto-/OAuth-grund, projektanteckningar och PDF.
- PR #33 integrerar `apps/player-account` från den inkommande `player-ac-site`-branchen.
- Endast `main` och den stabila preview-branchen `troubleshooting-support` ska finnas som
  aktiva branches. Avslutade konto-/dashboardbranches finns som
  `archive/2026-08-19/*`-taggar.
- `pnpm install --frozen-lockfile`, hela `pnpm check`, Vercel, containerjobbet och CI:s
  riktiga Postgres-/migration-/RLS-/pgTAP-tester var gröna vid överlämningen.

## Vad som är implementerat

- Blackjack och europeisk roulette kör auktoritativa TypeScript-state-machines i
  `packages/game-core`.
- Game-servern äger regler, RNG/fairness, saldo, ledger, snapshots och sekvensnumrerade
  events. Frontend får aldrig räkna fram ett konkurrerande utfall.
- `apps/web` presenterar liveevents på `/blackjack` och `/roulette` och har textfallback,
  reduced-motion och en eventstyrd 3D-scen.
- `/konto` i spelappen samt `apps/player-account` använder Supabase Auth. Den fristående
  appen har `/login`, Google OAuth-kod, anonym gäst, route gate, logout och profilredigering.
- Dashboardens saldo, statistik och historik är uttryckligen exempeldata. Ett autentiserat
  account-summary-read-model från servern saknas fortfarande.

## Vad 3D-scenen redan har

Bygg inte nya tillgångar utan att först jämföra med dessa fungerande fallbacks:

- `apps/web/src/app/_components/casino-scene.tsx` har ett procedurgenererat bord,
  marker, deal-animation och kamera-/ljusrigg.
- `apps/web/src/app/_components/scene/playing-card.tsx` har en återanvändbar kortmesh som
  genererar framsida för samtliga ranks/suits och en dold baksida.
- `apps/web/src/app/_components/scene/roulette-wheel.tsx` har ett eventstyrt roulettehjul,
  boll och rätt pocketmappning.
- `apps/web/src/app/_components/scene/croupier.tsx` är nuvarande procedurgenererade
  dealerfallback.
- `presentation.ts` och `visual-intents.ts` mappar auktoritativa events till lokala kort-,
  marker-, fokus- och dealerintentioner.

En extern GLB ska förbättra presentationen och kunna falla tillbaka till dessa komponenter.
Den får inte ändra speldata eller avgöra vilket kort/pocket som visas.

## Meshy-läge och fattat beslut

Användaren uppger att Meshy har producerat en riggad humanoid samt walk/run i GLB och FBX.
Filerna är ännu inte importerade eller tekniskt verifierade i repot.

Beslut för första versionen:

- Dealern står bakom bordet. Blackjackkameran kan visa främst överkroppen; roulette behöver
  räckvidden från en stående pose.
- Välj `Talk_with_Hands_Open` som neutral showcase-/presentationsgest.
- Be om samma skelett, neutral start/slutpose, inga steg och en in-place-version utan root
  motion. Händerna ska hålla sig ovanför bordskanten och inte korsa ansiktet.
- Behåll GLB som webbens runtimeformat. FBX är käll-/utbytesformat för Blender/Maya och ska
  inte laddas i webbläsaren.
- Sittande dealer är ett senare, separat idle-/animationspaket. Det ska inte blandas in i
  första stående riggen.

Meshy-resultatet är endast en grundrigg. Finger-/ögonben, ansikts-morph targets, de
dealer-specifika klippen och slutlig webbanpassning behöver fortfarande göras i Blender/Maya
enligt [`DEALER_AVATAR_SPEC.md`](DEALER_AVATAR_SPEC.md).

## Ska blackjackbord och kortlek skapas?

### Blackjackbord: ja, efter att dealerimporten fungerar

Ett produktionssnyggt blackjackbord är en bra separat GLB-tillgång, men det är inte en
blocker eftersom en fungerande procedurvariant redan finns. Använd bordet som nästa
art-pass efter att dealerns skala, placering, händer och kamera är validerade.

Krav på bordstillgången:

- separat `blackjack-table-v001.glb`, utan dealer eller inbakade spelutfall;
- normaliserad fysisk skala, tydlig pivot/origin och konsekvent glTF-orientering;
- separata materialytor för filt, kant/trä/metall och marker-/kortzoner;
- cirka 30k–60k trianglar som utgångsbudget och huvudsakligen 2K-texturer;
- inga texter eller regler inbakade i modellen om de behöver kunna ändras eller översättas;
- licens och Meshy-/källprompt dokumenteras bredvid source-filen.

Nuvarande scen använder stiliserade relativa mått. Nästa agent ska därför först mäta
dealer, bord, kamera och kort tillsammans och införa en uttrycklig scale adapter i stället
för att sprida godtyckliga `scale`-värden.

### Kortlek: nej till 52 separata modeller

Kortsystemet finns redan och tar rank/suit från servereventet. En visuell uppgradering ska
behålla en enda tunn, återanvändbar kortgeometri och byta framsida via procedural canvas,
SVG eller en texture atlas. Kortbaksidan är ett separat material. Detta är lättare, skarpare
och betydligt billigare än 52 GLB-filer.

Rekommenderat framtida assetpaket är därför exempelvis:

```text
playing-card-v001.glb       # valfri gemensam kortgeometri
cards-atlas-v001.webp       # alla framsidor om procedural canvas ersätts
card-back-v001.webp         # gemensam baksida
```

Kortets identitet, synlighet och målposition ska fortsatt komma från
`blackjack.card.dealt`, `blackjack.card.revealed` och presentationens `cardTarget`.

### Övriga tillgångar

- Marker kan senare ersättas av en instansierad chipmesh; skapa inte en GLB per valör.
- Roulettehjulet fungerar redan. Ett externt art-pass får ersätta geometri/material men
  måste bevara pocketordning, eventstyrd rotation och tester.
- Skapa inte walk/run som dealerklipp i produktion. De är bara riggvalidering och möjligt
  framtida lobbyinnehåll.

## Nästa agents rekommenderade ordning

1. Be användaren lägga in eller bifoga dealer-GLB, FBX och varje animationsfil.
2. Kontrollera filnamn, licens, storlek, trianglar, material/texturer, skelett, bind pose,
   clip names, root motion och att samtliga animationer använder samma rigg.
3. Visa GLB:n isolerat i en lokal asset-inspektör innan `casino-scene.tsx` ändras.
4. Importera dealern bakom en liten adapterkomponent och behåll `Croupier` som fallback.
5. Mappa endast godkända `DealerPose`-/cue-värden till klipp; okänt eller saknat klipp ska
   gå till neutral idle.
6. Verifiera blackjack deal/reveal/split/settlement och roulette betting/spin/result samt
   reduced-motion. Animation får aldrig avslöja ett dolt kort i förtid.
7. Lås dealer/kamera/skala. Beställ eller skapa därefter blackjackbordets art-pass.
8. Gör kortens visuella art-pass sist och behåll en gemensam mesh/texture-strategi.
9. Kör `pnpm check`, browserkontroll och relevant visuell regression före PR.

Separat kontospår som fortfarande återstår: aktivera Supabase Anonymous Sign-Ins, Google
provider, Manual Identity Linking och callback-allowlist; hosta `apps/player-account` som
eget projekt; verifiera OAuth end-to-end; bygg därefter ett säkert account-summary-read-model.

## Icke förhandlingsbara gränser

- AI/avatar får endast välja godkänd presentation, aldrig RNG, regler, saldo, ledger eller
  behörighet.
- Frontend får inte hårdkoda eller gissa kort, roulettepocket, payout eller slutligt saldo.
- Ett dolt blackjackkort får inte läcka rank, suit eller card-id före reveal-eventet.
- Lägg inte FBX/sourcefiler eller onödigt stora texturer direkt i produktionsbundlen.
- Ändra kontrakt före fixtures/schema och fryst ruleset endast med nytt versions-ID och nya
  golden vectors.

## Kort startprompt till nästa agent

> Läs AGENTS.md, docs/SYSTEM_CANVAS.md, packages/system-model/models/play-money-mvp.json,
> övrigt/DEALER_AVATAR_SPEC.md och denna handoff. Börja med att inventera de faktiska
> Meshy-filer som användaren bifogar. Implementera inte ny spelmotor eller nytt utfall.
> Validera först dealer-GLB/skelett/animationer isolerat, behåll den procedurgenererade
> croupiern som fallback och föreslå en liten eventstyrd import-PR med tester.
