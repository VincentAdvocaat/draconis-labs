# Engelse afbeelding per paginagebruik

Deze stap bouwt op PR31, commit `0bb3c0d063cd9ad92a3c2e8b46f06596f93caea6`. Alleen fictieve lokale gegevens. Portfolio binnen een EN-pagina blijft buiten scope.

## Gedrag

NL bepaalt asset, bestandsversie, blokvolgorde en decoratief gebruik. EN bewaart alleen eigen alt en bijschrift naast de bestaande tekstvelden. Een EN-revisie bewaart de exacte bronbeeldbinding en een retained mediareferentie. Er ontstaat geen kopie van het bronasset. Publicatie maakt zoals voorheen immutable releasebestanden.

Een gewijzigd bronbeeld, bestandsversie of decoratief gebruik maakt de EN-variant verouderd. De editor toont de actuele bron en vraagt expliciete bevestiging. Vertalingen blijven behouden. Een API-save vereist dan `confirmSourceChange: true` plus de actuele structuur en versie. Ook zonder gewijzigde tekst maakt bevestigen een opslaanbare wijziging.

Betekenisvol beeld vereist directe, niet-lege EN-alt. Decoratief beeld vereist expliciet de lege string. Ontbrekend en leeg blijven verschillend. Bijschrift mag ontbreken of leeg zijn en krijgt geen NL-fallback. EN kan geen asset, referentie of decoratieve eigenschap insturen.

Migratie 6 voegt nullable bronbinding- en mediarevisiekolommen toe. Bestaande tekststructuurhashes, EN-revisies en actieve releases blijven bruikbaar. Exacte revisiepreviews gebruiken hun opgeslagen beeldbinding. Een NL-only release behoudt de eerder gepubliceerde EN-versie. Een siterelease legt alle geselecteerde bindingen vóór de eerste async build vast. Rechten, hashes en de bestaande finale activatiegate blijven van toepassing.

## Verificatie

- Volledige API/component-suite na fixes: 150 tests groen. Shared-suite: 15 tests groen.
- Workspace typecheck, lint en build groen.
- Zes nieuwe API-tests bewijzen gescheiden NL/EN-alt en bijschrift, retained media, bronwijziging en expliciete bevestiging, oude previews/releases, async freeze, nullable velden, decoratieve alt, override-afwijzing, rechtenwijziging tijdens build en migratie van oude tekst-only EN.
- Componenttest bewijst bevestiging bij ongewijzigde vertalingen en de daadwerkelijke savepayload.
- Browser op poort 3025: echt synthetisch PNG geüpload, fictieve rechten expliciet vrijgegeven, NL- en EN-teksten ingevuld, EN-privatepreview en expliciete navigatie-/EN-publicatieselectie. Publieke EN-afbeelding toont eigen alt en bijschrift.
- Echte serverprocesherstart: actieve EN-pagina behoudt het gepubliceerde bijschrift, terwijl het later opgeslagen concept `Unpublished English caption after restart` afzonderlijk terugkomt. Runtime en screenshot staan uitsluitend in de genegeerde lokale fixturemap.

## Review en herstel

PR32 heeft een onafhankelijke alleen-lezen review door `/root/review_pr32`, GPT-6 Astra medium. Initiële remote head `fa2fe7e47db5bbb23ea916c1255a56b588721dad`. Twee noodzakelijke P2-editorfouten waren reproduceerbaar: verwerpen wiste de bronbevestiging niet; herstel na een gelijktijdige NL-bronwijziging bood alleen overname die lokale EN-invoer overschreef.

Fixsubagent `/root/fix_pr32_editor`, GPT-6.1 Sol low, verifieerde beide met rode echte-handlerregressies. Commit `491f0e1efd49551052ba10a876a23e7b7eba2f45` reset bevestiging bij verwerpen en biedt uitsluitend bij ongewijzigde EN-revisie een bronherstelactie met behoud van de lokale draft. Daarna blijft expliciete bevestiging nodig. Een echte gelijktijdige EN-revisiewijziging houdt de afzonderlijke overnamekeuze.

Herreview op die SHA sloot beide oorspronkelijke reproducties en vond een P2-grensgeval: het eerste EN-concept zonder opgeslagen revisie kreeg na bronherstel geen uitlijnknop, omdat de server dan needsUpdate false teruggeeft. Commit `cbf5c544902bb04a42ce7a336fbffa25c95b8c98` markeert geladen gewijzigde bron lokaal als uit te lijnen. Regressie bewijst version 0, behoud van dirty alt/bijschrift/body, toevoeging van nieuw bronblok en actuele structure met confirmSourceChange true. De 31 gerichte tests, CMS/API typecheck, lint en diffcheck slagen. De browser bevestigde de herstelroute voor een bestaande revisie met een werkelijk gewijzigd bronasset, zichtbare versie 2, behouden dirty caption en Save pas na bevestigen.

Volledige rapporten, gecontroleerde SHA's, reviewer-id en afsluitstatus staan in de PR-body. Afsluitende herreview op `cbf5c544902bb04a42ce7a336fbffa25c95b8c98` is akkoord. Reviewer draaide opnieuw 31 gerichte tests. Alle drie P2-bevindingen gesloten; geen resterende noodzakelijke bevindingen. Geen merge of deployment uitgevoerd.
