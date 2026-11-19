# Echte lokale upload in het CMS

Deze stap verbindt de normale CMS-browserinterface met de gereviewde M1-processor. Zij bouwt op PR #13, head `06fc8e6af5aebaded00f17fd7274c6399e519c3c`, M1 uit PR #11 op `84e0bf9443802e0b8d2c48a1b40f77a2c036e762` en de gedeelde rechtenservice uit PR #14 op `d49f1493d126516b4187531d803d991295d62d8e`.

## Hergebruik en eigenaarschap

M1-commits `f1d4cf4`, `2cf30b0` en `84e0bf9` zijn ongewijzigd cherry-picked. `server/api/src/media-upload/rights.ts` is exact overgenomen uit `553fda6` en gecontroleerd tegen de gereviewde `d49f149`. Beide bronversies en dit bestand hebben Git-blob `93741f1a9635ddea66002484f1841b181ed9d26f`. Het bestand gebruikt alleen bestaande M0-contracten, fixturevalidatie en SQLite; zijn constructor maakt de private audit-tabel idempotent aan. Er is geen catalogus-schema nodig.

`media-upload/service.ts` is exact de gereviewde versie op `d49f149`, blob `f86a4e9180b9ace8fc53d35d025927cac6669a72`. Dat omvat de correctie waardoor uploadstatus de opgeslagen rechten leest. CMS importeert deze gedeelde services rechtstreeks; de CMS-adapter bevat geen eigen rechtenmutatie-SQL of tweede assetdatabase. Zijn private-previewlezer doet alleen geparameteriseerde reads uit dezelfde `media.sqlite`. De overige media-owned bestanden blijven gelijk aan de genoemde gereviewde commits.

## Normale gebruikersflow

```powershell
corepack pnpm install --frozen-lockfile
./scripts/start-cms-fixture.ps1 -Port 3018
```

Gebruik de gegenereerde lokale Editor- of Publisher-toegang uit het private toegangsbestand. De app, API, upload en publieke release draaien op dezelfde loopback-origin. De losse M1 CLI-HTTP-app wordt niet voor browserverzoeken gebruikt en behoudt haar eigen browserverbod.

1. Open Proeftuin en kies een lokaal PNG-, JPEG- of WebP-bestand. Bestand uploaden verwerkt het via M1 en selecteert de teruggegeven assetId/fileVersion als conceptkeuze. De draft verandert pas bij Concept opslaan.
2. Een mislukte verwerking toont een fout en een uploadnummer. Open Uploadstatus controleren of herstellen, haal de status op en probeer expliciet opnieuw. Een ondecodeerbaar origineel blijft failed; een ander geldig bestand kan vervolgens als nieuwe upload worden aangeboden. Bewaar het uploadnummer om na browserherlaad dezelfde status op te halen. Tokens blijven alleen in tabbladgeheugen.
3. Sla titel/tekst, afbeelding, alt-tekst of decorative-keuze op. Een ready derivative mag privé bekeken worden als de rechten nog unknown zijn. Er komt geen origineel of openbaar URL bij deze preview vrij.
4. Publiceren met unknown of geblokkeerde rechten faalt. Een Publisher haalt Rechtenstatus op en vult rechthebbende, bron en onderbouwing in. De bevestigingscheckbox en Rechten vrijgeven leggen een versiegecontroleerde beslissing vast. De server neemt de medewerkernaam uit de geauthenticeerde proefidentiteit; de browser mag die niet opgeven.
5. Publiceren blijft een aparte bewuste actie. De release pint de geselecteerde immutable revisie, assetId en fileVersion. Zij kopieert een geschoonde fallbackvariant met juiste MIME/extensie naar `media/<releaseId>/hero.png`, `.jpg` of `.webp`. Oude gepubliceerde beeldadressen blijven releasegebonden.

Een statusrefresh voor rechten vereist opnieuw bevestigen. Een gewijzigd asset wist de vorige rechtenkeuze; het formulier kan dus geen versie van het ene beeld met de beslissing voor een ander beeld combineren. Stale metadataVersion geeft 409. De lokale Editor mag uploaden en drafts beheren maar kan geen rechten vrijgeven of publiceren. Ook de vooraf vrijgegeven M0-testassets vereisen in deze uploadflow een expliciete auditbeslissing; de seedstatus alleen telt niet als toestemming.

## Toegang en verwerking

Nieuwe CMS-routes onder `/api/v1/cms/websites/:websiteId` zijn `POST /media`, `GET /media/:assetId`, `POST /media/:assetId/retry` en `GET/PUT /media/:assetId/rights`. Ze gebruiken dezelfde gesloten CMS-authenticatie en servervaste website-mapping als drafts. De uploadbody is raw binary; `X-Media-Filename` bevat een percent-geëncodeerde bestandsnaam. De server decodeert die en laat M1 naam, MIME, magic bytes, grootte, afmetingen en frameaantal controleren.

De module laat één upload tegelijk toe vóór body parsing, maximaal 20.000.000 bytes. De overige CMS-JSON-routes behouden hun kleine bodylimiet. Time-outs zijn 30 seconden voor requests en 10 seconden voor verbindingen; M1 begrenst ook de decoder. Browserverzoeken met Origin moeten exact de actieve `http://127.0.0.1:<poort>`-origin gebruiken; cross-site Fetch Metadata wordt geweigerd. Er is geen cookieauth of CORS-toelating.

Private preview leest uitsluitend een ready variant binnen `public/<serverwebsite>/<assetId>/<fileVersion>/`, weigert afwijkende paden en symlinkcomponenten en controleert grootte/hash. Het geauthenticeerde no-store antwoord embedt die geschoonde variant als data-URI in een sandboxed frame. Rechtenvrijgave is hiervoor niet vereist. Publiceren eist zowel `MediaRightsService.requireApproval` als de bestaande M0-controles op actuele rights, ready-status, alt/decorative, pad en hash. De audit met onderbouwing blijft privé.

Na de laatste asynchrone bouwstap controleert de server approval en de M0 ready-/versie-/variant-/rechtenvoorwaarden opnieuw. Direct daarna activeert hij synchroon de pointer, zonder `await` ertussen. Dit sluit een HTTP-rechtenblokkade tijdens het bouwen af in het ondersteunde model van één eigenaarproces per lokale CMS-runtime. Onafhankelijke schrijversprocessen op dezelfde opslag zijn geen ondersteund atomiciteitsmodel; daarvoor is eerst een gedeeld lock-/transactieprotocol nodig. Oude al gepubliceerde immutable releases worden niet automatisch ingetrokken door een nieuwe rechtenbeslissing.

M1 bewaart origineel, jobs en derivatives in de bestaande private mediafixture. De CMS-revisie bewaart alleen referenties. Behouden draft-, revisie- en releasereferenties verhinderen purge. De eerdere beperkte beschikbaarheid bij een ontbrekende media-root blijft gelden: publieke releasekopieën werken door; media-afhankelijk beheer weigert zonder een vervangende opslag aan te maken. Deze proef maakt nog geen back-ups en koppelt geen echte klantwebsite.

## Verificatie op 19 november 2026

De PR-body vermeldt het definitieve testaantal en de onafhankelijke reviewhead. Aanvullende integratietests voeren de normale appfactory uit, waaronder echte same-origin loopback HTTP. Ze toetsen PNG/JPEG/WebP naar geschoonde publieke MIME-varianten, upload groter dan de gewone 16 KB JSON-limiet, begrensde body/admission, foreign Origin, onbekende site, onbevoegde rol, verkeerde rechtenversie, verplichte onderbouwing, geweigerde medewerker-spoofing, unknown preview en geweigerde unknown-publicatie. De toegestane release bevat de exacte fileVersion; EXIF/XMP ontbreken in de geëxporteerde derivative. Een failed job blijft na heropenen opvraagbaar, retry is expliciet en een volgende geldige upload werkt.

De componentregressietests blijven de daadwerkelijke getranspileerde React-handlers gebruiken. Ze toetsen onder andere een nieuwe rechtenversie die opnieuw bevestiging vereist, de juiste asset/version in het verzoek, behoud van eigen tekst en het wissen van een oude keuze bij assetwisseling. Een browsercontrole vond en herstelde dat een saveantwoord de uploadcapability niet doorgaf; de API-regressie controleert nu ook het saveantwoord.

Chrome doorliep via het normale startscript een ongeldige lokale PNG, duurzame failed-status, expliciete mislukte retry en daarna een geldig lokaal gegenereerd 160×160-PNG met fictieve EXIF-metadata. De ready upload bleef unknown, de privépreview werkte en publiceren werd afgewezen. Daarna volgden metadata ophalen, onderbouwing invullen, expliciet bevestigen/vrijgeven en publiceren. De publieke browser laadde een 160×160-derivative met alt en releasegebonden pad. Na stoppen en herstarten van het echte proefproces bleven draftversie 2, actieve releaseversie 1, fileVersion 1 en cleared rechtenversie 2 behouden. Er zijn geen handmatige databasewijzigingen gebruikt in deze gebruikersflow.

De onafhankelijke review vond een rechtenrace tijdens build en een late upload die conceptovername kon overschrijven. Beide zijn eerst rood gereproduceerd en daarna hersteld. De nieuwe API-regressie blokkeert via het normale rechtenendpoint tijdens `beforeActivate`, hervat de build en controleert een mislukte nieuwe poging, behoud van de vorige actieve release en 404 op het ongepubliceerde nieuwe beeldadres. De componentregressie vertraagt het echte uploadantwoord, controleert dat expliciet overnemen tijdens busy zowel disabled als door de handler geweigerd is en neemt daarna veilig B inclusief B's afbeelding over. Ook een nieuwe expliciete publicatiekeuze is tijdens busy geblokkeerd. Na deze fixes slagen alle 78 tests.

Geen betaalde services, AI-aanroepen, cloudresources, productiegegevens of live deployment. De vervolgrichting voor pagina's, blokken en i18n staat in [centrale tekstredactie](centrale-tekstredactie.md); die functionaliteit wordt niet als onderdeel van deze uploadstap geclaimd.
