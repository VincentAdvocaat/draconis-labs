# Engelse afbeelding per paginagebruik

Deze stap bouwt op PR31, commit `0bb3c0d063cd9ad92a3c2e8b46f06596f93caea6`. Alleen fictieve lokale gegevens. Portfolio binnen een EN-pagina blijft buiten scope.

## Gedrag

NL bepaalt asset, bestandsversie, blokvolgorde en decoratief gebruik. EN bewaart alleen eigen alt en bijschrift naast de bestaande tekstvelden. Een EN-revisie bewaart de exacte bronbeeldbinding en een retained mediareferentie. Er ontstaat geen kopie van het bronasset. Publicatie maakt zoals voorheen immutable releasebestanden.

Een gewijzigd bronbeeld, bestandsversie of decoratief gebruik maakt de EN-variant verouderd. De editor toont de actuele bron en vraagt expliciete bevestiging. Vertalingen blijven behouden. Een API-save vereist dan `confirmSourceChange: true` plus de actuele structuur en versie. Ook zonder gewijzigde tekst maakt bevestigen een opslaanbare wijziging.

Betekenisvol beeld vereist directe, niet-lege EN-alt. Decoratief beeld vereist expliciet de lege string. Ontbrekend en leeg blijven verschillend. Bijschrift mag ontbreken of leeg zijn en krijgt geen NL-fallback. EN kan geen asset, referentie of decoratieve eigenschap insturen.

Migratie 6 voegt nullable bronbinding- en mediarevisiekolommen toe. Bestaande tekststructuurhashes, EN-revisies en actieve releases blijven bruikbaar. Exacte revisiepreviews gebruiken hun opgeslagen beeldbinding. Een NL-only release behoudt de eerder gepubliceerde EN-versie. Een siterelease legt alle geselecteerde bindingen vóór de eerste async build vast. Rechten, hashes en de bestaande finale activatiegate blijven van toepassing.

## Verificatie

- 146 API/componenttests en 15 shared-tests groen.
- Workspace typecheck, lint en build groen.
- Zes nieuwe API-tests bewijzen gescheiden NL/EN-alt en bijschrift, retained media, bronwijziging en expliciete bevestiging, oude previews/releases, async freeze, nullable velden, decoratieve alt, override-afwijzing, rechtenwijziging tijdens build en migratie van oude tekst-only EN.
- Componenttest bewijst bevestiging bij ongewijzigde vertalingen en de daadwerkelijke savepayload.
- Browser op poort 3025: echt synthetisch PNG geüpload, fictieve rechten expliciet vrijgegeven, NL- en EN-teksten ingevuld, EN-privatepreview en expliciete navigatie-/EN-publicatieselectie. Publieke EN-afbeelding toont eigen alt en bijschrift.
- Echte serverprocesherstart: actieve EN-pagina behoudt het gepubliceerde bijschrift, terwijl het later opgeslagen concept `Unpublished English caption after restart` afzonderlijk terugkomt. Runtime en screenshot staan uitsluitend in de genegeerde lokale fixturemap.

Onafhankelijke review volgt op de gereedgemaakte PR. Geen merge of deployment uitgevoerd.
