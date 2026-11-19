# Eén vaste mediareferentie op de CMS-pagina

Deze stap bouwt op de gereviewde tekstproef van PR #10, head `0179a4ffeb2b340c421c7d1b43bd2913d410e07d`, en het gereviewde M0-mediacontract van PR #8, head `de089d22998b76fda8b905fb7d3ba90e2f8a7fd4`. De twee M0-runtimecommits `dd41e28` en `de089d2` zijn ongewijzigd hergebruikt. De nieuwe integratie wijzigt alleen CMS-code, CMS-app, CMS-tests en deze documentatie. De uploadprocessor uit M1 is nog niet aangesloten.

## Proberen

```powershell
corepack pnpm install --frozen-lockfile
./scripts/start-cms-fixture.ps1 -Port 3017
```

Gebruik het lokale toegangsbestand zoals beschreven in [de tekstproef](lokale-proef.md). Kies Testafbeelding versie 1, vul Nederlandse alt-tekst in of kies expliciet decoratief en sla het concept op. Privépreview toont de gecontroleerde publieke derivative in het sandboxframe. Publiceren kopieert alleen de gecontroleerde derivative naar de lokale release; de publieke pagina gebruikt een relatief afbeeldingspad en heeft geen CMS-aanroep nodig.

De afbeelding is een vaste fictieve 1×1-PNG uit de mediafixture, vergroot naar 160×160. Beide bestandsversies bevatten dezelfde testpixel; het verschil is hun gepinde fileVersion. Dit is een contractproef, geen bewijs van verwerking van een geüploade foto. De keuzelijst heeft ook fictieve entries met onbekende rechten of verwerkingsstatus, waarmee afwijzing kan worden geprobeerd. Er is geen rechtenvrijgaveknop of impliciete vrijgave.

Na publicatie van versie 1 kan versie 2 als draft worden opgeslagen zonder de publieke release te wijzigen. Ook verwijderen uit de draft laat een behouden gepubliceerde release intact. Ontbrekende alt-tekst, niet-gereed materiaal, onbekende/geblokkeerde rechten of ontbrekende versies blokkeren preview of publicatie. Decoratief is een expliciete keuze en vereist lege alt-tekst. HTML-encoding geldt ook voor het alt-attribuut.

## Adapter en behoud

De server beheert de vaste mapping `demo-cms → fixture-alpha` en `demo-other → fixture-beta`. Een browser geeft geen mediascope of opslagpad op. De normale CMS-entrypoint activeert de M0-adapter; de gewone Planner-start blijft onveranderd. Er is één mediafixture per CMS-runtime, geen tweede implementatie van assetopslag. Haar bestaande tijdelijke root wordt via het private bestand `media-root.json` heropend. De database en originelen worden nergens publiek geserveerd.

Elke CMS-revisie bevat haar beeldreferentie en een gepinde `media_revision_id`. Een gewijzigde afbeelding/alt/decorative-keuze registreert eerst een nieuwe immutable referentierevisie in M0. Tekst-only wijzigingen hergebruiken een bestaande mediareferentierevisie. Zo blijft een al geselecteerde, daarna gearchiveerde afbeelding geldig bij een tekstwijziging. Een nieuwe selectie van een gearchiveerd asset blijft verboden. Een wijziging aan de beeldreferentie geldt in deze M0-proef als een nieuwe selectie en kan dus worden geweigerd bij een gearchiveerd asset.

Een oude tekstclient die `image` weglaat behoudt de huidige afbeelding; expliciet `image:null` verwijdert alleen de verwijzing uit de nieuwe draft. Behouden oudere revisies en releases blijven verwijzen. De twee databases hebben geen gezamenlijke transactie. Registreren vóór CMS-commit kan bij uitval een extra behouden referentie achterlaten, maar voorkomt dat een opgeslagen CMS-revisie een niet-geregistreerd asset gebruikt. Deze proef ruimt zulke referenties niet automatisch op en heeft geen purge- of cleanupactie.

Preview vraagt aan dezelfde mediaresolver een intern snapshot met ID `preview-<media_revision_id>`. Dat houdt de gecontroleerde derivative vast zonder een CMS-release te activeren. De server embedt uitsluitend deze gevalideerde PNG als data-URI in het geauthenticeerde HTML-antwoord. Het frame heeft geen token-URL, krijgt sandboxing en staat alleen deze afbeeldingsbron toe.

Publiceren vraagt de resolver om een clean manifest voor release-ID plus de gepinde mediareferentierevisie. M0 controleert website, ready-status, actuele vrijgave, alt/decorative, publiek pad, symlinks, bestandsgrootte en checksum. De CMS-adapter controleert de bytes bij overname nogmaals. Het releaseartifact bevat `index.html`, `media/hero.png` en een intern `release.json` met hashes en het publieke media-snapshotcontract. De publieke router serveert alleen HTML en die ene PNG uit de actieve release; zij heeft geen route voor manifesten of originelen.

SQLite-migratie 2 voegt alleen de nullable mediareferentiepointer toe; eerdere tekstfixtures blijven geldig. Retentie blijft conservatief: alle revisies/releases blijven behouden en M0 weigert fysieke/metadata-purge zolang er retained usages bestaan. De M0-root staat in Windows' tijdelijke map en is geen back-upoplossing. Als die root buiten de app wordt gewist, weigert de app nieuwe mediahandelingen; reeds gekopieerde actieve releasebytes blijven zelfstandig beschikbaar. Back-up/herstel van beide databases plus assets is vervolgwerk vóór echte aansluiting.

## Verificatie op 19 november 2026

- Alle 52 API/client/media-tests slagen, waaronder 24 ongewijzigde M0-contracttests, 21 eerdere CMS/platformtests en 7 integratiegevallen.
- Workspace typecheck, lint en build slagen; diffcheck is groen.
- Integratietests dekken geauthenticeerde embedded preview, alt/decorative en encoding, private paden, versiepinning en checksum, ontbrekende versies, servervaste scope, oudere tekstclients, niet-gereed/onbekende/geblokkeerde media, retained refs na verwijderen en tekstwijziging na archiveren. De actieve publicatie blijft intact na afwijzing van een nieuwe poging.
- Chrome via de normale start op `127.0.0.1:3017`: versie 1 geselecteerd, alt ingevuld, draft opgeslagen, private preview geopend en lokaal gepubliceerd. Versie 2 daarna uitsluitend opgeslagen als draft. Het echte proefproces is gestopt en opnieuw gestart. De browser heropende conceptversie 3 met afbeeldingsversie 2 en actieve publicatieversie 1. Het interne releasecontract bleef op afbeeldingsversie 1 met SHA-256 `4ff6ab670a58c14270e034e2090d9a432caa263a14e0a25785386b0c12f880b5`.
- De publieke browserpagina laadt de PNG daadwerkelijk, `complete=true` en `naturalWidth/naturalHeight=1`; de alt-tekst is aanwezig. Een screenshot alleen kan de gelijke 1×1-bytes van de twee fixtureversies niet onderscheiden. De versieclaim steunt daarom ook op de API, het manifest en de tests.

Er is geen echte upload, bestandsprocessor, catalogus, klantdata, cloudvoorziening of live publicatie gebruikt. M1-uploadintegratie volgt apart vanaf zijn gereviewde commit, met dezelfde expliciete rechtencontrole vóór publiceren. Catalogusreferenties zijn afgestemd als `websiteId`, `collectionId`, `snapshotId`; een release pint snapshotId plus checksum. Die catalogusaansluiting maakt geen deel uit van deze afbeeldingproef.
