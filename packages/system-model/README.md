# @spelsajt/system-model

Maskinläsbar integrationskarta för play-money-MVP:n. Modellen binder ihop ytor, HTTP, realtime, domänevent, presentations-cues och körbara dokumentationsscenarier utan att ersätta de auktoritativa källorna.

## Source of truth

- Zod i `src/schema.ts` bestämmer modellformatet.
- `models/play-money-mvp.json` är den granskade systemkartan.
- `schemas/system-model.schema.json` genereras och får inte handredigeras.
- V2-command- och eventnamn importeras från `@spelsajt/contracts`; okända eller äldre discriminants stoppas vid validering.
- Varje v2-event är uttömmande klassat som en presentations-cue eller ett explicit presentations-ignore. `reaction.cue` är inte ett domänevent; Reaction Planner ska härleda presentation intents deterministiskt i frontend.

Varje del beskriver fyra separata mognadsaxlar så att en kontrakterad typ inte misstas för körbar funktionalitet:

- `runtime`: `implemented`, `partial` eller `absent`;
- `contract`: `zod-v2`, `zod-v1`, `ad-hoc` eller `none`;
- `verification`: `direct`, `partial`, `fixture-only` eller `none`;
- `lifecycle`: `active`, `planned` eller `deprecated`.

Kör `pnpm schemas:generate` efter en avsiktlig schemaändring och `pnpm check` före commit.
