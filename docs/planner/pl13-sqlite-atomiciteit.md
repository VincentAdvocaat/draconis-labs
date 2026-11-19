# PL-13 · SQLite-migratie en atomaire taakmutaties

Deze lokale stap bouwt op PR #15, onafhankelijk herbeoordeeld op
`40a45216e30dcefd508a851537dc556406ae1367` in reviewchat
`01a1f4ce-2d62-7df3-b1fa-18cc1a657401`. De drie eerdere P2-bevindingen zijn
daar opgelost. Dit document beschrijft het SQLite-deel van PL-13; de volledige
story met PostgreSQL, werkruimte-import en herstel is nog niet gereed.

## Mutatiegrens

De core ontvangt een synchrone `PlannerStorage.transaction`-poort. Aanmaken,
wijzigen, verwijderen en het lezen/bijwerken van voorkeuren voeren hun gehele
bewerking binnen die poort uit. De SQLite-adapter gebruikt
`sqlite.transaction(operation).immediate()`. De write-lock wordt dus verkregen
voordat de taak en versie worden gelezen, niet pas vóór de eerste update.

De versiecontrole, taakstatus, lane-herordening en eventuele opvolger horen bij
dezelfde transactie en dezelfde verbinding. Een fout ontsnapt aan de callback
en rolt de hele groep terug. Een naburige taak krijgt ook een hogere versie als herordening haar positie
verandert. De direct gewijzigde taak krijgt binnen diezelfde operatie één
versiestap. Een client met de oude buurpositie krijgt daardoor ook een conflict.
De opvolgerberekening staat nog steeds uitsluitend
in de gedeelde core, voor HTTP en desktop.

Het nieuwe workspace-updatecontract vereist nu een positieve gehele `version`,
in de getypeerde client, het gedeelde commandschema en het OpenAPI-body-schema.
Een ontbrekende versie geeft `INVALID_INPUT`/400. Een geldige maar verouderde
versie geeft `VERSION_CONFLICT`/409 met de actuele taak. De bestaande
`/api/v1/planner`-routes en onversieerde alias accepteren nog een PATCH zonder
versie. Zij lezen de actuele taak onder dezelfde write-lock.

De adapter stelt een maximale SQLite busy-wachttijd van 5.000 ms in. Bij
blijvende bezetting wordt `SQLITE_BUSY` vertaald naar `UNAVAILABLE`/503. Dit is
een begrensde wachttijd via SQLite, geen onbeperkte applicatie-retryloop. De
test gebruikt 25 ms en controleert dat er geen taak wordt geschreven.

## Genummerde migraties

`packages/planner-sqlite/src/migrations.ts` bevat SQLite-migratie 1, de bestaande
Planner-tabeldefinities, indexen en conditionele kolommen uit de baseline.
`initializePlannerSqlite` voert ontbrekende migraties en hun registratie in
`planner_schema_migrations` samen onder `BEGIN IMMEDIATE` uit. Een volgende
start slaat reeds geregistreerde versies over. Een onbekende migratieversie
wordt geweigerd zonder de taken of migratiehistorie te veranderen.

Beide bestaande schemafixtures behouden alle oorspronkelijke cellen en
voorkeuren en registreren precies één migratie. Een geforceerd SQL-foutscenario
na eerdere DDL vergelijkt de volledige `sqlite_master`, taken en voorkeuren
met de beginsituatie. Alles blijft gelijk, ook de nieuwe versieadministratie
wordt teruggedraaid. Na het wegnemen van de fictieve naamconflictfout slaagt
dezelfde migratie en blijft een herhaalde start zonder extra registratie.

## Onafhankelijke schrijvers en foutinjectie

Dezelfde vijf scenario's draaien met de API-binding 12.11.1 en de desktop-binding
13.2.0. De concurrencyproef gebruikt twee echte Node-childprocessen, elk met een eigen
SQLite-verbinding naar hetzelfde tijdelijke WAL-bestand. Beide openen hun
verbinding voordat de proef begint. De eerste schrijver wordt na het lezen
van de parenttaak binnen de transactie vastgehouden. Daarna begint de tweede
schrijver zijn update. Een bestandsbarrière controleert dat hij de taak nog
niet kan lezen. Pas daarna krijgt de eerste toestemming door te gaan.
Dit forceert overlappende verzoeken en toetst dat de lock vóór de read zit.

| Scenario | Geslaagde controle |
| --- | --- |
| Twee schrijvers met verwachte versie 1 | Statussen 200 en 409, parentversie 2, exact één opvolger. |
| Twee compatibiliteitswriters zonder versie | Twee successen, parentversie 3, exact één opvolger. |
| Fout direct na daadwerkelijke opvolger-insert | Gehele parentrij, alle taakrijen en lane-posities exact gelijk aan vóór de write. |
| Verouderde buurpositie na herordening | Gewijzigde buurversie verhoogd; schrijven met de oude versie geeft 409. |
| Aanhoudende write-lock op een andere verbinding | `UNAVAILABLE`/503 na de ingestelde korte testwachttijd, nul ingevoegde taken. |

Alle tien atomaire regressietests zijn ook met de oorspronkelijke PR-15-service
zonder transactiewrapper uitgevoerd. Ze faalden alle tien. Na terugzetten van
de nieuwe service slagen ze. De negatieve proef gebruikte alleen tijdelijke
bestanden en in-memory-fixtures.

## Verificatie en desktopbehoud

Frozen install, typecheck, lint, build en 49 tests slagen op Windows met Node
24.3.0 en pnpm 11.10.0: 28 API, 7 core, 6 desktop, 5 shared en 3 web-UI.
De normale API-startsmoke slaagt. De OpenAPI-wijziging bestaat uit de verplichte
versie op de nieuwe workspace-PATCH; de canonieke hashes van alle oorspronkelijke
v1-/legacy-paddefinities blijven gelijk.

De verpakte desktop 0.7 opende het bestaande fictieve 0.6-profiel met twintig
records, zonder genummerde historie. Migratie 1 werd geregistreerd en alle twintig
volledige records kwamen exact gelijk terug, inclusief tijdzone, herhaling en
versies. Na verdere writes las 0.8 alle dertig records exact gelijk terug en
schreef door tot veertig. De actuele 0.9 las die veertig records daarna ook exact
terug en schreef door tot vijftig. Vijftien launches bleven context, conflictcode,
ongeldige invoer, vaste actor en voorkeuren controleren.

Zie [0.7](evidence/pl13-v0.7.json), [0.8](evidence/pl13-v0.8.json),
[0.9](evidence/pl13-v0.9.json),
[recordinhoud en hashes](evidence/pl13-desktop-preservation.json) en
[de uitgelezen SQLite-status](evidence/pl13-sqlite-state.json).
De pakketten 0.7/0.8 maten 403.650.272 bytes; de actuele 0.9 mat 403.650.481 bytes. Dit blijft een appmapproef op een
ontwikkelwerkplek, geen installerupgrade of koude-VM-proef.

## Resterende PL-13-scope

Deze stap bewijst SQLite-taakatomiciteit, lokale migratienummering en strikte
workspace-updateversies. PostgreSQL is niet gebouwd of getest in deze stap. De huidige opslagpoort is
synchroon voor SQLite; een PostgreSQL-adapter vraagt ook een expliciete
asynchrone aanroepgrens en is geen geteste drop-in-adapter.
Er is geen cloudresource aangemaakt. Werkruimtegebonden datamigratie,
snapshot/export/import, dry-run en herstel blijven open. De identity-/hosting-
keuzes en Windows-runtimeacceptatie blijven de eerder beschreven fasegrenzen.

De volgende kleine opslagstap kan de lokale snapshot-/herstelvoorziening met
dezelfde fixtures beproeven. Een PostgreSQL-claim vereist een werkelijk gedraaide
kosteloze lokale testomgeving en dezelfde onafhankelijke-writer/rollbacktests.

Bronnen: [SQLite-transacties](https://www.sqlite.org/lang_transaction.html) en
[better-sqlite3 transaction API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).
