# Plan för att förena Emils repo med Spelsajt

Granskad 2026-08-19. Källrepo: privat GitHub-repo `EmaCodeHero/ava-live-blackjack`, default branch `main`, commit `13a93549bc323ed2634dee4b801c52fda9881542`.

## Kort rekommendation

Gör `spelsajt` till målrepo och flytta in Emils dealer- och presentationsarbete stegvis via separata pull requests. Gör inte en vanlig hel-repo-merge och ersätt inte Spelsajts spelmotor, v2-kontrakt, Supabase-identitet, ledger eller fairness.

Emils starkaste tillgångar är:

- en Ready Player Me-kompatibel GLB-avatar med visemes;
- R3F-kod för blink, blick, andning, huvudrörelse och gester;
- en eventregissör som skiljer skriptade spelrepliker från LLM-chatt;
- leverantörsadaptrar för LLM och TTS samt ljudcache;
- ett videodealer-spår med ankarbild, klippbibliotek, crossfade och eventmappning;
- konkret visuell research, identitetsbilder och verifieringsmaterial.

Spelsajts starkaste tillgångar och auktoritativa ansvar är:

- testade blackjack- och roulettemotorer i `packages/game-core`;
- versionerade Zod-kontrakt och semantiska v2-events;
- serverägd fairness, Postgres-ledger och Supabase Auth;
- idempotenta commands, snapshots och sekvensnumrerad realtime;
- ett befintligt Reaction Planner-/presentation-intent-lager med reduced-motion-fallback.

## Det som ska flyttas in

| Från Emils repo | Mål i Spelsajt | Behandling |
| --- | --- | --- |
| `client/public/avatar.glb` och uniformtexture | `apps/web/public/models/dealer/` | Licens, storlek, rigg och blendshapes verifieras före import. |
| `client/src/scene/Avatar3D.tsx` | `apps/web/src/app/_components/scene/dealer/` | Anpassas till Spelsajts `PresentationIntent`; ingen egen game store. |
| `shared/lipsync.ts` och voice player-idéer | dealer-/audio-mapp i webben | Görs till presentationsteknik och testas med textfallback. |
| gaze- och gesturelogik | `dealer-avatar.tsx` + `avatar-director.ts` | Tar bara emot godkända cues, aldrig rå spelstate som ny sanning. |
| persona, scripts och director | framtida `apps/presentation-service/` eller server-side route | Motorn publicerar events; dealerregin väljer bara om/när/hur det uttrycks. |
| LLM-/TTS-providerinterfaces | `packages/presentation-ai` först när två appar behöver dem | Hemligheter stannar server-side; mockläge bevaras. |
| `video-dealer/` | `art-source/dealer-video/` + web player | Separat feature flag/spår tills pilotklippen är godkända. |
| researchbilder och teststrips | `art-source/` eller extern objektlagring | Inte i webbundle. Masters och genererade kandidater skiljs från runtime-assets. |

## Det som inte ska mergas

- `server/src/game/**`: parallell blackjackmotor skulle konkurrera med `packages/game-core`.
- Emils `shared/protocol.ts`: Spelsajts Zod-validerade `GameEventV2` och commands gäller.
- `server/src/brain/memory.ts`: JSON-fil ersätts av Supabase-identitet och en framtida RLS-/serverägd minnesmodell.
- Emils lokala `playerId` och enbordslösning: spelare ska fortsätta identifieras med verifierad Supabase-token.
- `Math.random()` får inte följa med in i spelutfall. Slump för blink/idle kan finnas i presentationen men ska vara testbar och aldrig påverka spelstate.
- Emils real-money-inriktning i `context.md`: nuvarande Spelsajt är uttryckligen play-money-only.
- `npm`-lock och Vite-/Railway-rootkonfiguration: målrepot använder pnpm, Turborepo, Next.js och befintlig Vercel/Render-drift.

## Föreslagen målstruktur

```text
apps/
  web/
    public/models/dealer/
      ava-v001.glb
      ava-uniform-v001.webp
    src/app/_components/scene/dealer/
      dealer-avatar.tsx
      avatar-director.ts
      avatar-manifest.ts
      lipsync.ts
      dealer-avatar.test.ts
  game-server/                 # oförändrat auktoritativt spel och ledger
  presentation-service/        # först när server-side AI/TTS byggs
packages/
  contracts/                   # befintliga v2 game contracts
  game-core/                   # befintliga motorer
  presentation-ai/             # valfritt senare, provideragnostiskt
art-source/
  dealer-3d/                   # Blender/Meshy/RPM masters
  dealer-video/                # ankarbilder, klippplan och verifiering
övrigt/
  DEALER_AVATAR_SPEC.md
  EMIL_REPO_SAMMANSLAGNING.md
```

`art-source/` bör bara skapas när ni faktiskt bestämmer vad som ska versionshanteras. Stora videor och modellmasters passar ofta bättre i objektlagring med ett manifest i Git; optimerade runtimefiler kan ligga under `apps/web/public/`.

## Integrationskontraktet mellan spel och dealer

Flödet ska vara enkelriktat:

```text
GameEventV2
  -> befintlig Reaction Planner
  -> PresentationIntent / DealerCue
  -> Avatar Director
  -> animation + blick + textning + valfri röst
```

AI får välja formulering, röstvariant eller en godkänd gest. AI får aldrig välja kort, roulettepocket, payout, saldo, behörighet eller om ett command är giltigt.

Emils `DealerBrain.onEvent` är en bra prototyp för regin, men dess egna `TableEvent` ska ersättas med en uttömmande adapter från Spelsajts befintliga v2-events. Varje event ska få en presentation eller ett uttryckligt `ignore`.

## Rekommenderad PR-ordning

1. **Asset-spike:** importera en optimerad GLB och visa idle/blink i en isolerad demo utan AI.
2. **Eventadapter:** koppla befintliga presentation intents till gaze/gesture med fixtures och reduced-motion.
3. **Läppsynk och ljud:** integrera färdig ljuduppspelning, textning och avbrottsregler.
4. **Dealerregi:** porta script/director-logik server-side utan Emils spelmotor.
5. **LLM/TTS:** lägg till leverantörsadaptrar, strukturerat output, rate limits och mockfallback.
6. **Videodealer-pilot:** feature flag, CDN-manifest, preloading och fallback till 3D/text.

Varje steg bör komma från en kortlivad branch och en PR till `main`. Emil kan äga dealer-/animationsmapparna, medan ändringar i `packages/contracts`, `apps/game-server` och Supabase kräver gemensam granskning.

## Första gemensamma beslutet

Innan kod flyttas bör ni välja primärt visuellt spår för nästa demo:

- **3D-avatar först:** lägst distributionskostnad, bäst realtidsreaktioner och enklast integration med nuvarande R3F-scen.
- **Videodealer först:** högre fotorealism men kräver godkänt klippbibliotek, assetleverans och en tydlig fallback.

Rekommendationen är 3D-avatar först och videodealern som parallell experimentflagga. Båda ska använda samma DealerCue-gränssnitt.
