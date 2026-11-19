# CMS-backlog en verificatie

Ontwerpbacklog van 19 november 2026, alleen voor lokale uitvoering met fictieve data totdat de orchestrator verdere aansluiting opdraagt. S is ongeveer één ontwikkeldag, M twee tot vier dagen en L vijf tot acht dagen; schattingen zijn richtinggevend. De codes zijn nog niet naar Azure Boards geschreven. `scripts/backlog-data.json` blijft ongewijzigd.

| Story | Prio / na | Uitvoering en acceptatie | Omvang / zekerheid |
| --- | --- | --- | --- |
| CMS-01 Lokale tekstproef | P0 / start | Voer de [eerste bouwopdracht](eerste-bouwopdracht.md) uit. Browser bewerkt één fixturepagina, bewaart een draft, toont preview en publiceert naar een lokale statische route. Herstart behoudt draft en actieve release; anonieme drafts zijn verboden. | M / hoog |
| CMS-02 Paginaschema en revisies | P0 / 01 | Voeg meerdere templatepagina's, `_shared`, routes, categorieën en revisiehistorie toe. Verplichte velden, slugwijziging en verwijdering worden vóór snapshot gevalideerd. Twee gelijktijdige saves leveren één 409. | M / middel |
| CMS-03 Talen en editors | P0 / 02 | NL/EN-tabel en paginaweergave gebruiken dezelfde draftwrites, paginaselectie en opslagstatus. Bewust leeg blijft leeg; ontbrekend valt terug. Een taalwissel bewaart of vraagt afhandeling van lokale invoer. Derde taal en onvolledige standaardtaal zijn getest. | M / middel |
| CMS-04 Websitegebonden identiteit | P0 voor aansluiting / 01, platformidentity beschikbaar | Vervang lokale testtokens door platformidentiteit en expliciete CMS-capabilities. Test Viewer/Editor/Publisher/Owner met twee websites, sessieverloop, CSRF waar cookies gelden en scoped agentkeys. Geen implicit publish bij import van bestaande Editor. | M / middel |
| CMS-05 Releases en herstel na storing | P0 voor aansluiting / 02, 03 | Complete sitebrede snapshots, statusmachine, CAS-activatie, idempotente retries en startup-reconciliatie. Afbreken vóór/na bestandswrite en vóór/na pointercommit geeft altijd een complete oude of nieuwe release. | M / middel |
| CMS-06 Media en catalogusadapters | P1 / 02, 05, contract v1 media/catalogus | Resolveer gepinde fileVersion en catalogus snapshotVersion, registreer referenties en exporteer alleen publieke derivatives. Test ontbrekend, cross-website, archief, rechtenblokkade en poging tot verwijderen tijdens build. | M / middel |
| CMS-07 Bestaande CMS-import | P1 / 02, 03, 04, 06, reproduceerbare bron | Maak dry-run en idempotente import volgens onderstaand draaiboek. Begin met gesynthetiseerde oude schemafixtures; daadwerkelijke klantimport vraagt eigen opdracht. Vergelijk pagina's, tekstwaarden, IDs, talen, links en mediahashes. | L / middel |
| CMS-08 Bestaande websiteadapter | P1 / 05, 06, 07 | Valideer offline tegen gekopieerd fictief template en manifest; produceer het exacte releaseartifact voor één serverbeheerd target. Test fake deployuitkomsten, unknown/reconcile en rollback. Live adapter activeren vraagt expliciete opdracht en bevestigde kostengrens. | M / middel |
| CMS-09 Back-up en restore | P0 voor aansluiting / 05, 06 | Maak consistente export en offline restore op schone lokale opslag. Vergelijk tekst, revisies, verwijzingen en actieve statische release; herstelproef moet slagen voordat import omschakelt. | M / middel |
| CMS-10 Acceptatie en overdracht | P0 voor aansluiting / 04 t/m 09 | Lever fixture-demo, resultaten van regressiematrix, beheerdraaiboek, beperkingen en onafhankelijk beoordeelde PR. Orchestrator beslist over echte siteomschakeling. | S / hoog |
| CMS-11 Latere uitbreidingen | P2 / 10 en expliciete keuze | Publicatieplanning, goedkeuringsrondes, veldgericht samenvoegen, visuele blokken en meer adapters. Pas prioriteren nadat de basisflow is geaccepteerd. | afzonderlijk schatten |

Hergebruik de bestaande platformstories voor identiteit, scoped agents, migraties, herstel, appregistratie en CI. Zoek de actuele Boards-ID's en status op bij uitvoering. Bovenstaande stories voegen CMS-specifieke acceptatie toe en rechtvaardigen geen tweede platformidentity- of hostingproject.

## Migratiedraaiboek

1. Leg geselecteerde broncommit plus lokale afwijkingen, schemas, website-ID's, manifest, templates en mediabestandshashes vast. Neem geen echte brondata op in de publieke repo. Maak een herstelbare bronback-up en bewijs restore voordat een echte import wordt toegestaan.
2. Bouw gesynthetiseerde fixtures voor oude en huidige CMS-schema's. Dek ContentField/ContentValue, locales, `_shared`, WorkItems met ContentFields, Travel/Now-translations, categorieën en media af. Behoud leeg versus ontbrekend en de oude veldversies.
3. Dry-run valideert aantallen, unieke routes en keys, cross-website relaties, ontbrekende bestanden en onbekende templates. Rapporteer verschillen zonder writes. Onbekende bronvelden zijn fouten of expliciet geaccepteerde uitzonderingen, geen stilzwijgende dataverlieskeuze.
4. Importeer naar een geïsoleerde doelwebsite met mapping `(sourceSystem, sourceWebsiteId, sourceType, sourceId) → targetId` en bronfingerprint. Dezelfde bron opnieuw uitvoeren verandert aantallen/IDs/inhoud niet. Een gewijzigde bron of al bewerkte doelrecord geeft een conflict; nooit overschrijven zonder keuze. Bewaar bestaande klantwaarden boven catalogusdefaults.
5. Importeer actuele opgeslagen broninhoud als draftbaseline. Een eerdere Azure-publicatie uit een chat bewijst niet dat die inhoud gelijk is aan de huidige bron. Lees de bevestigde huidige siteartifact alleen onder aparte aansluitingstaak en leg die als legacy release vast; anders blijft publicatiestatus onbekend. Geen automatische activatie na import.
6. Vergelijk oude en nieuwe renderer met fictieve export: locale-uitvoer, SEO, alle routes/links, media en afwezige verwijderde pagina's. WebsiteOwner bevestigt rolmapping en sitekeuze. Maak een korte redactiebevriezing of aantoonbare delta-import; er is één schrijfbron tegelijk.
7. Alleen na opdracht omschakelen naar het gevalideerde artifact. Registreer release-ID en marker, houd de oude bron read-only. Bij fout herstel het vorige targetartifact/pointer. Nieuwe drafts blijven bewaard; reverse-sync is geen onderdeel van rollback. Stop de omschakeling als restore of vergelijking faalt.

## Back-up en herstel

Voorstel voor de lokale proef: handmatige back-up vóór schema-upgrade, import en opschoning; voor een latere lokale gebruiksfase dagelijks zolang de app draait. Voorlopig doel maximaal één werkdag dataverlies en herstel binnen één uur, nog te meten op representatieve omvang. Dit zijn doelen, geen bewezen SLA's. Bewaar zeven dagelijkse en vier wekelijkse kopieën op een door de eigenaar gekozen lokaal volume; hetzelfde fysieke volume beschermt niet tegen schijfverlies.

Een back-up bevat schema-/appversie, consistente database, paginaschema's/templates met hashes, media/catalogussnapshots of gegarandeerd behouden verwijzingen, alle gepinde files en retained releases inclusief active-pointer. Voor SQLite gebruik de online backupvoorziening of stop writes en checkpoint; kopieer niet alleen een open WAL-databasebestand. Voor de oude SQL Server-bron gebruik de bestaande native backup/restoreprocedure op een geïsoleerde kopie. Geen aanname dat SQLite-back-up voldoende is voor SQL Server.

Een backupset krijgt manifest met hashes en alleen status Complete nadat alle bestanden en checks kloppen. Restore weigert incomplete sets, padtraversal en onbekende schema's. Herstel eerst in een nieuwe map en database, controleer relaties/hashes, render de actieve release offline, test daarna draftread en een save als bevoegde gebruiker. Zet de huidige opslag pas na validatie via beheeractie om en behoud de vorige map. Tokens/secrets vallen buiten plaintext backup; na herstel opnieuw configureren. Bewaar audit- en actor-ID's en herbevestig lidmaatschappen, maak geen standaardadmin aan.

Opschoning van revisies/releases is expliciet beheerwerk. Nooit de actieve release of de enige herstelbare voorgaande release verwijderen. Media mag pas vrijgegeven worden nadat geen bewaarde draft, revisie, release of backupset die fileVersion nodig heeft. Een backupset mag in plaats daarvan de volledige bytes bevatten en onafhankelijk herstelbaar zijn. Bewaarstatus en referentieregistratie moeten dit onderscheid aantoonbaar maken.

## Verificatiematrix

| Gebied | Vereist bewijs |
| --- | --- |
| Draft/publicatie | Save A verandert publieke B niet; preview A is privé. Publish A terwijl save C binnenkomt activeert uitsluitend A. Herstart behoudt C als draft en A als actief. |
| Concurrentie | Twee DB-connecties bewaren dezelfde versie: één succes, één 409. Twee activaties tegen dezelfde active-version: één succes. Retrykey met andere payload faalt. |
| Rollen/tenant | Alle beheerroutes leveren 401 zonder token, 403 zonder capability en 404 voor een ander siteobject. Publieke site serveert uitsluitend actieve releasebestanden. |
| Rendering | HTML encodeert scriptachtige tekst; linkscheme en paden zijn begrensd. Geen CMS-editor/API/token/private files in output. Controleer SEO, `_shared`, taalwisseling en lokale links. |
| Talen | Ontbrekend/leeg/tekst, fallback, disabled locale, derde taal, onvolledige standaardtaal en metadata worden getest in tabel én export. |
| Bestandsschade | Ontbrekende derivative, gewijzigde hash, mislukte rename/write, disk-full en process-stop blokkeren activatie of behouden vorige release. Geen half gepubliceerde site. |
| Routelevenscyclus | Slugconflict, Windows-casebotsing, traversal, redirect en pagina verwijderen. Geen Journal/Destination-herintroductie. |
| Migratie/herstel | Dry-run schrijft niets; herhaling dupliceert niets; gewijzigde bron wordt gemeld. Restore op schone opslag bewaart IDs, versies, teksttoestanden, rollen en actieve release. |
| Gebruik | Toetsenbord bereikt website/pagekeuze, inputs, opslaan en publiceren. Labels/status/fouten zijn leesbaar; netwerk-/401-/409-fout bewaart de invoer. |

De implementatie-PR's voeren relevante unit-, API-, filesystem- en browsertests uit, plus bestaande Labs typecheck/lint/build en API-suite. Een rendereradapter draait daarnaast de geselecteerde bestaande CMS-regressiegevallen op fictieve templates. Verifieer de actuele head-SHA en testresultaten in de verplichte aparte reviewchat. Deze documentatie-PR claimt geen uitgevoerde runtime- of hersteltests.
