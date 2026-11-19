# Eerste opgeslagen catalogus- en portfolioflow

Deze stap implementeert het geaccordeerde scenario met één vaste categorie `algemeen`, één collectie `portfolio` en generieke items. De opslag ondersteunt meerdere items om slugconflicten en atomair publiceren te kunnen testen; er is nog geen categorie-editor. Geen prijzen, voorraad, checkout of CMS-pagina-editor.

De branch `feature/catalogus-portfolio-flow` begint op gereviewde M1-commit `84e0bf9443802e0b8d2c48a1b40f77a2c036e762` uit [PR 11](https://github.com/VincentAdvocaat/draconis-labs/pull/11). Dat is afhankelijk van M0-PR 8 en ontwerp-PR 6. Deze stap voegt geen dependency toe en wijzigt geen lockfile of algemene API-registratie. Alles gebruikt dezelfde expliciet gemarkeerde lokale proefopslag.

## Starten en gebruiken

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @draconis/api exec tsx src/catalogus/start.ts
```

De terminal geeft `/catalogus`, token en fixtureRoot. Open die URL, plak het tijdelijke token en kies Laden. Het token blijft alleen in het geopende invoerveld/geheugen, niet in localStorage of de HTML-bron. De token vertegenwoordigt de lokale medewerkerproef, geen productieaccount of vastgesteld identiteitsbewijs.

1. Upload een lokale JPEG, PNG of WebP. De browserflow gebruikt de echte M1-processor. De nieuwe afbeelding begint met `unknown` rechten.
2. Bekijk de geschoonde afbeelding met Privévoorbeeld. Dit vereist bearer-auth en geeft alleen een gecontroleerde derivative, zonder vrijgave of publieke release. Originelen hebben geen route.
3. Vul rechthebbende, bron, onderbouwing en medewerker in. Controleer de expliciete checkbox en klik Rechten vrijgeven. Dit schrijft een versiegecontroleerde beslissing met datum naar het private rechtenlog. Geen veld is vooraf als akkoord ingevuld. Ook reeds cleared testfixtures vereisen voor cataloguspublicatie een expliciete beslissing.
4. Vul titel, site-unieke slug, beschrijving, optioneel jaar en de Nederlandse alttekst in. Categorie is Algemeen. Voor een decoratieve afbeelding kies je expliciet de checkbox, de opgeslagen alt is dan leeg. Sla het concept op.
5. Publiceer een nieuwe lokale portfoliosnapshot en open de link. De snapshot toont een raster en een detailpagina. Zij bevat alleen goedgekeurde, ready media met gepinde fileVersion en controlesommen.
6. Wijzig of archiveer het concept. De eerdere snapshot blijft de oorspronkelijke gegevens en afbeelding tonen. Archiveren verwijdert geen revisies, bestanden of release-referenties.

Heropenen gebruikt dezelfde SQLite-database en bestanden:

```powershell
corepack pnpm --filter @draconis/api exec tsx src/catalogus/start.ts --root=<fixtureRoot>
```

De poort en token veranderen bij herstart. Bestaande snapshotpaden blijven gelijk onder het nieuwe lokale adres. Stop de server vóór de expliciete cleanup met `media-upload/cleanup.ts --root=<fixtureRoot> --confirm`, zoals beschreven in [M1](m1-upload.md).

## Herbruikbare contracten en eigenaarschap

- `CatalogService.save(websiteId, input)` maakt een immutable itemrevisie met mediareferenties. `expectedVersion` voorkomt overschrijven. Slugs zijn uniek binnen de website en blijven na archiveren gereserveerd.
- `CatalogService.publish(websiteId, expectedCollectionVersion)` maakt een nieuwe immutable snapshot. Iedere referentie krijgt een eigen behouden release-registratie. Als één item faalt worden snapshot én alle nieuwe mediarelease-registraties teruggedraaid.
- `CatalogRef = {websiteId, collectionId: 'portfolio', snapshotId}` wordt opgelost via `resolveSnapshot`. De response bevat item-ID's, titel/slug/categorie/metadata, gepinde MediaReference, concrete publieke variants en een SHA-256-checksum over de snapshotinhoud. CMS bewaart referentie en checksum, geen binaries of veranderlijke lijstquery. `snapshotId` is de concrete immutable catalogus-snapshotVersion, rechtstreeks afgestemd met CMS-chat `01a1f49b-5ee0-7010-83f3-b62b8b94b041`.
- `MediaRightsService` in `server/api/src/media-upload/rights.ts` is de gedeelde mediaservice voor `setRights(websiteId, assetId, {expectedVersion,status,owner,source,basis,employee,confirmed:true})`. `status` is cleared of blocked. De service beheert het private auditlog en metadataVersion. Catalogus gebruikt deze service; de CMS-adapter kan haar rechtstreeks hergebruiken. Een aangeleverde medewerkersnaam is in deze lokale proef geregistreerde invoer, geen geverifieerde identiteit. Een echte accountkoppeling blijft nodig voor productie.
- `CatalogService.preview` geeft uitsluitend een ready derivative achter auth, ook als rechten nog onbekend zijn. Dat is gescheiden van publieke `resolveSnapshot` en M0 `resolveRelease`. Voor een CMS-preview hoeft geen rechtencontrole van publicatie omzeild te worden.

M0 `MediaFixtureStore` accepteert nu optioneel dezelfde expliciete fixture-databaseverbinding. Hij controleert dat het databasepad bij de fixture hoort en sluit een geïnjecteerde verbinding niet zelf. Daarmee delen catalogusrevisies en media-usage één transactie, zonder tweede mediaschema of bestanden te kopiëren.

De SQLite-migratie maakt `catalog_schema` versie 1, collections, items, immutable revisions en snapshots. MediaRightsService maakt idempotent haar eigen audittabel. Onbekende catalogusschemaversies worden geweigerd. Oude media-/uploadtabellen en hun inhoud blijven staan. Een proef op een bestaande fixturedatabase bewijst migratie/heropenen; er is geen migratie op klantdata uitgevoerd.

## HTTP en publicatiegrens

De browser-app componeert de bestaande loopback-uploadapp. Haar standaard Origin-verbod blijft voor standalone M1 gelden. Alleen deze compositie staat de exacte actieve `http://127.0.0.1:<poort>`-Origin toe. Die waarde komt uit het gebonden serveradres, niet uit Host of een aangeleverde header. Andere Origins en cross-site Fetch Metadata worden geweigerd. Mutaties en privé-preview vereisen daarnaast het willekeurige bearer-token. Er is geen cookie-auth of CORS-toestemming voor andere websites.

| Route | Gedrag |
| --- | --- |
| `GET /catalogus` | Openbare lokale lege beheershell, zonder data/token |
| `GET /catalogus/api/:site` en `/assets` | Alleen geauthenticeerde drafts en selectiegegevens |
| `POST /catalogus/api/:site/items` | Gevalideerd itemconcept met optimistic version |
| `DELETE /catalogus/api/:site/items/:id` | Alleen archiveren, met expectedVersion |
| `PUT /catalogus/api/:site/rights/:asset` | Expliciete rechtenbeslissing en audit |
| `GET /catalogus/api/:site/preview/:id/:fileVersion` | Private ready derivative, `Cache-Control: no-store` |
| `POST /catalogus/api/:site/publish` | Immutable lokale snapshot, collectieversiecontrole |
| `GET /portfolio/:site/:snapshotId` | Alleen gepubliceerde snapshot, zonder token |
| `GET /portfolio/:site/:snapshotId/items/:slug` | Detail uit dezelfde gepinde snapshot |
| `GET /portfolio/:site/:snapshotId/media/:itemId/:variantIndex` | Alleen bytes die in die snapshot staan, binnen public-submap, zonder symlinks en met lengte/hashcontrole |

Conceptgegevens, rechtenlog en originelen worden niet publiek geserveerd. HTML-tekst en alt worden geëscapet. Een ongeldige site/referentie levert geen gegevens van een andere website. Veldfouten geven 400, stale versies/slugs/rechtenproblemen 409. Publiek betekent hier uitsluitend leesbaar op de lokale loopbackserver, geen online deployment of statische ZIP-export.

Een latere blokkade voorkomt nieuwe snapshots. Reeds behouden snapshots blijven bestaan, zoals een eerder gemaakte statische export. Intrekken van een bestaande publicatie vraagt een afzonderlijke workflow; deze stap levert geen automatische verwijdering of retentieopruiming. Oude revisies en mediareferenties worden onbeperkt behouden in deze proef.

## Verificatie en grenzen

```powershell
corepack pnpm --filter @draconis/api exec vitest run tests/catalogus.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

De catalogustests controleren opgeslagen revisies/snapshots na heropenen, slug- en versieconflicten, site-isolatie, atomiciteit van item/mediawrites en volledige publicatierollback, expliciet rechtenbewijs met audit, schema-input, gereserveerde slugs, gedeelde database-eigendom en de echte HTTP-auth/publicatiegrens. Een trigger laat de catalogusinsert bewust falen om te bewijzen dat geen mediareferentie achterblijft.

De lokale Chrome-controle gebruikte uitsluitend een synthetische PNG en expliciet als test aangeduide rechtengegevens. Via de browser zijn upload, privévoorbeeld, rechtenvrijgave, concept opslaan en snapshotpublicatie doorlopen. Na procesherstart zijn het item gewijzigd en gearchiveerd; de eerdere snapshot bleef met oorspronkelijke titel/afbeelding renderen. De detailpagina en een viewport van 390 bij 844 zijn gecontroleerd; de tijdelijke viewport is daarna hersteld. Screenshotbewijs staat als lokaal chatartifact, zonder token of klantmateriaal.

De module is nog een lokale proef met twee fictieve websites, één vaste categorie, NL-presentatie en alleen getypeerde jaarmetadata. Er is geen klantmigratie, productie-identiteit, uitgebreide categorie-editor, algemene metadata-schema-editor, centrale navigatieregistratie of deployment. Volgende integratie is een CMS-adapter die CatalogRef en checksum pint en dezelfde mediarechtenservice gebruikt. Dat vraagt geen nieuwe kopie van mediaopslag.
