# Gebouwd, geïntegreerd en nog open

Stand van de lokale werkstroom op 19 november 2026. De PR's zijn gestapeld; merge en deployment zijn niet uitgevoerd. Deze pagina vergelijkt de gerealiseerde proef met de oorspronkelijke [backlog](backlog.md). Een werkende kleine flow betekent niet dat alle bredere fasecriteria al zijn ingevuld.

| Onderdeel | Gebouwd en lokaal verbonden | Nog open uit de oorspronkelijke scope |
| --- | --- | --- |
| Ontwerp en inventarisatie | Drie repositories gelezen; grenzen media/catalogus/CMS en phased backlog vastgelegd in PR 6 | Productkeuze echte collectie en doelwebsite, rechten van bestaande foto's |
| M0 media-contract | Websitegescheiden SQLite, assetId/fileVersion, referentieretentie, versieconflicten en manifestresolver, PR 8 | Productie-identiteit en fysieke assetpurge buiten volledige fixturecleanup |
| M1 upload/processor | Echte loopback-HTTP-upload, JPEG/PNG/WebP-validatie, kleine bronnen, schone varianten, jobherstel/retry, PR 11 | Batch-UI, client-idempotency, algemene opslagdienst en productie-operatie |
| M2 bibliotheek/rechten | Selectie, private derivativepreview en expliciete versiegecontroleerde rechtenaudit, gebruikt door catalogus | Volwaardige zoek/filter/paginering-UI, tags, expiry/credits-beheer en echte medewerkeridentiteit |
| M3 catalogus | Opgeslagen generieke items, vaste collectie/categorie, title/slug/description/jaar, immutable revisies en snapshots, PR 14 | Categorie-editor, meer collecties en configureerbaar metadata-schema |
| M4 portfolio | Raster en detailpagina boven dezelfde gepinde media, alt/decorative, behoud na wijziging/archief | Vrije albums/selecties, meerdere beelden per item, reorder/coverbeheer en responsieve bronkeuze/lightbox wanneer nodig |
| Publicatiebeheer | Normale CLI-start, snapshotlijst, expliciete CAS-intrekking, audit en 404 voor bekende pagina/detail/beeld, PR 16 | CMS-publicaties die CatalogRef consumeren en eigen gekopieerde releases kunnen intrekken |
| Talen | Eén gereviewd gedeeld puur contract, PR 18; handmatige NL/EN-itemvelden en gepinde taalcontext, PR 19 | Centrale redactie van alle publieke labels/categorietekst en volledige meertalige websitebundel via CMS |
| M5 CMS-export | Contract afgestemd, media-/rechtenservices en shared-helper beschikbaar voor CMS-hergebruik | Gezamenlijke CatalogRef→CMS-blok→offline static release nog niet gebouwd in deze werkstroom |
| M6 migratie | Fixturemigraties en heropenen, behoud IDs/defaultslugs/revisies/snapshots/refs | Read-only klantinventaris, dry-run import, gecontroleerde backup/restore en echte klantomschakeling |

## Integratie die al aantoonbaar werkt

De catalogus-app gebruikt dezelfde media- en uploadservices, gecontroleerde fixtureopslag en rechtenaudit binnen één lokale flow. De normale `catalogus start` opent deze module, zonder aparte mockdatabase of een root-/gebruikersdatabase als fallback. Browserproeven en tests doorlopen upload, private preview, vrijgave, item, publicatie en intrekking.

De NL/EN-flow gebruikt exact de gereviewde shared-helper. Locale-opslag, slugconstraint en publicatievalidatie zijn aangesloten op dezelfde items en mediareferenties. Oude NL-snapshots en ingetrokken routes blijven behouden.

CMS heeft de exacte gereviewde service- en helpercommits ontvangen en werkt aan hergebruik in zijn eigen werkstroom. Deze pagina claimt geen gezamenlijke CMS/catalogus-build of integratiereview die in deze branch niet is uitgevoerd.

## Eerstvolgende noodzakelijke stap: CMS-publicatieadapter

Prioriteit is integratie van het bestaande contract, zonder losse nieuwe catalogusfuncties. Een klein acceptatiescenario kan één CMS-pagina met één portfolioblok en één item gebruiken:

1. De CMS-medewerker kiest een gepubliceerde CatalogRef met websiteId/collectionId/snapshotId, checksum en dezelfde gekozen locale/fallback. Concept en private preview blijven gescheiden van activeren. De verwijzing wordt gepind, niet als veranderlijke nieuwste-lijstquery opgeslagen.
2. De builder controleert websitegrens, gepinde context, snapshotstatus, gebruikte bestandsversies/hashes en actuele mediarechten. Een onbekende, ingetrokken, cross-site of niet vrijgegeven bron blokkeert de nieuwe release met een concrete melding.
3. Bij asynchrone export wordt snapshotstatus en rechten opnieuw vlak vóór activatie gecontroleerd. Een rechtenblokkade of intrekking tijdens de build mag geen nieuwe release activeren; de vorige release blijft intact. De huidige catalogus-publicatie zelf is synchroon en heeft dit async venster niet.
4. De CMS-release kopieert uitsluitend gebruikte schone derivatives en rendert de gepinde titel/slug/alt en toegestane beschrijvingsfallback. Het resultaat werkt zonder Labs/CMS-server en bevat geen tokens, private audit of absolute opslagpaden.
5. CMS registreert zijn behouden concept-/releaseverwijzing. Archiveren, intrekken of toekomstige retentie mag actieve verwijzingen niet stilzwijgend verwijderen. Voor reeds gekopieerde CMS-publicaties is een eigen expliciete intrekactie nodig; een lokale bronintrekking wist geen bestaande kopieën.
6. Een normale gezamenlijke start en browserproef bewijzen NL en EN, heropenen, een bronwijziging met behoud van de oude release, en weigering bij intrekking/rechtenblokkade tijdens bouwen. Ook centrale label-/taalvelden blijven onder het CMS-ontwerp vallen.

Pas daarna zijn bredere bibliotheek- of portfoliobedieningen zinvol. Echte klantmigratie, merge en deployment blijven afzonderlijke opdrachten. De huidige fixtures en screenshots bevatten alleen synthetisch testmateriaal.

## Verificatielimieten

De laatste checks en exacte gereviewde SHA staan in de PR-/chatrapportage. De modules zijn lokaal op Windows/Node getest. De identiteit is een tijdelijk token voor fictieve websites, geen productieaccountstelsel. De eerder geblokkeerde negatieve CLI-cleanup naar de projectmap is niet uitgevoerd of omzeild; veilige pure argumentchecks en positieve cleanup van een eigen tijdelijke fixture zijn wel uitgevoerd. Er zijn geen productieresources, betaalde vertalingen of externe opslag gebruikt.
