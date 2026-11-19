# PL-31/32 · Lokaal publiek boeken

Deze stap levert een publieke bezoekerspagina naast de bestaande lokale
medewerkersapp. Beide processen gebruiken hetzelfde expliciet gekozen
SQLite-bestand. Alle acceptatiegegevens zijn fictief. Cloudhosting, PostgreSQL,
e-mail, productiebeveiliging en eerdere releasevoorwaarden blijven open.

## Kanaal en publieke grens

De CLI maakt expliciet één actief kanaal per werkruimte met een willekeurige
UUID, naam en exacte website-origin. Er is geen automatisch standaardkanaal.
De zelfstandige publieke Fastify-entrypoint registreert uitsluitend health,
beschikbaarheid en reserveren. Privé-CRUD, API-keyfallback en documentatie-UI
zijn daar niet geregistreerd. De entrypoint bindt alleen aan loopback en eist
een bestaand expliciet databasepad.

De bezoekerspagina gebruikt een eigen Vite-entrypoint en een same-origin proxy
naar de publieke API. POST vereist JSON en de exacte kanaal-origin. Er zijn
geen sessiecookies of publieke CORS-toestemmingen. Een ontbrekende of vreemde
Origin weigert schrijven; beschikbaarheid zonder Origin blijft leesbaar.
De server vertrouwt geen doorgestuurde IP-headers. De lokale limiter bewaart
hoogstens 1.024 IP-buckets, met per minuut 60 lees- en 10 schrijfverzoeken.
Bij een volle actieve tabel worden nieuwe adressen geweigerd. De bodylimiet
is 8.192 bytes. Deze limiter geldt per proces en is geen productievoorziening
voor meerdere instanties.

Beschikbaarheid bevat alleen kanaalnaam, zone, datum, boekbaar klanttijdvak,
slot-ID en resterende capaciteit. Contactgegevens, interne aankomsttijd,
blokkaderedenen en private IDs ontbreken. Postcode, zone en horizon worden bij
reserveren opnieuw op de server gecontroleerd. De vijf postcodevoorbeelden
blijven uitsluitend de fictieve indeling uit PL-21/22.

## Schrijven, herhalen en bevestigen

Contact, afspraak met bron `public`, aanvraag, gebeurtenissen en receipts
vallen onder dezelfde SQLite-transactie en capaciteitsregels als handmatig
boeken. De sleutel en hash van de gevalideerde payload bepalen idempotentie:
dezelfde invoer geeft dezelfde bevestiging; gewijzigde invoer met dezelfde
sleutel geeft conflict. Een fout rolt ook het nieuwe contact terug.

Een onzekere response vergrendelt de invoer; opnieuw proberen gebruikt exact
dezelfde payload en sleutel. De onbevestigde aanvraag blijft alleen in het
geheugen van de pagina. Herstel van een onbevestigd formulier na afsluiten is
geen geleverde garantie. Na bevestiging bevat sessionStorage uitsluitend het
strikte publieke bevestigingsobject, zonder contactgegevens. De pagina toont
het klanttijdvak en een willekeurige referentie. Die referentie biedt geen
publiek opvraagpad voor persoonsgegevens. Er wordt geen e-mail verstuurd.

## Migratie en verificatie

Migratie 4 voegt kanaal-, aanvraag- en receipttabellen toe en staat bron
`public` toe. Bestaande ruwe afspraakvensters, gebeurtenissen en receipts
blijven behouden. De capaciteit- en blokkadeguards blijven actief. Een fout
tijdens migreren rolt ook de schemamarker terug. Dit is getest met de twee
SQLite-bindings 12.11.1 en 13.2.0.

- De volledige suite slaagt met 148 tests: 117 API, 13 ReactDOM, 7 core,
  5 shared en 6 desktop. Veertien nieuwe procesproeven testen echte
  onafhankelijke schrijvers: publiek tegenover medewerker en blokkade in
  beide volgordes, dezelfde sleutel, capaciteit twee en een commitfout.
- Typecheck, lint en build slagen. De bestaande Vite-bundelgroottewaarschuwing
  blijft staan. De private en publieke gecompileerde startup-smokes slagen;
  de publieke smoke boekt, herstart en herhaalt dezelfde HTTP-aanvraag.
- De eerste onbegrensde API-testrun overschreed setup-timeouts door gelijktijdige
  procesproeven. De betrokken tests slaagden afzonderlijk. Vier Vitest-workers
  begrenzen nu de vermenigvuldiging van subprocessen; de volledige suite is
  daarna groen. De werkelijke meervoudige schrijvers blijven behouden.
- De eerste echte publieke startup vond een te laat geregistreerde Fastify
  sluithaak. De entrypoint is aangepast en opnieuw via het gecompileerde
  proces inclusief herstart getest.
- Chrome heeft via de normale bezoekerscontrols in Noord geboekt op
  20 november 2026. De interne app toont twee van twee plekken bezet en bron
  Publieke boeking. De eerdere interne aankomsttijd 10:15 blijft behouden;
  de nieuwe publieke afspraak heeft geen interne aankomsttijd. Na API-herstart
  blijft de ochtend vol en toont de bezoeker dezelfde bevestiging na verversen.
  Voor deze proef is alleen een Backup-API-kopie van het eerdere eigen
  synthetische profiel gebruikt; de bronhash bleef gelijk.

Bewijs staat in `evidence/pl31-32-web.json`, `pl31-32-public.png` en
`pl31-32-staff.png`. De eerste interne Vite-ontwikkelpagina bleef leeg; de
boekingsacceptatie gebruikte daarom eerst de gebouwde app met expliciete
API-URL. De onafhankelijke review vond een gedeelde dependencycache van de
twee Vite-configuraties. Public gebruikt nu een aparte absolute `.vite-public`
cache. Daarna zijn beide ontwikkelpagina's tegelijk normaal geladen, inclusief
interne pagina verversen na publieke serverstart en herstart. Beschikbaarheid
bleef werken. Dit aanvullende bewijs staat in
`evidence/pl31-32-dev-private-after-public-restart.png`.
Startinstructies staan in [de demo](demo-lokaal.md).
Er is niets gemerged, gedeployd of publiek op het internet gezet.
