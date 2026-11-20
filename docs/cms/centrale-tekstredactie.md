# Centrale website-tekst, pagina's en talen

Uitwerking van de gebruikersrichting van 19 november 2026. Dit document beschrijft vervolgwerk na de uploadreview; de huidige proef heeft nog één pagina en Nederlandstalige inhoud. De nieuwe richting omvat alle redactionele websitetekst en het toevoegen van pagina's, getypeerde blokken en foto's via het CMS.

## Aangetroffen i18n en keuze

Labs heeft `apps/planner/src/i18n.ts` met getypeerde NL/EN-berichten, `createTranslator` en `Intl`-formattering. `packages/shared/src/schemas/preferences.ts` kent locale `nl`/`en`. Dat zijn appberichten en voorkeuren; deze vertaalmap is geen redactionele paginadatabase. De huidige CMS-app heeft nog vaste Nederlandse labels/statuszinnen. Studio-Projects heeft al pagina-/veldcatalogi en ContentValue per locale, ontbrekend versus leeg, defaultLocale en versiecontrole. Zie [onderzoek](onderzoek.md). De feitelijk geconfigureerde standaardtaal van een bestaande site blijft bij import behouden; de Labs-fixture is expliciet NL, de eerder onderzochte echte sites kunnen EN als standaard hebben.

Gebruik voor vaste CMS-appbediening dezelfde getypeerde i18n-aanpak als Planner, in een eigen CMS-namespace. UI-locale en inhoudslocale zijn afzonderlijke keuzes. Deel geen Planner-teksten of imports tussen appmodules. Labels, knopnamen, vaste validatieberichten en statuscodes krijgen vaste keys en veilige stringinterpolatie. Geen `eval`, functies uit vertaaldata, vrije HTML of uitvoerbare template-expressies. React rendert de tekst; de statische compiler encodeert tekst en attributen.

Redactionele website-inhoud staat in CMS-records, inclusief navigatie, footer, zichtbare koppen/teksten, linklabels, formulierlabels waar aanwezig en SEO. Een nieuwe pagina of nieuw blok vraagt geen key in het UI-vertaalbestand. Code beheert toegestane schema's en bindings; een redacteur beheert records en taalvarianten. Bestaande codebeheerde publieke bindings kunnen als benoemde contentvelden naast blokken blijven bestaan tot hun expliciete migratie. Zo blijft alle bereikbare tekst centraal vindbaar zonder bestaande veldidentiteiten te verliezen.

## Recordcontract en grenzen

| Record | Voorstel |
| --- | --- |
| Website | Stabiele website-ID, expliciete defaultLocale, ondersteunde drafttalen en afzonderlijk gepubliceerde locales. Taalconfiguratie zit in de release. |
| Page | Stabiele pageId en codebeheerd templateId/schemaVersion, categorie/volgorde, draft pointer/version. Slug is localegebonden metadata, nooit page-identiteit. |
| PageRevision | Immutable revisie met localevarianten voor titel, slug, SEO-titel/beschrijving en blokinhoud. De revision bevat ook de structuur en volgorde van stabiele blockIds. |
| TextBlock | Getypeerd blok met heading/body per locale, begrensde platte tekst. Geen HTML, script of CSS. |
| ImageBlock | Stabiele blockId, assetId/fileVersion/usage, expliciet decorative en locale-alt/caption per gebruik. Media blijft de enige bron voor binaries en rechten. |
| SharedContent | Websitebrede benoemde velden/records, bijvoorbeeld navigatie en footer, met eigen immutable revisie. |
| SiteRelease | Complete mapping van pagina's, shared revisie, taalconfiguratie, templates en media-/catalogussnapshots. Alleen gevalideerde output activeren. |

Slugs zijn uniek per website en locale na normalisatie, inclusief Windows-casebotsingen. Ze zijn niet door een vertaalkey beperkt. De bestaande default-route blijft geldig. Een localevariant kan later een eigen route onder bijvoorbeeld `/en/<slug>.html` krijgen. Routewijziging of pagina verwijderen gaat met een expliciete redirect/tombstone in dezelfde sitebrede release. Alleen servergegenereerde paden komen bij de filesystembuilder. Ontbrekende of ongeldige routes blokkeren publicatie.

Nieuwe blokken kiezen een geregistreerd type. Nieuwe typen vereisen code/schema/review; redacteuren kunnen zelfstandig zoveel toegestane blokrecords toevoegen als binnen de ingestelde limieten past. Foto toevoegen gebruikt de zojuist gebouwde upload/rechtenflow. Bestandsvervanging maakt een nieuwe versie/referentie; behouden releases veranderen niet.

## Taal- en fallbackregels

1. Bewaar ontbrekend, expliciet leeg en ingevuld apart. Een ontbrekende waarde staat niet in de locale-map; leeg is `""`. Gebruik standaardtaal verwijdert de lokale override. Een save materialiseert een getoonde fallback niet stilzwijgend als vertaling.
2. De editor en privépreview mogen ontbrekende tekst uit de standaardtaal tonen, met zichtbare ontbrekend/fallback-status en resolvedLocale. Een taalwissel bewaart of laat de gebruiker onopgeslagen wijzigingen afhandelen. Versieconflicten blijven zichtbaar.
3. De compiler valideert de gekozen publieke locales vóór activatie. Titel, routes en verplichte bloktekst moeten voor die locale bestaan. Ook betekenisvolle alt-tekst is vereist per publieke locale; decorative vereist lege alt. De eerste bouwstap publiceert alleen de bestaande NL-fixture, zodat ontbrekende EN-tekst niet stilzwijgend live verschijnt.
4. Alleen velden waarvan het schema expliciet default-fallback toestaat mogen in een publieke niet-standaardvariant terugvallen. Bijvoorbeeld optionele toelichting; slug en verplichte SEO-identiteit krijgen geen geraden waarde. Leeg blijft leeg. Het releasemanifest registreert welke waarden terugvielen en hun brontaal; de renderer markeert tekst in de afwijkende taal passend.
5. Een niet-ondersteunde editorlocale geeft een validatiefout; een niet-gepubliceerde publieke taalroute geeft 404. Taalkeuze maakt geen nieuwe pagina of datarecords aan. Geen automatische vertaal- of AI-aanroepen.

De standaardtaal wijzigen vereist een expliciete beheeractie en volledige verplichte inhoud in de nieuwe taal. Het herschrijft geen bestaande vertalingen of veld-ID's. Een bestaande publicatie blijft intact totdat de nieuwe volledige snapshot valideert en activeert.

## Behoud en aansluiting catalogus

De huidige `home`-titel, introductie, afbeelding, alt/decorative, draftversies en actieve releases worden met een genummerde, idempotente migratie behouden. Een compatibiliteitsadapter houdt de bestaande home-route lees-/schrijfbaar totdat de nieuwe editor is aangesloten. Er komt één gezaghebbende draftopslag; geen dubbele writes naar oude en nieuwe systemen. Bewijs migratie op gesynthetiseerde oude fixtures en herhaal die zonder duplicaten.

Met de media/cataloguschat afgestemd: item-ID, categorie-ID en niet-talige metadata zoals jaar blijven invariant. Titel, beschrijving, slug en categorienaam krijgen localevarianten; slugs zijn uniek per website+locale. Alt blijft per-use locale-map. Catalogussnapshots bevriezen defaultLocale plus opgenomen varianten. CMS pint `CatalogRef {websiteId, collectionId, snapshotId}` en checksum, en legt gekozen locale/fallbackbeleid vast. De bestaande catalogusproef blijft expliciet NL totdat de betreffende locale-story is uitgevoerd. Een vertaalbestand bepaalt geen nieuwe categorieën, items, pagina's of blokken.

## Eerstvolgende kleine bouwstap

Na de uploadreview volgt CMS-21: in de lokale fictieve site één nieuwe pagina met titel, veilige slug, SEO en een tekstblok kunnen aanmaken, aanvullen met één imageblok uit de bestaande mediaflow, opslaan, privé bekijken en opnemen in een sitebrede lokale release. De home-pagina en haar bestaande inhoud blijven behouden. Onderliggende records gebruiken stabiele IDs en een expliciete locale, zodat EN later via dezelfde schema's kan worden toegevoegd. Deze stap publiceert NL en introduceert geen vrije HTML of visuele layoutbouwer.

Neem nieuwe bedieningslabels direct op in de CMS-i18n-namespace volgens de bestaande getypeerde aanpak. De afzonderlijke locale-story voltooit de verplaatsing van alle huidige CMS-appteksten naar NL/EN-keys en redigeert meerdere contentlocales. Zo blokkeert de vertaalmap het toevoegen van redactionele records niet. Geen nieuwe UI- of vertaalbibliotheek nodig.

Acceptatie: maak via de normale interface een fictieve pagina aan, wijzig slug/SEO en bloktekst, voeg een vrijgegeven foto met alt toe, sla de draft op en publiceer. De bestaande home en nieuwe route werken na herstart. Een incomplete pagina, dubbele/genormaliseerde slug, onbekend bloktype, scriptachtige tekst, cross-website media of stale page-version weigert veilig en laat de actieve release staan. De reviewer controleert migratiebehoud, sitebrede snapshotconsistentie, mediaretentie, paden en taalscheiding. Back-up/restore vóór een echte klantimport blijft vereist vervolgwerk.
