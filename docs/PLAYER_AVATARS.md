# Personliga spelaravatarer

## Levererad pipeline

En säkrad, icke-anonym spelare kan starta en personlig avatargenerering på `/konto`.
Flödet är kosmetiskt och helt frikopplat från commands, spelregler, RNG, fairness,
saldo, ledger och behörighet:

1. Webbläsaren accepterar JPG, PNG eller WebP på högst 8 MB och 16 megapixlar.
2. Magic bytes och dimensioner kontrolleras före full avkodning. Bilden skalas till
   högst 2048 px, återkodas till JPEG och tappar EXIF/metadata.
3. Servern verifierar JPEG-strukturen igen och skickar en data-URI till Meshy. Något
   originalfoto skrivs aldrig till Supabase eller Vercel Blob.
4. Meshy Image-to-3D kör en pinnad `meshy-7`, texturerad A-pose med moderation,
   triangelremesh och 30 000 faces.
5. Den färdiga image-tasken skickas som `input_task_id` till Rigging API.
6. Rigg-tasken får fem fasta, produktgodkända animationer: Idle (`0`), Agree Gesture
   (`25`), Confused Scratch (`36`), Listening Gesture (`47`) och Victory Cheer (`59`).
7. Riggad GLB och varje animerad GLB laddas ned endast från `assets.meshy.ai`,
   storleksbegränsas, valideras som självförsörjande glTF 2.0 och kopieras en fil per
   pollning till privat Vercel Blob.
8. Meshy-taskerna raderas efter lyckad kopiering. Kontosidans raderingsknapp tar bort
   appens privata Blob-filer och försöker även radera ett pågående Meshy-jobb.

Pipelinejobbet bärs av en tidsbegränsad HMAC-token som är bunden till Supabase-
användaren, generationen, alla provider-task-id:n och redan kopierade filer. Endast
ägaren kan läsa eller uppdatera avatarens metadatarad via RLS. En separat
`SECURITY DEFINER`-funktion reserverar högst en betald start per timme och tre per
rullande 30 dagar. Funktionsanropet kan inte starta Meshy på egen hand.

Den privata idle-GLB:n visas på livebordet och i `/3d-lab`; en procedurgenererad
initialfigur används vid saknad, trasig eller för stor modell. Reduced-motion-läget
visar text i stället för en animerad 3D-scen.

## Avtalsspärr

Meshys standardvillkor, senast uppdaterade 7 mars 2026, förbjuder personidentifierande
information i Customer Input. En selfie är normalt personidentifierande. Därför är
runtimeflödet avstängt som standard och blir tillgängligt endast när samtliga
servervariabler finns och `MESHY_SELFIE_ENABLED=true`:

- `MESHY_API_KEY`
- `PLAYER_AVATAR_JOB_SECRET` (minst 32 slumpmässiga tecken)
- `BLOB_READ_WRITE_TOKEN` för en privat Blob-store
- `MESHY_SELFIE_ENABLED=true`

Aktivera flaggan först när ett skriftligt Meshy Order/DPA eller annat bindande tillägg
uttryckligen tillåter identifierbara användarbilder och reglerar träning, retention,
radering, underbiträden och dataöverföringar. UI-samtycke ersätter inte leverantörsavtal.

## Kostnad och drift

Med Meshys prislista vid implementationstillfället kostar texturerad Meshy-7
Image-to-3D 30 krediter, auto-riggning 5 och varje animation 3. Fem animationer ger
cirka 50 krediter per komplett avatar. Provider- och Blob-anrop ligger server-side;
inga hemligheter får heta `NEXT_PUBLIC_*`.

Meshys icke-Enterprise API-output behålls normalt i tre dagar. Appen kopierar därför
varje färdig GLB omedelbart till egen privat lagring och behandlar Meshys signerade
asset-URL:er som kortlivade. Ett misslyckat raderingsanrop får inte göra en avatar
publik, men ska följas upp i driftloggar.

Referenser:

- [Meshy Image-to-3D API](https://docs.meshy.ai/en/api/image-to-3d)
- [Meshy Rigging API](https://docs.meshy.ai/en/api/rigging)
- [Meshy Animation API](https://docs.meshy.ai/en/api/animation)
- [Meshy API pricing](https://docs.meshy.ai/en/api/pricing)
- [Meshy Terms of Service](https://www.meshy.ai/terms-of-use)
- [Vercel Blob](https://vercel.com/docs/vercel-blob)
