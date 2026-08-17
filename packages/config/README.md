# Shared configuration

`rulesets/` innehåller versionerade, maskinläsbara spelregler. Runtimevalideringen finns i `src/`, JSON Schema-filen under `schemas/` genereras och ruleset-lockfilen skyddar en publicerad version mot tysta beteendeförändringar.

```powershell
pnpm --filter @spelsajt/config schemas:generate
pnpm --filter @spelsajt/config rulesets:check
```

Ändra inte en låst ruleset på plats. Kopiera den till ett nytt versions-ID och skapa nya golden vectors.
