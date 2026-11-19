# Nieuwe pagina's en getypeerde blokken

CMS-21 bouwt voort op de [uploadproef](upload-proef.md). Start vanuit deze worktree met `./scripts/start-cms-fixture.ps1 -Port 3019 -NoOpen` en open `http://127.0.0.1:3019`. Gebruik uitsluitend de lokaal gegenereerde testgegevens uit het genegeerde toegangsbestand.

## Redactie en publicatie

De paginaweergave kan een Nederlandse pagina aanmaken met een stabiele ID, unieke slug, SEO-titel en beschrijving. Een pagina bevat maximaal zestien getypeerde tekst- en beeldblokken, waaronder maximaal één beeldblok. De redacteur kan blokken toevoegen en verplaatsen. Beeldupload, geschoonde varianten, alt-tekst, decoratief gebruik en expliciete rechtenvrijgave gebruiken dezelfde mediaflow als de uploadproef.

Opslaan maakt een onveranderlijke revisie. Een save met een verouderde versie geeft 409 en bewaart de lokale invoer voor een expliciete keuze. De privépreview toont precies de opgeslagen revisie. Niet-opgeslagen wijzigingen moeten eerst worden bewaard.

Publiceren vraagt eerst een volledige paginaselectie op. De interface toont de gekozen revisies en versies; de server vergelijkt alle pagina's opnieuw in de snapshottransactie. Een ontbrekende selectie geeft 428, een gewijzigde selectie 409. De release bewaart alle gekozen inhoud en verwijzingen vóór de asynchrone build. Latere draftwijzigingen komen niet in die release. Een netwerkretry gebruikt dezelfde idempotencykey en dezelfde selectie.

De gepubliceerde home blijft `index.html`; nieuwe pagina's krijgen `<slug>.html`. Alleen veilige kleine ASCII-slugs zijn toegestaan. Gereserveerde route- en Windowsnamen en dubbele slugs worden geweigerd. Zodra een pagina eenmaal gepubliceerd is, staat de slug vast. Slugwijzigingen met redirects vragen een volgende opdracht.

## Opslag en behoud

De additieve migratie 3 maakt tabellen voor documentidentiteit, revisies en sitebrede snapshots. De bestaande home blijft in haar oorspronkelijke tabellen. Een kleine identiteitstabel koppelt haar aan de stabiele pagina-ID `home`; de snapshotadapter leest de bestaande inhoud. De migratie kopieert of herschrijft de home-inhoud, revisies en actieve releases niet.

Nieuwe revisies registreren mediareferenties bij de bestaande mediaopslag. De CMS-database bevat geen tweede assetbibliotheek. Gepubliceerde bestanden krijgen releasegebonden beeldpaden, met de pagina-ID voor nieuwe pagina's. Oude gepubliceerde beeldkopieën blijven via hun eigen releasepad beschikbaar. Revisies, referenties en releases worden niet automatisch opgeruimd.

Na alle bestandswrites en de laatste asynchrone hook valideert de release alle actuele rechten, exacte mediaversies en hashes opnieuw. Direct daarna activeert dezelfde lokale eigenaar synchroon de CMS-pointer met een versiecontrole. Deze proef claimt geen atomariteit met externe schrijvers of meerdere processen. De komende catalogusadapter moet haar eigen schrijfgrens expliciet afstemmen.

## Verificatie

Alle 89 API- en componenttests slagen, evenals workspace-typecheck, lint, build en `git diff --check`. De nieuwe tests dekken onder meer migratie van bestaande home en media, veilige en unieke slugs, schemavalidatie, blokvolgorde, HTML-encoding, tenantgrenzen, concurrente saves en activaties, volledige vastgelegde snapshots, idempotente retries en ingetrokken rechten vlak vóór activatie. De componenttests draaien de echte editorhandlers en controleren onder andere ongelezen nieuwere revisies en retries na een verloren antwoord.

De browserproef heeft een nieuwe pagina aangemaakt, twee tekstblokken verplaatst, een echte lokale PNG geüpload, rechten expliciet vrijgegeven en de hele site gepubliceerd. Daarna is een nieuwer paginaconcept opgeslagen en het serverproces via het normale script herstart. De home bleef behouden; het nieuwe concept en de oudere gepubliceerde pagina bleven afzonderlijk bestaan. De publieke pagina toont de gekozen volgorde, SEO-titel en geschoonde afbeelding. Bewijsscreenshots staan uitsluitend in de genegeerde lokale fixturemap.

Deze stap biedt nog geen volledige talenredactie, verwijderflow, redirectbeheer, portfolio/catalogusblok of productie-import. Er zijn maximaal 32 nieuwe pagina's per fixturewebsite. De runtime blijft lokaal en gebruikt fictieve inhoud.
