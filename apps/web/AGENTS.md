# Webbspecifika instruktioner

- Konsumera versionerade typer och fixtures från `@spelsajt/contracts`; skapa inte parallella eventformat i webben.
- Översätt semantiska events till animation, ljud och avatarreaktioner i ett presentationslager.
- 3D-animationer måste ha en reducerad rörelse- eller 2D-fallback och får inte blockera spelkontroller.
- Endast publishable Supabase-nyckel får förekomma i `NEXT_PUBLIC_*`. Secret/service-role keys hör aldrig hemma i webbläsaren.
- Testa minst loading, fel, reconnect och ett inspelat eventflöde när motsvarande UI byggs.
