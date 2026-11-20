# M5: zelfstandige statische release-export

Eigen branch `feature/cms-static-release-export` vanaf exact PR43 `22f5c66659ab4abadb6a1f65b34b92846dce959f`. Deze stap voegt alleen een expliciet exportcommando, publieke artifactvalidatie, tests en documentatie toe. Geen renderer-, recovery-, upload-, catalogus-, shared- of dependencywijziging. De parallelle fileVersion-stap bezit zijn eigen recoverywijzigingen; deze export leest geen mediaDB of uploadschema.

## Contract en gebruik

Het commando leest uitsluitend een bestaande succesvolle CMS-publicatie. Kies expliciet `active` of een gepubliceerde release-UUID. Active wordt bij de read-only DB-selectie vastgezet; een nieuwer concept wordt niet gerenderd. De eerste versie accepteert alleen eigen CMS09-fixtures direct onder de tijdelijke map, met hun synthetische marker. Een gewone klant-/gebruikersmap of database wordt niet geopend als fallback.

```powershell
# Gebruik een eigen, eerder met cms-recovery.ts init gemaakte en gepubliceerde fixture.
$source = 'C:\Users\<gebruiker>\AppData\Local\Temp\draconis-cms-recovery-<eigen-fixture>'
$target = Join-Path $env:TEMP ('draconis-cms-export-'+[guid]::NewGuid())
corepack pnpm --filter @draconis/api exec tsx scripts/cms-export.ts `
  --source $source --website demo-cms --release active --target $target
# Of vervang active door de exacte oudere gepubliceerde UUID.
```

De uitvoer toont doel, website, geselecteerde release, basispad en aantal bestanden. Bestaande doelen, onbekende/niet-gepubliceerde IDs en een website zonder actieve publicatie worden geweigerd. De CLI leest geen toegangstokens, credentialconfiguratie of private media.

Het doel is een statische webroot met `sites/demo-cms/...` en een nieuw `export-manifest.json`. De bestaande rootrelatieve URLs blijven bytegelijk, inclusief `/sites/demo-cms/media/<release>/...` en template-assets. Mount dus de hele exportroot op de origin, niet alleen de map demo-cms. Een eenvoudige lokale host zonder CMS/API kan bijvoorbeeld:

```powershell
python -m http.server 3060 --bind 127.0.0.1 --directory $target
# Open http://127.0.0.1:3060/sites/demo-cms/index.html
```

Deze gewone hostregel is voor lokaal bekijken. De acceptatieharness gebruikt aanvullend een striktere CSP met `connect-src 'none'`, uitsluitend eigen styles/scripts/images, geen fonts, frames of forms. Daarmee worden API-/externe paginarequests geblokkeerd. Dit is geen claim dat de volledige browser of het OS offline staat. Er is geen file://-portabiliteitsclaim, URL-rewrite, deployadapter, nieuw templateframework of live publicatie.

## Wat wordt gekopieerd

Alleen bestanden uit de hashgebonden publieke release-inventaris: HTML, CSS, JS en schone PNG/JPEG/WebP-derivatives. Bestands- en bronmanifestidentiteit moeten bij de geselecteerde published-attempt horen. Iedere bronhash wordt gecontroleerd. Interne href/src en CSS-URLs moeten binnen de gepubliceerde basisroute naar een opgenomen bestand verwijzen; HTML-fragmenten moeten bestaan. Externe resourceverwijzingen, CSS-imports, onveilige paden, casebotsingen en symlinks/junctions worden geweigerd. De HTML-check accepteert alleen de beperkte syntax van de huidige producenten met geciteerde waarden en de bekende defer-vorm. Inline script/style, eventhandlers, srcset, base/iframe/object en onbekende resourcevormen worden expliciet geweigerd. Externe lokale JS wordt bytegelijk gekopieerd, zonder algemene JS-inhoudsanalyse. Gewone HTTPS/mailto-links zijn navigatiedoelen en worden niet opgehaald.

Het interne release.json wordt niet blind gepubliceerd. Dat bevat media-/portfoliometadata en localevelden die niet allemaal op de pagina staan. Het nieuwe publieke manifest bevat uitsluitend formaat/versie/complete, website/release/revisie-ID, basispad, de hash van het interne bronmanifest en per publiek bestand bytes/SHA256. Geen DB, tokens, actor/auditrecords, private originelen, concepten of interne veldmaps.

Validatie gebeurt vóór de doelkopie. Een eigen tijdelijke stagingmap krijgt de geverifieerde bytes en het complete publieke manifest. Pas daarna wordt de complete map naar het nieuwe doel verplaatst. Een afgehandelde fout verwijdert alleen de eigen stagingmap en laat geen gedeeltelijk doel achter; een ondertussen verschenen doel blijft behouden. Cleanup vergelijkt de directory-identiteit voordat recursief wordt verwijderd. Een procescrash kan uitsluitend een eigen stagingrest achterlaten; er is geen automatische activering of opruiming van onbekende mappen. Externe filesystemwriters vallen buiten deze lokale single-owner-proef. Maximaal4096 bestanden en256MiB publieke bytes; resterend budget en regulier bestand worden vóór de read gecontroleerd, werkelijke bytes erna opnieuw. Dit is geen algemeen procesgeheugenbudget.

## Uitgevoerde acceptatie op 20 november 2026

De bestaande services maken een rijke synthetische fixture: NL/EN-home, NL/EN-tekstpagina, NL/EN-portfolio en lege portfoliostaat, plus NL/EN-contacttemplate. Een ongebruikte categorie bestaat, maar het huidige contract heeft geen categorie-filterroute. Daarom wordt de werkelijk bestaande lege portfoliostaat geëxporteerd; er is geen nieuwe M4-filterfunctie gebouwd.

De fixture bewaart twee gepubliceerde releases en daarna een nieuwer, niet-gepubliceerd homeconcept. Alle CMS/API-handles sluiten vóór export. De echte CLI exporteerde active en een oudere UUID elk met26 publieke bestanden plus het gesaneerde manifest. Alle bestandshashes zijn bytegelijk aan hun eigen pins, ook na herexport met de definitieve stagingvalidatie. BronDB en bronmanifest blijven ongewijzigd.

Na de twee contractfixes slagen18 gerichte tests voor releasekeuze, complete route-/beeldinventaris, private-data-uitsluiting, echte CLI, statische HTTP zonder appserver, CSP/404, missing/hash/link/fragment/path/externe-resourcefouten, onbekende/failed releases, junctionweigering, bestaand/ondertussen verschenen doel en copy-failurecleanup plus retry.

De eerste volledige workspacepoort was groen met427 tests: API376in43 bestanden plus51 overige tests, frozen install, build/typecheck/lint, beide compiled Planner-startupsmokes inclusief booking/replay/herstart en acht catalogus-CLI-checks. Daarna zijn staging/fragmentcontrole en de extra cleanupregressie gericht gecontroleerd met8/8 tests. Op head1e88334 volgden twee parallelle hersteltimeouts en daarna een groene volledige seriële377-test API-run met standaardtimeouts. De fixhead349db0b heeft18/18 gerichte exporttests plus typecheck/lint/build groen; de finale volledige API-run op exact349db0b slaagt met387 tests in43 bestanden in232,32s, met --maxWorkers=1 --no-file-parallelism en de oorspronkelijke timeouts. Geen timeoutverhoging.

Echte browserproef op alleen statische hosts3060/3061 met CSP connect-src none: NL/EN-home, NL/EN-tekstpagina, NL/EN-portfolio met lokale derivative, NL/EN-lege staat, NL/EN-contact en taalnav. Oude home toont Welkom bij de proeftuin, nieuwe home New published NL home; het latere NOT_EXPORTED_DRAFT ontbreekt. Heropenen en echte hostherstart behouden dezelfde pagina's. De eerdere inventarisproef op3058 had daarnaast NL-contact/taalnav en alle42 rootrelatieve links zonder closuregaten. CMS/API3055/3056 stonden uit. Eigen statische listeners zijn na bewijs afgesloten. De browser vraagt soms een favicon op; ontbrekende favicon blijft een normale404 en wordt niet uit een private map aangevuld.

PR44 is onafhankelijk akkoord na gerichte Astra-medium herreview op runtimehead `349db0b3bfc2e2c85bfe852a7788ea3a9b571c69`. Twee P2-contractfixes zijn door Sol6.1 low opgelost en door dezelfde reviewer gesloten. Volledig rapport en test-/hostdiagnosenuance staan in [review-pr44.md](review-pr44.md). Dit is een kosteloze lokale M5-proef, geen klantimport, productiehosting of deployment. Het bron-/doelmanifest en de bytes zijn geen cryptografisch ondertekende releaseketen.
