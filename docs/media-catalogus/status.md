# Gebouwd, geïntegreerd en nog open

Stand op 19 november 2026, boven gezamenlijke [PR 37](https://github.com/VincentAdvocaat/draconis-labs/pull/37), vaste basis `fc43090d0f90892df97d7e033bef66b772c81aa8`. Merge en deployment zijn niet uitgevoerd. Deze matrix vergelijkt de gerealiseerde proef met de oorspronkelijke [backlog](backlog.md). Een werkende kleine flow betekent niet dat alle bredere fasecriteria al zijn ingevuld.

Gebouwd betekent dat code en lokale controles bestaan. Geïntegreerd betekent dat de genoemde entrypoints dezelfde services werkelijk aanroepen. De CMS-portfoliorelease en zelfstandige catalogus zijn inmiddels samengebracht. Het vastgelegde [integratierapport](../integratie/review-pr37.json) reviewt SHA `fb9c22d407a50fcc020d792a94261510019d65ad` zonder bevindingen, inclusief 306 API-tests, 18 shared-tests, 20 Planner-UI-tests, startupsmokes en acht catalogus-CLI-checks. Browser- en herstartbewijs zijn aangeleverd door de integratie-eigenaar, zie [bewijs](../integratie/bewijs.json) en [gebruikersdemo](../integratie/gebruikersdemo.md). Dit is bronattributie, geen nieuwe uitvoering van die checks door deze documentupdate.

| Onderdeel | Gebouwd en lokaal verbonden | Nog open uit de oorspronkelijke scope |
| --- | --- | --- |
| Ontwerp en inventarisatie | Drie repositories gelezen; grenzen media/catalogus/CMS en phased backlog vastgelegd in PR 6 | Productkeuze echte collectie en doelwebsite, rechten van bestaande foto's |
| M0 media-contract | Twee fictieve websites, assetId/fileVersion, referentieretentie, CAS-conflicten en manifestresolver, PR 8; catalogus en geïntegreerde CMS-consumer gebruiken dezelfde M0-service | Productie-identiteit en fysieke assetpurge buiten volledige fixturecleanup |
| M1 upload/processor | Echte loopback-HTTP-upload, JPEG/PNG/WebP-validatie, kleine bronnen, schone varianten, jobherstel/retry, PR 11 | Batch-UI, client-idempotency, algemene opslagdienst en productie-operatie |
| M2 bibliotheek/rechten | Uploadstatus, expliciete versieselectie, schone private preview en rechtenaudit. Nu ook asset-ID zoeken, rechten/nieuwste-statusfilters, serverpaginering en detail met alle versies/historisch retained gebruik, zie [bibliotheekproef](media-library.md) | Nieuwe bestandsversies beheren via UI; bredere toetsenbordacceptatie buiten deze lijst/detailflow; tags, expiry/credits en echte medewerkeridentiteit |
| M3 catalogus | Items opslaan/bewerken/archiveren, vaste collectie portfolio/categorie algemeen, getypeerd jaar, slugconstraint/CAS, immutable revisies en snapshots, PR 14 | Collectie-/categorie-editor, categorie-in-gebruikweigering, configureerbaar metadata-schema en redactionele volgorde met herstartacceptatie |
| M4 portfolio | Raster, itemdetail en lege staat boven dezelfde gepinde media, alt/decorative, behoud na wijziging/archief; mobiele browserproef | Geordende selectie/reorder, coverkeuze, filter, meerdere beelden, zichtbare credits en gerichte toetsenbord-/focusherstelacceptatie; responsieve bronkeuze/lightbox wanneer nodig |
| Publicatiebeheer | Normale CLI-start, snapshotlijst, expliciete CAS-intrekking, audit en 404 voor bekende pagina/detail/beeld, PR 16; CMS consumeert nu CatalogRef | Eigen expliciete intrekking van gekopieerde CMS-releases; bronintrekking wist geen kopieën |
| Talen | Gedeeld contract, handmatige NL/EN-itemvelden en gepinde taalcontext; CMS heeft inmiddels ook NL/EN-blokkop/lege staat, paginavarianten, navigatie, EN-afbeelding/portfolio en Home-EN in PR 37 | Categorie-naam en overige labels van de zelfstandige portfoliorenderer bevatten nog NL-tekst; geen volledige vertaling van iedere losse renderer geclaimd |
| M5 consumer-interface | Gereviewde consumer verbonden met CMS: volledige attemptpinset, één synchrone activatiegate en herstel uit duurzame CMS-status. Gerichte aansluitingscontrole en CMS-integratietests gesloten | Twee databases blijven niet crash-atomair; unknown pins blijven behouden |
| M5 gezamenlijke CMS-export | Gepinde CMS-portfoliorelease met schone derivatives, bloktaal/expliciete fallback, behouden vorige release bij geblokkeerde build en heropenen; geïntegreerd en onafhankelijk beoordeeld in PR 37 | Algemene productie-operatie, expliciete CMS-kopie-intrekking en echte klantacceptatie; lokale fixtures zijn geen klantrelease |
| M6 migratie | Fixturemigraties en heropenen, behoud IDs/defaultslugs/revisies/snapshots/refs | Read-only klantinventaris, kopie met mapping/uitzonderingen, idempotente import, backup/restore, rollback en twee-tenantsacceptatie van die import; echte klantomschakeling vereist aparte opdracht |

## Integratie die al aantoonbaar werkt

De catalogus-app gebruikt dezelfde media- en uploadservices, gecontroleerde fixtureopslag en rechtenaudit binnen één lokale flow. De normale `catalogus start` opent deze module, zonder aparte mockdatabase of een root-/gebruikersdatabase als fallback. Browserproeven en tests doorlopen upload, private preview, vrijgave, item, publicatie en intrekking.

De NL/EN-flow gebruikt exact de gereviewde shared-helper. Locale-opslag, slugconstraint en publicatievalidatie zijn aangesloten op dezelfde items en mediareferenties. Oude NL-snapshots en ingetrokken routes blijven behouden.

PR 37 bevat de catalogustip `8d3eaeb30d5a8501c064ad1e7a0e4af22779e2c3` als ancestor. De services/helper/consumer zijn één keer opgenomen. De ontbrekende zelfstandige app/HTML/start/CLI en de gereviewde uploadcompositie zijn toegevoegd zonder een tweede media- of rechtenopslag. Deze bibliotheekstap bouwt daarboven, zonder CMS-UI of gedeelde dependencies te wijzigen.

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
| Dezelfde catalogus-app | `/portfolio/:site/:snapshot`, `/portfolio/:site/:snapshot/items/:slug`, `/portfolio/:site/:snapshot/media/:item/:variant`: alleen gepubliceerde gepinde publieke inhoud; ingetrokken routes weigeren |
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

## Ingevulde integratieacceptatie en grenzen

De volgende criteria vormden de kleine CMS-adapteropdracht en zijn nu verbonden met het PR 37-bewijs. Ze blijven gelden bij vervolgstappen:

1. De CMS-medewerker kiest een gepubliceerde CatalogRef met websiteId/collectionId/snapshotId, checksum en dezelfde gekozen locale/fallback. Concept en private preview blijven gescheiden van activeren. De verwijzing wordt gepind, niet als veranderlijke nieuwste-lijstquery opgeslagen.
2. De builder controleert websitegrens, gepinde context, snapshotstatus, gebruikte bestandsversies/hashes en actuele mediarechten. Een onbekende, ingetrokken, cross-site of niet vrijgegeven bron blokkeert de nieuwe release met een concrete melding.
3. CMS bewaart de volledige pinset vóór de asynchrone build. Na de laatste await controleert één synchrone finale batchgate alle slots opnieuw en omhult de bestaande CMS-activatie. Een rechtenblokkade of intrekking tijdens de build mag geen nieuwe release activeren; de vorige release blijft intact. Herstel leest de echte duurzame CMS-attemptstatus; unknown geeft geen referenties vrij. De huidige catalogus-publicatie zelf is synchroon en heeft dit async venster niet.
4. De CMS-release kopieert uitsluitend gebruikte schone derivatives en rendert de gepinde titel/slug/alt en toegestane beschrijvingsfallback. Het resultaat werkt zonder Labs/CMS-server en bevat geen tokens, private audit of absolute opslagpaden.
5. CMS registreert zijn behouden concept-/releaseverwijzing. Archiveren, intrekken of toekomstige retentie mag actieve verwijzingen niet stilzwijgend verwijderen. Voor reeds gekopieerde CMS-publicaties is een eigen expliciete intrekactie nodig; een lokale bronintrekking wist geen bestaande kopieën.
6. Een normale gezamenlijke start en browserproef bewijzen NL en EN, heropenen, een bronwijziging met behoud van de oude release, en weigering bij intrekking/rechtenblokkade tijdens bouwen. Ook centrale label-/taalvelden blijven onder het CMS-ontwerp vallen.

Pas daarna zijn bredere bibliotheek- of portfoliobedieningen zinvol. Echte klantmigratie, merge en deployment blijven afzonderlijke opdrachten. De huidige fixtures en screenshots bevatten alleen synthetisch testmateriaal.

## Huidige kleine vervolgstap: bibliotheek

De gezamenlijke review is afgerond. De geautoriseerde vervolgstap is de bestaande assets bruikbaar doorzoeken, filteren en pagineren, met versie-/gebruiksdetail. De [bibliotheekproef](media-library.md) beschrijft de nieuwe read-only API, live-offsetsemantiek en browser-/herstartacceptatie. Geen batch, lightbox, extra CMS-bibliotheek, migratie of productie-uitrol. Andere open fasecriteria blijven afzonderlijk te plannen.

## Verificatielimieten

De modules zijn lokaal op Windows/Node getest. De identiteit is een tijdelijk token voor fictieve websites, geen productieaccountstelsel. Eén eigenaarproces en een SQLite-gate geven geen algemene multiproces- of bestandssysteemgarantie. De echte child-exit bewijst herstelvolgorde, geen fysieke stroomuitvalbestendigheid.

De automatische goedkeuringscontrole blokkeerde eerder de negatieve CLI-cleanup gericht op de projectmap met `blocked by policy`. Die actie is niet uitgevoerd, herhaald of omzeild. De acht pure argumentchecks en positieve cleanup van een eigen gestopte tijdelijke fixture zijn wel uitgevoerd. Er zijn geen klantmutaties, productieresources, betaalde vertalingen of externe opslag gebruikt.
