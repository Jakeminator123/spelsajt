# Kontraktsinstruktioner

- Zod-scheman i `src/` är runtime-källan. Filer under `schemas/` genereras med `pnpm schemas:generate` och får inte handredigeras.
- Behåll `strict` objektvalidering så att okända fält inte tyst accepteras över nätverksgränsen.
- Bakåtinkompatibla ändringar kräver nytt `schemaVersion`, nya JSON-fixtures och koordinerad granskning av frontend och backend.
- `pnpm schemas:check` måste upptäcka drift mellan Zod och incheckade JSON Schema-filer.
