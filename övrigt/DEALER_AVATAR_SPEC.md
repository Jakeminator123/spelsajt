# Specifikation: eventstyrd dealeravatar med valfri OpenAI-personlighet

## Bedömning av grundidén

**Grundidén får 9 av 10.**

Det är en bra arkitektur att låta en 3D-dealer reagera på explicita spelhändelser och samtidigt ge dealern en konsekvent personlighet med AI. Den viktiga preciseringen är att det inte ska vara en enda AI som styr allt.

Dealern ska bestå av två oberoende lager:

1. En deterministisk Avatar Director väljer godkänd animation, blick, ansiktsuttryck och avbrottsregel från serverns `GameEventV2`.
2. En valfri AI-tjänst formulerar kort dialog och tonalitet inom ett strikt schema efter att grundreaktionen redan har startat.

AI är därmed dealerns improvisations- och personlighetslager, inte dealerns spelhjärna. Spelservern förblir ensam auktoritet för kort, rouletteficka, regler, fairness, payout, ledger och PLAY-saldo.

Om “Meshy” avser en 3D-mesh eller en modell skapad med Meshy.ai gäller samma leveranskontrakt: verktyget får skapa utseendet, men produktionsasseten ska vara en granskad, riggad och optimerad GLB med lokalt definierade animationer.

## Mål

Dealern ska:

- kännas som en sammanhängande person med stabil röst, ton och temperament;
- reagera omedelbart och korrekt på blackjack- och rouletteevents;
- fortsätta fungera fullständigt när OpenAI, röst eller nätverk är avstängt;
- aldrig exponera dold spelstate eller konkurrera med backendens utfall;
- vara avbrytbar så att tal och kosmetiska gester aldrig blockerar nästa spelhandling;
- ge samma information i reduced-motion- och textläge.

## Icke-mål

Dealern ska inte:

- välja kort, rouletteficka, utfall, payout eller saldo;
- skapa eller skicka `GameCommandV2`;
- räkna om blackjack- eller rouletteregler;
- få tillgång till server seed före reveal, databas, ledger eller service-role-nycklar;
- ta emot godtyckliga clipnamn, benrotationer, URL:er eller Three.js-kod från AI;
- fördröja command acknowledgement, eventleverans eller settlement;
- bygga en bestående profil av spelaren utan ett separat samtyckesbeslut.

## Befintlig integrationspunkt

Den körbara kedjan är redan:

```text
GameEventV2
  -> planGameEvent(...)
  -> PresentationCue
  -> sceneVisualIntent(...)
  -> CroupierVisualPose
  -> nuvarande procedurhänder i Croupier
```

Den nya kedjan ska bli:

```text
GameEventV2
  -> Reaction Planner
  -> PresentationCue
  -> Avatar Director ---------------------> godkänt GLB-klipp direkt
                  |
                  +-> sanerat SpeechIntent
                        -> server-side Personality Service
                        -> validerad kort replik
                        -> tal + läppsynk om cuen fortfarande är aktuell
```

Avatar Director ersätter inte Reaction Planner. Den konsumerar dess redan godkända cue och styr endast presentation.

## 3D-assetkontrakt

### Fil och källmaterial

- Produktionsformat: glTF 2.0 Binary, `.glb`.
- Redigerbar källa: `.blend` eller motsvarande ska sparas utanför runtimeasseten.
- En Three.js-enhet motsvarar en meter.
- Y är uppaxel.
- Dealern ska titta mot positiv Z, där spelaren befinner sig i den nuvarande scenen.
- Root-origo placeras centrerat mellan fötterna. En sittande eller halvfigurvariant får ha ett dokumenterat alternativt origo.
- Ingen animation får använda permanent root motion. Dealern står eller sitter kvar bakom bordet.
- Texturer ska bäddas in i GLB eller levereras från repots egna statiska assets; inga externa runtime-URL:er.

### Rekommenderad Meshy-pipeline

1. Generera en fullständig humanoid dealer i neutral T-pose eller A-pose.
2. Be om separerade armar, händer och fingrar utan kort, marker eller bord fastbyggda i kroppen.
3. Kör remesh och UV unwrap innan slutlig texturering om modellen har onödigt tät geometri eller synliga textursömmar.
4. Aktivera `Remove Lighting` så att skuggor inte bakas in i färgtexturen.
5. Aktivera PBR och generera Base Color/Albedo, Normal, Roughness och Metallic.
6. Använd 2K-texturer för webbversionen. En 4K-master får sparas för framtida omexport, men 8K ska inte skickas till browsern.
7. Kör humanoid auto-rig i Meshy och prova ett neutralt idle-klipp.
8. Exportera en riggad FBX till Blender för dealerunika klipp och ansiktsarbete.
9. Rätta viktning, handpositioner, bordskollisioner, material och clipnamn i Blender.
10. Exportera den granskade runtimeversionen som en GLB med flera namngivna animationsklipp.

Meshys presets är lämpliga för rigg, idle och generella kroppsgester. `deal`, `reveal`, `collect` och `payout` behöver sannolikt justeras eller keyframas mot det faktiska bordet i Blender. Precisa ansiktsuttryck, morph targets och visemes ska också betraktas som ett separat DCC-steg, inte som garanterad auto-rig-output.

### Filstruktur och versionshantering

Föreslagen struktur:

```text
art-source/
  dealer/
    v001/
      meshy-original.glb
      dealer-rigged.fbx
      dealer.blend
      textures-master/
        dealer-base-color-4k.png
        dealer-normal-4k.png
        dealer-roughness-4k.png
        dealer-metallic-4k.png

apps/web/public/models/dealer/
  dealer-v001.glb

apps/web/src/app/_components/scene/dealer/
  dealer-avatar.manifest.ts
```

Regler:

- `art-source/` innehåller original och redigerbart källmaterial och får aldrig laddas av webbappen.
- Stora `.blend`-, FBX- och mastertexturer ska lagras med Git LFS eller i gemensam assetlagring, inte som vanliga stora Git-objekt.
- Endast den optimerade `dealer-v001.glb` placeras i `public`.
- En publicerad version skrivs aldrig över. Nästa granskade export blir `dealer-v002.glb`.
- Manifestet väljer aktiv version och mappar lokala action-ID:n till clipnamn.
- En `.glb` med alla kärnklipp är förstahandsvalet. Om Meshy exporterar ett klipp per fil ska de konsolideras till en rigg och flera Actions i Blender före slutexport.
- Texturer kan ligga inbäddade i GLB. Separata runtime-texturer används endast om mätning visar att delad caching eller KTX2-komprimering behövs.

Exempel på manifest:

```ts
export const dealerAvatarManifest = {
  assetUrl: "/models/dealer/dealer-v001.glb",
  clips: {
    rest: "idle_loop",
    present: "present",
    deal: "deal_right",
    reveal: "reveal",
    collect: "collect",
    payout: "payout",
    celebrate: "celebrate_subtle",
    sympathetic: "sympathize_subtle",
  },
  version: 1,
} as const;
```

### Texturernas pixlar och färgrymd

Själva kroppen mäts inte i pixlar. Den består av polygoner/trianglar, UV-koordinater, rigg och skin weights. Pixlar gäller texturkartorna som läggs över geometrin.

För runtimeversionen:

- Base Color/Albedo: 2048 × 2048, sRGB.
- Normal: 2048 × 2048, linjär/non-color.
- Roughness: 2048 × 2048, linjär/non-color.
- Metallic: 2048 × 2048, linjär/non-color; hud och tyg ska normalt vara icke-metalliska.
- Occlusion/AO: valfri 2048 × 2048 linjär karta om den ger mätbar visuell förbättring.
- Masterkartor får vara 4096 × 4096 men ska skalas ned vid webbexport.
- PNG är lämpligt för redigerbara masterkartor. Runtimekartorna bäddas i GLB och får senare komprimeras efter visuell jämförelse.

Använd helst ett välgjort 2K-atlas för hela dealern i första versionen. Flera 4K- eller 8K-kartor blir snabbt tyngre än själva geometrin och ger långsam mobil laddning utan motsvarande förbättring i den aktuella kameravinkeln.

### Prestandabudget för första versionen

- Högst 70 000 synliga trianglar i huvud-LOD.
- Högst fyra material.
- Texturer högst 2048 × 2048 per karta.
- Högst fyra skin weights per vertex.
- Komprimerad GLB högst 10 MB som målvärde.
- Avataren ska hålla minst 30 FPS på måltelefon och 60 FPS på normal desktop när resten av bordet visas.
- Skuggor ska kunna stängas av separat på svagare enheter.

Om kvaliteten kräver en större originalmodell ska ett enklare mobilt LOD exporteras i stället för att överskrida budgeten utan mätning.

### Minsta humanoida rigg

Riggen ska ha stabila, dokumenterade bennamn för:

- root och hips;
- spine, chest, neck och head;
- vänster/höger shoulder, upper arm, forearm och hand;
- minst tumme, pekfinger och ett gemensamt grepp för övriga fingrar per hand;
- valfria ögonben om blick inte enbart drivs med morph targets.

Kort och marker fortsätter vara separata auktoritetsneutrala scenobjekt. Avatarens händer kan synkroniseras mot dem, men får inte skapa kort eller marker.

### Ansikte och morph targets

Minimikrav:

- `blinkLeft`, `blinkRight`;
- `jawOpen`;
- `smile`, `frown`;
- `browUp`, `browDown`;
- `lookLeft`, `lookRight`, `lookUp`, `lookDown`, alternativt ögonben.

Rekommenderade visemes för senare läppsynk:

- `rest`, `aa`, `ee`, `ih`, `oh`, `ou`;
- `fv`, `l`, `mbp`.

För första röstslicen räcker amplitudstyrd `jawOpen`. Visemes är en kvalitetsuppgradering och ska drivas av faktiskt ljud eller tidsatta fonem, inte uppskattad textlängd.

### Obligatoriska animationsklipp

| Lokalt action-ID | GLB-klipp | Typ | Rekommenderad längd |
| --- | --- | --- | --- |
| `rest` | `idle_loop` | loop | 4–8 s |
| `present` | `present` | engångs | 0,8–1,5 s |
| `deal` | `deal_left` och `deal_right` | engångs | 0,6–1,0 s |
| `reveal` | `reveal` | engångs | 0,7–1,2 s |
| `collect` | `collect` | engångs | 0,8–1,4 s |
| `payout` | `payout` | engångs | 0,8–1,4 s |
| `celebrate` | `celebrate_subtle` | engångs | 1,0–1,8 s |
| `sympathetic` | `sympathize_subtle` | engångs | 1,0–1,8 s |
| `explain` | `explain_loop` | loop | 2–5 s |
| `listen` | `listen_loop` | loop | 2–5 s |
| `talk` | `talk_loop` | loop/additive | 2–5 s |

Alla klipp ska:

- börja och sluta i en pose som kan cross-fadas mot idle;
- undvika att armar eller händer går genom bordsskivan;
- vara semantiskt neutrala beträffande vinnare och utfall;
- ha samma skeleton och bind pose;
- kunna spelas utan ljud.

Ett lokalt manifest mappar action-ID till GLB-klipp. Servern och AI får aldrig skicka ett GLB-klippnamn.

## Avatar Director

Avatar Director är en lokal TypeScript-komponent i presentationslagret. Den tar emot en cue och producerar en köad, validerad avatarintention.

Föreslagen intern form:

```ts
type AvatarAction =
  | "rest"
  | "present"
  | "deal"
  | "reveal"
  | "collect"
  | "payout"
  | "celebrate"
  | "sympathetic"
  | "explain"
  | "listen"
  | "talk";

interface AvatarIntent {
  sourceEventId: string;
  sourceSequence: number;
  action: AvatarAction;
  priority: "critical" | "gameplay" | "emotion" | "ambient";
  interruptPolicy: "replace" | "queue" | "drop_if_busy";
  lookTarget: "dealer-hand" | "player-hand" | "roulette-wheel" | "player" | "table";
  speechIntent: DealerSpeechIntent | null;
}
```

### Prioritet

1. **Critical:** kort reveal och landning på serverangiven rouletteficka. Får avbryta tal och kosmetiska gester.
2. **Gameplay:** dela kort, samla marker, payout och presentera tillåten tur.
3. **Emotion:** celebrate, sympathize och kort resultatreplik.
4. **Ambient:** idle, blinkning, andning, blick och små huvudrörelser.

Critical och gameplay får aldrig vänta på AI eller ljud.

### Eventregler

- `blackjack.card.dealt` startar `deal`, men kortets identitet och mål kommer endast från eventet.
- Ett kort med `faceUp:false` får aldrig skapa synlig kortfront, dialog om kortet eller AI-kontext med kortidentitet.
- `blackjack.card.revealed` startar `reveal` och visar exakt serverkortet.
- `roulette.spin.started` får endast starta en neutral spinpresentation. Ingen slutposition får antydas.
- `roulette.result` får avbryta lokal timing och landa på exakt `payload.pocket`.
- Settlement väljer endast lokalt godkänd `celebrate`, `sympathetic`, `present`, `collect` eller `payout`.
- Samma `eventId` eller samma redan presenterade sekvens får inte spela en kritisk handling eller replik två gånger.
- Ett snapshot återankrar scenen till aktuell state utan att återspela hela animationshistoriken.

De befintliga 24 cue-ID:na ska fortsätta ha en uttömmande mappning. Ett nytt cue-ID ska göra TypeScript eller testsviten röd tills en explicit presentation eller `ignore` har valts.

## Dealerpersonlighet

Personligheten ska vara en versionshanterad konfiguration, inte enbart en lång fri prompt.

```ts
interface DealerPersona {
  personaVersion: 1;
  dealerId: string;
  displayName: string;
  locale: "sv-SE" | "en-US";
  traits: readonly ("calm" | "warm" | "precise" | "dry-humour")[];
  maxWordsPerLine: number;
  prohibitedBehaviours: readonly string[];
}
```

Rekommenderad första persona:

- lugn, varm och professionell;
- kortfattad: normalt högst 12 ord per spelreplik;
- aldrig hånfull vid förlust;
- aldrig överdrivet jublande vid stora svängningar;
- förklarar regler sakligt och hänvisar till serverns visade tillåtna handlingar;
- påstår aldrig sig kunna påverka tur, kort eller hjul;
- säger uttryckligen att spelet använder PLAY och inte riktiga pengar när det är relevant.

Personlighetens kontinuitet kommer från persona-version, frasbank, röst och begränsad sessionskontext. Modellen ska inte beskrivas tekniskt som medveten eller som en beständig människa.

## SpeechIntent och AI-kontrakt

Tillåtna speech intents i första versionen:

```ts
type DealerSpeechIntent =
  | "welcome"
  | "betting_open"
  | "bet_accepted"
  | "your_turn"
  | "bets_locked"
  | "spin_started"
  | "announce_result"
  | "acknowledge_win"
  | "acknowledge_loss"
  | "acknowledge_push"
  | "acknowledge_mixed"
  | "explain_allowed_action";
```

AI-tjänsten får endast ta emot sanerad publik information:

```ts
interface DealerSpeechRequest {
  schemaVersion: 1;
  sourceEventId: string;
  sourceSequence: number;
  game: "blackjack" | "roulette";
  speechIntent: DealerSpeechIntent;
  locale: "sv-SE" | "en-US";
  publicFacts: readonly string[];
  personaVersion: 1;
}
```

`publicFacts` byggs av applikationskod från publika eventfält. Råa databasrader, hela snapshots, access token, server seed före reveal, dolda kort och intern saldohistorik får inte skickas.

Modellens output ska följa ett strikt schema:

```ts
interface DealerSpeechModelOutput {
  text: string; // 1–140 tecken och inom personans ordgräns
  tone: "neutral" | "warm" | "celebratory" | "sympathetic" | "instructional";
  delivery: "calm" | "bright" | "soft";
}
```

Tjänsten lägger själv till `sourceEventId`, tid och versionsfält efter validering. AI får inte returnera action, clipnamn, payout, saldo, kort, pocket, transform, kod eller URL.

OpenAI Structured Outputs med JSON Schema eller Zod ska användas för den textbaserade tjänsten. Ogiltigt svar, refusal, timeout eller olämpligt innehåll ger omedelbart en lokalt godkänd fallbackfras.

## Rekommenderad OpenAI-arkitektur

### Version 1: kedjad och kontrollerbar

```text
SpeechIntent
  -> server-side OpenAI Responses-anrop med Structured Outputs
  -> validerad text
  -> text-to-speech
  -> ljudanalys/visemes
  -> browseruppspelning om cuen fortfarande är aktuell
```

Detta är förstahandsvalet eftersom spelet behöver inspekterbar text, fasta enums, enkel fallback och tydlig avbrytning. OpenAI beskriver en kedjad voice pipeline som lämplig när applikationen behöver förutsägbara workflows och explicit kontroll över transcription, reasoning och speech.

Implementationen ska ligga server-side, exempelvis i en separat Vercel Route Handler eller framtida presentationstjänst. `OPENAI_API_KEY` får aldrig heta `NEXT_PUBLIC_*` eller skickas till browsern. AI-integrationen ska vara en separat ändring från det visuella avatararbetet eftersom den kräver serverkod, dependencies, env och säkerhetsgranskning.

### Version 2: fri realtime-konversation

När spelaren senare ska kunna prata fritt med dealern kan en OpenAI Realtime-session kopplas in för naturlig tal-till-tal-dialog och avbrott. Browsern ska då få en kortlivad ephemeral client secret från en server, aldrig den permanenta API-nyckeln.

Realtime-konversationen är fortfarande ett sidolager:

- den får läsa en sanerad offentlig bordssammanfattning;
- eventstyrda avatarhandlingar har högre prioritet än samtalet;
- den får inte få ett tool som skapar game commands eller ändrar state;
- fri dialog får avbrytas när deal, reveal, spin eller settlement behöver visas;
- Avatar Director fortsätter välja klipp, eftersom realtime-röst inte är det auktoritativa animationskontraktet.

Officiell vägledning: [OpenAI Voice agents](https://developers.openai.com/api/docs/guides/voice-agents) och [Structured model outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

## Timing, köer och fallback

- Basreaktionen ska starta senast nästa render-frame efter mottaget event och får inte invänta nätverk.
- AI-text har en rekommenderad deadline på 1 200 ms.
- Ett svar kasseras om dess `sourceEventId` inte längre motsvarar aktiv cue.
- Tal får inte börja om en critical/gameplay-animation behöver företräde.
- Högst en dealerreplik får starta per fyra sekunder och högst två per femton sekunder i normalt spelläge.
- Upprepade likalydande repliker ska undertryckas inom samma session.
- AI avstängd, rate limit, timeout eller nätfel använder lokal frasbank eller tyst presentation.
- Spelkontrollerna ska alltid vara klickbara oberoende av tal och avatar.

## Röst och läppsynk

Första versionen:

1. generera validerad kort text;
2. generera eller hämta ljud server-side;
3. returnera ljud via en adresserbar, kortlivad resurs;
4. animera `jawOpen` från ljudets amplitud;
5. cross-fada till `talk_loop` medan ljud spelas;
6. avbryt ljud och återgå till lämplig gameplaypose vid högre prioritet.

Senare version:

- tidsatta visemes;
- blick mot spelaren under tal;
- separata additive-lager för blinkning, ansikte och kropp;
- barge-in när spelaren börjar tala;
- textning av all dealer-dialog.

Röst ska vara opt-in eller tydligt avstängningsbar. All information måste samtidigt finnas som text.

## Säkerhet och integritet

- OpenAI-anrop görs endast server-side.
- Request och response valideras med Zod.
- Ingen raw prompt eller access token loggas.
- Logga endast request-id, persona-version, speech intent, latency, utfallskategori och fallbackorsak.
- Begränsa anrop per session och användare.
- Moderera fri användarinput innan eller som del av röstagentens guardrails.
- Sessionsminne ska vara kortlivat och rensas när bordet lämnas.
- Spelarens fria röst får inte sparas som permanent profil utan separat beslut och samtycke.
- En komprometterad AI-tjänst ska som mest kunna ge en felaktig replik; den ska inte ha teknisk åtkomst till spelstate eller ledgeroperationer.

## Tillgänglighet

- `prefers-reduced-motion` ger statisk eller omedelbar pose och samma textinformation.
- Dealer-dialog visas som textning i ett `aria-live="polite"`-område.
- Kritiska speluppdateringar får inte endast kommuniceras med färg, ljud eller ansiktsuttryck.
- Tal, bakgrundsljud och animation ska kunna stängas av separat.
- Textfallback ska fungera utan WebGL.

## Tester och evals

### Deterministiska tester

- Alla 24 cues mappar till en godkänd avatarintention eller explicit `ignore`.
- Dolda blackjackkort skapar aldrig synlig kortfront eller AI-request med kortdata.
- `roulette.spin.started` väljer aldrig slutpocket.
- `roulette.result` vinner alltid över lokal spin-timing.
- Duplicate/replayed events spelar inte kritiska klipp eller tal två gånger.
- Snapshot efter reconnect återankrar utan att spela gammal historik.
- Reduced-motion och textläge visar samma auktoritativa state.
- Om GLB eller ett clip saknas används text och säker idlepose utan att spelet kraschar.

### AI-tester

- Varje speech intent ger en output som klarar schemat eller fallback.
- Svar över 140 tecken, okända enums och extra fält avvisas.
- Output får inte innehålla påstådda kort, pocket, saldo eller vinst om detta inte finns i `publicFacts`.
- Timeout och rate limit påverkar inte spelstate eller animation.
- Ett sent svar för en gammal cue kasseras.
- Förlustton är respektfull; vinstton är kort och inte hetsande.
- Prompt injection i fri användardialog kan inte skapa game commands eller ändra guardrails.

### Visuell verifiering

- Händer går inte genom bord, kort eller hjul i obligatoriska klipp.
- Cross-fades saknar synliga hopp.
- Ansikte, blick och tal kan avbrytas utan att riggen fastnar.
- Mål-FPS och assetbudget mäts på desktop och måltelefon.

## Leveransordning

### Milestone A: riggad avatar utan AI

- Leverera optimerad GLB och källfil.
- Ersätt procedurhänderna bakom samma `CroupierVisualPose`-gränssnitt.
- Implementera manifest, clipkontroll, fallback och reduced motion.
- Bevisa alla 24 cues med fixtures.

### Milestone B: Animation Director

- Lägg till prioritet, kö, avbrott, blick och additive idle.
- Synkronisera deal/reveal/collect/payout med befintliga scenobjekt.
- Lägg till deterministisk svensk frasbank och textning.

### Milestone C: server-side AI-text

- Lägg till `DealerSpeechRequest` och strikt outputschema i presentationslagret.
- Implementera server-side Responses-anrop med timeout, rate limit och fallback.
- Logga latency och fallbackorsak utan känsligt innehåll.
- Spelet ska fortfarande klara samtliga tester med AI helt avstängd.

### Milestone D: röst och läppsynk

- Text-to-speech, ljudkö och avbrott.
- Amplitudstyrd käke, därefter tidsatta visemes.
- Textning, volymkontroll och opt-out.

### Milestone E: valfri realtime-dialog

- Ephemeral browser-session och WebRTC.
- Sanerad read-only bordskontext.
- Barge-in, guardrails, moderation och kortlivat sessionsminne.
- Inga game-command-tools.

## Definition of done för första releasen

Första dealerreleasen är klar när:

- en riggad GLB ersätter placeholdern;
- alla befintliga 24 cues har verifierad animation eller explicit no-op;
- spelet fungerar identiskt med AI, ljud och WebGL avstängt;
- dolda kort, rouletteutfall och saldo förblir backendstyrda;
- reduced motion och textfallback är testade;
- OpenAI-nyckeln endast finns server-side;
- AI-output är schema-validerad, tidsbegränsad och kan kasseras;
- sen eller felaktig AI aldrig kan stoppa eller ändra ett spelmoment;
- dealerrepliker är korta, textade, respektfulla och kan avbrytas.
