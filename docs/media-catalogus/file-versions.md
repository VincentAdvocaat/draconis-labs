# Nieuwe bestanden bij een bestaand asset

Lokale M2-stap boven de vaste PR43-head `22f5c66659ab4abadb6a1f65b34b92846dce959f`, reviewed runtime `ea12b79ce8095878edc4d10ce3f260e3b35b9bf2`. Geen dependencies, cloudservices, per-versierechtenframework of CMS-bibliotheek toegevoegd. De normale `catalogus start -Port 0` opent assetdetail met upload en retry.

## Vooraf afgestemd rechtenbeleid

Rechten blijven assetbreed. Een nieuwe complete ready-versie maakt de vrijgave `unknown` en schrijft een systeemaudit; een bestaande `blocked` blijft `blocked`. Voor toekomstig publiceren/her-resolven van **alle** versies, ook oude, is een nieuwe medewerkerbeslissing nodig. De UI toont dit vóór de upload en vraagt expliciete bevestiging. Bestaande snapshot-JSON, bekende publieke pagina-/beeldroutes en gekopieerde CMS-publicaties blijven intact; de upload trekt ze niet in.

Reserveren verhoogt metadataVersion voor CAS, maar rechten/audit veranderen pas bij succesvolle verwerking. Failed verandert de oude rechten niet. Vrijgeven tijdens een pending versie wordt geweigerd; blokkeren mag wel. Completion leest de actuele blokkade in dezelfde transactie en promoveert die nooit. Itemselectie, NL/EN-alt/decorative en drafts schakelen niet automatisch naar de nieuwe fileVersion. De medewerker bekijkt de schone preview, bevestigt rechten en kiest bewust een versie. Bij een nieuw beeld blijft betekenisvolle EN-alt expliciet vereist voor EN-publicatie.

## Migratie en jobbinding

Catalogusschema blijft 5 en CMS blijft 8. De aparte media_upload_schema is 1. De oude zes jobkolommen blijven; asset, file_version, attempts, owner_pid en source_checksum komen erbij, plus een unieke website/asset/fileVersion-index. Legacyjobs krijgen asset=id/v1. Hun historische pogingen worden niet verzonnen: de nieuwe teller start op 0. Nieuwe verwerking telt vanaf 1, maximaal vijf pogingen inclusief de eerste.

Een nieuwe versie heeft een aparte job-ID en atomair gereserveerde MAX(fileVersion)+1. MetadataVersion, latestFileVersion, website, bestaan en archiefstatus worden onder één IMMEDIATE-transactie gecontroleerd. Failed nummers worden niet hergebruikt. Twee writers met dezelfde CAS geven precies één succes en één 409. Er komt geen tweede pending versie op hetzelfde asset.

V1 behoudt `private/:website/:asset/source`. Vanaf v2 staan bron en staging onder `private/:website/:asset/:version/`; publieke varianten blijven versiegebonden. Ready-versies worden nooit overschreven of opgeruimd. Bestaande MIME/ext/signatuur-, byte/pixel/frame/decodegrenzen, metadata-strip, fallbackvarianten en outputhashes gelden ongewijzigd. Nieuwe jobs bewaren de private bronhash vóór verwerking en controleren die bij retry/herstel. Een onderbroken legacyjob zonder bronhash krijgt die bij zijn eerste herstel; dit bewijst geen historische bronintegriteit.

Het lokaal vastgelegde owner_pid voorkomt overname van een levende worker. Alleen signaal 0 controleert bestaan; geen proces wordt beëindigd. Een bewezen gestopt proces kan herstellen; een levende of hergebruikte PID wordt niet gestolen. Dit is geen gedistribueerde lease of algemene multiprocescapaciteitsgarantie. HTTP-admission geldt per app vóór bufferen. Startup hervat een onderbroken job op dezelfde versie. Failed vereist expliciete retry. Bij de limiet wordt ook een onderbroken processing-file failed, zodat een volgende versie mogelijk blijft.

## Private API en UI

| Route | Gedrag |
| --- | --- |
| POST `/websites/:website/media` | Compatibele nieuwe-assetupload; v1 houdt job-ID gelijk aan asset-ID |
| POST `/websites/:website/media/:asset/versions` | Binaire upload met x-media-filename, x-media-metadata-version, x-media-file-version en x-media-confirm-invalidation: true |
| GET `/websites/:website/media/jobs/:jobId` | Jobstatus, binding, pogingen en veilige fout; oude GET `/media/:id` blijft |
| POST `/websites/:website/media/:jobId/retry` | Alleen failed/niet-ready/onder de limiet; dezelfde job en fileVersion |

Token/origin/website/methodgrenzen en bodylimieten blijven. Fouten geven jobId/assetId/fileVersion voor gericht verversen. Detail toont veilige jobstatus, zonder private bronpaden of bronhashes. Bij een ander detailverzoek is de oude uploadbinding gewist en zijn file/confirm/upload uitgeschakeld. Nieuwe ready-previewknoppen en metadata worden geladen zonder de itemversiekeuze te wijzigen. Retry is disabled bij ready of limiet; focus gaat naar een bruikbare knop.

## Backup/restore in dezelfde stap

Afgestemd met de CMS09-eigenaar; alleen de eigen branch wijzigt recovery.ts en voegt recovery-upload.ts toe. Het bestaande format1-manifest krijgt additief uploadSchema: 0 voor echte zeskolomsjobs zonder marker, 1 voor de nieuwe layout. Ontbrekend betekent alleen legacy0. Feitelijke DB-layout en manifestwaarde moeten overeenkomen; onbekende schema's of nieuwe kolommen zonder marker worden geweigerd vóór restore-doelen ontstaan. Validatie is read-only; pas app-open migreert legacyjobs.

Naast bestaande invarianten worden jobshape, unieke binding, state, begrensde pogingen, lege offline-owner en bekende bronhash/signatuur gecontroleerd. Processing moet eerst afronden/herstellen. Een failed ontbrekende bron blijft diagnose; retry kan de bron niet terugmaken. De bestaande M0-metadata-purge kan jobs/private bytes achterlaten; volledig gepurgede metadata wordt niet als bruikbare ready-status hersteld en status blijft 404. Geen onbekende rechten/pins worden vrijgegeven.

Tests herstellen ready v1/v2, oude NL/EN-snapshots, retained pins/audit en failed v2 met retry op dezelfde binding. Schema/binding/attempt/owner/bronhashwijzigingen worden ook na herberekende buitenste DB-hash geweigerd. Een echt legacy-zeskolomspakket zonder uploadSchema migreert pas bij openen. De bestaande herstelcase behoudt zijn oorspronkelijke timeout en asserts. Na twee timeouts onder gedeelde hostbelasting is de definitieve volledige poort geserialiseerd; een tijdelijke diagnostische timeoutverhoging is niet opgenomen. Dit schrijft geen exclusieve oorzaak aan hostbelasting toe. Nieuwe omvangrijke herstelgevallen hebben hun eigen begrensde testbudget. Historisch PR42-bewijs blijft toegeschreven aan zijn eigen head.

## Bewijs

Nieuwe tests: 9 versie-service/HTTP-gevallen, 4 offline-herstelgevallen en 4 UI-gevallen met het echte script. Bestaande upload/library/CMS/publicatie/localeproeven blijven regressiecontrole. Laatste volledige poort en exacte reviewhead staan bij de PR/chat; gerichte en volledige controles worden onderscheiden.

Browser uitsluitend synthetisch: rood v1 vrijgegeven en NL/EN-snapshots gemaakt. Blauw v2 via detail geüpload na expliciete melding; selectie en alt bleven staan, publicatie werd tot herbevestiging geweigerd. Na bewuste keuze/vrijgave en nieuwe alt zijn NL/EN-v2-snapshots gepubliceerd. Oude snapshot-JSON/usages/v1-hashes zijn bytegelijk gecontroleerd. Een eigen tijdelijke Windows-lock op alleen v3-staging forceerde een fout. Na vrijgeven werd dezelfde job v3 ready met 2/5 pogingen; de lock is gesloten. CLI-stop/herstart behield alle versies, de bewuste v2-itemkeuze en oude rode versus nieuwe blauwe EN-publicatie. Alle gepinde checksums blijven gelijk. Bewijsbeelden en before/aftercontrole staan bij de chatoplevering.

Geen batch, automatische itemomschakeling, per-versierechten, lightbox, extra M4, echte klantdata, merge of deployment.
