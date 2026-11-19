# Beheerde catalogus voor vaste publieke tekst

Dit is een ontwerp en inventaris, geen nieuwe runtime. Het gebruikersdoel blijft dat alle bestaande websitetekst centraal via het CMS bewerkbaar wordt. Code bepaalt veilige bindings en schemas; redacteuren beheren de tekst en taalvarianten.

De eerste afzonderlijke vertical is inmiddels gerealiseerd en onafhankelijk gereviewd in [de navigatietekstenproef](gedeelde-navigatieteksten-proef.md). Onderstaande tabel blijft de oorspronkelijke inventaris en ontwerpkeuze documenteren.

| Aangetroffen publieke binding | Huidige eigenaar | Beoogde redactie/publicatie |
| --- | --- | --- |
| Paginatitel, SEO, tekstblokken | NL-documenten en EN-localerevisies | Bestaande page-ID, immutable revisies en expliciete sitekeuze behouden. |
| Navigatiepaginanamen | Paginatitels uit geselecteerde locales | Blijven bestaande redactionele paginavelden; geen extra UI-key als bron. |
| Taalkeuzekop Taal/Language | CMS-documentrenderer | Shared contentveld `navigation.languageLabel` per locale. |
| Taalnamen Nederlands/English | CMS-documentrenderer | Shared velden `navigation.locale.nl` en `navigation.locale.en`, met expliciete brontaal voor endoniemen. |
| Portfolio-kop en lege staat | CMS-portfolio-blokrevisie | Bestaande redactionele localevelden behouden. Oude compatibilitywaarden horen bij oude revisies, niet bij nieuwe vertaalkeys. |
| Catalogustitel/beschrijving/alt | Gepinde catalogussnapshot en per-use media | Bron blijft catalogus/media; geen duplicerende CMS-bibliotheek. |
| Footer, formulieren en overige linklabels | Niet aanwezig in deze lokale renderer | Pas inventariseren en binden wanneer een echte template ze bevat. Geen nieuwe functies of voorbeeldlabels toevoegen. |

## Eerste afzonderlijke runtimevertical

Een volgende opdracht kan de bestaande taalkeuzekop en taalnamen als klein shared-contentrecord redigeerbaar maken. Geef ieder veld een vaste identiteit met omschrijving, schema-eigenaar, defaultLocale, ondersteunde locales en directe/fallbackregel. De editor toont ontbrekend, expliciet leeg en eigen waarde. Vereiste navigatielabels bestaan rechtstreeks voor de gekozen publieke locale; geen stilzwijgende fallback. Endoniemen krijgen een expliciete taalmarkering.

Voeg een genummerde additieve migratie toe voor een shared drafthead en immutable revisies. Een save gebruikt versie-CAS. De privépreview combineert de expliciet gekozen shared revisie met een paginarevisie en toont bronlocale/ontbrekend-diagnostiek. De volledige siterelease selecteert en pint de shared revisie vóór async werk, net zoals pagina's. Nieuwe drafts wijzigen geen actieve publicatie. Oude releases houden hun al gerenderde tekst; een compatibiliteitsadapter behoudt bestaande labels bij upgrade zonder oude immutable records te herschrijven.

Acceptatie omvat twee websites, NL/EN, leeg/ontbrekend, conflicterende saves, HTML-escaping, expliciete selectie, late drafts tijdens build, incomplete labels met behoud van de vorige release en herstart. Alleen de bestaande bindings worden vervangen. De CMS-bediening behoudt eigen getypeerde UI-keys en gebruikt deze shared records niet als authenticatie- of systeemmeldingen.

Volledige EN-image/portfolio-inhoud blijft apart: per-use alt/bijschrift, expliciete bloktaal en CatalogRef/checksum/context moeten binnen dezelfde rechten-, retentie- en activatiegrens blijven. Daarvoor komt geen tweede vertaalengine, assetopslag of automatische vertaling.
