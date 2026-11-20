# Integratiebewijs op 20 november 2026

## Semantische delta

CMS09 uit PR42 accepteerde bewust alleen CMS-schema8 met catalogusschema3. De catalogusketen migreert naar schema4 voor categorieën en schema5 voor itempositie. De integratie neemt expliciet de versies 3, 4 en 5 op, zonder toekomstige versies blind toe te staan. Backup schrijft de daadwerkelijk read-only geverifieerde versie. Restore eist overeenkomst tussen manifest en database vóór een appconstructor of migratie wordt geopend.

`recovery-catalog.ts` controleert vereiste tabellen/kolommen, categorieversies en labels, websitegebonden categorieën in retained revisies/snapshots, current revision-relaties, niet-negatieve schema5-posities en unieke posities voor actieve items. Archiefgaten en positie-overlap met gearchiveerde items blijven toegestaan. Snapshotversies1/2/3 behouden hun volledige JSON. Hun checksums worden zonder veldstrippen herberekend; identiteit, categoriecoverage en revisieverwijzingen worden gecontroleerd. Consumerrequest/snapshot/context/hash/owner/activatie/events en bij gepubliceerde CMS-pagina's de vereiste pins worden onderling vergeleken. Onbekende schema's, ontbrekende categorie/positie/pin, gewijzigde snapshotchecksum of manifest/DB-versieconflict worden geweigerd.

Bestaande offline eigenaar-, SQLite backup-API-, recoverylock-, pad/junction-, no-overwrite-, nieuwe-token- en foutcleanupgrenzen blijven behouden. Geen live atomiciteitsclaim voor twee databases plus bestanden. De nieuwe validator opent nooit CatalogService om een pakket te inspecteren. Pas na geslaagde restore mag een expliciete appstart schema3/4 naar5 migreren.

## Geautomatiseerde controle

Uitgevoerd vanuit deze ene checkout met pnpm11.10.0 en Node24.3.0:

```powershell
./scripts/verify-local-integration.ps1
```

Frozen install, build, typecheck, lint en alle416 tests groen: API365 in42 bestanden, PlannerUI20, shared18, core7, desktop6. Bestaande Planner chunkwaarschuwing blijft aanwezig. Beide echte dist-startupsmokes groen: private CRUD/legacy/workspace/CORS/retry; publiek reserveren, exacte replay, afwezige private routes/PIIlookup en behoud van receipt/capaciteit na procesherstart. Acht catalogus-CLI-argumentchecks groen. Geen testtimeouts verhoogd.

De gerichte recoverysets hebben15 tests. Het nieuwe gecombineerde scenario maakt via de echte services NL/EN-items en snapshots, pint twee snapshots via echte CMS-publicatie/consumeractivatie, hernoemt een categorie, draait de volgorde om en bewaart oude/nieuwe snapshots plus een archiefcategorie en nieuwer CMS-concept. Offline backup/restore bewaart alle database-rijen vóór startup, snapshot-JSON, CAS, actieve publicatie en bron-DB-hashes. Twee herstarts behouden de snapshots en publieke HTML; oude toegang faalt. Schema3- en4-fixtures worden eerst byte/rijgetrouw hersteld en pas bij appstart bewust naar5 gemigreerd.

Negatieve pakketten worden ook geweigerd als de buitenste bestandshash opnieuw is berekend: ontbrekende categorie, ontbrekende positie, checksumwijziging, verwijderde consumerpins en versiemismatch. Bestaande tests dekken gedeeltelijke foutcleanup/retry, corruptie, ontbrekende/extra bestanden, traversal/case/junction, onbekende schema's, stale/live recoveryowners en behoud van nieuwe eigenaar.

## Browser en echte CLI

Een eigen tijdelijke, gemarkeerde synthetische CMS/media-root is vanuit deze checkout gestart. CMS3055 en catalogus3056 deelden dezelfde root en één owning Node-eventloop. De helper en configuratie staan uitsluitend in genegeerde server/api/data/integration-v2. Er zijn geen klantmappen gebruikt.

- Bibliotheek zoekt photo, toont beide versies en retained gebruik. Categorie Integratieprojecten/Integration projects aangemaakt; item met directe NL/EN-inhoud opgeslagen.
- NL- en EN-snapshot gepubliceerd. Volgorde via knoppen omgedraaid en opgeslagen. Categorie hernoemd naar Integratiewerk/Integration work. Nieuwe EN-snapshot toont nieuwe naam en omgekeerde volgorde; oude EN-snapshot behoudt de eerdere naam en volgorde.
- Contactkop EN bewerkt, opgeslagen en in exacte privépreview met werkend menu bekeken. Expliciete shared- en NL/EN-contactpins gepubliceerd. Alleen lokale CSS/JS, geen externe resources. Nieuwere contactdraft verandert de gepubliceerde kop niet.
- Beide eigen listeners gestopt. De niet-interactieve teststarter gaf geen stdin-doorvoer; uitsluitend het vooraf gecontroleerde eigen Nodeproces is beëindigd. Quiesce verwijderde daarna alleen aantoonbaar dode ownerlocks. Backup via echte CLI produceerde52 bestanden; restore naar een volledig nieuwe CMS/media-root met nieuwe tokens.
- Hersteld doel weigert oud catalogustoken. Nieuwe toegang laadt categorieën en opgeslagen volgorde. Oude/nieuwe publieke snapshots blijven bereikbaar. CMS laadt de nieuwere conceptkop naast de eerdere publieke contactkop. Save op het doel werkt.
- Na echte procesherstart blijft concept 'Saved after consolidated offline restore' behouden en publieke kop 'Meet the integration fixture' ongewijzigd. Nieuwe snapshot behoudt nieuwe categorienaam en volgorde. Beide listeners via de interactieve eigen starter netjes gestopt;3055/3056 gesloten.

De browserproef levert geen echte klanttemplate-import. Consumerpins/refs zijn aanvullend in de geautomatiseerde gezamenlijke serviceproef geverifieerd. Plannercode is blobgelijk aan PR37; de startup/bookingherstartsmokes zijn opnieuw gedraaid. De eerdere Planner-browserbaseline blijft begrensd tot de onveranderde code, er wordt geen nieuwe Planner-UI-functionaliteit geclaimd.

## Review

Gerichte onafhankelijke Astra-medium integratiereview volgt na het gereedmaken van de PR. Scope: de semantische recoverydelta, schema/invariantvalidatie en consolidatieherkomst. De oude moduleketens worden niet blind opnieuw beoordeeld.
