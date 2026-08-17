# Spelserverspecifika instruktioner

- Spelservern är ensam auktoritet för commands, spelstate, fairness, PLAY-saldo och settlement.
- Validera varje externt payload med `@spelsajt/contracts` innan domänlogik körs.
- Skriv saldo, runda, fairness-post och ledger atomiskt. Retry med samma `commandId` får aldrig debitera eller settle:a igen.
- Emittera semantiska, sekvensnumrerade events; emitera aldrig filnamn eller animationsimplementationer.
- Secret/service-role keys används bara serverside och får aldrig loggas.
