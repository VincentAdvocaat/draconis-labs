# PL-13 · Lokale snapshot, import en herstel

Deze stap bouwt op PR #20 (`303b7fd`) en gebruikt uitsluitend zelfgemaakte
oude en huidige SQLite-fixtures. PostgreSQL, cloudopslag en werkruimtemigratie
tussen gebruikers vallen buiten deze stap. De synchrone SQLite-poort is nog
geen asynchrone PostgreSQL-poort. PL-13 is daarmee nog niet geheel afgerond.

## Gebruik

Voer vanuit de repository uit met **zelf gekozen testpaden**; er bestaan geen
standaardpaden naar gebruikersgegevens. In PowerShell:

```powershell
corepack pnpm --filter @draconis/api planner:data backup --source C:/temp/own-demo.sqlite --snapshot C:/temp/own-backup.sqlite
corepack pnpm --filter @draconis/api planner:data dry-run --snapshot C:/temp/own-backup.sqlite
# Neem SHA256 uit de dry-run over als $snapshotHash.
corepack pnpm --filter @draconis/api planner:data import --snapshot C:/temp/own-backup.sqlite --target C:/temp/own-import.sqlite --source-id own-demo --import-version 1 --sha256 $snapshotHash
corepack pnpm --filter @draconis/api planner:data restore --snapshot C:/temp/own-backup.sqlite --target C:/temp/own-restored.sqlite --sha256 $snapshotHash
```

`backup` gebruikt de SQLite Backup API via een alleen-lezen bronverbinding.
Daardoor worden ook gecommitte wijzigingen uit een actieve WAL meegenomen.
Alleen de eigen tijdelijke kopie wordt naar zelfstandig rollback-journalformaat
omgezet. Publicatie gebeurt exclusief vanuit een tijdelijke map op hetzelfde
volume. Dit vereist een bestandssysteem dat harde links ondersteunt, zoals NTFS.
Een bestaand doel of bestaande doelzijbestanden worden geweigerd.
Backup en restore controleren bestandsformaat, SQLite-integriteit en hash;
hun rapport bevat de hash en aanwezige tabelnamen. Zij eisen geen
importgeschiktheid. Zo blijft een volledige backup mogelijk wanneer een normale
taakverwijdering een historische herhaalouderverwijzing heeft achtergelaten.

`dry-run` leest het snapshotbestand in een alleen-lezen geheugendatabase.
De bron wordt niet gemigreerd of als schrijfbare SQLite-database geopend.
Een actieve WAL, een niet-lege journal of een WAL-bestandsheader wordt
geweigerd: maak daarvoor eerst een backup. Het rapport bevat de SHA256 van
het **snapshotbestand**, migratieversies, aantallen, IDs, herhaalverwijzingen
en afzonderlijke gegevenshashes voor taken en voorkeuren. Een hash van alleen
een actieve hoofddatabase zou de WAL missen en wordt niet als bewijs gebruikt.

De strengere dry-run-/importcontrole omvat SQLite-integriteit, herkende schema's/migraties, geldige
taakvelden/JSON, bestaande herhaalouders zonder cycli en geldige voorkeuren.
Oude kolommen krijgen alleen in het importmodel expliciete defaults: versie 1
en lege plannings-/herhaalvelden. Labels, voorkeuren, bestaande versies, IDs,
tijdstempels en herhaalverwijzingen worden behouden.
Een ontbrekende herhaalouder verhindert alleen de gecontroleerde import;
backup en herstel bewaren die bestaande gegevens zonder aanpassing.

## Importgrens

Importversie 1 importeert uitsluitend `tasks` en `user_preferences` naar één
lokale database. Een onbekende bedrijfstabel of migratie wordt geweigerd.
Bekende technische tabellen worden niet geïmporteerd: API-sleutels,
desktop-importbronnen en oude importmarkers verhuizen dus niet mee. Backup en
bestandsherstel bewaren wel het gehele bestand.

Een nieuw doel is de normale CLI-route. `--resume` is expliciet vereist om een
bestaand doel van een eerdere poging te openen. De adapter schrijft onder één
`BEGIN IMMEDIATE`: schema-adoptie, taakrijen, voorkeuren en importmarker slagen
samen of rollen samen terug. Identieke reeds aanwezige bronrijen mogen blijven;
afwijkende of nieuwere doelrijen leveren `IMPORT_CONFLICT` met ID en versies op.
Er wordt niets overschreven. Andere bestaande doel-IDs leveren
`TARGET_NOT_EMPTY` op; dit is geen algemene live-samenvoegfunctie.

De marker bestaat uit bronidentiteit, snapshot-SHA256 en importversie. Een exact
herhaalde afgeronde import schrijft niets, ook als de gebruiker daarna een taak
heeft gewijzigd of verwijderd. Na een afgebroken transactie kan dezelfde import
opnieuw worden uitgevoerd. Een ander snapshot geldt als een andere poging en
wordt opnieuw op conflicten gecontroleerd. De opgegeven SHA moet overeenkomen
met de eerder gecontroleerde dry-run.

## Herstelgrens en bewijs

`restore` valideert bron, SHA en de tijdelijke kopie, en publiceert alleen naar
een **nieuwe, ongebruikte bestandsnaam**. Een bestaande database wordt nooit
vervangen, ook niet wanneer die gesloten is. Het omschakelen van een applicatie
naar het herstelde bestand is een afzonderlijke handeling en is hier niet
geautomatiseerd. Een bestaande/open database en alle bijbehorende zijbestanden
worden ongemoeid gelaten.

`server/api/tests/planner-snapshots.test.ts` draait dezelfde gevallen met
API-binding 12.11.1 en desktopbinding 13.2.0: oude/huidige fixturebehoud,
actieve WAL-backup, idempotentie zonder verwijderde taken terug te brengen,
nieuwere doelversie, rollback bij een fout op de tweede insert en succesvolle
retry na reparatie, ongeldige relaties/voorkeuren/migraties, scopeweigering en
herstel met doel-/hashcontroles. De tests gebruiken alleen eigen tijdelijke
databases. Er is geen echte gebruikersdatabase geopend of hersteld.
