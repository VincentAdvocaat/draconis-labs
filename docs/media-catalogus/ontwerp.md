# Ontwerp en modulecontract v1

Alle gedragingen hieronder zijn voorstellen voor te bouwen modules. Bestaande implementaties staan in [inventarisatie](inventarisatie.md).

## Beheer en gebruik

De beheerder opent de beeldbibliotheek van één website, uploadt een afbeelding en ziet een status per bestand. Een mislukte upload toont een concrete fout en een herkansknop. Een afgekeurd bestand komt niet in de keuzelijst. De beheerder vult herkomst, rechten en standaard-altteksten in voordat een afbeelding voor publicatie beschikbaar komt.

De bibliotheek biedt zoeken op naam/titel, filters op type, status, categorie en rechten, een raster met thumbnails en een detailpaneel. Het paneel toont afmetingen, bytes, bestandsversies en alle gebruiken, inclusief concepten en behouden releases. Een expliciete hergebruikactie selecteert een bestaand asset. Duplicaatdetectie op checksum gebeurt alleen binnen dezelfde website en vervangt nooit stilzwijgend een bestaande versie.

Catalogusbeheer biedt collecties, categorieën en items met een titel, stabiele ID, unieke slug binnen collectie/website, korte omschrijving, detailtekst, volgorde, status en optionele getypeerde metadata. V1 ondersteunt tekst, getal en datum met een collectieschema en veldlimieten, geen uitvoerbare HTML of scripts. Categorieën zijn in v1 vlak; een item mag meerdere categorieën hebben. Slugwijzigingen vereisen een expliciet redirectplan voor bestaande exports. Ongebruikte categorieën kunnen weg; gebruikte categorieën moeten eerst worden heringedeeld.

Een portfolio is een benoemde selectie met geordende assetreferenties of catalogusitem-ID's, een cover en optionele categorieën. Het portfolio bewaart geen binaries. De bezoeker krijgt een mobiel raster, categorieknoppen, lege staat en optionele detailpagina of vergrootweergave. Filters werken met gewone links; JavaScript kan dit versnellen. Een vergrootweergave ondersteunt toetsenbord, Escape, zichtbare focus en focusherstel. Afbeeldingen krijgen width/height, responsieve bronnen en lazy loading buiten het eerste scherm.

## Upload en beeldverwerking

V1 accepteert uitsluitend JPEG, PNG en niet-geanimeerde WebP. RAW, HEIC, SVG, GIF, video en documenten krijgen een uitlegbare afwijzing; conversie gebeurt buiten deze module. Grenzen zijn voorstelwaarden: maximaal 20.000.000 bytes per bestand, 40 megapixels, maximaal 12.000 pixels per as en één frame. Streamlimiet geldt ook zonder betrouwbare Content-Length. Maximaal één actieve decode per lokale worker; één lokaal batchverzoek bevat maximaal tien bestanden.

Controleer website-autorisatie vóór schrijven. Controleer extensie, bestandssignatuur en werkelijke decode, en accepteer alleen een overeenkomstig formaat. Een MIME-header is geen bewijs. Verwerp nulbytes, kapotte/truncated bestanden, animatie, overschrijding en padmanipulatie. Geef opslagbestanden gegenereerde namen; bewaar de aangeleverde naam uitsluitend als metadata. Geen ophalen van aangeleverde URL's.

Schrijf eerst naar private tijdelijke opslag buiten de statische webroot. Decodeer met begrensde resources, corrigeer EXIF-oriëntatie, converteer kleur naar sRGB en verwijder metadata, inclusief GPS, uit publieke bestanden. Bewaar origineel privé. Maak zonder opschalen breedtes 320, 640, 1280 en 1920, voor zover kleiner dan de bron. Maak WebP plus JPEG-fallback voor foto's en PNG-fallback bij transparantie; thumbnail is maximaal 320 pixels. Geen crop in v1. Derivative-identiteit bevat bronhash, verwerkingsprofiel en versie.

Status loopt van `processing` naar `ready` of `failed`. Alleen een complete variantset wordt `ready`. Bewaar geen databaseverwijzing naar halfgeschreven bestanden: schrijf tijdelijke bestanden, hernoem na succes en commit metadata; een herstelcontrole ruimt verweesde tijdelijke bestanden op. Bij crash kan dezelfde job idempotent hervatten. Geen cloudqueue nodig; lokale persistente jobtabel volstaat. Foutbestanden blijven privé en kunnen expliciet verwijderd worden.

Een concrete beeldprocessor wordt in fase M1 geselecteerd na controle van beschikbare lokale runtime, licentie en decode/encode-ondersteuning. Dit ontwerp claimt geen gratis licentie voor een nog niet gekozen bibliotheek. Geen librarykeuze die abonnement, AI-call of hosted transformatie vereist.

## Data en eigenaarschap

| Gegeven | Eigenaar en regels |
| --- | --- |
| Asset | Media: `websiteId`, `assetId`, titel, labels, maker, bron, rechtenstatus, licentie/toestemming, eventuele einddatum, standaard-alt per locale, metadataVersion |
| FileVersion | Media: immutable `fileVersion`, bronhash, bytes, werkelijk MIME, afmetingen, status en derivativeprofiel; vervangen maakt nieuwe versie |
| MediaReference | Gebruikende module: `assetId`, `fileVersion`, `usage`, `altText` per locale en `decorative`; websitecontext verplicht in request/owner |
| Usage | Module + owner-ID + revision/release-ID + slot; index op website/asset/versie; registratie omvat alle behouden concepten/revisies/releases |
| Collection/item/category | Catalogus: website-ID op iedere rij, itemversie en aparte immutable snapshotVersion |
| Release manifest | CMS: gepinde mediareferenties, checksums en exportpaden, plus collectie/item/category-ID's en catalogus-snapshotVersion |

`fileVersion` is canoniek, niet `assetVersion`. Caption en focalPoint zijn uitbreidingen na v1. Wijzigingen aan metadata en items gebruiken optimistic concurrency en geven 409 bij verouderde versie. V1 deelt alleen binnen dezelfde website. Een klant met twee websites krijgt geen automatische kruistoegang. Een bewuste kopie naar een tweede website krijgt een nieuw asset-ID en eigen rechtenregistratie.

Alt beschrijft het gebruik, daarom bewaart iedere referentie localegebonden alt. De standaard-alt uit media is een suggestie die bij selectie wordt overgenomen. Een latere wijziging past bestaande contexten niet automatisch aan. Bij publicatie is alt verplicht voor betekenisvolle afbeeldingen; bij expliciet decoratief gebruik is alt leeg. Maak de betekenisvolle cover van een portfolio niet decoratief. Een ontbrekende locale blokkeert publicatie tenzij de CMS-release een expliciete fallbacklocale vastlegt. Geen AI-altgeneratie in deze scope.

Rechtenstatus is `unknown`, `cleared` of `blocked`. Alleen `cleared` zonder verstreken einddatum mag in een nieuwe release. Leg eigenaar, bron, gebruikstoestemming/licentie, creditvereiste en controleur vast. Een bron-URL of aanwezig bestand is geen bewijs. Private toestemmingsdocumenten gaan niet mee in de export. Publiceer vereiste credits wel bij het gebruik of op een afgesproken creditpagina.

## Contract met CMS en catalogus

De onderstaande operaties zijn interne contracten; transport en concrete routenamen volgen tijdens implementatie. CMS kiest een asset via een pickercontract, geen opslagpad of willekeurige URL. Autorisatie blijft nodig bij elke operatie, inclusief metadata, preview en bestandstoegang. Cookie-mutaties gebruiken de bestaande CSRF-beveiliging; agenttoegang volgt later via een expliciete scoped adapter.

| Operatie | Invoer | Resultaat |
| --- | --- | --- |
| Select/list | website, zoek/filter, cursor, limiet maximaal 100 | Alleen bevoegde assets en private previewreferenties |
| Upload | website, begrensde binary, metadata, idempotency key | assetId, fileVersion en processing-status |
| Save references | website, module, owner/revision, expectedVersion, volledige referentieset | Gevalideerde set en gebruiksregistratie, of conflict |
| Resolve release | website, releaseId, volledige gepinde referenties en catalogus-snapshotVersion | Immutable manifest met publieke derivativepaden, MIME, bytes, afmetingen, SHA-256 en credits |
| Archive | website, assetId, expected metadataVersion | Verborgen uit picker, bestaande gepinde verwijzingen blijven geldig |
| Purge | website, assetId, expliciete beheeractie | Alleen verwijderen bij nul behouden referenties; anders conflict met gebruikslijst |

Opslaan van een referentie en registreren van het gebruik moeten samen slagen. Bij aparte opslag krijgt CMS een reservering voordat het een draft/release commit; media laat een reservering meetellen als gebruik. Publicatie finaliseert die reservering. Vrijgeven na fout is expliciet/idempotent; geen tijdgestuurde verwijdering van gereserveerde bestanden zonder reconciliatie. Binnen één database kan dit één transactie zijn. CMS is eigenaar van revisieretentie, media controleert de geregistreerde verwijzingen vóór fysiek verwijderen.

## Publicatie en verwijderen

Opslaan verandert alleen het concept. Een release kiest een volledige catalogussnapshot en exacte fileVersions. Controleer websitegrens, status, rechten, alt, beschikbare derivatives en benodigde credits. Valideer catalogusslugs en unieke exportpaden. Ontbrekende media of onbekende legacy-URL's blokkeren met de owner/slot van de fout. Externe afbeeldingen worden in v1 niet gedownload of doorgelaten.

Bouw in een nieuwe lokale stagingmap, kopieer alleen gebruikte publieke derivatives en render statische lijst/detailpagina's plus manifest. Verifieer hashes en interne links. Finaliseer een releasemap/ZIP pas na alle controles. Bij fout blijft de vorige release intact. Publicatie registreert het gebruik vóór de bestanden kunnen worden opgeruimd. De export werkt zonder CMS of Labs-server; geen private bestandsroute in HTML/JSON. Interne manifestvelden met persoonsgegevens of lokale paden worden niet publiek geëxporteerd.

Rechten worden opnieuw gecontroleerd bij finaliseren, naast de gepinde bestandsdata. Een tussentijdse blokkade voorkomt dus dat een reeds voorbereide release alsnog definitief wordt. De CMS-publicatieworkflow beheert de release; media publiceert niet zelfstandig.

Verwijderen van een portfolio-item verwijdert alleen de verwijzing. Verwijderen van een catalogusitem is eerst archiveren; behouden releases en revisies blijven bestaan. Archiveren van media blokkeert nieuwe selectie, niet bestaand gebruik. Fysiek verwijderen vereist een expliciete beheeractie én nul referenties in alle behouden revisies/releases/reserveringen. Er is geen cascade van portfolio naar binary. Retentie is voorlopig handmatig, zonder automatische purge.

Een rechtenblokkade voorkomt nieuwe releases en geeft de beheerder een lijst van getroffen exports. Reeds gedownloade ZIP's en online kopieën verdwijnen niet automatisch. De beheerder moet een aparte vervangings-/verwijderopdracht voor die publicaties uitvoeren. Een historische release met inmiddels geblokkeerde rechten mag niet opnieuw worden uitgegeven zonder hercontrole.
