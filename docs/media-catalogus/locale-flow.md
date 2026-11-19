# Kleine opgeslagen NL/EN-catalogusflow

Deze flow gebruikt exact de onafhankelijk gereviewde shared-helper uit [PR 18](https://github.com/VincentAdvocaat/draconis-labs/pull/18), commit `ce7805d4fea17eb19720ae7dc67594db5fdd0c51`. De branch `feature/catalogus-locale-flow` begint daarop. Er is geen tweede taalkern, package, dependency of vertaal-API toegevoegd.

## Beheerflow

Start via de bestaande lokale opdracht:

```powershell
. ./scripts/dev-cli/development.ps1
catalogus start
```

Heropenen van een eerdere eigen tijdelijke fixture kan met `-FixtureRoot <fixtureRoot>`. De lokale migratie behoudt bestaande item-ID's, categorie-ID's, bestandsversies en NL-defaultslugs. Deze proef heeft twee bekende fictieve websites met expliciete NL-default. Echte CMS-websites en hun bestaande defaulttaal worden niet gewijzigd.

1. Laad een bewaard item. De gewone editor bewerkt de bestaande NL-defaultvelden en algemene metadata/afbeeldingskeuze.
2. Klik EN-variant laden. Eventueel kies je expliciet het gemarkeerde NL-privévoorbeeld. De editor toont per veld direct, ontbrekend, bewust leeg of fallback met bronlocale. Fallback wordt nooit automatisch in EN-invoervelden geschreven.
3. Vul titel EN, slug EN en betekenisvolle alt EN handmatig in. Een decoratief gebruik vraagt expliciet lege EN-alt. Voor de beschrijving onderscheidt een checkbox ontbrekend van bewust leeg. Uitgevinkt plus lege invoer bewaart een lege string.
4. Sla de EN-variant op. Zij hoort bij hetzelfde item en krijgt een nieuwe immutable revisie met dezelfde algemene metadata. NL-inhoud verandert niet. De itemversie beschermt ook edits tussen de twee taalpanelen.
5. Kies bij publiceren NL of EN. Alleen voor ontbrekende optionele beschrijving bij EN kun je expliciet NL-fallback kiezen. Een ontbrekende/lege directe EN-titel, slug of betekenisvolle alt blokkeert EN-publicatie, ook met fallback aan.

Sla wijzigingen aan het standaarditem eerst op voordat je EN laadt of opslaat. De UI bewaakt dit voor gewijzigde NL-velden en een nieuw geselecteerde afbeelding, zodat een taalactie geen onopgeslagen standaardinvoer weggooit. Na een externe wijziging blijft een EN-formulier aan zijn eerdere versie gebonden en geeft opslaan een conflict. Expliciet Laden vernieuwt de formulieren samen met hun versies.

Ook EN laden zelf vereist dezelfde item-ID en versie als het zichtbare bron-/afbeeldingspaneel. Als een ander venster het item intussen heeft gewijzigd, maakt de editor de EN-bewerking ongeldig en vraagt hij expliciet volledig herladen. Bestaande onopgeslagen EN-invoer blijft daarbij zichtbaar, maar kan niet met een stilzwijgend nieuwere versie worden opgeslagen. Dit sluit de P2 uit de onafhankelijke PR 19-review; twee regressietests dekken een externe wijziging vóór EN laden en vóór opnieuw EN laden.

## Opslag en migratie

Catalogus-databaseschema 3 voegt default_locale, immutable localevelden per itemrevisie en aparte slugreserveringen toe. De bekende bestaande fixture-inhoud wordt expliciet als NL opgenomen. De migratie wijzigt geen bestaande itemrevisie-JSON of snapshot-JSON, geen ID, defaultslug of media-usage. Zij draait transactioneel op de gecontroleerde tijdelijke fixtureopslag, niet op klantdata.

Een echte constraint reserveert slug per website, collectie en locale. Dezelfde tekst mag een NL- en EN-slug zijn; een tweede item binnen dezelfde site/collectie/taal krijgt 409. De vaste runtimecollectie blijft portfolio. Een lege nog onvoltooide vertaalde slug wordt niet gereserveerd en kan niet gepubliceerd worden. Archiveren behoudt de bestaande reserveringen en referenties.

Een EN-opslagactie kopieert de andere localevelden naar een nieuwe immutable revisie en wijzigt alleen de handmatige EN-velden. De nieuwe localegegevens, slugreserveringen, mediareferenties en itemrevisie worden samen in één SQLite-transactie opgeslagen. Een conflict laat de oude revisie intact. Historische revisies en releases blijven behouden.

Een wijziging van asset-ID of fileVersion via de standaardeditor maakt de oude EN-alt ongeldig, tenzij de aanroeper expliciet een nieuwe EN-alt aanlevert. Daardoor kan een beschrijving van de vorige afbeelding niet stilzwijgend de nieuwe afbeelding publiceerbaar maken. Vertaalde titel, slug en beschrijving blijven behouden. Oude snapshots gebruiken hun eerder gepinde bestand en alt.

Een mislukte migratie sluit de geopende service- en appverbindingen, zodat een fout geen verborgen database-lock achterlaat.

## Publicatiecontract

Nieuwe snapshots hebben `schemaVersion=2` en bevatten:

- de expliciete `localeContext` met defaultLocale, gekozen locale en eventuele fallbackLocale;
- immutable `localeValues` per item en `fieldSources` met value/sourceLocale/isFallback/missing/explicitEmpty;
- de gepinde itemvelden voor de gekozen publicatietaal en dezelfde behouden mediareferenties;
- dezelfde CatalogRef-identiteit en een checksum over de complete snapshotinhoud.

De publicatie gebruikt `CONTENT_PUBLICATION_RULES_V1` uit de gedeelde helper. Decorative-alt blijft een expliciete mediadomeincontrole. De bestaande rechtenvrijgave, status, hashes en retained refs blijven vereist. Snapshotbouw blijft geheel synchroon in één SQLite-transactie. Er is geen async voorbereiden/activeren-venster waarin een tweede request rechten kan blokkeren tussen validatie en commit.

Een snapshot legt één publicatieprofiel vast. CMS-release gebruikt dezelfde gekozen taal/fallback en pint CatalogRef plus checksum. Voor een andere publicatietaal maakt deze kleine flow een nieuwe snapshot met een eigen ID. Alle variantwaarden blijven voor herleidbaarheid in die snapshot bevroren; deze stap levert nog geen meertalige websitebundel onder één release-ID.

Bestaande `schemaVersion=1`-snapshots behouden hun bekende NL-presentatie en inhoud. Intrekken blijft alle overzicht-, detail- en beeldroutes onder dat ID weigeren. Een latere vertaalwijziging of rechtenbeslissing verandert oude opgeslagen snapshots niet.

## HTTP en weergave

De geauthenticeerde bestaande publicatieroute accepteert nu expectedVersion plus optioneel locale en fallbackLocale. Voor de oude call zonder taal kiest de adapter expliciet de opgeslagen sitedefault, zonder fallback. Eenzelfde gekozen taal en fallback is ongeldig. Unsupported locales worden geweigerd.

`GET /catalogus/api/:site/items/:id/locales/:locale?fallbackLocale=nl` geeft directe invoerwaarden en gemarkeerde privédiagnostiek, achter dezelfde token/Origin-grens. `PUT` op hetzelfde pad vervangt een niet-defaultvariant met expectedVersion en title/slug/description/alt. Niet meegestuurde of null-velden worden unset; een string, ook leeg, blijft inhoud. De bestaande defaulteditor blijft eigenaar van NL-velden en algemene itemstructuur. Het gedeelde contract wordt voor zowel diagnose als publicatie gebruikt.

Publieke pagina's gebruiken de gekozen taal voor document-lang, itemtitel, slug en afbeelding-alt. Een NL-beschrijvingsfallback krijgt eigen lang=nl en een data-fallback-markering. De bestaande categorienaam en navigatie-/jaarlabels blijven in deze beperkte proef NL, met taalmarkering. Centrale redactie en localevarianten van alle publieke labels/categorieën volgen de CMS-backlog; deze stap claimt geen volledige websitevertaling.

## Bewijs

```powershell
corepack pnpm --filter @draconis/api exec vitest run tests/catalogus-locales.test.ts tests/catalogus-ui.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

De tests bewijzen defaultbehoud, expliciete fallback, missing/null tegenover empty, directe titel/slug/alt, decorative-alt, echte slugconstraints per namespace, CAS, variantretentie bij standaardedit, invalidatie van oude alt bij beeldwissel, heropenen, legacy snapshot-JSON en withdrawn routes. De beheerscript-tests bewijzen dat fallback geen invoer materialiseert en dat een taalactie geen onopgeslagen standaardinvoer of bewust gekozen nieuwe upload weggooit.

Een concurrerende HTTP-proef laat twee verschillende items binnen dezelfde site/collectie/EN tegelijk dezelfde slug aanvragen. De databaseconstraint laat één verzoek slagen en weigert het andere met 409. Dit is concurrentie binnen de afgesproken ene server, geen claim van getest meerprocessenbeheer.

De browserproef heropende de eerder bij snapshotbeheer gebruikte schema-2-fixture. De oude NL-snapshot bleef renderen en de ingetrokken beeld-URL bleef geweigerd. EN-publicatie zonder directe verplichte velden werd geweigerd ondanks fallback. Na handmatige EN-invoer werkte een EN-snapshot met eigen slug/alt en expliciet gekozen NL-beschrijving. Daarna bleef een bewust lege EN-beschrijving leeg, ook met fallback gekozen. Na procesherstart bleven EN-invoer en beide gepinde taalprofielen bestaan. Er is uitsluitend synthetisch lokaal testmateriaal gebruikt.

De volledige workspacechecks en onafhankelijke review worden vóór afronding gerapporteerd. Geen automatische vertaling, klantmigratie, betaalde dienst, externe publicatie of merge.
