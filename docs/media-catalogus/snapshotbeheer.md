# Snapshotbeheer en normale lokale start

Deze afronding begint op gereviewde cataloguscommit `d49f1493d126516b4187531d803d991295d62d8e` uit [PR 14](https://github.com/VincentAdvocaat/draconis-labs/pull/14). De afhankelijkheidsketen is PR 14, M1 PR 11, M0 PR 8 en ontwerp-PR 6. Geen bestaande centrale scripts, lockfile, Planner of CMS-module zijn gewijzigd. Het nieuwe commandbestand is afgestemd met Planner en orchestrator.

## Start, heropenen en stoppen

Laad vanuit deze checkout de bestaande dev-CLI:

```powershell
. ./scripts/dev-cli/development.ps1
catalogus start
```

Dit gebruikt automatisch de checkout waarin `commands/catalogus.ps1` staat, een vrije loopbackpoort en een nieuwe expliciet gemarkeerde tijdelijke fixture. Er is geen fallback naar een root-, gebruikers-, planner- of CMS-database. Dependencies installeer je eerst via `corepack pnpm install --frozen-lockfile` in die checkout.

Expliciete keuzes kunnen zonder globale instellingen:

```powershell
catalogus start -RepoRoot <checkout> -FixtureRoot <eerder-afgedrukte-fixtureRoot> -Port 0
```

`-Port 0` kiest een vrije poort. Bij een bezette vaste poort toont de start welke catalogus-instance-ID daar draait, of meldt een onbekende lokale service. Het command stopt geen bestaand proces en probeert geen andere database als alternatief. De eigen zojuist aangemaakte ongebruikte fixture wordt bij een mislukte bind opgeruimd. Een expliciet heropende fixture blijft behouden.

Ctrl+C in de startterminal sluit alleen de eigen foregroundserver. De fixture blijft bewaard voor heropenen. De normale stop zoekt of beëindigt geen andere node-, Planner- of CMS-processen.

Fixturecleanup heeft een eigen expliciete scope, de volledige tijdelijke proef inclusief originelen, database en behouden referenties. Stop de bijbehorende eigen server eerst:

```powershell
catalogus cleanup -FixtureRoot <eigen-afgedrukte-fixtureRoot> -ConfirmCleanup
```

Het command gebruikt de bestaande gecontroleerde cleanup, met pad-, prefix- en markercontrole onder de tijdelijke systeemmap. Het raadt geen pad. De bestaande groepsdispatcher geeft flags als positionele argumenten door; het eigen command parseert alleen de gedocumenteerde flags en gebruikt geen tekstuitvoering of gedeelde dispatcherwijziging.

De directe entrypoint `corepack pnpm --filter @draconis/api exec tsx src/catalogus/start.ts --port=0` blijft ook bruikbaar.

## Publicatiebeleid en intrekken

De beheerpagina toont nu alle snapshots van de geselecteerde website met ID, status, versie en checksum. Rechten vrijgeven en blokkeren zijn aparte expliciete knoppen met een bevestigde, onderbouwde beslissing. Blokkeren verhindert nieuwe snapshots. Bestaande snapshots blijven beschikbaar tot een medewerker ze afzonderlijk intrekt.

Voor intrekken selecteert de medewerker de snapshot, vult naam en reden in, controleert de checkbox en klikt Geselecteerde snapshot intrekken. De server valideert de bevestiging, website en verwachte snapshotversie. Een tweede of verouderde intrekking geeft 409, een ID van een andere website 404.

Na intrekken geven deze reeds bekende routes 404, ook zonder authenticatie:

- het snapshot-overzicht;
- iedere detailpagina onder die snapshot;
- iedere beeld-URL onder die snapshot.

De publieke routes en private API-responses hebben `Cache-Control: no-store`. Een al weergegeven of gedownloade kopie kan de server niet terughalen. Die beperking staat ook in de beheerhelp. Er is geen online deployment of automatische verwijdering bij externe hosting uitgevoerd.

Intrekken verandert alleen status en beheer-versie. De immutable snapshot-JSON en checksum blijven gelijk. Audit, itemrevisies en alle retained mediareferenties blijven bestaan. Fysieke purge blijft daardoor geblokkeerd. Opnieuw publiceren maakt een nieuwe snapshot-ID en controleert de actuele rechten, onderbouwing, alt en bestandsversies opnieuw. De ingetrokken URL wordt niet hergebruikt.

## Modulecontract en migratie

`CatalogService.listSnapshots(websiteId)` levert de sitegebonden beheerstatus. `withdraw(websiteId,snapshotId,{expectedVersion,employee,reason,confirmed:true})` legt de actie vast. `resolveSnapshot`, de bestaande detailrenderer en `variant` weigeren een ingetrokken snapshot. CMS kan dus hetzelfde `CatalogRef` blijven pinnen en krijgt bij intrekking een duidelijke niet-beschikbare referentie. Eerder door CMS gekopieerde releasebestanden vragen een eigen expliciete intrekactie in die publicatieworkflow.

HTTP-beheer gebruikt `GET /catalogus/api/:site/snapshots` en `POST /catalogus/api/:site/snapshots/:snapshot/withdraw`, achter dezelfde bearer- en Origin-grens. `GET /catalogus/instance` geeft uitsluitend module en willekeurige instance-ID, zonder token of opslagpad, voor lokale poortdiagnose.

SQLite-migratie 1 naar 2 voegt snapshotstatus en beheer-versie toe en een aparte audittabel. Bestaande snapshots krijgen published/versie 1 plus een migratie-auditrecord. De gepinde inhoud, bestanden en refs veranderen niet. Nieuwe publicaties en intrekkingen krijgen een datum en auditrecord; de intrekbeslissing bevat medewerker en reden. Heropenen van versie 2 is idempotent. Database-schema 2 staat los van het ongewijzigde snapshot-contract `schemaVersion=1`.

Het formulier toont Bezig, blokkeert gelijktijdige bediening tijdens een actie, herstelt bediening ook bij fouten en toont concrete instructies bij ontbrekende intrekbevestiging of medewerker/reden. Conflicten veranderen de bewerkte formulierversie niet stilzwijgend. Laden vernieuwt formulier en versie samen, zoals vastgelegd in de gereviewde PR 14-fix.

## Bewijs en vervolg

De tests bestrijken migratie met bestaande snapshot, site-isolatie, vereiste bevestiging, CAS en concurrerende HTTP-intrekking, bekende pagina/detail/beeld-URL's na intrekken, ongewijzigde checksum/audit/retained refs en opnieuw publiceren met actuele rechten. De echte beheerscript-test controleert de checkbox, statusmelding en herstel van bediening na weigering/succes.

De lokale browserproef gebruikte uitsluitend synthetische testdata. Via `catalogus start -Port 0` zijn publiceren, weigering zonder checkbox, bevestigde intrekking en nieuwe publicatie doorlopen. De reeds geopende snapshot en haar bekende beeld-URL werden na intrekken geweigerd; een nieuwe snapshot kreeg een ander ID. De bezettepoortproef benoemde de bestaande instance en die bleef daarna bruikbaar.

Een gecombineerde negatieve CLI-test met een cleanup-aanroep naar de projectmap werd door automatische toolcontrole geweigerd. Die cleanup is niet uitgevoerd. De guard voor ontbrekende cleanup-bevestiging is in de code gecontroleerd; normale start en bezette/ongeldige poort zijn apart uitgevoerd. Positieve cleanup blijft beperkt tot een expliciet eigen tijdelijk fixturepad.

`scripts/dev-cli/tests/catalogus-arguments.ps1` controleert acht argumentgevallen zonder een proces of cleanup-actie uit te voeren, inclusief defaults van de bestaande groepsdispatcher. De normale start zonder flags is daarna echt uitgevoerd. Na Ctrl+C van die extra eigen testinstantie bleef de eerdere catalogus-instance-ID bereikbaar. `catalogus cleanup` op uitsluitend de afgedrukte eigen tijdelijke fixture van het gestopte extra proces is vervolgens geslaagd. De geweigerde negatieve cleanup naar de projectmap is niet herhaald of omzeild.

Alle verdere klant- of productie-integratie blijft een aparte opdracht. De eerstvolgende gevraagde inhoudelijke uitbreiding, centrale CMS-redactie en taalvarianten, staat als voorstel in [de backlog](backlog.md), met behoud van bestaande defaulttaal en IDs. Deze afronding bouwt geen shop, vertaalservice of externe publicatie.
