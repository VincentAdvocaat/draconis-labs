# CMS-01: één lokale pagina van draft naar publicatie

Uitvoerbare vervolgopdracht voor de orchestrator. Deze ontwerp-PR voert haar niet uit. Maak na opdracht een eigen worktree vanaf actuele `origin/main` met `scripts/start-development.ps1`. Stem de noodzakelijke registratie in gedeelde compositie en app-startscripts af met andere uitvoeringschats. Bescherm `scripts/backlog-data.json` en andere gebruikerswijzigingen.

## Resultaat

Een redacteur opent een lokale CMS-app, voert een Editor-token in en wijzigt titel en introductie van één fictieve pagina. Opslaan maakt een nieuwe draftrevisie met versienummer. Preview toont deze revisie. De openbare lokale site blijft de laatste actieve release tonen. Met een Publisher-token kan de redacteur precies de opgeslagen revisie publiceren; vervolgens toont de site die tekst, ook na een herstart. Geen browserstap vraagt echte accounts, media of klantgegevens.

Voorbeeldfixture website `demo-cms`, pagina `home`, route `index.html`, locale `nl`, template `plain-page@1`. Begintekst is `Welkom bij de proeftuin` met introductie `Dit is fictieve inhoud voor een lokale CMS-proef.` Een tweede fictieve website bestaat alleen om isolatie te toetsen. Geen koppeling naar een bestaande site of domein. De fixture wordt expliciet geïnstalleerd en seedt alleen ontbrekende records; herstart overschrijft geen edits. Nieuwe website heeft geen actieve release tot de eerste publicatie.

## Te leveren onderdelen

- `apps/cms` uit het bestaande app-template, met manifest, website/paginanaam, twee tekstvelden, opslagstatus, versieconflict, privépreview, publicatieknop en link naar lokale site. Gebruik bestaande React/Vite-tools. Token alleen in geheugen, geen opslag of queryparameter.
- `server/api/src/modules/cms` met module-entrypoint, schemas, service, repository, lokale builder en tests. Gebruik de bestaande `ApiModule`-registratie onder `/api/v1/cms`. Geen import uit Planner-services.
- Een eigen SQLite-testdatabase via injecteerbare CMS-repository en genummerde modulemigratie, gescheiden van Planner-data. Voor deze fixture is dit tijdelijke proefopslag; het is geen besluit over een tweede productiedatabase. Geen import-side-effect dat echte CMS-data opent.
- Minimale schema's voor site, page, revision, releaseAttempt en active release. Platte tekst met maximale lengte, pagina-CAS, immutable revisie, HTML-encoding. De snapshot pint één template en revisie. Geen talenbeheer, vrije HTML, media, catalogus, autosave, mail of cloudpublicatie.
- Gehashte lokale testtokens met servergeconfigureerde site/capabilities. Geen gebruik van `identifyActor` als toelatingscontrole. Bind de proef aan loopback, met begrensde ontwikkel-origin voor de CMS-app. Geen credentials in Git of logs.
- Lokale statische output onder een afzonderlijke, genegeerde runtime-map, bijvoorbeeld `server/api/data/cms/releases/<websiteId>/<releaseId>`. Een browserroute leest uitsluitend de complete map aangewezen door de DB-pointer. Opstartreconciliatie negeert stagingmappen en behoudt de laatste actieve release.

## Routecontract voor de proef

| Route onder `/api/v1/cms` | Recht en gedrag |
| --- | --- |
| `GET /websites/:websiteId/pages/home` | Editor/Publisher; draftwaarden, revisionId en pageVersion. |
| `PUT /websites/:websiteId/pages/home/draft` | Editor/Publisher; `{expectedVersion, values:{title,intro}}`. Return nieuwe revisionId/version; 409 behoudt oude draft. Ontbrekende expectedVersion geeft 428. |
| `GET /websites/:websiteId/previews/:revisionId` | Editor/Publisher; scoped revision, `Cache-Control: no-store`, alleen geëncodeerde HTML. |
| `POST /websites/:websiteId/releases` | Publisher; `{revisionId, expectedActiveVersion}` en verplichte idempotency key. Bouw lokaal en activeer uitsluitend na volledige validatie. Return release-ID, status en publieke URL, of controleerbare fout. |
| `GET /websites/:websiteId/releases/:releaseId` | Editor/Publisher; status, foutcode en gekozen revisionId; geen token of intern absoluut pad. |

Publieke lokale route `GET /sites/:websiteId/*` valt buiten het beheerprefix en gebruikt alleen active releasebestanden. Zonder actieve release geeft zij 404. Site- en routeparameters zijn servermatig gemapt; willekeurige filesystempaden zijn onmogelijk. De builder schrijft via staging naar een nieuwe complete releasemap; daarna activeert één DB-transactie de pointer met CAS. Een crash vóór pointercommit laat de vorige release actief; een crash erna kan alleen naar een al complete map wijzen. Retry met dezelfde key en payload retourneert hetzelfde resultaat, ook na restart. Verkeerde key/payload geeft 409.

## Acceptatie en controles

1. Start lokaal op een lege fixturedatabase. Zonder token zijn draft/preview/writes ontoegankelijk; Editor kan niet publiceren. Toets website-isolatie met beide fixtures en geconfigureerde scoped tokens.
2. Bewaar tekst A en preview A. Vóór eerste publish is de publieke route 404. Publiceer A; bewaar daarna B. Publiek blijft A en preview toont B. Herstart behoudt deze situatie.
3. Publiceer B, wijzig tijdens bouwen naar C. Publiek toont B; draft blijft C. Test dit met een gecontroleerde builderbarrière, zonder tijdafhankelijke sleeps. Twee saves op dezelfde versie geven precies één 409, ook via twee DB-connecties.
4. Forceer een render-/filesystemfout en een crash vóór en na activatie. De publieke site blijft een complete A of B tonen. Een idempotente retry maakt geen dubbele poging; andere payload met dezelfde key faalt.
5. Voer scriptachtige tekst en traversalpaden in. Preview/publicatie voeren geen script uit en verlaten de runtime-map niet. Output bevat geen token, editorcode, draft-API of bestanden van de tweede website.
6. Demonstreer de flow in de browser met toetsenbordbediening, zichtbare opslag-/publicatiestatus en herstelde invoer bij 401/409/netwerkfout. Leg de fixtures en commando's vast; schrijf geen echte geheimen in screenshots of rapporten.

Controleer passende module/API-tests en de bestaande API-suite, typecheck, lint en build. Maak de PR met `scripts/new-pr.ps1`; gebruik alleen een echt toegewezen AB-nummer. Start daarna de verplichte aparte alleen-lezen reviewchat met GPT-6 Astra medium. Laat bevindingen terugsturen naar de implementatiechat met GPT-6.1 Sol low, verifieer en herstel noodzakelijke fouten en laat substantiële fixes gericht herbeoordelen. Rapporteer PR, head-SHA, testresultaten, beperkingen en demo aan de orchestrator. Geen merge of deployment in deze opdracht.
