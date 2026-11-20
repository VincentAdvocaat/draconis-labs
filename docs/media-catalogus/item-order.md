# Expliciete redactionele itemvolgorde

Tweede kleine M3-stap boven gereviewde categorie-PR 39, vaste basis `df69460b60fb4d34b8082693d12b21493f1d8fd7`. Geen nieuwe dependencies, shared-contractwijziging, CMS-UI of snapshotvelden toegevoegd.

## Migratie en gedrag

Catalogusschema 5 voegt `position INTEGER NOT NULL` toe aan `catalog_items`. De schema-4-migratie loopt in één IMMEDIATE-transactie en initialiseert posities per website exact volgens de eerdere `ORDER BY slug`. Alle items krijgen een positie; archiefgaten veranderen de onderlinge volgorde van actieve items niet. De migratie wijzigt geen item-/revisie-JSON, snapshotbytes/checksums, mediarefs of collectieversie. Opnieuw openen op schema 5 sorteert niet opnieuw.

Nieuwe items komen achteraan. Een inhouds- of slugwijziging behoudt de bestaande positie. Archiveren verandert de onderlinge volgorde van andere items niet; een opnieuw opgeslagen gearchiveerd item komt achteraan. De lijst en nieuwe publicatie gebruiken `position,id`. Oude snapshots lezen hun bestaande itemarray en houden hun eerdere volgorde, ook na reorder, itemwijziging of archief.

`PUT /catalogus/api/:site/order` verwacht `{expectedVersion,itemIds}`. Het is de volledige actieve ID-set van de gekozen website, maximaal 10000 UUIDs. Geen duplicates, ontbrekende, extra, gearchiveerde of cross-site IDs. De bestaande token-/origin-/websitegrens geldt. Eén IMMEDIATE-transactie controleert de collectie-CAS en set, schrijft alle posities en verhoogt de collectieversie. Elke fout draait alle writes terug. Een acknowledge bevat de nieuwe versie en volgorde. Reorder maakt geen nieuwe itemrevisies en muteert geen media, alt, rechten of retained verwijzingen.

## Bediening

De bestaande `catalogus start -Port 0` toont een extra sectie Redactionele itemvolgorde. Gebruik Omhoog/Omlaag en daarna Volgorde opslaan. Knopteksten en statuslabels staan centraal in `order-ui.ts` met NL/EN-keys voor latere binding; er is geen drag/drop of nieuwe publieke copy.

Het open item, onopgeslagen NL/EN-velden, categoriedraft en expliciete fileVersion blijven behouden. Na succesvolle eigen reorder mag de publicatie de door de server bevestigde nieuwe collectieversie gebruiken. Bij een stale versie of gewijzigde set blijven de voorgestelde posities staan met een concrete herlaadmelding. Expliciet Laden neemt de actuele lijst/versie over. Een interne item-save ververst een pending order niet stil: de oude order-CAS blijft staan en voorkomt het overschrijven van een gewijzigde collectie. Annuleren herstelt alleen de lokale volgordebaseline; het haalt geen nieuwere serverdata op.

Websitewisseling wordt vóór andere resets geweigerd zolang de volgorde niet opgeslagen/geannuleerd is. De bestaande categorieguard blijft daarna gelden. Knopfocus blijft bij het verplaatste item; op een grens gaat focus naar de andere verplaatsknop. Opslaan en annuleren herstellen focus. Grensknoppen blijven ook na andere editoracties uitgeschakeld. De bediening is pas beschikbaar nadat een collectie is geladen.

## Bewijs

`catalogus-order.test.ts` controleert behoud na inhoudswijziging/archief/heropenen, append, oude versus nieuwe snapshotvolgorde, exacte actieve set, stale CAS, sitegrenzen en echte rollback na een latere position-write. Twee daadwerkelijke writerprocessen met dezelfde expectedVersion leveren precies één 200 en één 409. Een echte schema-4-fixture zonder positionkolom migreert naar de exacte legacy-slugvolgorde; bestaande revisie- en snapshotbytes blijven gelijk. Oudere migratietests verwijderen bij hun schema-downgrade ook de nieuwe kolom, zodat zij werkelijke oude tabellen testen.

Het echte inline-script-harnas bewijst keyboardfocus/grensknoppen, behoud van dirty NL/EN/assetselectie, succesvolle publicatie met acknowledged CAS, herstel na conflict, bescherming van pending CAS bij interne refresh en siteguard/cancel. Bestaande CMS-, locale-, categorie- en consumerproeven blijven regressiecontrole.

Browser uitsluitend synthetisch via normale CLI: drie items in aanmaakvolgorde Zeta/Alpha/Midden. Midden tweemaal met Enter omhoog, dirty itemtitel blijft staan, pending order blokkeert websitewisseling. Expliciet opslaan geeft Midden/Zeta/Alpha en herstelt knopfocus. Nieuwe snapshot toont die volgorde, oude snapshot blijft Zeta/Alpha/Midden. Echte CLI-stop/heropen met dezelfde fixture behoudt de opgeslagen volgorde en beide snapshots. Bewijsbeeld staat bij de chatoplevering.

Meer collecties, metadata-schema-editor, multi-image, batch, lightbox, klantmigratie, merge en deployment vallen buiten deze stap.
