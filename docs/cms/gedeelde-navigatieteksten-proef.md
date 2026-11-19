# Bestaande publieke navigatieteksten redigeren

Deze eerste tekstcatalogusvertical maakt alleen bestaande bindings redactioneel: de toegankelijke naam van de taalkeuze en de taalnamen in haar links. Er is geen nieuwe zichtbare kop, footer, formulier of linkfunctie toegevoegd. De redacteur wijzigt gewone CMS-velden; hiervoor zijn geen SQL- of codewijzigingen nodig.

## Vaste identiteit en veldregels

| Vaste veld-ID | Redactie en publicatie |
| --- | --- |
| `navigation.languageLabel` | Rechtstreekse NL- en EN-waarden. De gekozen publieke paginalocale bepaalt de toegankelijke navigatienaam. Deze binding was al `aria-label`, geen zichtbare H2. |
| `navigation.locale.nl` | Bewerkbare Nederlandse endoniemtekst met vaste brontaal `nl`; link krijgt `lang=nl` en `hreflang=nl`. |
| `navigation.locale.en` | Bewerkbare Engelse endoniemtekst met vaste brontaal `en`; link krijgt `lang=en` en `hreflang=en`. |

De server accepteert uitsluitend deze getypeerde IDs en brontalen. Alle waarden zijn begrensd op 200 tekens. Null/ontbrekend en bewust leeg blijven in drafts onderscheiden. De gedeelde localevalidator vereist een rechtstreekse, niet-lege taalkeuzekop voor iedere opgenomen publieke locale en beide ingevulde endoniemen. Er is geen fallback. Gewoon getypte `<...>` en quotes mogen als tekst worden opgeslagen; de renderer encodeert tekst en attributen. Er is geen HTML-interpretatie of uitvoerbare tekstcatalogus.

## Migratie, revisies en keuze

Additieve migratie 5 maakt websitegebonden shared draftheads en immutable revisies. De oorspronkelijke labels Taal/Language en Nederlands/English vormen de compatibele draftbaseline. De migratie activeert niets en herschrijft geen oude releases, pagina's of mediabestanden. Heropenen maakt geen dubbele baseline. De oude publieke HTML blijft leesbaar.

Opslaan gebruikt de websiteversie met een IMMEDIATE-transactie en compare-and-swap. Bij een conflict blijft de lokale invoer staan tot bewuste overname van de actuele revisie. De redactie staat los van bedieningstaal en paginaconcepten.

De privépreview kiest expliciet de opgeslagen shared revisie/versie en een opgeslagen NL- of EN-documentrevisie. Zij gebruikt dezelfde tekstvalidatie en encoding als de release. De taalkeuzelinks in deze geïsoleerde preview zijn lokale ankers; ze beloven geen nieuwe publieke routes. De gekozen bronpagina en labels blijven onveranderlijk, ook wanneer inmiddels nieuwere drafts bestaan.

De volledige sitekeuze toont shared revisie-ID, versie en de concrete labelwaarden. Publiceren vereist het expliciete vinkje voor deze revisie. De server weigert ontbrekende selectie met 428 en een stale keuze met 409. De sitecapture legt pagina's, gekozen EN-varianten en shared inhoud in dezelfde CMS-transactie vast vóór asynchroon buildwerk. Nieuwe saves tijdens de build veranderen die release niet. Manifest en private snapshot registreren de shared revisie/versie. De finale bestaande media/catalogusrechten-gate blijft behouden.

Onvolledige gekozen labeltekst laat de vorige actieve release staan. Reeds gepubliceerde EN-pagina's gebruiken de gekozen nieuwe shared revisie bij een volgende volledige siterelease; hun vereiste EN-label mag daarom niet ontbreken. Eerdere immutable HTML en releasegebonden beelden blijven behouden. De proef heeft geen gedeelde revisieverwijdering of automatische cleanup.

## Normale browserflow en bewijs

Start `./scripts/start-cms-fixture.ps1 -Port 3024 -NoOpen`. Open een documentpagina, kies eventueel haar opgeslagen EN-variant en open **Navigatieteksten openen**. Bewerk de bestaande velden, sla op en kies **Gekozen navigatierevisie privé bekijken**. Haal daarna de volledige publicatieselectie op, beoordeel de labelwaarden en vink shared revisie en gewenste EN-update expliciet aan.

Browser op 3024: een NL-tekstpagina en handmatige EN-variant zijn opgeslagen. Via de gewone CMS-velden zijn de EN-navigatienaam `Choose your site language` en het endoniem `English (demo)` bewerkt. De privépreview en publieke EN-pagina tonen deze gekozen revisie. Een nieuwer concept met `Unpublished wording for later` blijft na een normale procesherstart opgeslagen, terwijl de publieke pagina de eerder gekozen labels behoudt. De toegankelijke navigatienaam is in de browserstructuur gecontroleerd; de zichtbare linktekst en publicatie zijn als screenshot vastgelegd. Bewijsbestanden en tokens blijven genegeerd.

Alle 138 API/componenttests slagen met twee workers; alle 15 shared-tests, typecheck, lint en workspacebuild slagen. Na het borgen van de shared-capability in de home-save-response zijn de vijf relevante API-scenario's opnieuw groen. Tests dekken echte migratie/reopen zonder activatie, oude releasebytes, exacte preview, encoding, stale/missing pins, incomplete EN met behoud actieve release, onafhankelijke schrijvers, rollen/sites, schema/sourceLocale, async pinning/idempotency en echte editorhandlers voor expliciete keuze/retry/conflict.

De onafhankelijke Astra-review volgt na gereedmaken van de PR. Alleen fictieve lokale gegevens; geen merge, deployment, extra engine of service. Volledige EN-image/portfolio-inhoud blijft open. Deze stap sluit uitsluitend de geïnventariseerde vaste navigatiebindings; andere echte templates vragen hun eigen bindinginventaris en redactionele aansluiting.
