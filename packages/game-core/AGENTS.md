# Instruktioner för game-core

- Bygg egna, rena och deterministiska TypeScript-state-machines för blackjack och europeisk roulette. Externa GitHubprojekt är endast referenser; importera inte en tredjepartsmotor som auktoritativ runtime.
- En transition tar explicit tidigare state, validerat command, versionslåst ruleset och injicerad fairness-data. Den returnerar ny state, domänevents och ledger-intent utan sidoeffekter.
- Paketet får inte känna till HTTP, Socket.IO, Supabase, miljövariabler, systemklocka, React, GLB, ljud, AI eller presentations-cues.
- Använd aldrig `Math.random`. RNG/fairness ska injiceras så att samma input alltid ger samma observerbara resultat.
- Lagra och räkna PLAY-belopp som heltal. Payout ska följa den frysta ruleset-versionen och testas utan flyttalsavrundning.
- Modellera olagliga commands som explicita domänfel och mutera aldrig indata. Retry- och databasidempotens orkestreras av servern men motorn måste vara deterministisk under replay.
- Lägg tester kring varje legal och illegal transition, ess/split/double/dealerregler, samtliga 37 rouletteutfall och samtliga stödda bettyper. En ändrad fryst regel eller observerbar transition kräver ny version och nya golden vectors/fixtures.
- Emittera endast semantiska domänhändelser som kan mappas till `@spelsajt/contracts`. Returnera aldrig clipnamn, animationstider, UI-text eller andra presentationsbeslut.
