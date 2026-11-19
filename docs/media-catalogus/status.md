# Gebouwd, geïntegreerd en nog open

Stand op 19 november 2026, na onafhankelijke herreview van [PR 22](https://github.com/VincentAdvocaat/draconis-labs/pull/22) op `264ce99cfd76493d0e4851de13d8c56ec524f23d`. De PR's zijn gestapeld; merge en deployment zijn niet uitgevoerd. Deze matrix vergelijkt de gerealiseerde proef met de oorspronkelijke [backlog](backlog.md). Een werkende kleine flow betekent niet dat alle bredere fasecriteria al zijn ingevuld.

Gebouwd betekent dat code en lokale controles bestaan. Geïntegreerd betekent dat de genoemde entrypoints dezelfde services werkelijk aanroepen. De consumer is gereed en overgedragen; een gezamenlijke CMS-portfoliorelease is hier nog niet bewezen. CMS-PR 21 is volgens de CMS-overdracht gereviewd op `0a9a9b76b0df289c404e97b2d05254dac7e62d74`; dat bewijst op zichzelf geen gebruik van consumer-PR 22.

| Onderdeel | Gebouwd en lokaal verbonden | Nog open uit de oorspronkelijke scope |
| --- | --- | --- |
| Ontwerp en inventarisatie | Drie repositories gelezen; grenzen media/catalogus/CMS en phased backlog vastgelegd in PR 6 | Productkeuze echte collectie en doelwebsite, rechten van bestaande foto's |
| M0 media-contract | Twee fictieve websites, assetId/fileVersion, referentieretentie, CAS-conflicten en manifestresolver, PR 8; catalogus en consumer gebruiken dezelfde M0-service | Productie-identiteit en fysieke assetpurge buiten volledige fixturecleanup; gezamenlijk CMS-hergebruik nog bewijzen |
| M1 upload/processor | Echte loopback-HTTP-upload, JPEG/PNG/WebP-validatie, kleine bronnen, schone varianten, jobherstel/retry, PR 11 | Batch-UI, client-idempotency, algemene opslagdienst en productie-operatie |
| M2 bibliotheek/rechten | Uploadstatus, selectie, private derivativepreview, contextgebonden alt/decorative en expliciete versiegecontroleerde rechtenaudit; gebruikt door catalogus en consumer. Meerdere retained gebruiken delen één binary | Zoek/filter/paginering en detail/gebruikslijst via volledige UI; bestandsversiebeheer via UI; gerichte toetsenbordacceptatie; tags, expiry/credits en echte medewerkeridentiteit |
| M3 catalogus | Items opslaan/bewerken/archiveren, vaste collectie portfolio/categorie algemeen, getypeerd jaar, slugconstraint/CAS, immutable revisies en snapshots, PR 14 | Collectie-/categorie-editor, categorie-in-gebruikweigering, configureerbaar metadata-schema en redactionele volgorde met herstartacceptatie |
| M4 portfolio | Raster, itemdetail en lege staat boven dezelfde gepinde media, alt/decorative, behoud na wijziging/archief; mobiele browserproef | Geordende selectie/reorder, coverkeuze, filter, meerdere beelden, zichtbare credits en gerichte toetsenbord-/focusherstelacceptatie; responsieve bronkeuze/lightbox wanneer nodig |
| Publicatiebeheer | Normale CLI-start, snapshotlijst, expliciete CAS-intrekking, audit en 404 voor bekende pagina/detail/beeld, PR 16 | CMS-publicaties die CatalogRef consumeren en eigen gekopieerde releases kunnen intrekken |
| Talen | Eén gereviewd gedeeld puur contract, PR 18; handmatige NL/EN-itemvelden, expliciete fallback, directe verplichte publicatievelden en gepinde taalcontext, PR 19 | Centrale redactie van categorie-naam en alle publieke portfolio/detail/jaar/navigatie/lege-staatlabels; gezamenlijke meertalige CMS-bundel. De zelfstandige portfoliorenderer bevat nog NL-labels |
| M5 consumer-interface | Gereviewde PR 22: duurzame owner/revision/slot/attempt-pins, schone bytes, volledige attempt-batchgate, één synchrone callback en twee-databaseherstel, zie [consumer-pins](consumer-pins.md) | CMS moet de interface nog aantoonbaar aansluiten op zijn bestaande blok/releaseflow. Twee databases zijn niet crash-atomair; unknown pins blijven behouden |
| M5 gezamenlijke CMS-export | Gereviewde consumer en herbruikbare NL/EN-fixture overgedragen; CMS bouwt één portfolioblok in eigen branch | Offline werken zonder server; uitsluitend gebruikte derivatives; pinned hashes bij herbouw; bronwijziging laat vorige release intact; ontbrekend bestand/rechtenblokkade/intrekking blokkeert activatie zonder vorige release te beschadigen; CMS-retained refs blokkeren purge; gezamenlijk heropenen en integratiereview |
| M6 migratie | Fixturemigraties en heropenen, behoud IDs/defaultslugs/revisies/snapshots/refs | Read-only klantinventaris, kopie met mapping/uitzonderingen, idempotente import, backup/restore, rollback en twee-tenantsacceptatie van die import; echte klantomschakeling vereist aparte opdracht |

## Integratie die al aantoonbaar werkt

De catalogus-app gebruikt dezelfde media- en uploadservices, gecontroleerde fixtureopslag en rechtenaudit binnen één lokale flow. De normale `catalogus start` opent deze module, zonder aparte mockdatabase of een root-/gebruikersdatabase als fallback. Browserproeven en tests doorlopen upload, private preview, vrijgave, item, publicatie en intrekking.

De NL/EN-flow gebruikt exact de gereviewde shared-helper. Locale-opslag, slugconstraint en publicatievalidatie zijn aangesloten op dezelfde items en mediareferenties. Oude NL-snapshots en ingetrokken routes blijven behouden.

CMS heeft de exacte gereviewde service- en helpercommits ontvangen en werkt aan hergebruik in zijn eigen werkstroom. De consumercommits zijn `17371b84def3833149a47804d6341b52c58b2f04` en `264ce99cfd76493d0e4851de13d8c56ec524f23d`, boven de benodigde gereviewde catalogus/locale-API op `8eca7997e55aabf7788b013c96b118d72991b568`. Reeds aanwezige shared-helpercommits worden niet dubbel overgenomen. Deze documentupdate wijzigt die dependency-head niet. Deze pagina claimt geen gezamenlijke CMS/catalogus-build of integratiereview die in deze branch niet is uitgevoerd.

## Entry points en controleerbaar bewijs

Start vanuit een checkout met de gereviewde stack:

```powershell
corepack pnpm install --frozen-lockfile
. ./scripts/dev-cli/development.ps1
catalogus start -Port 0
```

De start toont een eigen tijdelijke fixtureRoot, loopback-URL en tijdelijk token. Open `/catalogus`; de publieke shell geeft geen toegang tot de private API. De beheerflow levert de echte snapshot-URL. Heropenen kan met `catalogus start -FixtureRoot <afgedrukte-fixtureRoot> -Port 0`. Stop alleen de eigen instantie. Gecontroleerde cleanup staat in [snapshotbeheer](snapshotbeheer.md); gebruik geen klantmap of rootdatabase als fixture.

| Bewijs | Entry point en bewezen grens |
| --- | --- |
| [M0-tests](../../server/api/tests/media-fixture.test.ts) | Websitegrens, fileVersion, alt/rechten, revisies/retentie, archief, resolverhashes en purgeweigering |
| [Uploadtests](../../server/api/tests/media-upload.test.ts) | Echte HTTP-upload, breedtes 1/200/320/640, WebP/fallback, EXIF/GPS/XMP/ICC, byte/pixel/framegrenzen, afgebroken client en jobherstel |
| [Catalogusflowtests](../../server/api/tests/catalogus.test.ts) | Atomaire item/mediawrites, slug/CAS/schema, expliciete rechtenaudit, oude snapshot na wijziging/archief/heropenen en intrekkingsroutes |
| [Localeproeven](../../server/api/tests/catalogus-locales.test.ts), [editorproeven](../../server/api/tests/catalogus-ui.test.ts) en [shared tests](../../packages/shared/tests/content-locale.test.ts) | Ontbrekend versus leeg, handmatige vertaling, toegestane fallback, directe verplichte velden, locale-slugconflict, stale editorweigering en echte oudere fixtureschemamigratie |
| [Consumerfixture](../../server/api/src/catalogus/consumer-fixture.ts) en [17 consumertests](../../server/api/tests/catalogus-consumer.test.ts) | Twee echte databases; wijzigingen na async grens; alle attemptsloten verplicht; nested gates geweigerd; daadwerkelijke eigen child-exit tussen CMS- en mediacommit, heropenen/reconcile en retained refs. Een consumerfixture is geen geïntegreerde CMS-export |
| [Upload-app](../../server/api/src/media-upload/app.ts) | `POST /websites/:website/media`: authenticated binary-upload, gebruikt door de cataloguscompositie |
| [Catalogus-app](../../server/api/src/catalogus/app.ts) | `/catalogus/api/:site`, items, rechten, snapshots, publicatie en localevarianten: token/exacte lokale browserorigin, websitegrens en versiecontrole |
| Dezelfde catalogus-app | `/portfolio/:site/:snapshot`, `/items/:slug`, `/media/:item/:variant`: alleen gepubliceerde gepinde publieke inhoud; ingetrokken routes weigeren |
| [CatalogSnapshotConsumer](../../server/api/src/catalogus/consumer.ts) | Interne preparePin/materialize/finalize/reconcile; geen HTTP-API of CMS-authenticatielaag. CMS bepaalt de bevoegde website |

De laatste runtimecontrole op reviewed head `264ce99` leverde 100 geslaagde API-tests en groene workspace typecheck/lint/build op. De onafhankelijke gerichte herreview voerde alle 17 consumertests opnieuw uit en sloot beide gatebevindingen. Deze documentupdate claimt geen nieuwe uitvoering van de runtimechecks. Herhalen kan met:

```powershell
corepack pnpm --filter @draconis/api test
corepack pnpm --filter @draconis/api exec vitest run tests/catalogus-consumer.test.ts
corepack pnpm --filter @draconis/shared test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

## Eerstvolgende noodzakelijke stap: CMS-publicatieadapter

Prioriteit is integratie van het bestaande contract, zonder losse nieuwe catalogusfuncties. Een klein acceptatiescenario kan één CMS-pagina met één portfolioblok en één item gebruiken:

1. De CMS-medewerker kiest een gepubliceerde CatalogRef met websiteId/collectionId/snapshotId, checksum en dezelfde gekozen locale/fallback. Concept en private preview blijven gescheiden van activeren. De verwijzing wordt gepind, niet als veranderlijke nieuwste-lijstquery opgeslagen.
2. De builder controleert websitegrens, gepinde context, snapshotstatus, gebruikte bestandsversies/hashes en actuele mediarechten. Een onbekende, ingetrokken, cross-site of niet vrijgegeven bron blokkeert de nieuwe release met een concrete melding.
3. CMS bewaart de volledige pinset vóór de asynchrone build. Na de laatste await controleert één synchrone finale batchgate alle slots opnieuw en omhult de bestaande CMS-activatie. Een rechtenblokkade of intrekking tijdens de build mag geen nieuwe release activeren; de vorige release blijft intact. Herstel leest de echte duurzame CMS-attemptstatus; unknown geeft geen referenties vrij. De huidige catalogus-publicatie zelf is synchroon en heeft dit async venster niet.
4. De CMS-release kopieert uitsluitend gebruikte schone derivatives en rendert de gepinde titel/slug/alt en toegestane beschrijvingsfallback. Het resultaat werkt zonder Labs/CMS-server en bevat geen tokens, private audit of absolute opslagpaden.
5. CMS registreert zijn behouden concept-/releaseverwijzing. Archiveren, intrekken of toekomstige retentie mag actieve verwijzingen niet stilzwijgend verwijderen. Voor reeds gekopieerde CMS-publicaties is een eigen expliciete intrekactie nodig; een lokale bronintrekking wist geen bestaande kopieën.
6. Een normale gezamenlijke start en browserproef bewijzen NL en EN, heropenen, een bronwijziging met behoud van de oude release, en weigering bij intrekking/rechtenblokkade tijdens bouwen. Ook centrale label-/taalvelden blijven onder het CMS-ontwerp vallen.

Pas daarna zijn bredere bibliotheek- of portfoliobedieningen zinvol. Echte klantmigratie, merge en deployment blijven afzonderlijke opdrachten. De huidige fixtures en screenshots bevatten alleen synthetisch testmateriaal.

## Kleine vervolgstap na de gezamenlijke integratiereview

Eerst wordt de CMS-aansluiting gericht gecontroleerd op volledige attemptpinset, synchrone callback na de laatste await en herstel uit de duurzame CMS-status. De cataloguschat controleert die aanroepen zonder gelijktijdig CMS-code te wijzigen. Noodzakelijke integratiefixes gaan voor nieuwe stories.

Na die review en de NL/EN offline-/heropenproef volgt als kleine story het resterende publieke taalwerk van ditzelfde portfolioblok: portfolio-/detailkop, teruglink, jaarlabel en lege staat centraal als handmatige NL/EN CMS-velden beheren en per release bevriezen. Bevestig eerst welke teksten de integratie al levert en werk alleen het overgebleven gat af. Dit is geen opdracht voor een algemene categorie-editor, extra collecties, bredere bibliotheek of klantmigratie.

## Verificatielimieten

De modules zijn lokaal op Windows/Node getest. De identiteit is een tijdelijk token voor fictieve websites, geen productieaccountstelsel. Eén eigenaarproces en een SQLite-gate geven geen algemene multiproces- of bestandssysteemgarantie. De echte child-exit bewijst herstelvolgorde, geen fysieke stroomuitvalbestendigheid.

De automatische goedkeuringscontrole blokkeerde eerder de negatieve CLI-cleanup gericht op de projectmap met `blocked by policy`. Die actie is niet uitgevoerd, herhaald of omzeild. De acht pure argumentchecks en positieve cleanup van een eigen gestopte tijdelijke fixture zijn wel uitgevoerd. Er zijn geen klantmutaties, productieresources, betaalde vertalingen of externe opslag gebruikt.
