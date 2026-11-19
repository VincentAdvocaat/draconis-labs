# Lokale tekstproef CMS-01

De eerste bouwstap uit [de bouwopdracht](eerste-bouwopdracht.md) is uitgevoerd op basis van het gereviewde ontwerp uit PR #7, head `02ac4291ba12987f0a30921339897185d25a7f32`. De implementatiebranch hangt van die ontwerpcommit af. Dit is één lokale fictieve pagina; bestaande websites en het ASP.NET CMS blijven buiten deze implementatie.

## Starten en gebruiken

Voer vanuit de implementatieworktree uit met PowerShell 7 en Node 22 of hoger:

```powershell
corepack pnpm install --frozen-lockfile
./scripts/start-cms-fixture.ps1
```

Het script bouwt de React-app, start de eigen CMS-API op `http://127.0.0.1:3016` en opent de app nadat de listener gereed is. Met `-NoOpen` start dezelfde toepassing zonder browser; `-Port 3017` kiest een andere loopbackpoort. Stop via Ctrl+C in de startterminal. Deze proef gebruikt `server/api/src/modules/cms/local.ts` en dezelfde `buildCmsApp`-factory als de tests. De gewone Planner-start en platform-API-registratie zijn niet gewijzigd. Het `ApiModule`-contract wordt binnen dit proef-entrypoint éénmaal geregistreerd onder `/api/v1/cms`; er is geen afwijkende tweede set CMS-routes of onversioned alias.

Alle proefdata staan in de genegeerde map `server/api/data/cms-fixture` binnen deze worktree. Daar staan SQLite, lokale releasebestanden, de configuratie met tokenhashes en `local-access.json` met uitsluitend voor deze fixture gegenereerde editor/publisher-tokens. Open dit toegangsbestand lokaal en kopieer de gewenste waarde naar het wachtwoordveld. Tokens staan niet in broncode, logs, URLs, browseropslag of publieke output. Het bestand is leesbaar voor het lokale Windows-account en erft de maprechten; dit is geen productiecredentialvoorziening. Het opnieuw starten hergebruikt de tokens en bewaart gewijzigde tekst. De tweede testwebsite is in de opslag aanwezig voor isolatietests; de gegenereerde browseraccounts hebben alleen toegang tot Proeftuin.

1. Kies Proeftuin en open met het editor-token. Wijzig titel/introductie en kies Concept opslaan.
2. Open Privépreview. De publieke lokale pagina is vóór de eerste publicatie 404 en blijft daarna de vorige publicatie tonen.
3. Gebruik het publisher-token. Opgeslagen tekst blijft geselecteerd; Lokaal publiceren activeert precies die revisie. De link opent de publieke statische pagina.
4. Bewaar een nieuwe draft en herstart. Open opnieuw met een token; de draft en actieve publicatieversie blijven gescheiden. Een browserherlaad wist het in-memory token zoals bedoeld.
5. Open twee vensters op dezelfde conceptversie. Bewaar in het eerste, probeer daarna in het tweede op te slaan. De tweede toont 409 met zijn eigen invoer en de nieuwste tekst. Nieuwste versie overnemen is een expliciete keuze. Bij een publicatieconflict haalt de app de activeVersion op en vraagt zij opnieuw om een publicatiekeuze.

De preview is een geauthenticeerde fetch, vervolgens een sandboxed srcdoc-frame. Er staat geen previewtoken in de framelink. Een request zonder Bearer-token geeft 401. De statische site kent uitsluitend `/sites/:websiteId/index.html`; databases, configuratie, manifesten, stagingmappen en andere bestanden hebben geen publieke route.

## Uitvoering en integriteit

SQLite draait in een afzonderlijke fixturedatabase met modulemigratie 1. Een save maakt een immutable revisie en wijzigt de page-pointer onder een immediate transactie met expectedVersion. Release-aanvragen pinnen revisionId, template `plain-page@1` en expectedActiveVersion. De builder schrijft geëncodeerde HTML en een intern checksummanifest naar staging, flusht de bestanden, valideert en hernoemt naar een complete releasemap. Daarna staan active-pointer en published-status in dezelfde SQLite-transactie. De actieve route controleert de HTML-checksum bij lezen. Een conflict verandert de pointer niet.

Idempotency keys zijn websitegebonden. Dezelfde payload/key levert dezelfde poging; een gewijzigde payload geeft 409. Een retry tijdens bouwen geeft 202 met dezelfde poging. Een procesherstart markeert overgebleven `building` als `failed/interrupted`. Dezelfde key blijft die eindstatus geven; een nieuwe bewuste poging gebruikt een nieuwe key. Een runtime-lock voorkomt dat een tweede proces lopende builds van het eerste onderbreekt. Een oude lock van een niet-bestaande PID wordt bij starten hersteld.

Opgeslagen releases blijven behouden. De proef heeft geen verwijder/opschoonroute en geen automatische back-up. Het [backlog](backlog.md) bevat het benodigde herstel- en retentiewerk vóór aansluiting van bestaande sites. Een power-lossproef, schijfherstel, centrale identiteit, meertaligheid, mediaverwerking, catalogus en live deployment zijn niet onderdeel van deze versie.

## Verificatie op 19 november 2026

Uitgevoerd met Node 24.3.0 en pnpm 11.10.0. Dependencies kwamen uit de lokale pnpm-cache; geen betaalde service of nieuwe cloudresource gebruikt.

```powershell
corepack pnpm --filter @draconis/api test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
git diff --check
```

De CMS-tests gebruiken tijdelijke databases en de normale `buildCmsApp`-factory. Ze toetsen loopback HTTP, geauthenticeerde routes, twee websites, ontbrekende expectedVersion, overlong input, HTML-encoding en no-store preview. Verder zijn draft/publicatie na heropenen, twee databaseconnecties met dezelfde page-versie, twee publishers met dezelfde active-versie, retry tijdens bouwen, gewijzigde keypayload, fout vóór pointerwissel, interrupted herstel en fout na committed activatie afgedekt. Een corrupte publicatie geeft 503 en serveert geen beschadigde bytes. Crashmomenten binnen de builder zijn gecontroleerde foutinjectie; de browsertest stopte daarnaast het echte proefproces en startte het opnieuw. Er is geen bewijs van stroomuitvalbestendigheid of herstel op een andere machine.

De onafhankelijke review vond dat overnemen van een conflicterende nieuwere draft een oude onzekere publicatiekeuze kon laten staan. Dat is hersteld door de keuze aan de zichtbare revisionId te koppelen en bij expliciet overnemen te wissen. Twee regressietests voeren de echte getranspileerde React-componenthandlers uit met alleen een hook/fetch-testadapter. Retry van ongewijzigde A behoudt exact dezelfde key/payload; netwerkverlies bij A, draft-409 en overnemen van B publiceert B met een nieuwe key en behoudt tot die keuze de eigen invoer. De B-test faalt aantoonbaar op de oude component doordat A wordt verstuurd en slaagt op de fix. Daarna slagen alle 21 API/clienttests.

Chrome is gebruikt voor draftsave, sandbox-preview, lokale publicatie, een zichtbaar versieconflict met behouden invoer en heropenen na procesherstart. Toen was conceptversie 3 actief in de editor en bleef publieke versie 1 de eerder gepubliceerde tekst tonen. Toetsenbordfocus en foutstatus zijn handmatig gecontroleerd; dit is geen volledige toegankelijkheidsaudit. Tests veranderen geen bestaande CMS- of Planner-data.

De uiteindelijke PR-body vermeldt de actuele testaantallen, head-SHA en onafhankelijke reviewstatus. De eerstvolgende bouwstap is CMS-02, meerdere schema-gebaseerde pagina's en gedeelde tekst. Media-integratie volgt apart via het afgestemde `assetId`/`fileVersion`-contract en is geen dependency van dit tekstpad.
