# @spelsajt/player-account

Spelarens kontosida / dashboard (play-money). Genererad i v0 och tillagd som
en egen app i monorepot för granskning och integration.

## Innehåll
- Profilhuvud med rank och nivå-XP
- Nyckeltal: kreditsaldo, antal spelade rundor, vinstprocent, nettoresultat
- Kreditsaldo-kort (play-money)
- Veckoaktivitet (diagram)
- Fördelning Blackjack vs europeisk Roulette
- Tabell med senaste rundor: bord-id, sekvensnummer, utfall
  (win/loss/push/mixed) och fairness-verifiering (commit/reveal)

Datamodellen i `lib/player-data.ts` speglar systemets v2 command/event-flöde
men innehåller för närvarande exempeldata. Nästa steg är att koppla den mot
Supabase / event-strömmen för riktig spelardata.

## Status
- Stack: Next.js 16.3.1, React 19, Tailwind v3, shadcn/ui
- Fristående app; ännu ej inkopplad mot `@spelsajt/*`-paketen eller Supabase
- Kör lokalt: `pnpm --filter @spelsajt/player-account dev`
