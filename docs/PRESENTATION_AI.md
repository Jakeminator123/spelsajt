# Spelmotor, 3D-avatarer och AI

Det här dokumentet är den tekniska riktningen för hur Jakob och Emil kopplar ihop en auktoritativ spelmotor med en responsiv casinopresentation. Målet är att presentationen ska kännas levande utan att animation eller AI någonsin kan ändra spelutfall, regler eller PLAY-saldo.

## Beslut om externa spelprojekt

Vi behåller en egen TypeScript-kärna i `packages/game-core` och använder externa projekt som referenser, inte som produktionsmotorer.

| Projekt | Bra som | Ska inte äga |
| --- | --- | --- |
| [dozsolti/react-casino-roulette](https://github.com/dozsolti/react-casino-roulette) | Prototyp för satsningsmatta, hjul och responsivt roulette-UI | Utfall, payout eller saldo |
| [RumenDamyanov/rust-blackjack](https://github.com/RumenDamyanov/rust-blackjack) | Referens för state machine, dold dealerhand och API-form | Vår runtime; split saknas och shuffle är inte vår verifierbara RNG |
| [KSmith8888/TypeScript-Blackjack](https://github.com/KSmith8888/TypeScript-Blackjack) | Regel- och UX-inspiration | Auktoritativ backendlogik |
| [Lemelson/casino-by-ai](https://github.com/Lemelson/casino-by-ai) | Grafisk, ljudmässig och Canvas-baserad inspiration | Saldo eller RNG; demon använder `localStorage` och `Math.random` |
| [gfauchart/node-casino-engines](https://github.com/gfauchart/node-casino-engines) | Negativa regressionsexempel | Någon produktionskod |
| [matthewlilley/provably-fair-framework](https://github.com/matthewlilley/provably-fair-framework) | Begreppsreferens för commit/reveal | Vår fairness-kärna; vi behåller rejection sampling och golden vectors |

`packages/game-core` innehåller i dag främst regelkonfiguration och rena hjälpfunktioner. Nästa backendsteg är därför en komplett, deterministisk state machine för blackjack och roulette med injicerad fairness-byte-stream, inte att lägga till ännu en tjänst eller porta ett helt tredjepartsrepo.

## Händelsekedjan

```text
spelar-command
  -> auktoritativ game-server
  -> game-core + fairness + atomisk ledger
  -> versionslåsta, sekvensnumrerade events
  -> frontendens Reaction Planner
  -> Animation Director
  -> GLB-klipp, ansikte, blick, ljud och eventuell AI-replik
```

Backend skickar semantik, till exempel `blackjack.card.dealt`, `round.settled` och `reaction.cue`. Frontend översätter semantiken till en presentation som är lämplig för aktuell scen, enhet och reduced-motion-inställning. Backend skickar aldrig filnamn, benrotationer eller visuellt slutresultat som en separat konkurrerande sanning.

## Hur GLB ska användas

En `.glb` är normalt en kompilerad leveransfil. Emil bör redigera källan i exempelvis Blender (`.blend`) och exportera en riggad GLB, inte försöka skriva om GLB-filen under körning.

Varje dealeravatar bör ha:

- en stabil skeleton/rig och namngivna animation clips;
- ansikts-morph targets för blinkning, käke och grundläggande uttryck;
- separata lager för kropp, händer, blick och ansikte;
- korta clips som `idle`, `deal`, `reveal`, `collect`, `celebrate`, `sympathize`, `explain` och `wait`;
- mjuka cross-fades och additive animation för små reaktioner ovanpå grundposen.

React Three Fiber laddar GLB:n och styr clips med Three.js `AnimationMixer`. En Animation Director håller en tillståndsmaskin, prioriterar kritiska spelhandlingar och avbryter eller tonar ut kosmetiska reaktioner. Kort, marker och rouletteboll animeras mot backendens redan fastställda event.

## Två lager: determinism först, AI sedan

Spelögonblicket får aldrig vänta på en modell. Därför finns två lager:

1. **Deterministisk reaktion.** Ett omedelbart regelverk väljer en godkänd cue utifrån event, till exempel sympatisk blick vid förlust eller fokuserad deal-animation. Detta fungerar även när AI är avstängd.
2. **Valfri AI-förfining.** En server-side tjänst får en sanerad sammanfattning av de senaste händelserna och returnerar en strikt strukturerad replik och presentationston. Svaret får bara använda fördefinierade enum-värden och kan hoppas över om det kommer för sent.

Ett framtida kontrakt kan ha formen:

```json
{
  "schemaVersion": 1,
  "cueId": "uuid",
  "sourceEventId": "uuid",
  "actor": "dealer",
  "emotion": "sympathetic",
  "gesture": "small_nod",
  "intensity": 0.35,
  "speechIntent": "acknowledge_bad_luck",
  "interruptPolicy": "drop_if_busy"
}
```

Zod-kontraktet ska vara runtime-sanning och JSON Schema genereras på samma sätt som övriga events. Modellen får inte returnera godtyckliga clipnamn, kod, URL:er eller transformvärden.

## Dialog, röst och läppsynk

För första versionen är en kort servergenererad text följd av text-till-tal enklare och stabilare än en helt öppen röstkonversation. Repliken valideras mot ett strikt schema, filtreras för upprepning och tonalitet och spelas bara om scenen fortfarande är relevant.

Läppsynk ska drivas av det färdiga ljudet, inte av en gissad textlängd. Börja med käk-/munrörelse från ljudets amplitud och lägg senare till tidsatta visemes eller ett separat audio-to-face-steg. Blick, blinkningar och små kroppsrörelser körs oberoende så att avataren fortsätter kännas levande även utan tal.

Om spelaren senare ska kunna prata fritt med dealern kan ett realtime-röstlager läggas till. Det är ett presentationssystem bredvid spelet, aldrig en väg in till game-core eller ledger.

## AI:s hårda gränser

- AI ser aldrig ett hemligt server seed före reveal.
- AI kan inte skapa commands, debitera, settle:a eller välja vinnare.
- AI väljer endast bland godkända emotioner, gestures och speech intents.
- All output valideras; vid fel används en lokal cue och en godkänd frasbank.
- Reaktioner har cooldown, prioritet och avbrottsregler så att dealern inte pratar över nästa spelhandling.
- Kontexten begränsas till nödvändiga spelhändelser och spelarens uttryckliga presentationspreferenser.

## Nästa vertikala slice

1. Frys ett `reaction.cue`-kontrakt och lägg till fixtures för vinst, förlust och push.
2. Emil riggar en enkel placeholder-dealer med `idle`, `deal`, `celebrate` och `sympathize`.
3. Frontend spelar upp fixtures utan backend och verifierar cross-fades, avbrott och reduced motion.
4. Jakob låter riktig blackjack-state-machine producera samma events.
5. Lägg till deterministic phrase bank.
6. Koppla in OpenAI server-side först när hela flödet fungerar utan AI.
