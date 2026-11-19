# CMS-architectuur en gebruik

Voorgesteld contract v1, 19 november 2026. Alle nieuwe namen en routes in dit document zijn ontwerp. Zie [onderzoek](onderzoek.md) voor aangetroffen werking en [eerste bouwopdracht](eerste-bouwopdracht.md) voor de beperkte eerste versie.

## Pagina's en tekst

De redacteur kiest een website, daarna een pagina of Websitebreed. De paginalijst toont categorie, conceptwijzigingen en laatste publicatie. De teksttabel groepeert velden per pagina en toont NL/EN, locatie, ontbrekende vertaling en opslagstatus. De paginaweergave gebruikt dezelfde draftrevisie. De eerste proef levert alleen een formulier met lokale preview; de tweede editorweergave komt later.

Een versie van het paginaschema bepaalt template, toegestane veldkeys, types, limieten, SEO-velden en bindings. Redacteuren wijzigen tekst, geen selectors, scripts of templatebestanden. Start met platte tekst, meerregelige tekst, gecontroleerde links en later mediareferenties. Vrije HTML en een algemene blokkenbouwer wachten. Nieuwe pagina's gebruiken een geregistreerd template; slugcontrole weigert padtraversal, gereserveerde paden, duplicaten en verschillen die op Windows alleen hoofdlettergebruik betreffen. Een slugwijziging vereist expliciete redirect/tombstone in dezelfde release.

Websitebrede teksten hebben een eigen `_shared` revisie. Een release legt zowel pagina's als deze revisie vast. Werk-, Nu- en reiscollecties behouden bij import hun bronidentiteit en mapping; categorieën voor paginanavigatie zijn iets anders dan cataloguscategorieën voor items.

## Opslag en revisies

| Record | Inhoud en invariant |
| --- | --- |
| Site | workspace/tenantId, websiteId, naam, localeconfiguratie en serverbeheerde targetkoppeling. Elke query controleert beide scopes. |
| Page | stabiel pageId, websiteId, route, templateId/schemaVersion, draftRevisionId en optimistic version. Website plus genormaliseerde route is uniek. |
| Revision | immutable revisionId, pageId, parentRevisionId, auteur, tijdstip, alle veldwaarden per taal, media/catalogusreferenties. Opslaan maakt een nieuwe revisie en CAS-update van de Page-pointer in één transactie. |
| Release | releaseId, websiteId, schemaVersion, complete pageId→revisionId-mapping, `_shared`, locales, templateversie/hash en alle afhankelijkheden. De snapshot verandert nooit. |
| ReleaseAttempt | status, idempotency key, aanvrager, foutcode, outputmanifest/checksum, targetId en verwachte actieve release. Renderen maakt een nieuwe poging, geen mutatie van de snapshot. |
| ActiveRelease | websiteId+targetId, releaseId en version. Alleen na geslaagde validatie en compare-and-swap omschakelen. |
| AuditEvent | actorId, websiteId, actie, object/revision/release-ID, tijdstip en resultaat. Geen tokens of complete tekstwaarden in logs. |

Een tekstwaarde heeft drie toestanden: ontbrekend, expliciet `""`, of tekst. Ontbrekend gebruikt de gepinde standaardtaal; leeg blijft leeg. De standaardtaal moet voor elk verplicht geregistreerd veld expliciet bestaan. Import en serialisatie bewaren deze toestanden en de bronversies. Draft pointer-version is nieuw en staat los van oude veldversies. Een wijziging van talen of fallback komt pas met een release bij bezoekers.

Page-versie is de conflictgrens in de eerste proef. Twee editors met dezelfde expectedVersion leveren één succes en één 409. Een fout bewaart de lokale invoer voor vergelijken/herladen. Geen stilzwijgend laatst-schrijf-wint. Later kan veldgericht samenvoegen volgen; eerst correct pagina-CAS. Afmelden of netwerkverlies wist onopgeslagen invoer niet. Preview heeft authenticatie nodig en gebruikt geen publieke cache.

## Rollen en toegang

| Actie | Viewer | Editor | Publisher | WebsiteOwner |
| --- | --- | --- | --- | --- |
| Draft en preview lezen | ja | ja | ja | ja |
| Draft aanmaken/opslaan | nee | ja | ja | ja |
| Release bouwen, activeren en terugzetten | nee | nee | ja | ja |
| Leden en publicatierechten beheren | nee | nee | nee | ja |
| Templates, targetconfiguratie, restore uitvoeren | nee | nee | nee | aparte beheeropdracht |

Alle rollen zijn websitegebonden. Platformbeheer is een expliciete beheercapability, geen standaard redactierol. Bestaande WebsiteEditor wordt Editor, WebsiteOwner wordt Owner; bestaande editors krijgen niet automatisch publicatierecht. Een restore vraagt operatorrechten buiten de gewone CMS-interface. Agents krijgen ingeperkte website- en actiescopes, bijvoorbeeld alleen draft:write. Elke beheeraanroep zonder geldige identiteit geeft 401, zonder recht 403; een object van een andere website geeft 404. Authenticatie vindt plaats vóór lookup. Cookiegebaseerde writes vragen CSRF-bescherming; Bearer-credentials blijven uit browseropslag en publieke bundles.

De eerste proef gebruikt uitsluitend lokale servergeconfigureerde, gehashte tokens voor Editor en Publisher en twee fictieve websites. De browser voert een token in dat alleen in geheugen blijft. Dit is een testadapter totdat centrale identiteit beschikbaar is; geen nieuwe accountprovider en geen hergebruik van de algemene anonieme Labs-user.

## Publiceren naar een bestaande website

Opslaan maakt een draft. Publiceren kiest de exacte opgeslagen revisies; wijzigingen tijdens het bouwen gaan pas mee in de volgende release. De UI onderscheidt Opgeslagen concept, Build gereed en Gepubliceerd naar target. Een download of geslaagde build heet nooit automatisch Gepubliceerd.

1. Publisher vraagt een sitebrede snapshot met expected draft versions en actieve release/version. De server controleert rechten en legt alle revisies, routes, taalconfiguratie, templates en media/catalogusversies vast in een korte transactie.
2. Resolver valideert alle gepinde afhankelijkheden. Templatebestanden worden naar een geïsoleerde stagingmap gekopieerd en gehasht; renderen leest uitsluitend die kopie. Externe links blijven links. Externe fonts/afbeeldingen zijn expliciete manifestafhankelijkheden en vallen buiten een offlinegarantie; de fixture heeft geen externe bestanden.
3. De builder maakt HTML en lokale assets zonder draft-API, editorcode, tokens, originele uploads of privémetadata. Hij controleert lokale verwijzingen, ontbrekende verplichte waarden en routebotsingen. Het manifest bevat inhoudshashes, routes en renderer/templateversie. Twee builds van dezelfde snapshot hebben dezelfde inhoudshashes; variabele buildtijd en ZIP-metadata tellen niet als inhoud.
4. Een adapter levert alleen die geverifieerde output aan het gekoppelde target. De lokale adapter serveert een complete releasemap achter één DB-pointer en schakelt die atomair om. Geannuleerde of mislukte builds raken de actieve release niet.
5. Activeer alleen als de verwachte actieve release nog klopt. Twee gelijktijdige publicaties mogen niet door eindtijd de volgorde bepalen. De tweede activatie krijgt 409 en vraagt een nieuwe keuze. Retry met dezelfde key en payload retourneert dezelfde poging; dezelfde key met andere payload geeft 409. Herstart reconcilieert onafgemaakte pogingen en gebruikt alleen volledig gevalideerde output.

Een sitebrede publicatie neemt alle geselecteerde drafts mee. De bevestiging toont welke pagina's wijzigen en welke gedeelde teksten/collecties geraakt worden. Pagina-selectief publiceren en plannen op datum zijn latere uitbreidingen.

Voor de bestaande sites is een afzonderlijke adapter nodig van het releaseartifact naar de reeds gekozen sitepipeline. `site.manifest.json` blijft de beheerde website/targetkoppeling. Het bestaande `publishPath` is templatebron, geen bewijs dat nieuwe CMS-data live staat. De adapter mag geen algemene workflow starten die opnieuw de oude Git-bron bouwt. Leg artifact-ID/checksum en target vast, verifieer de deployuitkomst en controleer de actieve release-marker op de website. Bij onbekende uitkomst blijft de poging `unknown`; een retry reconcilieert eerst. Secrets blijven server-/pipelinebeheer. Ontwerp en lokale proef doen geen netwerkdeploy, provisioning of kostenverhogende actie.

Rollback activeert een behouden, gevalideerde release met Publisher-recht en verwachte active-version. Controleer actuele rechtenblokkades op media opnieuw. Terugzetten wijzigt drafts niet. Een release die bewust pagina's weglaat vervangt de volledige routeset, zodat oude bestanden verdwijnen; aparte redirects blijven expliciet. Dit voorkomt terugkeer van verwijderde Journal/Destination-routes.

## Contract met media en catalogus

Op 19 november afgestemd met bronchat `01a1f42a-5c9b-79a3-8d73-bf1e963939c4` en media/cataloguschat `01a1f49b-6245-79e0-8083-f8099beb0672`. Canonieke naam is `fileVersion`; eerdere voorstellen met assetVersion vervallen. De mediachat documenteert dezelfde grens onder `docs/media-catalogus` in zijn eigen PR.

```json
{
  "assetId": "asset-demo-01",
  "fileVersion": "1",
  "usage": "hero",
  "altText": { "nl": "Blauwe cirkels op een witte achtergrond", "en": "Blue circles on a white background" },
  "decorative": false
}
```

Fictief contractvoorbeeld. Asset-ID en immutable fileVersion komen van media. Metadata heeft een apart optimistic versietoken. Alt-tekst hoort bij het gebruik; publicatie vereist betekenisvolle alt per effectieve taal of expliciet decorative. Caption/focalPoint zijn optioneel vervolgwerk. De resolve-opdracht bevat websiteId, releaseId en alle referenties. Media retourneert alleen vrijgegeven publieke derivatives met relatief exportpad, MIME, grootte en SHA-256. Ontbrekend, niet-ready, geblokkeerd of cross-website materiaal blokkeert de release. Originelen blijven privé.

CMS registreert referenties voor drafts, behouden revisies en releases vóór publicatie. Media beschermt de gepinde versies tegen fysieke verwijdering; bij mislukte build blijven of vervallen reserveringen via een idempotente lifecycleactie. Archiveren verbergt een asset uit nieuwe selectie en behoudt geldige gepinde referenties. Een rechtenblokkade verhindert nieuwe publicatie. Al geëxporteerde publieke bestanden verdwijnen daardoor niet automatisch; daarvoor is een afzonderlijke republish/verwijderopdracht nodig. Eerst referenties registreren, dan valideren voorkomt verwijderen tussen controle en build.

Catalogus beheert generieke items en itemcategorieën, met eigen IDs en snapshotVersion. CMS beheert alleen plaatsing en presentatieverwijzingen. Elke release pint de catalogussnapshot en geselecteerde IDs; archiveren verwijdert geen behouden snapshot. Geen prijzen, bestellingen of checkout. Paginaschema-catalogus en itemcatalogus gebruiken verschillende namen/IDs. De eerste tekstproef heeft geen media- of catalogusdependency; adapters volgen na contracttests.
