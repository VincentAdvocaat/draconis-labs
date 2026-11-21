# Lokale PostgreSQL-proef voor Planner

De PostgreSQL-adapter gebruikt een pool en een genummerd schema voor taken,
voorkeuren en idempotente taakcreatie per werkruimte. De proef gebruikt de
asynchrone Planner-service uit `packages/planner-core`. De bestaande Fastify-,
boekings- en Electron-ingangen gebruiken SQLite. De PostgreSQL-adapter is via
de import-CLI en de integratiesuite te gebruiken.

## Starten en testen

Gebruik een eigen disposable PostgreSQL 17-container met een dynamische
loopbackpoort. De waarden hieronder zijn uitsluitend voor fictieve fixtures.
Kies een eigen containernaam als deze naam al in gebruik is.

```powershell
docker run --rm -d --name draconis-planner-pg-probe -p 127.0.0.1::5432 -e POSTGRES_USER=planner_fixture -e POSTGRES_PASSWORD=planner_fixture_only -e POSTGRES_DB=draconis_planner_test postgres:17
docker exec draconis-planner-pg-probe pg_isready -U planner_fixture -d draconis_planner_test
$plannerPgPort = (docker port draconis-planner-pg-probe 5432).Split(':')[-1]
$env:PLANNER_POSTGRES_TEST_URL = "postgresql://planner_fixture:planner_fixture_only@127.0.0.1:$plannerPgPort/draconis_planner_test"
corepack pnpm --filter @draconis/planner-postgres test:postgres
```

Wacht op `accepting connections` bij de eerste start. De suite vereist de
databasenaam `draconis_planner_test`, maakt een eigen schema en verwijdert dat
schema na afloop. Ze gebruikt twee poolverbindingen en controleert zichtbaar
in PostgreSQL dat beide transacties op dezelfde werkruimte wachten.

De suite controleert de voorwaartse migratie en een mislukte DDL-migratie,
conflicten met serverversie, afronden zonder versie, herstel na een fout na
invoegen van een opvolgtaak, herhaalde taakcreatie, werkruimte-isolatie en de
taak- en voorkeurgegevens van de beide SQLite-fixtures.

## SQLite-snapshot overzetten

Maak eerst een consistente kopie met [Planner-data](pl13-snapshot-import-herstel.md).
Gebruik de bronhash uit de SQLite-inspectie en een lege PostgreSQL-werkruimte.
Voer onderstaande opdrachten uit in dezelfde disposable containeromgeving.

```powershell
$env:PLANNER_POSTGRES_URL = $env:PLANNER_POSTGRES_TEST_URL
corepack pnpm --filter @draconis/planner-postgres planner:postgres migrate
corepack pnpm --filter @draconis/planner-postgres planner:postgres create-workspace --workspace fixture
$plannerImportArgs = @('--workspace', 'fixture', '--snapshot', 'C:/pad/naar/fixture.sqlite', '--source-id', 'fixture-A', '--sha256', '<bronhash>')
corepack pnpm --filter @draconis/planner-postgres planner:postgres dry-run @plannerImportArgs
corepack pnpm --filter @draconis/planner-postgres planner:postgres import @plannerImportArgs
```

De dry-run voert dezelfde inserts en databasecontroles uit onder een
savepoint en draait ze terug. Stop na een fout en controleer de bron of het
doel vóór de definitieve import. Herhaal de import met dezelfde werkruimte,
bronidentiteit en hash om de marker te controleren. Het tweede rapport heeft
`alreadyImported: true` en nul inserts. De snapshot blijft byte voor byte gelijk.
Een andere import in een bezette werkruimte stopt vóór de eerste insert.

De import projecteert taken, voorkeuren en opgeslagen resultaten voor
taakcreatie. Afspraken, contacten, slots, boekingsreceipts, publieke aanvragen
en API-sleutels blijven in de SQLite-bron. Bewaar die bron en de afzonderlijke
SQLite-back-up zolang hun overgang openstaat. Stop alleen je eigen container
na de proef met `docker stop draconis-planner-pg-probe`.

## Transacties

Elke wijziging vergrendelt de bestaande werkruimterij met `FOR UPDATE` vóór de
eerste inhoudelijke read. De transactie gebruikt één verbinding en bepaalt
de taakversie na het verkrijgen van de lock. De taakstatus, herordening,
eventuele opvolgtaak en de mutatieresultaten worden binnen diezelfde
transactie bijgewerkt. Het migratieslot is een PostgreSQL advisory lock op
transactieniveau. [PostgreSQL-locks](https://www.postgresql.org/docs/17/explicit-locking.html)

## Vervolgacceptatie

AB#127 vraagt om Fastify met managed PostgreSQL. Dat vereist een toegewezen
testserver, pool- en TLS-configuratie, Key Vault en goedgekeurde toegang.
Test daarna werkruimte-autorisatie via HTTP, bestaand foutgedrag met 409 en
dezelfde capaciteitsraces bij reserveren, blokkeren en verplaatsen. De
PostgreSQL-proef dekt vooralsnog alleen de taken- en voorkeurenopslag.

AB#129 vraagt om een herstelproef op een aparte omgeving. Leg eerst RPO,
RTO en de behandeltijd van writes sinds het gekozen herstelpunt vast. Meet en
controleer daarna de teruggezette data voordat iemand de API omschakelt.
