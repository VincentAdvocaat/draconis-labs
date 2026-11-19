# M1 lokale HTTP-upload en beeldverwerking

De branch `feature/media-upload-proef` bouwt voort op de gereviewde M0-commit `de089d22998b76fda8b905fb7d3ba90e2f8a7fd4` uit [PR 8](https://github.com/VincentAdvocaat/draconis-labs/pull/8), die op ontwerp-PR 6 steunt. Geen klantdata of bestaande API-registraties zijn gewijzigd. De proef gebruikt de M0 SQLite-opslag en hetzelfde assetId/fileVersion-contract. `PublicVariant.mime` ondersteunt nu PNG, JPEG en WebP.

## Start en HTTP-flow

Vanuit deze worktree:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @draconis/api exec tsx src/media-upload/start.ts
```

De entrypoint bindt uitsluitend op `127.0.0.1` met een vrije poort. De terminal toont adres, tijdelijk bearer-token en fixtureRoot. Een nieuwe start maakt eigen tijdelijke opslag. Een herstart kan dezelfde opslag openen met `--root=C:\pad\naar\de\afgedrukte\draconis-media-fixture-map`. Er is geen fallback naar planner- of CMS-data. Het token verandert bij iedere start.

Vul de afgedrukte waarden in. Gebruik uitsluitend een lokaal bestand waarop je rechten hebt; de proef publiceert geen website.

```powershell
$uploadHeaders = @{
  Authorization = 'Bearer <afgedrukt-token>'
  'x-media-filename' = 'voorbeeld.jpg'
}
Invoke-RestMethod -Method Post `
  -Uri 'http://127.0.0.1:<poort>/websites/fixture-alpha/media' `
  -Headers $uploadHeaders -ContentType 'image/jpeg' -InFile 'C:\pad\voorbeeld.jpg'
```

De response is `201` met `assetId`, `fileVersion=1`, `state=ready`, `rights=unknown` en de volledige publieke variantset met bytes, afmetingen en SHA-256. Vraag dezelfde status op met een geauthenticeerde `GET /websites/fixture-alpha/media/{assetId}`. `fixture-beta` is de tweede expliciete testwebsite. De probe-token geeft toegang tot beide fictieve websites; dit is geen productie-identiteit of rollenmodel.

De module accepteert een raw binary body, geen multipartformulier. MIME is JPEG/PNG/WebP en `x-media-filename` moet een bijpassende extensie hebben, zonder paden of controltekens. Alle routes vereisen de exacte bearer-token. Cookie-auth wordt niet gebruikt. Elk verzoek met een Origin-header of een cross-site Sec-Fetch-Site-header wordt geweigerd. Er is geen CORS-toestemming en geen browser-UI. Dit maakt de proef via CLI bruikbaar zonder dat een willekeurige website een schrijfrecht krijgt.

Voor een herhaalbare echte loopback-upload inclusief cleanup:

```powershell
corepack pnpm --filter @draconis/api exec tsx src/media-upload/smoke.ts
corepack pnpm --filter @draconis/api exec vitest run tests/media-upload.test.ts
```

Stop de server vóór het expliciet opruimen van de afgedrukte tijdelijke opslag. Dit verwijdert de volledige proef inclusief haar behouden releases en originelen:

```powershell
corepack pnpm --filter @draconis/api exec tsx src/media-upload/cleanup.ts --root=<fixtureRoot> --confirm
```

De cleanup controleert het genormaliseerde doel, de directe ligging onder de tijdelijke systeemmap, de fixtureprefix en eigendomsmarker. Het command accepteert geen reguliere project- of CMS-map.

## Verwerking en herstel

Fastify begrenst iedere body tot 20.000.000 bytes, ook bij chunked HTTP zonder Content-Length. De uploadroute laat vóór bodyparsing maar één upload toe; extra requests krijgen 429. Ook de processor weigert gelijktijdige verwerking. Een requesttimeout en native transformtimeout begrenzen stilgevallen requests en bewerkingen.

De processor controleert handtekening, MIME, extensie, decodeerbaarheid, maximaal 40 megapixels, maximaal 12.000 pixels per as en één frame. APNG en geanimeerde WebP worden afgewezen. De originele naam wordt geen opslagpad. Gegenereerde UUID's bepalen alle paden onder de gemarkeerde fixturemap. De bron blijft privé.

Sharp corrigeert EXIF-oriëntatie, converteert naar sRGB en schrijft nieuwe bestanden zonder EXIF, GPS, XMP of ICC. Breedtes zijn 320/640/1280/1920 voor zover kleiner dan of gelijk aan de georiënteerde bron. Bij bronnen van maximaal 320 pixels komt een geschoonde bronbreedtevariant. Iedere breedte krijgt WebP en JPEG-fallback, of PNG-fallback bij transparantie. Gelijke breedtes worden niet dubbel geschreven; niets wordt opgeschaald. De kleinste breedte is ook de thumbnailbron.

Een persistente `upload_jobs`-rij krijgt `processing`. Variants worden eerst in private staging geschreven en als complete map verplaatst. Pas daarna schrijft één SQLite-transactie asset, ready fileVersion en ready jobstatus. De rechten blijven `unknown`; `ready` betekent alleen dat beeldverwerking geslaagd is. Publicatieresolve blijft daarom geblokkeerd totdat later expliciet rechten zijn vastgelegd. M1 levert nog geen rechtenbeheer-UI.

Bij decode- of schrijffout krijgt de job `failed` en verwijdert de processor haar staging/publieke uitvoer. De private bron blijft beschikbaar in de tijdelijke fixture. Bij heropenen verwerkt de service achtergebleven `processing`-jobs opnieuw, met hetzelfde asset-ID en dezelfde fileVersion. Een eventuele map van een crash na rename maar vóór commit wordt herbouwd. Een ontbrekende bron krijgt een persistente failed-status. Er is geen ready asset met een gedeeltelijke variantset.

De vertrouwde lokale opslag mag niet tegelijk door een andere applicatie worden aangepast. Dit is een proef met één proces en één worker. Er is geen meerprocessen-lock, algemene bestandsopslagdienst, idempotency-key voor herhaalde clientuploads of automatische garbage collection van bronbestanden die vóór jobregistratie door een crash verweesd raken. Een herhaalde HTTP-upload maakt een nieuw asset. De expliciete fixturecleanup verwijdert alle proefbestanden. Een productiegeschikte migratie en retentie blijven latere fasen.

## Dependency en bewijs

Enige nieuwe directe dependency is exact `sharp@0.35.5`. Native laden en JPEG/PNG/WebP decode/encode zijn hier getest op Windows met Node `24.3.0` en libvips `8.18.7`. De installatie gebruikte pnpm-lock en lokale prebuilt packages. Andere platforms moeten hun eigen install/build opnieuw controleren; native binaries zijn platformafhankelijk.

Sharp gebruikt [Apache-2.0](https://github.com/lovell/sharp/blob/v0.35.5/LICENSE). De [officiële outputdocumentatie](https://sharp.pixelplumbing.com/api-output/) beschrijft standaard metadata-verwijdering en sRGB; de [constructoropties](https://sharp.pixelplumbing.com/api-constructor/) beschrijven de pixelgrens. De meegeleverde native libraries hebben eigen licentieteksten. Deze proef gebruikt de lokale package-installatie en neemt geen binaries of licentieclaims voor latere distributie over. Geen abonnement, hosted API, AI-call, opslagaccount of deployment nodig.

De tests omvatten breedtes 1/200/320/640, JPEG/WebP/PNG, transparantie, GPS/oriëntatie, bytegrenzen, chunked oversize, MIME/signatuur, namen, lege/kapotte/truncated bestanden, pixel-/aslimiet, animatie, auth/origin, één uploadslot, heropenen en interrupted-job recovery/foutcleanup. De smoke gebruikt echte HTTP op loopback en geeft 201. Workspace typecheck/lint/test/build worden vóór PR uitgevoerd, waarna onafhankelijke review en eventuele fixes volgen.

Volgende functionele stap is M2 bibliotheekbeheer met rechtenmetadata en een veilige picker. Catalogus en portfolio blijven aparte fasen. Deze uploadproef is nog niet aangesloten op echte klantwebsites of de CMS-pagina-editor.
