# Gezamenlijke acceptatie op20 november2026

## Eén checkoutpoort

Uitgevoerd vanuit `feature/local-modules-integration-v3`, gezamenlijke mergetip `f022f7800a989c63f5e13dba3fe60471b4c46445`, plus de nieuwe gezamenlijke test en de seriële scriptdelta. Geen runtimecode gewijzigd. pnpm11.10.0, Node24.3.0.

`./scripts/verify-local-integration.ps1` slaagt volledig: frozen install, build, typecheck, lint, 458 tests en beide gecompileerde Planner-startupsmokes plus acht catalogus-CLI-argumentchecks. API407 tests in46 bestanden,227,95s, één worker en geen bestandsparallelisme; overige tests shared18/core7/PlannerUI20/desktop6. Bestaande Planner-bundelgroottewaarschuwing blijft aanwezig. Geen bestaande timeout of testassert gewijzigd. De nieuwe integratiecase krijgt zijn eigen30s-budget; de gerichte eerste geslaagde run duurde3,68s voor de test.

Planner/private smoke controleert echte dist-start, create/move/read, legacy/workspace, verkeerde workspace, CORS en bookingretry. Publieke smoke controleert reservering, exacte replay, afwezige private routes/PIIlookup en behoud van receipt/capaciteit na procesherstart. Alle apps/packages blijven125 tracked blobs gelijk aan PR43. Package-/lock-/dependencybestanden blijven gelijk.

De seriële API-volgorde is bewust in de bestaande poort vastgelegd na de eerder gemeten oude parallelle recoverytimeouts in de bronchats. Deze run heeft geen timeouts. De historische failures/profielgrenzen blijven in het [PR44-rapport](../cms/review-pr44.md); seriële uitvoering bewijst geen exclusieve oorzaak van alle eerdere tijdsoverschrijdingen.

## Nieuwe gecombineerde regressiecase

`server/api/tests/cms-version-export-integration.test.ts` gebruikt echte bestaande services en uitsluitend nieuwe gemarkeerde tempfixtures. Rood v1 krijgt expliciete rechten en NL/EN-snapshots. Twee CMS-portfoliopagina's pinnen die snapshots in een echte release. Blauw v2 wordt ready, zet assetrechten unknown en laat de redactionele keuze op v1. Nieuwe cataloguspublicatie wordt geweigerd totdat de medewerker opnieuw vrijgeeft en bewust v2 met nieuwe NL/EN-alt kiest. Twee nieuwe snapshots worden in een volgende echte CMS-release gepind. Oude v1-beeldhashes blijven gelijk.

Een eigen geïnjecteerde stagingfout maakt v3 failed en behoudt de oude vrijgave. Vier geactiveerde CMS-consumerpins blijven aanwezig. Alle services sluiten vóór backup. Het pakket heeft CMS8/catalogus5/uploadschema1. Restore naar nieuwe eigen roots behoudt alle rijen van alle tabellen in beide databases vóór appstart, alle95-pakketbestanden in de afzonderlijke CLI-proef en iedere pakketbestandhash in de test. Dit omvat alle job/fileVersionbindingen, oude/nieuwe snapshots, CMS-releases, consumerrefs en audits. Nieuwe sleutels verschillen; oude toegang krijgt401, nieuwe200.

Actieve en oude release worden uit het herstelde doel geëxporteerd, hun HTML blijft bytegelijk aan de betreffende v1/v2-publicatie. Twee app-/serviceheropeningen behouden snapshots en publieke v2-HTML. Expliciete retry hervat dezelfde failed v3-job/fileVersion, wordt ready op poging2 en zet rechten unknown. Ook dan blijven de oude v1-bytes en bestaande CMS-publicatie behouden. De brongevallen van PR45 dekken daarnaast legacy0→1, manipulaties met opnieuw berekende buitenste hash, pending-CAS en retryweigering vanuit een tweede instantie; ze zitten in de volledige407-run.

## Echte CLI, processen en browser

Genegeerde helpers onder `server/api/data/integration-v3` zijn uitsluitend proefbesturing, geen productcode. Er is een nieuwe rijke synthetische CMS-fixture gemaakt met NL/EN-home, tekst, portfolio, lege staat en contact. Daarnaast bevat dezelfde mediaDB een werkelijk verwerkte ready v1/v2 en failed v3. Deze extra upload is afzonderlijk van de seedfoto die de rijke CMS-pagina's al pinnen; het kruisscenario met werkelijk door CMS gepinde v1/v2 is de regressiecase hierboven.

Echte `cms-recovery.ts backup` en `restore` kopieerden95 bestanden. Vóór enige startup zijn alle rijen van beide databases en alle95 bestandshashes vergeleken. Allemaal gelijk; nieuwe secrets bevestigd zonder tokens te loggen. De echte `cms-export.ts` exporteerde active en oudere UUID elk met26 publieke bestanden plus het publieke manifest. Actief `edfefaa0-32ed-4dfd-9fec-ae87e211832f`, oud `1da2061b-d429-4084-8ff8-a94fea5263d1`.

Een eigen CMS-proces3055 hervatte expliciet de failed v3-job. Na nette stop via stdin startte een nieuw proces dat dezelfde v3 ready/poging2 controleerde en de oude EN-portfolio served. HTTP-controle oude publisher401, nieuwe200, publieke huidige home bevat New published NL home en geen NOT_EXPORTED_DRAFT. Daarna CMS gestopt.

Alleen statische hosts3060/3061 bleven aan, met `connect-src 'none'`, eigen styles/scripts/images en zonder API/DB-routes. Browsercontrole van alle tien werkelijke NL/EN-routes, taalnav, lokale derivative geladen met natuurlijke breedte>0, lege-staattekst en gesaneerde contacttemplate. Oud toont Welkom bij de proeftuin; huidig toont New published NL home. Na echte statische hoststop/start blijven contact en oude home hetzelfde. Geen browser-/OS-offlineclaim, file://-rewrite of categorie-filterroute verzonnen. Favicon404 is toegestaan.

Na retry en procesherstart is de echte CLI-export opnieuw naar een vers doel uitgevoerd: alle27 bestanden inclusief manifest bytegelijk. Eigen CMS/API3055/3056 en statische3060/3061 worden na de proef afgesloten. Screenshot `integration-v3-static-contact.png` staat bij bronchat `01a1f49b-5ee0-7010-83f3-b62b8b94b041`; helpers/config/requests blijven genegeerd. Geen klantroot, private origin of token gepubliceerd.

## Reviewstatus

Nieuwe onafhankelijke Astra-medium integratiereview volgt op de nieuwe PR. De bronreviews zijn gesloten; de integratiereview beoordeelt actuele SHA, ancestry/blobherkomst, gezamenlijke contracten, script en nieuwe test. Geen blinde herreview van alle al beoordeelde moduleketens. Geen mainmerge of deployment.
