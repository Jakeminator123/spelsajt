# PR: Casino-lobby med 3D-roulettebord (frontend/presentation)

Denna PR gör om `apps/web` från en teknisk scaffold-sida till en mogen casino-
och sportboks-lobby, och ersätter den enkla 3D-hero med en trovärdig europeisk
roulette-scen (numrerat hjul, utdelade spelkort, delar av en croupier) driven av
en **återanvändbar, event-driven presentationsmotor**.

> **Produktgräns:** Allt arbete ligger i presentationslagret. Ingen backend,
> spelmotor, RNG, ledger eller behörighet har rörts. Se avsnittet
> [Efterlevnad av AGENTS.md](#efterlevnad-av-agentsmd).

---

## 1. Vad som gjorts i stort

### Design / UI (`apps/web`)
- **Ny visuell riktning:** från "traditionell grön filt + guld" till en mognare,
  modern iGaming-look (referens: yologames.io, bethard.com) — sval nästan-svart
  bas, elektrisk **lime** som primärfärg och **violett** signaturaccent. Allt via
  design-tokens i `globals.css`.
- **Ny typografi:** rubriker i **Bricolage Grotesque**, brödtext i **Inter Tight**,
  laddade via `next/font/google` (inga externa font-requests, ingen ny dependency).
- **Utbyggd lobby:** hero, live-vinnar-ticker, spelrutnät (blackjack, roulette,
  slots, live casino, poker), **sportboks-sektion** med oddstavla, kampanjbanner,
  perks och footer. Scroll-effekter via en återanvändbar `Reveal`-komponent
  (IntersectionObserver) och en uppräknande jackpot — allt med stöd för
  `prefers-reduced-motion`.

### 3D-scen (`apps/web/src/app/_components/scene/`)
- **Europeiskt roulettehjul** med korrekt 0–36-sekvens, bakad röd/svart/grön
  nummerruta (canvas-textur), 3D-frets, mittturell och en kula som snurrar,
  spiralar inåt och lägger sig i ett fack — **rent kosmetiskt**, inget vinnande
  nummer impliceras.
- **Riktiga spelkort** med bakade fram-/baksidetexturer.
- **Delar av en croupier** (ärmar, manschetter, händer) som delar mot bordet.
- **Studioljus** via drei `Environment`/`Lightformer`, kontaktskuggor och en
  mjuk kamera-rigg.

### Återanvändbar animationsteknik
- `animation.ts` — en `PoseMixer` som cross-fadar mellan namngivna poser med
  additiv "andning" ovanpå. Detta är tekniken som är tänkt att driva riggade
  croupier-/spelar-avatarer senare.
- `presentation.ts` — en **semantisk fas-state-maskin** för en rouletterunda
  (`betting → no_more_bets → ball_in_motion → result → payout`). Detta är samma
  vokabulär som backend förväntas sända som auktoritativa events.
- `table-director.tsx` — en provider (delad state via ref, läses varje frame utan
  re-render) plus en **ambient demo-director** som stegar fas-klockan. Scenen
  (croupier, kort, kula, fas-etikett) prenumererar på fasen och mappar den till
  godkända presentationer.

---

## 2. Beroenden

**Inga nya beroenden lades till.** All 3D- och typografifunktionalitet bygger på
paket som redan fanns i `apps/web/package.json`:

| Paket | Version | Användning i denna PR |
| --- | --- | --- |
| `three` | 0.185.1 | Geometrier, material, canvas-texturer för hjul/kort |
| `@react-three/fiber` | 9.7.0 | React-renderare för Three.js (`Canvas`, `useFrame`) |
| `@react-three/drei` | 10.7.8 | `Environment`, `Lightformer`, `ContactShadows`, `RoundedBox` |
| `next` (`next/font`) | 16.3.1 | Bricolage Grotesque + Inter Tight (self-hosted, ingen extern request) |
| `react` / `react-dom` | 19.2.8 | Context för delad table-state, UI |

Fonterna hämtas vid build via `next/font/google` och bundlas lokalt — de kräver
ingen runtime-nyckel eller nätverksanrop i produktion.

---

## 3. Ändrade / nya filer

```
apps/web/src/app/layout.tsx                         (M) next/font: Bricolage + Inter Tight
apps/web/src/app/page.tsx                           (M) full lobby: spel, sport, kampanj, perks
apps/web/src/app/globals.css                        (M) ny token-palett, typografi, fas-pill
apps/web/src/app/_components/reveal.tsx             (A) scroll-reveal (IntersectionObserver)
apps/web/src/app/_components/jackpot-counter.tsx    (A) uppräknande jackpot
apps/web/src/app/_components/winners-ticker.tsx     (A) live-vinnar-marquee
apps/web/src/app/_components/casino-scene.tsx        (M) scen-komposition + fas-etikett + kortutdelning
apps/web/src/app/_components/scene/animation.ts      (A) PoseMixer + easing (återanvändbar)
apps/web/src/app/_components/scene/presentation.ts   (A) semantisk fas-state-maskin
apps/web/src/app/_components/scene/table-director.tsx(A) state-provider + ambient director
apps/web/src/app/_components/scene/roulette-wheel.tsx(A/M) hjul + kula bunden till fas
apps/web/src/app/_components/scene/playing-card.tsx  (A) kort med bakade texturer
apps/web/src/app/_components/scene/croupier.tsx      (A/M) croupier-armar bundna till fas
apps/web/public/images/*                             (A) genererade spel-/sportbilder
docs/PR_CASINO_3D_HERO.md                            (A) detta dokument
```

---

## 4. Efterlevnad av AGENTS.md

- **Backend är auktoritativ.** Fas-klockan i `presentation.ts`/`table-director.tsx`
  är en kosmetisk demo-loop. Den producerar inget vinnande nummer och ingen
  ledger-effekt. När den riktiga motorn kopplas in ersätts **enbart**
  `advanceTableState` av en prenumeration som skriver backend-sända faser in i
  samma ref — resten av scenen är oförändrad.
- **Ingen `Math.random` för spelutfall.** Inget slumptal används överhuvudtaget
  för något som kan läsas som ett utfall; kulan landar i ett fast fack, kort är
  hårdkodade demokort.
- **Frontend hårdkodar inget auktoritativt utfall.** Scenen visar semantiska
  faser och godkända presentationer, aldrig ett resultat som konkurrerar med ett
  backend-event.
- Inga ändringar i `packages/`, `supabase/migrations/`, rulesets, kontrakt eller
  golden vectors. Inga hemligheter tillagda.

---

## 5. Verifiering

- `pnpm --filter @spelsajt/web typecheck` — grönt
- `pnpm --filter @spelsajt/web lint` — grönt
- Manuell verifiering i webbläsare (desktop 1440×900 + mobil 390×844): scenen
  renderar, korten delas ut, ingen horisontell scroll.

> Not: I en headless/strypt webbläsare kan `requestAnimationFrame` pausas mellan
> skärmdumpar, vilket gör att fas-klockan (som drivs av frame-delta) tycks stå
> still. I en vanlig, fokuserad flik går faserna i realtid.

---

## 6. Så här mergar du lokalt

Branch: `casino-gaming-platform` → bas: `main`.

```bash
# hämta och granska
git fetch origin
git checkout casino-gaming-platform
git pull

# verifiera
pnpm install
pnpm --filter @spelsajt/web typecheck
pnpm --filter @spelsajt/web lint
pnpm --filter @spelsajt/web dev   # öppna http://localhost:3000

# merga till main (efter granskning / via GitHub PR)
git checkout main
git merge --no-ff casino-gaming-platform
```

Eller merga direkt via GitHub-PR:en som hör till denna branch.

---

## 7. Nästa steg (förslag)

- Koppla `presentation.ts` till riktiga semantiska events från spelmotorn
  (ersätt `advanceTableState` med en socket-/event-prenumeration).
- Bygg ut `PoseMixer` till fullständigt riggade croupier-/spelar-avatarer.
- Koppla "Logga in"/"Skapa konto" till befintlig Supabase-auth.
