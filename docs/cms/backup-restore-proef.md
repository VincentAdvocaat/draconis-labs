# CMS-09: fictieve back-up en offline restore

Deze kleine CLI-proef volgt op PR40, documentatiehead `d3b881b63b29350b4ed575544f5441fd6b9cb92e`. PR37 blijft vast. M2/M3 van de mediacatalogus zijn niet opgenomen. Geen echte klantdatabase, userfolder, live omschakeling of algemeen templateframework.

## Grens en consistentieprotocol

De tool accepteert alleen eigen, expliciet aangemaakte synthetische fixtures direct onder de tijdelijke Windows/Linux-map. CMS-roots beginnen met `draconis-cms-recovery-`, pakketten met `draconis-cms-backup-`. Bestaande doelen worden altijd geweigerd. Een fixturemarker verbindt de CMS-root aan één eigen tijdelijke mediafixture. De marker is een scopegrens voor deze lokale proef, geen bewijs dat willekeurig later ingevoerde inhoud fictief is. Gebruik uitsluitend fictieve uploads en teksten.

Eén eigenaar stopt eerst alle CMS-, catalogus- en bestandswrites. Backup weigert bestaande runtime- en catalogusownerlocks. Na een abrupt afgebroken proces mag `quiesce` alleen de vaste recovery-, runtime- en catalogusownerlocks opruimen wanneer ieder geregistreerd PID aantoonbaar niet bestaat. Een live PID, ongeldige owner of onderbroken catalogusacquisitie wordt nooit overgenomen of beëindigd. De operator moet dan zelf inspecteren. Quiesce wijzigt geen database-inhoud. Recoverycommando's reserveren eerst de CMS-database met `BEGIN IMMEDIATE`, zodat controle, overname en vrijgave van de recoverymarker onderling geserialiseerd zijn. Alleen `quiesce` neemt een stale recoverymarker over, na een geldig PID, uitsluitend `ESRCH` en een tweede vergelijking van de markerbytes. Een crash laat de SQLite-reservering automatisch los.

Backup neemt een exclusieve recoverymarker en controleert daarna de runtimeowner opnieuw. CMS-start weigert de recoverymarker voor en na zijn eigen lockacquisitie. Vervolgens houdt backup op beide databases een SQLite `BEGIN IMMEDIATE`-schrijversreservering vast. Via afzonderlijke read-only verbindingen gebruikt hij de SQLite backup-API voor `cms.db` en `media.sqlite`. De kopieën worden naar DELETE-journal gezet zodat het pakket zelfstandig is en geen WAL/SHM nodig heeft. Brondata worden niet naar een andere journalmodus omgezet.

Dit is een offline protocol voor één ondersteunde eigenaar. Er is geen claim van een live atomaire transactie over twee databases en filesystem. De reserveringen blokkeren concurrerende SQLite-writes; onafhankelijke bestandswriters moeten gestopt blijven. De bestandsinventaris en hashes worden na de kopie opnieuw vergeleken. Een writer die buiten dit protocol om schrijft is niet ondersteund.

## Pakket en validatie

Het pakket bewaart beide volledige databases, inclusief revisies, previewpins, cataloguspins en auditrecords, alle behouden releasebestanden en de publieke en private fictieve mediabytes. Templates zitten als hashgebonden bundles in de CMS-database. `backup.json` versie 1 bevat bestandspaden, omvang, SHA256, bronfixture-ID, CMS-schema 8, catalogusschema 3 en het offline consistentiecontract. Alleen na alle controles wordt `complete: true` als laatste geschreven.

Uitgesloten zijn lokale configuratie, plaintext tokens, credentialhashconfiguratie, runtime-/consumerlocks, markers met bronpaden en WAL/SHM. Restore maakt nieuwe lokale editor/publishertokens en nieuwe configuratie. Actor- en audit-ID's in de databases blijven behouden. Dit is geen productie-identiteit of rolherbevestigingsflow.

Validatie weigert onbekende manifest- en databaseschema's, incomplete pakketten, ontbrekende/extra/dubbele bestanden, Windows-casebotsingen, traversal, absolute paden, gereserveerde Windowsnamen, symlinks/junctions, ongeldige hashes en corrupte SQLite/FK's. Alle succesvolle retained releases, hun bestanden, mediafilevarianten, actieve pointers en contacttemplatehashes worden gecontroleerd. Bestaande foutieve of onvoltooide builds/uploads moeten eerst via de bestaande app worden afgehandeld. Het hashmanifest detecteert schade en is geen digitale handtekening tegen een aanvaller die het hele pakket herschrijft.

Restore valideert vóór het aanmaken van een nieuw doel, kopieert naar volledig nieuwe opslag, controleert de gekopieerde bytes en schrijft pas als laatste de bruikbare fixturemarker. Het bronpakket en de broninhoud worden niet gewijzigd. Een fout ruimt uitsluitend nieuw aangemaakte eigen doelen op. Een procescrash kan een incompleet doel achterlaten; het heeft geen complete marker en wordt niet gestart of overschreven. Gebruik voor retry een nieuw doel na een crash; een normaal afgehandelde fout laat hetzelfde doel opnieuw toe. De bestaande runtime en actieve release worden nooit omgezet.

## Gebruik

Vanuit de repositoryroot, PowerShell. Kies telkens nieuwe namen. Alle commando's lopen lokaal en gebruiken geen betaalde diensten.

```powershell
$source = Join-Path $env:TEMP 'draconis-cms-recovery-demo-source'
$package = Join-Path $env:TEMP 'draconis-cms-backup-demo'
$target = Join-Path $env:TEMP 'draconis-cms-recovery-demo-restored'
corepack pnpm --filter @draconis/cms build
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts init --target $source
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts serve --source $source --port 3053
# Bewerk/publiceer uitsluitend fictieve inhoud. Stop daarna de eigenaar.
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts quiesce --source $source
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts backup --source $source --target $package
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts restore --source $package --target $target
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts serve --source $target --port 3054
```

Toegangsgegevens staan uitsluitend in `local-access.json` onder het gekozen doel. De CLI print alleen dat bestandspad. Deel het bestand niet. Er is geen delete-, overwrite-, deploy- of switchcommando.

## Uitgevoerde controles op 19 november 2026

- Frozen install, workspace-typecheck/lint/build groen. Bestaande Planner-bundelwaarschuwing blijft aanwezig.
- Volledige workspace 373 tests, waaronder API322, groen vóór de extra junctiontest. Laatste gerichte herstelset 6/6 groen. API-typecheck/lint opnieuw uitgevoerd.
- Hersteltest bewaart gepubliceerde home, afbeelding, portfolio met activated cataloguspin, contact NL/EN, templatehashes en een nieuwer concept. Nieuwe tokens weigeren oude toegang. Twee herstarts behouden publieke HTML/beeldbytes en draft/active-ID. Bron-DB-hashes blijven gelijk.
- Fouttests voor live owner, concurrerende DB-writer, start tijdens recovery, stale owner, ontbrekend/corrupt bestand, hashfout, extra bestand, onbekend schema, incomplete manifest, traversal, casecollision, junctionroot en gedeeltelijke kopiefout. Afgehandelde fouten ruimen het eigen doel op en retry slaagt.
- Echte CLI/browser: eigen nieuwe bron op 3053, fictieve home met pixel gepubliceerd, nieuwer concept opgeslagen. Bron gestopt, offline gecontroleerd, 37 bestanden geback-upt en naar nieuwe root hersteld. Doel op 3054 toont conceptversie 4 naast actieve publicatie 1. Save na restore maakt versie 5; herstart behoudt versie 5 en de ongewijzigde publieke titel/afbeelding. Beide listeners afgesloten.

PR42 is onafhankelijk akkoord na gerichte herreview op runtimehead `65643c9b448cd139a2f51c4d61ca6fd1fa76fbf4`. Eén P2 over herstel van een stale recoverylock is door Sol6.1 low opgelost. Na technisch vastgelopen subagentuitvoeringen bevestigde geautoriseerde Astra-medium reviewchat `01a1f85b-6a3d-76f2-a7c5-cfc9e7e7cfca` de sluiting met eigen 9/9 tests, typecheck/lint/diffcheck. Zie [volledig rapport](review-pr42.md). Geen timeoutverhoging opgenomen. Deze proef vervangt geen productieback-upbeleid, bewaartermijn, offsite kopie, echte klantimport of live herstelbesluit.
