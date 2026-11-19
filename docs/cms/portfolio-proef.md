# Gepind portfolio in een CMS-pagina

Deze lokale proef voegt één portfolio-blok per documentpagina toe aan CMS21. De bestaande home blijft behouden. De pagina zelf blijft Nederlands; het portfolio-blok kan een vooraf gepubliceerde Nederlandse of Engelse catalogussnapshot gebruiken. Dit is geen volledige CMS-taleneditor.

## Browserflow

Start `./scripts/start-cms-fixture.ps1 -Port 3020 -NoOpen` vanuit deze worktree. Een nieuwe runtime krijgt uitsluitend de synthetische catalogusfixture met twee snapshots. Bestaande mediaroots worden niet opnieuw gevuld en bestaande rechten worden niet gewijzigd. De vaste proefafbeelding is één pixel. Deze fixture bewijst de integratie en beeldhash, niet de beeldkwaliteit van echte uploads.

Open een documentpagina en kies **Portfolio-snapshots ophalen**. De lijst toont snapshot-ID, checksum, gekozen locale en eventuele expliciete fallback. Kies een snapshot en sla het paginaconcept op. De privépreview gebruikt de gepinde snapshot en gehashte schone beeldbytes. Publiceer vervolgens de volledige paginaselectie zoals in CMS21. Een nieuwe cataloguspublicatie vervangt een bestaande blokkeuze nooit automatisch.

De server bepaalt de mediawebsite vanuit de geautoriseerde CMS-site. Een referentie naar een andere website, verkeerde checksum of afwijkende taalcontext wordt geweigerd. De CMS-revisie bevat alleen de referentie, checksum en taalcontext. De consumer bewaart de onveranderlijke broninhoud en retained referenties. Publieke HTML bevat alleen gerenderde velden en eigen gekopieerde derivatives; geen private originelen of opslagpaden.

## Release en herstel

De integratie gebruikt de onafhankelijk gereviewde consumer uit PR22 op `264ce99cfd76493d0e4851de13d8c56ec524f23d`, met gedeeld localecontract uit `ce7805d` en catalogusruntime uit `8eca799`. De zelfstandige catalogusapp is niet overgenomen.

Na de transactionele CMS-sitecapture maakt CMS alle releasepins synchroon aan vóór de eerste asynchrone buildhook. Iedere eigenaar bevat site, pagina, revisie, blok en attempt. De pins zijn vóór de build duurzaam in de mediaopslag; een gedeeltelijk mislukte voorbereiding geeft geen referenties vrij. De build materialiseert de gekozen snapshot en schrijft schone beelden met releasegebonden veilige bestandsnamen.

Na de laatste await controleert CMS de gewone mediablokken opnieuw. Vervolgens geeft CMS de volledige duurzame portfolio-pinset voor die site/attempt aan één finale consumer-gate. Deze controleert alle bronnen onder de media-IMMEDIATE-lock en roept precies één synchrone CMS-activatiecallback aan. Snapshotintrekking of rechtenblokkade tijdens de build voorkomt activatie. De vorige complete release blijft actief, inclusief haar onveranderlijke beeldroutes.

CMS en media hebben afzonderlijke databases. Ze zijn niet crash-atomair. Een CMS-commit gevolgd door een fout vóór de mediacommit kan een gepubliceerde CMS-release met prepared pins achterlaten. Bij heropenen zoekt de adapter de volledige pinset terug en laat `reconcile` de duurzame CMS-attemptstatus lezen. Alleen bewezen publicatie markeert pins activated. Unknown en niet-gepubliceerd blijven retained. Deze handeling publiceert niets opnieuw en verwijdert niets. Een bronintrekking haalt eerdere CMS-kopieën niet automatisch offline.

## Verificatie en grenzen

De volledige suite van 112 tests en workspace-typecheck, lint en build slaagden vóór de laatste aanvullende contracttest. Daarna slaagden alle vijf CMS-portfolio-integratietests. Deze testen NL/EN-keuze, private preview, schone bytes en publicatie, retained pins, heropenen, afgewezen site/checksum/context, blokkade en intrekking tijdens de build, en herstel van de administratieve crashgap na een echte CMS-commit. De overgenomen consumer-tests testen ook een daadwerkelijke child-process-exit in die gap.

Browserbewijs op poort 3020: een tekstpagina opgeslagen, Engelse snapshot met Nederlandse beschrijvingsfallback geselecteerd, privé bekeken en als volledige site gepubliceerd. Na een normale procesherstart blijven home en portfolio-publicatie beschikbaar. De screenshots en runtimegegevens blijven in de genegeerde fixturemap. Een afzonderlijke onafhankelijke integratiereview volgt op de PR.

Geen klantdata, betaalde diensten, merge of deployment. Productiecatalogi, extra bloktypes, automatische synchronisatie en volledige talenredactie vallen buiten deze stap.
