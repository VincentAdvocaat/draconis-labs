# Backlog voor de serviceplanner

Voorgestelde werkvolgorde bij het [ontwerp](ontwerp.md), 19 november 2026. Elke rij kan als Story met bijbehorende Tasks naar Azure Boards. De sleutels in de eerste kolom zijn verwijzingen binnen dit document.

## Aansluiting op Azure Boards

GitHub bevat code, ontwerp en PR's. Azure DevOps blijft eigenaar van de uitvoeringsbacklog en CI. De [projectafspraken](../azure/ado-github-integration.md) en de [backlog in de onderzochte GitHub-main](../../scripts/backlog-data.json) gebruiken epics, features, stories en tasks. Het uitlezen van de actuele Azure Boards-items is via de beschikbare accounts niet gelukt. De kruistabel gebruikt daarom de codes uit de GitHub-versie. Controleer de actuele titel, status, hiërarchie en echte AB-nummers bij overname. Breid bestaande stories uit wanneer die het werk al dekken. [Azure Boards](https://dev.azure.com/vadvocaat/Draconis-labs/_backlogs/backlog).

| Bestaande code | Samenloop |
| --- | --- |
| E1 Planner product experience | Huidige taakinteractie en planning leveren de regressiebaseline. Serviceafspraken krijgen eigen stories. |
| E2 Platform architecture and contracts | Gebruik v1, contracttests, UI en bestaande compositie. Verdeel nieuw werk alleen waar lokale en gehoste uitvoering dat vragen. |
| E3 Central identity and security | Gebruik E3.F1.S1/S2 voor OIDC en sessies, E3.F2.S1 voor rollen en E3.F2.S2 voor agentkeys. Voeg de Planner-specifieke acceptatiegevallen toe. |
| E5 Data platform and reliability | Gebruik E5.F1.S1/S2 voor versiebeheer en managed Postgres, E5.F2.S1/S2 voor integriteit en herstel en E5.F2.S3 voor gegevenslevenscyclus. |
| E6 Testing, accessibility and performance en E7 CI/CD, cloud and observability | Breid de bestaande kwaliteits- en releasepoorten uit met PostgreSQL-tests, Windows-installer, herstelproef en pilotmonitoring. |
| E9 PWA and desktop distribution | Verbreed E9.F2.S1 tot een keuzeproef voor Tauri en Electron. E9.F2.S2 is de plek voor de gekozen installer en updateketen. PWA-werk uit E9.F1 is onafhankelijk van deze oplevering. |
| E4 AI REST and MCP platform en E8 Homescreen and app ecosystem | Behoud agent-REST voor taken. MCP, appcatalogus en een generiek plug-inmodel zitten buiten de afhankelijkheden van deze backlog. |

Prioriteit **P0** is vereist voor de eerste verticale oplevering. **P1** volgt na acceptatie daarvan. **P2** is latere uitbreiding met een expliciet beslismoment. Binnen een fase bepaalt de afhankelijkhedenkolom welke stories tegelijk kunnen lopen.

## Fase 0 · Bewijs en beslissingen

| Story | Prioriteit · vereist | Uitvoering en acceptatie |
| --- | --- | --- |
| PL-01 · Taakbaseline | P0 · start | Zet fictieve SQLite-fixtures op voor het oude en actuele taakschema. Leg veldwaarden, API-responses inclusief legacy-headers, recurrence, zichtbare sortering en acceptatiescenario's vast. **Gereed als** de huidige v1-suite én de genoteerde taakscenario's op de gekozen baseline reproduceerbaar zijn. |
| PL-02 · Windows-keuzeproef | P0 · start | Verpak dezelfde minimale React-weergave met typeveilige lokale SQLite-write in Electron en toets de Tauri-sidecarvariant uit E9.F2.S1. Meet pakketgrootte en koude start op dezelfde schone Windows x64-VM. Registreer ABI of sidecar-lifecycle, per-user installatie, offline eerste start, tweede versie met behouden SQLite-record, browserlogin, veilige tokenopslag en signing-/updatepad. **Gereed als** één ADR de keuze, meetresultaten en eventuele harde blokkades bevat. |
| PL-03 · Cloud- en identitykeuzes | P0 · start | Beproef webaanmelding en systeembrowserlogin met een OIDC-provider tegen één test-API. Test accountkoppeling, verlopen token en afmelden. Valideer regio, kostenklasse, ontvangende PostgreSQL-omgeving, secretbeheer en hersteldoelen binnen E3/E5/E7. **Gereed als** het gekozen proefaccount dezelfde werkruimte bereikt via web en Windows en de eigenaar de hosting- en herstelkeuzes heeft vastgelegd. |
| PL-04 · Productregels voor de pilot | P0 · start | Leg werkruimtetijdzone, dagdelen, boekingshorizon, toegestane statustransities en rolgrenzen vast. Maak fictieve demo-contacten en een vast scenario met een geblokkeerde ochtend. **Gereed als** het scenario de eerste versie doorloopt zonder echte klantgegevens en productkeuzes uit het ontwerp expliciet testbaar zijn. |

**Fasegrens.** De baseline is reproduceerbaar. De desktopruntime, identityprovider en productregels zijn vastgelegd. Hosting en hersteldoelen zijn besloten voordat een cloudpilot opent.

## Fase 1 · Werkende Planner in web en Windows

| Story | Prioriteit · vereist | Uitvoering en acceptatie |
| --- | --- | --- |
| PL-11 · Core en transport | P0 · PL-01, PL-02 | Maak compositie injecteerbaar. Geef de React-app een getypeerde client. Zet gedeelde taak-use-cases en SQLite-adapter achter de gekozen transportgrens en leg contractgevallen vast. **Gereed als** HTTP en desktop dezelfde taak toewijzen, verplaatsen en teruglezen en het OpenAPI-snapshotverschil verklaard is. |
| PL-12 · Werkruimten en toegang | P0 · PL-03, PL-11 | Implementeer sessies en desktop-access tokens, lidmaatschap, eigenaar/planner en ingeperkte agentkeys. Test met twee werkruimten per lees- en schrijfrichting, inclusief taak-ID, historie, zoekopdracht en voorkeuren. **Gereed als** een anonieme client geen privédata kan lezen, een gebruiker of agent nooit buiten zijn werkruimte handelt en uitloggen de cloudtoegang beëindigt. |
| PL-13 · Schema's en takenmigratie | P0 · PL-01, PL-11, PL-12, PL-04 | Lever genummerde dialectmigraties, SQLite-snapshot/import en Postgres dry-run via E5. Voer een onderbroken import opnieuw uit, vergelijk aantallen, IDs, relaties, posities, voorkeuren, herhaling en versies. **Gereed als** bij de twee fixtures alle ondersteunde taken door de bestaande UI en API bereikbaar blijven en aantoonbaar alleen de toegewezen werkruimte toegang krijgt. |
| PL-14 · Relaties | P0 · PL-11, PL-12, PL-13 | Implementeer contact aanmaken, aanpassen, zoeken, archiveren en een klantkaart. **Gereed als** een tweede aanvraag de bestaande klant kan vinden en een gearchiveerde klant uit nieuwe selectie verdwijnt terwijl de klantkaart beschikbaar blijft. |
| PL-15 · Afspraak, dagdeel en blokkade | P0 · PL-04, PL-11, PL-13, PL-14 | Bouw dagdeelbeschikbaarheid en handmatig aanmaken, verplaatsen, afronden, annuleren, blokkeren en vrijgeven. Gebruik de gedeelde slottransactie, verplichte afspraakversie, idempotente commando's en afspraakgebeurtenissen. **Gereed als** op beide databases dubbele reservering faalt, blokkeren tegen reserveren één geldige uitkomst geeft, een versieconflict zichtbaar is en een mislukte verplaatsing het bronslot intact laat. |
| PL-16 · Werkruimtekiezer en dagelijks gebruik | P0 · PL-12, PL-14, PL-15 | Voeg Afspraken en Relaties naast Taken toe. Koppel op de klantkaart komende en historische afspraken, ook voor gearchiveerde contacten. Maak de actieve opslagmodus zichtbaar en herstel na netwerkverlies. Test toetsenbordbediening, laad-/foutstatus, tijdzonegrenzen en dezelfde flow in de browser en Windows. **Gereed als** Windows offline kan starten en lokaal schrijven, web en Windows in cloudmodus dezelfde werkruimte lezen, en de bestaande takenflow volledig slaagt. |
| PL-17 · Installatie en herstel | P0 · PL-02, PL-13, PL-16 | Bouw en onderteken de Windows x64-installer. Lever een per-user installatietest, upgrade met database, lokale back-up en herstel, cloud-PITR-oefening en API-versiematrix. Laat geplande automatische updates pas aanstaan na test van de gekozen trustketen. **Gereed als** installatie en herstel op een schone machine lukken, herinstallatie of upgrade volgens de gedocumenteerde procedure geen afspraken verliest, en cloudherstel de afgesproken doelen haalt. |
| PL-18 · Acceptatie van de verticale versie | P0 · PL-16, PL-17 | Demonstreer in Windows lokaal zonder internet en vervolgens aan dezelfde cloudwerkruimte in web en Windows. Gebruik de fixtures voor taakbehoud, een terugkerende klant, twee verschillende tijdvelden, een volle ochtend, verplaatsen, annuleren en heropenen na herstart. **Gereed als** de volledige matrix hieronder slaagt en het hersteldraaiboek doorlopen is. |

| Acceptatiegeval | Web cloud | Windows cloud | Windows lokaal |
| --- | --- | --- | --- |
| Start, werkruimtekeuze en opslagindicatie | Aangemeld, cloud zichtbaar | Systeembrowserlogin, cloud zichtbaar | Zonder netwerk/account, lokaal zichtbaar |
| Klant opzoeken, plannen, verplaatsen, afspraak afronden/annuleren | Duurzaam in PostgreSQL | Duurzaam en ook in web zichtbaar | Duurzaam na afsluiten en opnieuw starten |
| Onbeschikbaar dagdeel en verouderde versie | Duidelijk foutbericht en verversen | Zelfde foutcode en vervolgactie | Zelfde foutcode via IPC |
| Klanttijdvak en interne aankomsttijd | Onafhankelijke zichtbare velden voor medewerkers | Zelfde waarden | Zelfde waarden |
| Verbindingsverlies | Cloudfout en retry | Cloudfout, retry, geen automatische lokale write | Handelingen blijven bruikbaar |
| Migratie en herstel | v1-compatibiliteit, migratie- en herstelproef | Werkruimte heropenen na release | N-1 naar N, snapshot terugzetten, gegevens gecontroleerd |

## Fase 2 · Zones en grotere capaciteit

| Story | Prioriteit · vereist | Uitvoering en acceptatie |
| --- | --- | --- |
| PL-21 · Werkgebieden | P1 · PL-18 | Voeg vijf fictieve zones en postcode-toewijzing toe als demo. Modelleer het oude impliciete werkgebied als blijvende standaardzone en migreer bestaande slots daarop. **Gereed als** een onbekende of dubbel geconfigureerde postcode een duidelijke uitkomst heeft en bestaande afspraken hun tijdvak en relatie behouden. |
| PL-22 · Roosters en capaciteitsuitzonderingen | P1 · PL-21 | Materialiseer slots per zone/datum/dagdeel op basis van standaardrooster en uitzonderingen. Werk publicatie en bezettingslezing bij. **Gereed als** twee van drie gelijktijdige pogingen winnen bij capaciteit twee, een verlaging onder bezetting atomair faalt, en blokkades alleen de gekozen zone en het gekozen tijdvak raken. |

**Fasegrens.** Een medewerker kan in de demo in alle vijf zones boeken. Dezelfde capaciteitsregels zijn bewezen voor meerdere gelijktijdige schrijvers.

## Fase 3 · Publiek boeken

| Story | Prioriteit · vereist | Uitvoering en acceptatie |
| --- | --- | --- |
| PL-31 · Publiek kanaal en tijdvakken | P1 · PL-22 | Voeg beheer van één actief kanaal per pilotwerkruimte en onpersoonlijke beschikbaarheidsresponses toe. Valideer zone/postcode, horizon en rate limits aan de serverkant. **Gereed als** publieke lijstopvraging alleen boekbare klanttijdvakken toont en tests expliciet uitsluiten dat interne aankomsttijd, route, blokkadereden of klantgegevens naar buiten gaan. |
| PL-32 · Reservering en bevestiging | P1 · PL-31 | Gebruik de afspraak-use-case met publiek actorcontext, idempotentie en bevestigingsreferentie. Kies in deze story of e-mail onderdeel van de pilot is. Als die aan staat, gebruik dan een transactionele outbox en begrens herpogingen. **Gereed als** twee browsers en een medewerker nooit dezelfde laatste plek bevestigd krijgen, herhaling dezelfde referentie geeft, volle slots een keuze voor een ander slot aanbieden en een eventuele e-mail geen interne planning bevat. |

**Fasegrens.** Een bezoeker kan één afspraak afronden. Een medewerker ziet die afspraak en het gekozen dagdeel zonder handmatige overdracht.

## Fase 4 · Outlook voor interne planning

| Story | Prioriteit · vereist | Uitvoering en acceptatie |
| --- | --- | --- |
| PL-41 · Microsoft 365-kalenderproef | P2 · PL-18 | Beproef tenant-consent, doelagenda, delegated scopes, intrekken en opnieuw verbinden. Leg vast welke afspraakgegevens naar de interne agenda mogen. **Gereed als** in een testtenant één gecontroleerde kalenderkoppeling werkt met de minimaal benodigde rechten en een ingetrokken verbinding in Planner zichtbaar wordt. |
| PL-42 · Afspraken doorzetten | P2 · PL-41, fase 3 geaccepteerd | Verwerk creëren, verplaatsen en annuleren via outbox en stabiele afspraak-/eventkoppeling. Test timeout, 429, herhaalde aflevering en gebeurtenissen buiten volgorde. **Gereed als** één afspraak hoogstens één gekoppeld intern agendarecord oplevert, herhaling naar de laatste Planner-versie convergeert en medewerkers een blijvende fout kunnen zien en opnieuw aanbieden. |
| PL-43 · Besluit over inkomende Outlook-bezetting | P2 · PL-42 | Beproef delta-uitlezing voor een vaste kalenderperiode en leg regels vast voor verwijdering, eigen uitgezonden events en botsing met bevestigde afspraken. **Gereed als** een go/no-go vastligt met een concrete eigenaar voor conflicten en een aanpak om te herstellen na een ongeldige delta-cursor. |

Fase 4 geeft Planner één afgebakende kalenderkoppeling. PL-41 kan eerder als proef lopen. Een inkomende koppeling gaat pas in productie na expliciete acceptatie van de conflictregels.

## Fase 5 · Besluit over synchronisatie tussen lokaal en cloud

| Story | Prioriteit · vereist | Uitvoering en acceptatie |
| --- | --- | --- |
| PL-51 · Synchronisatie-ontwerp | P2 · gebruikersvraag bevestigd, PL-18 | Kies wie bronhouder is per record, hoe lokale en cloudidentiteiten koppelen en wat offline wijzigbaar is. Werk tombstones, cursor, outbox, versie- en verwijderconflicten, teruggetrokken toegang en verlies van een apparaat uit. **Gereed als** het ontwerp een gelijktijdige edit en één offline claim voor de laatste plek in een concreet scenario afhandelt. |
| PL-52 · Beslissing over bouw | P2 · PL-51 | Maak acceptatiescenario's voor een conflict, hervatten na onderbreking, verwijdering en een volledige heropbouw van een lokale kopie. **Gereed als** de eigenaar de gebruikersimpact en uitrolvolgorde heeft geaccepteerd. Daarna kan het synchronisatiewerk apart worden ingedeeld. |

## Verificatie van de uitgangssituatie

Op `6daaef13d3a7d3a30c429a05e32555dd9f9e9a9b` op Windows met Node 24.3.0 en pnpm 11.10.0 slaagden `corepack pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test` en `build`. De suite draaide 13 tests, 11 API en 2 shared. Azure Pipelines is geconfigureerd voor Linux met Node 22. De controles verifiëren de huidige code. Testgevallen voor voorgestelde functies staan als acceptatiecriteria in de stories. [Pipeline](../../azure-pipelines.yml), [API-tests](../../server/api/tests), [shared-tests](../../packages/shared/tests).
