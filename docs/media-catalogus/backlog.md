# Gefaseerde backlog en eerste bouwopdracht

Deze backlog is een voorstel. Er zijn geen live taken of klantgegevens aangemaakt. Iedere fase levert een eigen lokale demonstratie, controles en PR; de orchestrator bepaalt de vervolgopdracht. Raming in werkdagen voor één ontwikkelaar, exclusief feedback en het ordenen van klantrechten.

| Fase | Werk en afhankelijkheid | Acceptatiecriteria | Raming |
| --- | --- | --- | --- |
| M0 | Contracten, fixtures en storage-adapter; startpunt | Twee fictieve websites, gepinde fileVersion, 409-concurrency, weigering cross-website, resolvermanifest en referentieblokkade testbaar; geen productieverbinding | 1-2 |
| M1 | Upload en lokale processor na M0 | Alle formaat/byte/pixel/frame-grenzen uit ontwerp getest; fake MIME en kapotte files afgewezen; GPS ontbreekt publiek; oriëntatie klopt; varianten zonder opschalen; fixtures met breedtes 1, 200, 320 en 640 leveren elk minimaal één geschoonde publieke variant plus fallback, zonder origineel/GPS; crash/herstart levert geen half-ready asset | 2-4 |
| M2 | Bibliotheek en hergebruik na M1 | Uploadstatus, zoeken/filter/paginering, detail/gebruikslijst en versiebeheer via UI; toetsenbordbediening; twee contexten gebruiken één binary; alt blijft contextgebonden; rechten blokkeren release | 2-3 |
| M3 | Generieke catalogus na M0/M2 | Collectie, vlakke categorieën, getypeerde metadata en items CRUD met draft/archief; slugconflict afgewezen; categorie-in-gebruik niet stil verwijderd; volgorde blijft na herstart; immutable snapshot reproduceerbaar | 2-3 |
| M4 | Portfolio boven media/catalogus na M2/M3 | Geordende selectie, cover en filter; mobiel raster en detail; lege staat; toetsenbord en focusherstel; geen dubbele originelen; vereiste alt/credits zichtbaar | 1-2 |
| M5 | CMS-integratie en lokale export na M1-M4 en CMS-contract | Fixture-site export werkt zonder server; alleen gebruikte derivatives; pinned versies/hash gelijk bij herbouw; draftwijziging verandert vorige release niet; ontbrekend bestand blokkeert zonder vorige export te beschadigen; purge faalt bij behouden release | 2-3 |
| M6 | Migratieproef en herstel na M5 | Dry-run inventaris, mapping, uitzonderingen en idempotente import op kopie; bron onaangeroerd; rollback bewezen; beide tenants gescheiden; klantmigratie pas na gerichte opdracht | 2-3 |

M0 en M1 mogen binnen Labs worden gebouwd als geïsoleerde proef. Het bestaande CMS blijft een latere adapterbron, geen reden om de klantdatabase nu te openen. M5 vraagt afstemming met de CMS-chat over de concrete release-API. Geen CMS-pagina-editor bouwen in deze backlog.

## Migratiepad

1. Maak een read-only inventaris van bestaande `MediaAsset`-rijen, website-ID's, lokale bestanden, `/uploads/`, HTML/JSON-verwijzingen en portfolio/categorievolgorde. Rapporteer ontbrekende bestanden en onbekende externe URL's. Doe dit pas na een migratieopdracht, niet tijdens dit ontwerp.
2. Werk op een kopie van database en media in een afzonderlijke fixturemap. Leg schema, tellingen en hashes vast. Verwijder geen originelen en wijzig geen `ACTIVE`.
3. Behoud bestaande asset-ID's en website-ID's. Ken bestaande bestanden `fileVersion=1` toe. Leg legacy-pad naar assetreferentie vast in een mappingrapport met een unieke importkey. Dezelfde import mag geen duplicaten maken.
4. Bestaande bestanden krijgen `unknown` rechten tot een mens bewijs bevestigt. De processor maakt schone derivatives. Legacy-anonieme bestandsroutes blijven geen toegang tot private originelen geven; pas de adapter aan en test bestaande URL-vervanging vóór omschakeling.
5. Zet alleen herkende verwijzingen om. Bewaar originele alt/locale en gebruikscontext. Onopgeloste verwijzingen blokkeren de proefrelease. Kopieer geen externe beelden automatisch; vraag voor import een lokale bron en rechtenbewijs.
6. Vergelijk aantallen, categorieën, volgorde, detail-URL's, alt, credits en screenshots in een lokale export. Importeer Work/Travel pas na een apart mappingbesluit, hun specifieke semantiek blijft behouden.
7. Rollback verwijdert uitsluitend de nieuwe fixture/import en wijst weer naar de ongewijzigde bronkopie. Een latere echte omschakeling vereist vooraf een geteste database-/bestandsbackup en rollbackplan. Gepubliceerde releases blijven tijdens migratie behouden.

## Gratis lokale uitvoering

Gebruik bestaande lokale Node/pnpm-workspace voor de Labs-proef, SQLite in een expliciet tijdelijk databasepad en media in een expliciete private fixturemap buiten de webroot. Bind de proef op loopback. De implementatie moet voorkomen dat een ontbrekende fixtureconfiguratie terugvalt op de bestaande planner- of CMS-data. Geen accounts, storage-abonnement, CDN, Azure-job of AI-API nodig.

Selecteer in M1 een lokale processor met passende gratis licentie en leg versie/licentie vast vóór installatie. Test decoder en geheugenlimieten met lokale fixtures. Als die eis niet haalbaar blijkt, rapporteer dat als beperking en wijzig niet stilzwijgend naar een betaalde dienst. Downloads van open-source dependencies mogen, servicegebruik niet.

Voor de latere CMS-adapter geldt dat de huidige bron SQL Server gebruikt. Deze proef veronderstelt geen gratis of reeds beschikbare SQL Server-instance. Begin met adapters en fixtures; voer CMS-integratietests alleen tegen een expliciet geïsoleerde beschikbare lokale testdatabase uit. Provision geen database of containerservice zonder vervolgopdracht.

In een nieuwe Labs-worktree via `scripts/start-development.ps1`, vanaf actuele `origin/main`, zijn de bestaande verificatiecommando's `corepack pnpm typecheck`, `corepack pnpm lint`, `corepack pnpm test` en `corepack pnpm build`. Voeg gerichte media-/catalogustests toe voor de echte invarianten. De definitieve lokale start-/fixturecommando's worden door M0 geleverd en in de PR bewezen, ze bestaan nu nog niet.

## Eerste concrete bouwopdracht M0

> Bouw uitsluitend de lokale media-contractproef in een eigen Labs-worktree vanaf actuele origin/main. Lees docs/media-catalogus en stem de referenties af met docs/cms wanneer beschikbaar. Wijzig geen Studio-repository, klantdata, CMS-pagina-editor of scripts/backlog-data.json. Gebruik twee fictieve website-ID's, een tijdelijke SQLite-database en private fixtureopslag. Maak contracttypes en adapters voor MediaReference met assetId/fileVersion/usage/locale-alt/decorative, FileVersion, referentieregistratie en release-resolve. Implementeer gecontroleerd select/list, atomair save-references, archive en purge-bescherming, plus resolver op vooraf gemaakte veilige afbeeldingfixtures. Nog geen uploadendpoint: M1 levert echte bestandsvalidatie en verwerking. Resolver accepteert alleen expliciet ready/cleared fixtures en levert een immutable lokaal manifest met checksum en uitsluitend publieke derivativepaden. Een lokale demo toont twee gebruiken van één asset en een geweigerde purge. Laat een gepinde release ongewijzigd na een nieuw concept. Bewijs cross-websiteweigering, ontbrekende fileVersion, alt/rechtenfouten, optimistic conflict en referentieretentie met gerichte tests. Lever herhaalbare fixture/start/cleanup-commando's die alleen hun eigen tijdelijke map mogen raken. Draai typecheck/lint/test/build, open PR via scripts/new-pr.ps1 en vraag verplichte onafhankelijke review. Geen merge, deployment, provisioning of betaald servicegebruik.

Klaar voor M1 als een schone checkout de proef met gedocumenteerde commando's start, alle genoemde grensgevallen groen zijn en de CMS-chat hetzelfde contract gebruikt. Een fixture is geen gevalideerde gebruikersupload; exposeer geen ongecontroleerde write-route in M0.

## Review en oplevering

Deze docs-PR krijgt ook de persoonlijke reviewafspraak: aparte read-only reviewchat met `gpt-6-astra`, `medium`, actuele head-SHA en bronchat. Concrete bevindingen bevatten ernst, bestand/regel, scenario, onderbouwing en oplossing. Terugrapportage en eventuele fixes volgen met `gpt-6.1-sol`, `low`. Geen externe reviewcomments of merge zonder aparte opdracht. Substantiële correcties gaan gericht terug naar dezelfde reviewchat.

Voor deze documentwijziging volstaan diff-/scopecontrole, controle van lokale Markdown-links en inhoudelijke review. Er is geen uitvoerbare code gewijzigd; applicatietests zijn daarom niet als bewijs voor het ontwerp opgevoerd.
