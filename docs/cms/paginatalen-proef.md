# Handmatige EN-variant van een tekstpagina

CMS22 begint met een bestaande Nederlandse documentpagina met uitsluitend tekstblokken. De redacteur opent **English bewerken** en vult handmatig titel, slug, SEO-titel/beschrijving en bloktekst in. De pagina-ID en tekstblok-ID's blijven dezelfde. Deze proef gebruikt geen vertaalservice. De CMS-bediening blijft grotendeels Nederlands; UI-locale en inhoudstaal zijn afzonderlijke criteria.

## Opslag, structuur en behoud

Additieve migratie 4 maakt localeheads, immutable localerevisies en een expliciete NL-standaardconfiguratie. De bestaande home en NL-documenttabellen blijven de schrijfbron voor NL. De migratie herschrijft geen eerdere revisies of releases. EN krijgt een eigen versie en compare-and-swapcontrole. Het slugschema normaliseert naar kleine ASCII-kebabnamen; een echte databaseconstraint bewaakt unieke `(website, locale, slug)`-waarden. De opslag weigert niet-genormaliseerde hoofdletters. Namen zoals `en`, `index`, API-paden en Windows-reserveringen worden als nieuwe slugs geweigerd.

Iedere EN-revisie legt de NL-blokstructuurfingerprint vast. Deze bevat de stabiele blok-ID's, types en volgorde, niet de Nederlandse tekst. Een gewone NL-tekstwijziging overschrijft geen EN-vertaling. Een gewijzigde structuur maakt EN zichtbaar 'bijwerken nodig'. De redacteur kiest bewust **EN-blokstructuur bijwerken**; bestaande vertalingen met dezelfde ID blijven staan en nieuwe blokken beginnen ontbrekend. Opslaan en publicatie vergelijken de actuele fingerprint binnen de CMS-transactie. Een conflict bewaart de lokale invoer tot expliciete overname van de actuele versie.

EN ondersteunt hier alleen tekstblokken. Afbeeldingen en portfolio worden niet stilzwijgend verwijderd of vertaald. De editor legt de beperking uit en de server weigert die EN-write of nieuwe EN-publicatie. NL blijft via de bestaande flow publiceerbaar. Verdere ondersteuning voor vertaalde beelden, portfolio en home is vervolgwerk.

## Taal- en publicatiematrix

| Veld/handeling | Regel |
| --- | --- |
| EN-titel, slug, SEO-titel en iedere bloktekst | Rechtstreeks ingevuld in EN en niet leeg/whitespace voor preview en publicatie. Gedeelde localevalidator; geen NL-fallback. |
| EN-blokkop en SEO-beschrijving | Optioneel. Ontbrekend en bewust leeg blijven afzonderlijk opgeslagen; rendering geeft dan lege tekst, geen NL-inhoud. |
| Nieuw EN-concept | Alleen opslaan maakt nog geen publieke route. De publicatieselectie vereist een expliciet vinkje voor die revisie/versie/structuur. |
| Eerder gepubliceerde EN-variant | De selectie toont dat deze behouden blijft. Een NL-publicatie draagt de eerder gekozen immutable EN-publicatie over als het nieuwe EN-concept niet geselecteerd is. Zo verwijdert een onvolledige EN-draft geen bestaande route. |
| Structuur gewijzigd | Nieuwe EN-publicatie geweigerd tot bewuste uitlijning en volledige tekst. De bestaande EN-publicatie kan behouden blijven terwijl NL wordt gepubliceerd. |
| Slug tijdens/na publicatie | Vast binnen de locale zodra een building/published snapshot de variant bevat. Redirects en verwijderen blijven apart werk. |

NL houdt `/sites/<site>/<slug>.html`; EN krijgt `/sites/<site>/en/<slug>.html`. De renderer schrijft `html lang="en"`, Engelse SEO en navigatie met alleen geselecteerde of eerder behouden EN-pagina's. De taalkeuze linkt dezelfde page-ID via de endoniemen Nederlands en English met passende `lang`/`hreflang`. Het navigatielabel is Taal of Language. Servergegenereerde absolute links voorkomen fouten door de extra EN-padlaag. Manifestbestanden bevatten pagina-ID, locale, revisie en versie; snapshots bevatten de volledige gekozen tekst. Oude releasegebonden beelden blijven beschikbaar.

## Bewijs

Alle 123 API/componenttests en 15 shared-tests slagen. Typecheck, lint en build slagen. Nieuwe tests controleren NL-behoud, vaste ID's, SEO/HTML-taal/nav, alleen expliciet gekozen EN, null/leeg/incompleet, behoud van oudere EN bij NL-publicatie, onafhankelijke databasewriters en unieke slugs, veilige routes, sitegrenzen, structuurconflict/uitlijning, nieuwere EN-draft tijdens build en EN-slugfreeze. Een echte componenthandlertest controleert dat een conflict lokale EN-invoer behoudt tot bewuste overname.

De normale browserproef op 3022 heeft een NL-tekstpagina opgeslagen, haar EN-variant handmatig ingevuld, privé bekeken en expliciet meegepubliceerd. De publieke taalkeuze leidt naar de Engelse route met Engelse SEO, tekst en navigatie. Na normale procesherstart blijven `lang=en`, SEO-beschrijving en publicatie behouden. Screenshots en runtime blijven uitsluitend in de genegeerde fixturemap.

De onafhankelijke review en gerichte herreview zijn gesloten op codecommit `f95389882d7b69d246f66070dec1d37c81123c56`. Eén gevonden P2-regressie is hersteld: een reeds gepubliceerde NL-slug `en` mag ongewijzigd blijven bij tekstbewerking. Nieuwe pagina's en hernoemingen naar deze gereserveerde slug blijven geweigerd. De extra upgradefixture test opslag vóór migratie 4, heropenen, tekstsave en herpublicatie op `/en.html`. De zestien relevante tests slagen bij implementatie en herreview; het API-totaal is daarmee 124. Er zijn geen noodzakelijke bevindingen meer open.

Start vanuit de worktree met `./scripts/start-cms-fixture.ps1 -Port 3022 -NoOpen`. Alleen fictieve lokale gegevens. Geen merge, deployment, klantimport of brede editorrefactor. De [acceptatiematrix](acceptatiematrix.md) houdt volledige CMS-i18n, shared publieke labels, andere bloktypen en productiecriteria open.

## Extra taal in de privépreview

Zet bij een bestaande lokale fictieve CMS-proef de volgende eigenschap in `server/api/data/cms-fixture/local-config.json`. Herstart daarna de proef. Gebruik alleen de websitesleutel van de gewenste fixture. Laat `fallbackLocale` weg om uitsluitend rechtstreeks ingevulde Duitse tekst te tonen.

```json
"localePreviews": {
  "demo-cms": { "locale": "de", "fallbackLocale": "nl" }
}
```

Open een opgeslagen pagina met gewone tekstblokken. **Duitse privépreview** toont titel, slug, SEO-velden en tekst per blok. Leegmaken na invoer geeft bewust lege tekst. Met **Markeer als ontbrekend** kan de preview Nederlandse terugvaltekst tonen, als die website daarvoor is geconfigureerd. De status geeft aan welke Duitse velden rechtstreeks moeten worden ingevuld en welke verplichte Nederlandse bronvelden leeg zijn. Terugvaltekst in de HTML krijgt `lang="nl"`.

De API geeft de instelling terug via `GET /api/v1/cms/websites/<website>/pages/home`. Stuur voorlopige tekst, blok-ID’s en `expectedVersion` naar `POST /api/v1/cms/websites/<website>/documents/<pageId>/locale-previews/de`. Het antwoord bevat de HTML en diagnose. Een verouderde paginaversie krijgt 409. Het websitegebonden token blijft vereist.

Deze proef bewaart de Duitse invoer in het geopende formulier. Een volgende stap voor Duitse publicatie moet revisieopslag, slugs, navigatieteksten, beeld-alt en de releasekeuze vastleggen. De Nederlandse en Engelse routes volgen de bestaande publicatiecontracten.
