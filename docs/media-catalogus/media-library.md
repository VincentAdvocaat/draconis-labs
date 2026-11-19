# Lokale assetbibliotheek

Gebouwd vanaf de vaste gezamenlijke PR 37-basis `fc43090d0f90892df97d7e033bef66b772c81aa8`. Geen migraties, dependencies of CMS-wijzigingen. Start normaal via `catalogus start -Port 0`; de beheerpagina `/catalogus` heeft een bibliotheek naast de bestaande expliciete asset/fileVersion-selectie.

De bibliotheek zoekt alleen op de bestaande asset-ID. Er is geen opgeslagen bestandsnaamzoekfunctie. Rechten filteren de asset; de verwerkingsstatusfilter gebruikt uitsluitend de hoogste fileVersion. Een resultaat is één asset. Detail toont alle bestandsversies met status/dimensies, actuele rechten en retained gebruik als kind/eigenaar/versie/slot. Historische revisies en releases blijven zichtbaar. Bladeren, filteren, detail en preview wijzigen geen itemvelden, rechten, alt/decorative of referenties. De bestaande selectielijst blijft de expliciete versiekeuze voor een item.

## Read-only API

Beide nieuwe GET-routes gebruiken dezelfde private token-/origin-/websitegrens als de catalogus-app:

- `/catalogus/api/:site/library?q=<asset-ID>&rights=unknown|cleared|blocked&state=ready|processing|failed&offset=0&limit=10` retourneert items, total, offset en limit. Rechten/status zijn optioneel; limit is 1–50 en offset 0–1000000.
- `/catalogus/api/:site/library/:asset` retourneert veilige assetmetadata, alle versies en retained gebruik. Geen private originelen, opslagpaden, hashes of rechtenauditinhoud. Gearchiveerde assets ontbreken in de lijst, maar hun bekende detail blijft websitegescheiden beschikbaar voor historische administratie.

De lijst sorteert binair op unieke asset-ID. Total en rows komen uit dezelfde readtransactie. Dit is gewone live-offsetpaginering: een insert vóór de huidige pagina kan bij het volgende verzoek een resultaat verschuiven/herhalen. Het is geen bevroren exportsnapshot. Verversen begint op offset 0; filters en zoekwijzigingen resetten de pagina. Een lege latere pagina kan terugnavigeren. In WAL-modus mogen writers tussen de reads committen, terwijl beide reads dezelfde snapshot behouden; in rollbackmodus kan de reader de writer kort blokkeren.

Een detailpreview gebruikt de bestaande private previewroute en uitsluitend ready schone derivatives. De nieuwste status is geen rechtenvrijgave. Onbekende/geblokkeerde rechten blijven publicatie verhinderen. De UI verwerpt oude lijst/detail/previewresponses na nieuwere requests, typen, sluiten of websitewissel en herstelt na details sluiten de focus op de oorspronkelijke knop.

## Controle

`tests/media-library.test.ts` controleert paginagrenzen, stabiele volgorde, zoek/filtervalidatie, nieuwste versus oude versie, website-/token-/origin-/methodgrenzen, ready-preview, retained gebruik, detail zonder opslagpaden, read-only geopende database en coherente rows/total bij een echte concurrente WAL-insert. `tests/media-library-ui.test.ts` draait het echte beheerscript en controleert verouderde responses, filters/page-reset, dirty NL/EN-velden, expliciete assetselectie, fout/lege staat en toetsenbordfocus. De bestaande catalogus-/CMS-tests blijven regressiecontrole.

Lokale browserproef uitsluitend met synthetische fixtures: 12 echte HTTP-uploads plus vier basisassets gaven 16 resultaten verdeeld over twee pagina's. Rechten/latest-readyfilter en asset-IDzoekvraag leverden één vrijgegeven asset. Detail toonde de schone WebP/PNG-varianten en historische revisie-/releaseverwijzingen. Onopgeslagen NL/EN-titels en de geselecteerde fileVersion bleven behouden; Enter op sluiten herstelde focus. Na echte CLI-stop/herstart met dezelfde fixture bleven assets, item en EN-snapshot met expliciete NL-beschrijvingsfallback behouden. Het bewijsbeeld staat bij de chatoplevering; geen klantdata gebruikt.

Dit levert de afgesproken lijst-/detailflow. Nieuwe versies uploaden/beheren, batch, tags, credits, lightbox en productie-identiteit vallen buiten deze stap.
