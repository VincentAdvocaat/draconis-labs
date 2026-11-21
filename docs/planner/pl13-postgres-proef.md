# Lokale PostgreSQL-proef voor Planner

De PostgreSQL-adapter gebruikt een pool en een genummerd schema voor taken,
voorkeuren en idempotente taakcreatie per werkruimte. De proef gebruikt de
asynchrone Planner-service uit `packages/planner-core`. Fastify heeft een expliciete lokale HTTP-proef voor deze adapter.
De standaardstart, boekingsingangen en Electron gebruiken SQLite.

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

## Opt-in HTTP-ingang

De gecompileerde API gebruikt PostgreSQL voor de beveiligde
`/api/v1/workspaces/local`-routes als `DRACONIS_PLANNER_POSTGRES_URL` is gezet.
Gebruik de [lokale testidentiteit](../api/local-identity.md) met een expliciet
`DATABASE_PATH` in een wegwerpprofiel. De API en de PostgreSQL-verbinding
gebruiken loopback. Geef in de PostgreSQL-URL een database, gebruikersnaam en
wachtwoord op. Gebruik een eigen testdatabase. De API voert de genummerde
migraties uit en maakt zo nodig werkruimte `local` aan vóór het luisteren.

```powershell
corepack pnpm --filter @draconis/api build
$env:DRACONIS_PLANNER_POSTGRES_URL = $env:PLANNER_POSTGRES_TEST_URL
$env:DRACONIS_LOCAL_IDENTITY_FILE = 'C:/pad/naar/fictieve-identity.json'
$env:DATABASE_PATH = 'C:/pad/naar/eigen-profiel/identity.sqlite'
$env:HOST = '127.0.0.1'
$env:PORT = '39081'
corepack pnpm --filter @draconis/api start
```

Stuur het token van de testidentiteit voor taak-, historie- en
voorkeurenverzoeken naar dezelfde workspace-routes als bij het beveiligde
SQLite-profiel. De standaardstart gebruikt SQLite. Voor afspraken, publieke
reserveringen en de compatibiliteitsroutes gebruik je de bestaande
standaardingangen. Een fout tijdens PostgreSQL-start stopt vóór de API
verkeer ontvangt.

```powershell
corepack pnpm --filter @draconis/api smoke:planner-postgres
```

Deze uitvoerbare proef gebruikt `PLANNER_POSTGRES_TEST_URL` uit de
containerinstructie hierboven. Het fixtureaccount maakt één eigen
wegwerpdatabase aan. De proef start de gecompileerde API op een vrije
loopbackpoort en controleert autorisatie, cursorpaginering, idempotentie en
een gelijktijdige afronding met één HTTP 409 en één opvolgtaak. Zij controleert
ook PostgreSQL-opslag en behoud van taken, voorkeuren en idempotentie na
procesherstart. Aan het eind sluit zij de processen en verwijdert zij de
eigen wegwerpdatabase.

## Audit en MCP

REST en MCP gebruiken in deze opt-in dezelfde werkruimteroutes, dezelfde
scoped agentcredentials en dezelfde PostgreSQL-opslag. De
identiteitsconfiguratie en credentialstore blijven in de bestaande lokale
testopstelling. Taakmutaties, idempotentiereceipts en geslaagde auditregels
worden op dezelfde PostgreSQL-verbinding vastgelegd. Faalt het wegschrijven
van de auditregel, dan vervalt ook de taakmutatie. Bij een geweigerde
mutatie blijven alleen de auditmetadata en de foutstatus staan.

Gebruik in beide processen dezelfde `DRACONIS_PLANNER_POSTGRES_URL` en
`DATABASE_PATH`. Voor MCP is ook `DRACONIS_MCP_AGENT_TOKEN` nodig. Het bestaande
commando `planner:audit` leest met de PostgreSQL-variabele de PostgreSQL-audit
en gebruikt bij de standaardstart de SQLite-audit. Audit bevat alleen
metadata volgens het lokale auditcontract.

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
De lokale HTTP-proef dekt werkruimte-autorisatie en het foutcontract voor
taken. Valideer deze op de toegewezen testserver en voeg de PostgreSQL-
boekingsopslag en capaciteitsraces toe voor reserveren, blokkeren en verplaatsen.

AB#129 vraagt om een herstelproef op een aparte omgeving. Leg eerst RPO,
RTO en de behandeltijd van writes sinds het gekozen herstelpunt vast. Meet en
controleer daarna de teruggezette data voordat iemand de API omschakelt.
