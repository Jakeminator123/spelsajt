# Frontend: modern MVP-lobby och eventdriven 3D-demo

Den här frontendändringen ger Spelsajt en tydlig visuell identitet och en
3D-presentation för europeisk roulette. Startsidan är avgränsad till produktens
två MVP-spel: blackjack och europeisk roulette.

Lobbyn är ännu inte en spelbar serverklient. Spelknappar, inloggning, PLAY-saldo
och realtime är därför inte aktiverade. 3D-ytan är märkt **demo** och spelar upp
ett inspelat, validerat v2-eventflöde. Den påverkar aldrig saldo eller spelutfall.

## Visuell riktning

- nära svart bas med lime som primär accent och violett som sekundär accent;
- Bricolage Grotesque för rubriker och Inter Tight för övrig text via
  `next/font`;
- responsiv hero, två spelkort, en kort “Under huven”-sektion och tydliga
  demoetiketter;
- en featureticker för blackjack, europeisk roulette, play money, fairness och
  3D-demon — inga påhittade livevinnare eller onlinesiffror;
- scroll-reveals och dekorativ rörelse med stöd för `prefers-reduced-motion`.

Alla synliga länkar går till en befintlig sektion eller `/system`. Det finns inga
aktiva knappar som låtsas logga in, placera en insats eller starta ett spel.

## Presentation från v2-events

Presentationslagret konsumerar `GameEventV2` från `@spelsajt/contracts` i stället
för att definiera ett eget domänformat:

1. `scene/presentation.ts` projicerar ett event med `projectGameEvent` till ett
   godkänt cue-id från systemmodellen eller ett uttryckligt `ignore`.
2. Samtliga 16 eventtyper i v2-unionen hanteras uttömmande. Projektorn täcker
   systemmodellens 24 godkända cues och ett uttryckligt `ignore`.
3. `presentationStore` applicerar event i stigande sekvensordning och erbjuder
   den React-anpassade läsvyn `usePresentationState`.
4. `scene/presentation.ts` innehåller ett schema-validerat, incheckat
   `GameEventV2`-demotranscript märkt `source: "recorded-demo"`.
5. Autoplay matar endast dessa inspelade v2-events till det globala lagret. Det
   är en presentationsdemo, inte en ersättning för den planerade serverströmmen.

Presentationskoden stoppar sekvensgap och event som kommer i fel ordning, gör
replay av samma event idempotent och låter aldrig ett dolt blackjackkort bära
rank, suit eller kort-id till scenen.

## 3D-scen och animation

- roulettehjulet har europeisk 0–36-sekvens och visuella nummerfält;
- kulan startar sin neutrala spinnrörelse först från den godkända
  `roulette.spin-started`-cuen;
- demotranscriptets `roulette.result` anger pocket 17, och först då riktas kulan
  mot motsvarande mål;
- blackjackkort skapas från deal/reveal-cues och ett dolt kort visas endast som
  en anonym baksida; inga dekorationskort skapas utan blackjackevents;
- `PoseMixer` cross-fadar croupierns godkända poser utifrån presentationscues;
- scenen räknar inte payout, saldo, kort eller roulettepocket.

Med reducerad rörelse visas en statisk svensk textstatus i stället
för tidsberoende Canvas-animation. Samma demokälla används; endast presentationen
förenklas.

## Systemgräns

| Del | Faktisk status |
| --- | --- |
| Blackjack- och roulettemotor | Implementerade och direkt testade i `packages/game-core` |
| Fairness-kärna | Implementerad och verifierad mellan Node och Web Crypto |
| V2 commands, events och snapshots | Kontrakterade och fixture-testade |
| Inspelad 3D-presentation | Implementerad frontend-demo |
| Command API, ledgerorkestrering och realtime | Planerade, inte anslutna till lobbyn |
| Auth och spelbara kontroller | Inte aktiverade på startsidan |

Backend ska fortsatt vara ensam auktoritet för RNG, regler, payout, saldo och
behörighet. När serveradaptern finns ersätts den inspelade demokällan av den
sekvensnumrerade v2-eventströmmen; scenens domänansvar ska inte utökas.

## Verifiering

Frontendändringen verifieras med:

```bash
pnpm --filter @spelsajt/web test
pnpm --filter @spelsajt/web lint
pnpm --filter @spelsajt/web typecheck
pnpm --filter @spelsajt/web build
```

Testerna täcker bland annat hela v2-eventunionen, idempotent replay,
sekvensfel, skyddet för dolda blackjackkort samt roulettehjulets mappning från
pocket till landningsvinkel.

## Bildassets

Startsidan använder endast `game-blackjack.webp` och `game-roulette.webp`.
De två 1024×1024-konceptbilderna är WebP-optimerade. Oanvända bilder för slots,
poker, live casino och sport ingår inte i MVP-grenen.
