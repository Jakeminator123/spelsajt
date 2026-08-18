# Webbspecifika instruktioner

- Konsumera versionerade typer och fixtures från `@spelsajt/contracts`; skapa inte parallella eventformat i webben.
- Översätt semantiska events till animation, ljud och avatarreaktioner i ett presentationslager.
- 3D-animationer måste ha en reducerad rörelse- eller 2D-fallback och får inte blockera spelkontroller.
- Endast publishable Supabase-nyckel får förekomma i `NEXT_PUBLIC_*`. Secret/service-role keys hör aldrig hemma i webbläsaren.
- Testa minst loading, fel, reconnect och ett inspelat eventflöde när motsvarande UI byggs.

## Utseendebranchens gräns

- Skapa en kortlivad utseendebranch från uppdaterad `main`; håll den normalt inom `apps/web/**`, inklusive webbspecifika tester och visuella assets.
- Konsumera `@spelsajt/contracts`, `@spelsajt/system-model` och incheckade fixtures. Definiera inte parallella interfaces, eventnamn eller domänstate i webben.
- Ändra inte `packages/contracts`, `packages/system-model`, `packages/game-core`, `packages/fairness`, `packages/config`, `apps/game-server`, `supabase`, rootens packagefiler eller lockfil som en bieffekt av visuellt arbete.
- Om UI:t behöver ett nytt event eller kontraktsfält: beskriv gapet, gör en separat gemensamt granskad kontrakts-PR och rebasea sedan utseendebranchen.
- Bevara `/system` som en enkel, sanningsenlig text-/systemvy. Den får gärna få samma visuella tema men ska fortsätta visa status och scenarier utan 3D.
- Mappa varje kontrakterad `GameEvent` uttömmande till en presentationsintention eller ett uttryckligt `ignore`; backend skickar aldrig GLB-filnamn eller benrotationer.
- Använd fixtures för att utveckla animationer innan realtime finns och testa alltid text/reduced-motion-fallback för samma eventsekvens.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
