# Lokale desktopproef

PL-02-experiment met een kleine React-weergave, beperkte Electron-preload en
duurzame SQLite-write via `planner-core.createPlannerService` en de gedeelde
`planner-sqlite`-adapter. De proef opent
uitsluitend `probe.sqlite` in een eigen profiel. Hij migreert geen bestaande
Planner-database. Cloud, werkruimten, contacten en afspraken zijn niet gebouwd.

Vanaf de repository-root:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @draconis/desktop-probe build
corepack pnpm --filter @draconis/desktop-probe package
corepack pnpm desktop:probe
```

`package` downloadt de gepinde Electron-runtime als die nog niet in de cache staat.
De gegenereerde map onder `dist/packages` is zelfstandig uitvoerbaar zonder Node
of ontwikkelserver. Open `DraconisPlannerProbe.exe` voor handmatige invoer.
De renderer gebruikt gebundelde assets; externe netwerkverzoeken worden geweigerd.

De automatische proef start vijf afzonderlijke processen met één tijdelijk
profiel, schrijft via de echte preload, controleert eerdere records, verplaatst de taak, rondt haar af, controleert één
opvolgtaak en weigert ongeldige invoer en verouderde versies. Vervalste maker, ID,
lane en versie uit create-invoer worden genegeerd. Hij controleert Windows safeStorage met een fictief token.
Vervolgens test hij het Node-sidecarprotocol met dezelfde SQLite-store en
taakregel. Dit laatste is geen Tauri-shell. Een time-out beëindigt het eigen
proces. De tijdelijke profielmap blijft beschikbaar voor inspectie.

JSON en schermafbeeldingen staan in `apps/desktop-probe/dist/results/run-<timestamp>`.
`readyMs` meet vanaf uitvoering van het main-script tot de preload gereed is.
`spawnToReadyMs` meet vanaf het starten door het meetproces tot datzelfde moment.
`elapsedMs` omvat ook de schrijfcontroles en het afsluiten. De OS-cache wordt
niet geleegd. Deze cijfers bewijzen geen koude start op een schone VM.

Een tweede versie met dezelfde profielmap beproeven:

```powershell
$env:PLANNER_PROBE_VERSION = '0.2.0'
corepack pnpm --filter @draconis/desktop-probe build
corepack pnpm --filter @draconis/desktop-probe package
$env:PLANNER_PROBE_PROFILE = 'C:\pad\naar\het\eerste\tijdelijke\profiel'
$env:PLANNER_PROBE_PREVIOUS = 'dist/results/run-<eerste-timestamp>/launch-5.json'
$env:PLANNER_PROBE_RESULTS = 'dist/results-v2'
corepack pnpm desktop:probe
```

De tweede proef vergelijkt de volledige eerste read met de laatste read van de
vorige versie, inclusief IDs en alle taakvelden. Dit beproeft vervanging van de
appmap met behoud van SQLite. Een echte installerupgrade blijft afzonderlijk
te testen. Verwijder de `PLANNER_PROBE_*`-variabelen uit de shell na de proef.

Een unsigned Squirrel-installer bouwen op Windows:

```powershell
corepack pnpm --filter @draconis/desktop-probe exec node scripts/package.mjs --installer
```

Dit maakt Setup.exe, een full.nupkg en RELEASES onder `dist/installer`.
Het installeert niets en publiceert niets. Forge zelf is nog niet geconfigureerd;
de proef gebruikt Packager en electron-winstaller rechtstreeks. De bestaande
Node/SQLite 12-dependency van de API blijft ongewijzigd. Alleen de proef gebruikt
SQLite 13.2 met meegeleverde Node-API-binaries. De versiegebonden pnpm-buildregel
voorkomt een onnodige automatische C++-rebuild van die binary.

Zie [de ADR](../../docs/planner/adr-001-windows-runtime.md) voor bewijs en grenzen.

De PL-11-vervolgstap gebruikt de gewone gedeelde `tasks`- en voorkeurentabellen
in diezelfde geïsoleerde proefdatabase. Eerdere PL-02-JSON-records worden per
ontbrekend ID atomair overgenomen; de brontabel blijft behouden. Met
`PLANNER_PROBE_SEED=../../docs/planner/evidence/upgrade-records.json` kan de
meetprocedure die oude tabel met vijf fictieve records aanmaken in een nieuw
profiel. Gebruik deze optie alleen voor de eerste run van dat nieuwe profiel.
Zie [PL-11 en zijn resterende criteria](../../docs/planner/pl11-core-en-opslag.md).

De gewone renderer gebruikt nu dezelfde `createPlannerClient` als de webapp,
met expliciet workspaceId `local`. Preload biedt alleen `invoke` en de meet-
readyfunctie. Main valideert commando, context en afzender. De meetprocedure
roept de echte rendererclient aan en controleert gedeelde foutcodes. De import
heeft een duurzame voltooiingsmarker; verwijderen van oude proeftaken wordt
na herstart niet teruggedraaid. Zie [de lokale clientacceptatie](../../docs/planner/pl11-lokale-client.md).
