# Catalogus en afbeeldingenportfolio

Het oorspronkelijke ontwerp is van 19 november 2026. De onderstaande vervolgrapporten beschrijven de lokaal gerealiseerde proeven en hun grenzen.

De voorlopige aanname is dat een catalogus een herbruikbare collectie is met categorieën, metadata en detailpagina's. De gebruiker heeft geen shop of productcatalogus gedefinieerd. Prijzen, voorraad, checkout en betalingen vallen buiten dit voorstel.

Een beeldbibliotheek bewaart afbeeldingen en hun herkomst. Catalogusitems verwijzen naar die afbeeldingen. Een portfolio toont een selectie uit dezelfde bibliotheek, rechtstreeks of via catalogusitems. Een portfolio maakt geen eigen kopieën van originelen.

## Leeswijzer

- [Lokale inventarisatie](inventarisatie.md) onderscheidt bestaande code van voorstellen.
- [Ontwerp en modulecontract](ontwerp.md) beschrijft beheer, publicatie en verwijdergedrag.
- [Backlog en eerste bouwopdracht](backlog.md) bevat fasen, acceptatiecriteria, migratie en lokale uitvoering.
- [M0 contractproef](m0-proef.md), [M1 HTTP-upload](m1-upload.md) en [opgeslagen catalogusflow](catalogus-flow.md) beschrijven de daaropvolgende lokale implementaties en hun grenzen.
- [Snapshotbeheer en normale start](snapshotbeheer.md) beschrijft intrekken, audit en de eigen `catalogus start`-opdracht.
- [Gedeeld localecontract](content-locale-contract.md) en [kleine NL/EN-flow](locale-flow.md) beschrijven de handmatige taalvarianten en expliciete fallback.

## Afbakening en besluitvoorstel

Begin met een geïsoleerde lokale Labs-proef met fictieve sites. Gebruik contracten die later op het bestaande CMS kunnen aansluiten. Behoud de bestaande CMS-media-ID's bij een latere migratie. Bouw geen tweede productie-CMS en wijzig geen klantwebsite in deze fase.

CMS beheert paginatekst, revisies, drafts en releases. Media beheert bestanden, asset-ID's, versies en metadata. Catalogus beheert items en categorieën. CMS bewaart verwijzingen en gepinde catalogussnapshots. De categorieën voor catalogusitems zijn andere gegevens dan de bestaande CMS-categorieën voor pagina-editing.

Dit contract is rechtstreeks afgestemd met CMS-chat `01a1f49b-5ee0-7010-83f3-b62b8b94b041`. De canonieke bestandsversie heet `fileVersion`. Optionele bijschriften en uitsneden volgen later. De bronchat is `01a1f42a-5c9b-79a3-8d73-bf1e963939c4`.

Het verwachte effect is één upload voor meerdere toepassingen en reproduceerbare lokale website-export. De raming is 12 tot 20 werkdagen voor alle fasen, te herijken na de eerste werkende upload. Vertrouwen is gemiddeld: de bestaande media- en exportcode is bekeken, maar klantenmigratie en beeldverwerking zijn niet uitgevoerd.

Alle uitvoering blijft lokaal. Geen betaalde diensten, AI-API's, provisioning, deployment of merges. Een lokale ZIP bouwen is hier publicatievoorbereiding; online plaatsen vraagt een afzonderlijke opdracht.
