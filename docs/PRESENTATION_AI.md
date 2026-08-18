# Spelmotor, 3D-avatarer och AI

Det här dokumentet beskriver hur Jakob och Emil kopplar ihop de auktoritativa blackjack- och roulettemotorerna med en responsiv casinopresentation. Målet är att scenen ska kännas levande utan att animation, tema eller AI någonsin kan ändra spelutfall, regler eller PLAY-saldo.

Den aktiva profilen är `mvp-v2`. Båda spelen har rena, direkt testade TypeScript-state-machines i `packages/game-core`. V2 commands, events, snapshots, acknowledgements och table-subscription är Zod-kontrakterade; serveradapter, Supabase Auth, atomisk Postgres-persistens och Socket.IO-leverans är implementerade. Spelar-UI:t återstår att koppla till livekanalen, och fixtures ligger kvar som deterministiskt presentationsunderlag.

## Beslut om externa spelprojekt

Vi behåller våra egna TypeScript-kärnor och använder externa projekt som referenser, inte som produktionsmotorer.

| Projekt | Bra som | Ska inte äga |
| --- | --- | --- |
| [dozsolti/react-casino-roulette](https://github.com/dozsolti/react-casino-roulette) | Prototyp för satsningsmatta, hjul och responsivt roulette-UI | Utfall, payout eller saldo |
| [RumenDamyanov/rust-blackjack](https://github.com/RumenDamyanov/rust-blackjack) | Referens för state-machine-idéer och dold dealerhand | Vår runtime, kontrakt eller verifierbara shuffle |
| [KSmith8888/TypeScript-Blackjack](https://github.com/KSmith8888/TypeScript-Blackjack) | Regel- och UX-inspiration | Auktoritativ backendlogik |
| [Lemelson/casino-by-ai](https://github.com/Lemelson/casino-by-ai) | Grafisk, ljudmässig och Canvas-baserad inspiration | Saldo eller RNG; demon använder `localStorage` och `Math.random` |
| [gfauchart/node-casino-engines](https://github.com/gfauchart/node-casino-engines) | Negativa regressionsexempel | Någon produktionskod |
| [matthewlilley/provably-fair-framework](https://github.com/matthewlilley/provably-fair-framework) | Begreppsreferens för commit/reveal | Vår fairness-kärna och dess golden vectors |

Våra motorer tar tidigare state, validerad domänavsikt, fryst ruleset och injicerad fairnessdata och returnerar ny state, semantiska domänevents och ledger intents. De känner inte till HTTP, Socket.IO, Supabase, React, GLB, färger eller AI.

## Händelsekedjan

```text
spelarens GameCommandV2
  -> autentiserad /v2 command-route och serveradapter
  -> game-core + fairness
  -> atomisk PLAY-ledger och eventpersistens i Postgres
  -> sekvensnumrerade GameEventV2
  -> frontendens deterministiska Reaction Planner
  -> lokala presentation intents
  -> Animation Director
  -> GLB-klipp, ansikte, blick, ljud och eventuell AI-replik
```

Backend skickar endast spelsemantik, till exempel `blackjack.card.dealt`, `blackjack.card.revealed`, `blackjack.turn.changed`, `roulette.spin.started`, `roulette.result`, de två spelens settlement-events och `round.settled`. Den fullständiga listan med exakt 16 v2-eventtyper finns i [System canvas](SYSTEM_CANVAS.md#exakta-semantiska-v2-events).

V2 har inget `reaction.cue`-domänevent. Reaction Planner härleder deterministiskt presentationen från ett eller flera redan mottagna `GameEventV2`. Därmed behöver backend varken känna till avatar, clipnamn, färgtema eller hur Emil väljer att gestalta en vinst eller förlust.

## Reaction Planner är ett frontendlager

Reaction Planner är en ren, uttömmande funktion. Samma event och samma presentationsinställningar ger samma basintention. Den får använda speltyp, eventtyp, publika payloadfält, reduced-motion och lokala tillgänglighetsinställningar; den får inte gissa dold state eller räkna om motorns beslut.

En lokal intention kan exempelvis se ut så här:

```json
{
  "sourceEventId": "event-uuid",
  "actor": "dealer",
  "action": "sympathize",
  "intensity": "subtle",
  "speechIntent": "acknowledge_loss",
  "interruptPolicy": "drop_if_busy"
}
```

Detta är ett internt presentationsformat, inte ett nytt `GameEventV2`. Det kan Zod-valideras i frontend och versionshanteras där, men får inte läggas in i motorn eller ledgern. Tillåtna actions och speech intents ska vara enums; inga godtyckliga clipnamn, URL:er, transforms eller kod får komma från AI.

Några grundmappningar:

| V2-event | Deterministisk basintention |
| --- | --- |
| `round.prepared` | Nollställ bordet och visa commitment/ruleset utan att starta deal eller spin. |
| `round.started` | Växla scenen till aktiv runda. |
| `blackjack.card.dealt` | Animera ett kort till angiven hand; visa aldrig en framsida för `faceUp:false`. |
| `blackjack.card.revealed` | Vänd dealerns hålkort till exakt serverangiven kortidentitet. |
| `blackjack.turn.changed` | Markera aktiv hand och visa exakt de kontrakterade actions som är tillåtna. |
| `blackjack.hand.settled` | Flytta eller betala marker för den specifika handen. |
| `roulette.spin.started` | Starta en neutral loop där slutposition ännu inte antyds. |
| `roulette.result` | Bromsa boll och hjul mot exakt `payload.pocket`. |
| `roulette.bet.settled` | Presentera payout för den specifika beten. |
| `round.settled` | Visa sammanfattning, saldo och verifieringsmöjlighet; välj lokal vinst-, förlust-, push- eller mixed-ton. |

Det dolda blackjackeventet i v2 saknar helt `card`, `cardId`, rank och suit. Varken Reaction Planner, renderer eller AI kan därför råka exponera hålkortet före `blackjack.card.revealed`.

## Hur GLB ska användas

En `.glb` är normalt en kompilerad leveransfil. Emil bör redigera källan i exempelvis Blender (`.blend`) och exportera en riggad GLB, inte försöka skriva om GLB-filen under körning.

Varje dealeravatar bör ha:

- en stabil skeleton/rig och namngivna animation clips;
- ansikts-morph targets för blinkning, käke och grundläggande uttryck;
- separata lager för kropp, händer, blick och ansikte;
- korta clips som `idle`, `deal`, `reveal`, `collect`, `celebrate`, `sympathize`, `explain` och `wait`;
- mjuka cross-fades och additive animation för små reaktioner ovanpå grundposen.

React Three Fiber kan ladda GLB:n och styra clips med Three.js `AnimationMixer`. En Animation Director köar intents, prioriterar kritiska spelhandlingar och avbryter eller tonar ut kosmetiska reaktioner. Kort, marker, hjul och rouletteboll animeras mot backendens redan fastställda events.

Ett bra lagerupplägg är:

1. **Spelhandling:** deal, reveal, samla och betala marker. Dessa får aldrig hoppas över på ett sätt som visar fel state.
2. **Kropp och blick:** idle, fokus på aktiv hand, blick mot hjul eller spelare.
3. **Emotion:** små additive uttryck och gester som inte blockerar nästa spelhandling.
4. **Tal:** valfri text/röst som alltid får avbrytas eller hoppas över.

Reduced motion ska ge samma information via omedelbar stateuppdatering och text. Det är en alternativ presentation av samma event, inte en alternativ spelväg.

## Determinism först, AI efteråt

Spelögonblicket får aldrig vänta på en modell. Presentationen består därför av två lager:

1. **Deterministisk basreaktion.** Reaction Planner väljer omedelbart en godkänd lokal intention från v2-eventet. Hela spelet fungerar när AI är avstängd eller nere.
2. **Valfri AI-förfining.** En server-side presentationstjänst får en sanerad sammanfattning efter att basintentionen finns och kan föreslå en kort replik eller ton inom ett strikt schema. Ett sent eller ogiltigt svar kastas.

AI får exempelvis förfina `speechIntent: "acknowledge_loss"` till en kort, neutral replik. Den får inte byta `action`, välja ett nytt spelutfall, fördröja settlement eller skriva transformvärden direkt till 3D-scenen.

## Dialog, röst och läppsynk

För första versionen är kort, servergenererad text följd av text-till-tal enklare och stabilare än en helt öppen röstkonversation. Repliken valideras mot ett strikt schema, filtreras för upprepning och tonalitet och spelas bara om scenen fortfarande är relevant.

Läppsynk ska drivas av det färdiga ljudet, inte av en gissad textlängd. Börja med käk-/munrörelse från ljudets amplitud och lägg senare till tidsatta visemes eller ett separat audio-to-face-steg. Blick, blinkningar och små kroppsrörelser körs oberoende så att avataren fortsätter kännas levande även utan tal.

Om spelaren senare ska kunna prata fritt med dealern kan ett realtime-röstlager läggas till. Det är ett presentationssystem bredvid spelet, aldrig en väg in till game-core eller ledger.

## Visuell baseline

Användarens referens sätter riktningen: nära svart som bas, acid-lime som primär actionfärg och violett som sekundär accent. Den kombinationen ska styra lobby, bord, fokuslägen och visuella återkopplingar när den nya frontend-PR:en har granskats.

Exakta hexvärden, semantiska tokens, kontrastnivåer, typografi och komponentvarianter fastställs först i den granskade frontend-PR:en. Fram till dess ska dokumentationen inte låsa påhittade färgvärden. Temat får aldrig påverka motor, kontrakt, fairness, payout, saldo eller eventordning; de lagren ska kunna köras helt utan renderer.

## AI:s hårda gränser

- AI ser aldrig server seed före reveal eller ett dolt kort före `blackjack.card.revealed`.
- AI kan inte skapa commands, debitera, settle:a eller välja vinnare.
- AI kan endast föreslå godkända presentationstoner och speech intents efter den deterministiska basreaktionen.
- All output valideras; vid fel används en lokal intention och en godkänd frasbank.
- Reaktioner har cooldown, prioritet och avbrottsregler så att dealern inte pratar över nästa spelhandling.
- Kontexten begränsas till nödvändiga publika spelhändelser och spelarens uttryckliga presentationspreferenser.
- Ingen API-nyckel eller modellåtkomst får finnas i klienten.

## Regressionstester för presentationslagret

Presentationstester ska återspela v2-fixtures och låsa att:

- varje `GameEventV2` hanteras uttömmande eller uttryckligen ger en no-op;
- ett dolt kort aldrig skapar en synlig kortfront eller skickas till AI;
- `roulette.spin.started` aldrig väljer slutposition och `roulette.result` alltid vinner över lokal timing;
- duplicate/replayed events inte spelar kritiska handlingar två gånger;
- ett sekvensgap pausar presentationen tills v2-snapshot har hämtats;
- reduced motion och textfallback visar samma auktoritativa state;
- motor- och kontraktstester förblir oberoende av visuella tokens och 3D-assets.

## Nästa vertikala slice

1. Koppla den planerade `/v2`-serveradaptern, atomiska persistensen och realtime-strömmen till den befintliga projektorn och samma schema-validerade presentationsflöde.
2. Utöka den nuvarande text-/3D-renderingen så varje cue har en tydlig reduced-motion-fallback och en godkänd visuell presentation eller explicit no-op.
3. Ersätt placeholder-dealern med en riggad avatar med `idle`, `deal`, `reveal`, `collect`, `celebrate` och `sympathize` utan att ändra eventkontraktet.
4. Lägg till en deterministisk frasbank.
5. Koppla in OpenAI server-side först när hela flödet fungerar korrekt utan AI.
