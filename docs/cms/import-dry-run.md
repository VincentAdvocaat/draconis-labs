# Synthetische dry-run voor CMS07 en M6

De dry-run leest één fictieve JSON-export en rapporteert de voorgestelde mapping voor twee websites. Het resultaat gaat naar stdout. De bronbestanden blijven intact.

`legacy.json` bevat schema 1 met `synthetic: true`, het bronsysteem `studio-cms-fixture` en precies één record voor `legacy-alpha` en `legacy-beta`. Dit zijn de bronnen voor respectievelijk `demo-cms` en `demo-other`. Ondersteunde pagina’s gebruiken template `text-page` met een NL-variant en optioneel een EN-variant. Elke variant bevat een slug en versies van titel, SEO-titel, optionele SEO-beschrijving en tekst. Een ontbrekende SEO-beschrijving blijft afwezig. Een expliciet lege waarde behoudt haar versie.

Voer dit vanuit de repository uit om een eigen fixture met een voorbeeldpagina te controleren.

```powershell
$draconisImportFixture = Join-Path ([IO.Path]::GetTempPath()) "draconis-cms-import-fixture-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $draconisImportFixture | Out-Null
@'
{
  "synthetic": true,
  "schemaVersion": 1,
  "sourceSystem": "studio-cms-fixture",
  "websites": [
    {
      "websiteId": "legacy-alpha",
      "pages": [{
        "id": "over",
        "template": "text-page",
        "nl": {
          "slug": "over",
          "contentValues": {
            "title": {"version": 2, "value": "Over"},
            "seoTitle": {"version": 1, "value": "Over de proef"},
            "body": {"version": 3, "value": "Fictieve tekst."}
          }
        }
      }],
      "assets": []
    },
    {"websiteId": "legacy-beta", "pages": [], "assets": []}
  ]
}
'@ | Set-Content -LiteralPath (Join-Path $draconisImportFixture 'legacy.json') -Encoding utf8
corepack pnpm --filter @draconis/api exec tsx scripts/cms-import-dry-run.ts --source $draconisImportFixture
```

Het rapport vermeldt de SHA-256 van de bronmanifestbytes, een stabiel doel-ID per pagina en de genormaliseerde route per taal. Een mediarecord heeft `id`, `filename` en `sha256`. Plaats het genoemde bestand in de submap met het bronwebsite-ID. Een optioneel `cover` op een pagina bevat het bronwebsite-ID onder `websiteId`, het `assetId`, `decorative` en `altText` per aanwezige taal. De dry-run vergelijkt de bestandshash met het manifest en stelt versie 1 en rechtenstatus `unknown` voor. Hetzelfde media-ID kan in twee websites voorkomen.

Exitcode 0 geeft een volledig voorstel. Exitcode 1 geeft een JSON-rapport met foutcodes en paden, bijvoorbeeld bij een onbekend veld, dubbele route, ontbrekend bestand of verwijzing over een websitegrens. Exitcode 2 geeft een gebruiksfout. De proef controleert alleen de genoemde assetbestanden.

## Import uitvoeren

Gebruik het bestaande bronvoorbeeld hierboven. Kies een nog ongebruikte doelmap direct onder de tijdelijke systeemmap. De CLI accepteert alleen het vaste fictieve schema en twee fictieve websites.

```powershell
$draconisImportTarget = Join-Path (Resolve-Path ([IO.Path]::GetTempPath())) "draconis-cms-import-target-$([guid]::NewGuid())"
corepack pnpm --filter @draconis/api exec tsx scripts/cms-import.ts apply --source $draconisImportFixture --target $draconisImportTarget
corepack pnpm --filter @draconis/api exec tsx scripts/cms-import.ts apply --source $draconisImportFixture --target $draconisImportTarget
```

De eerste opdracht meldt `applied`. De tweede meldt `unchanged` en geeft dezelfde pagina-, revisie- en media-ID's terug. De import gebruikt de pagina-ID uit de dry-run en legt elk bronmedia-ID vast met de nieuwe asset-ID binnen dezelfde website. Bewaar `source-values.json` voor de oorspronkelijke veldversies en voor het verschil tussen afwezig en bewust leeg. De NL-doelpagina gebruikt een lege SEO-beschrijving als het bronveld ontbreekt, volgens het bestaande paginaschema. EN bewaart dat geval als `null`. Revisies starten op versie 1 in het doel.

De CLI rapporteert een gewijzigde bronfingerprint als `source_changed`. Bewerkte of verdwenen concepten en gewijzigde media verschijnen als doelconflicten, met website en bron-ID. Een draaiend doel of een bestaande map zonder geldig importbewijs wordt afgewezen. Stop de proefserver voordat je dezelfde bron opnieuw toepast. Bij een fout tijdens de eerste import worden de twee nieuwe opslagmappen opgeruimd. De CLI maakt de import pas bruikbaar via `serve` zodra beide websites zijn geschreven en `import.json` is vastgelegd. Een harde processtop kan tijdelijke opslag achterlaten. Zo'n doelmap geldt als onvoltooid. Gebruik dan een nieuwe doelmap.

```powershell
corepack pnpm --filter @draconis/api exec tsx scripts/cms-import.ts serve --target $draconisImportTarget --port 3097
```

Deze proefserver bindt alleen aan `127.0.0.1`. Lees het websitegebonden token uit `local-access.json` voor de CMS-API. Het rapport bevat de ID's voor de NL- en EN-preview onder `/api/v1/cms/websites/<website>/documents/<pageId>`. Gebruik respectievelijk `/previews/<nlRevisionId>` en `/locales/en/previews/<enRevisionId>`. De import maakt concepten. Beeldrechten starten op `unknown` en de gewone publicatiecontrole blijft van toepassing. Een onvolledige EN-tekst blijft een concept totdat de redacteur aan de bestaande preview- en publicatiecriteria voldoet.

De tests vergelijken de NL- en EN-HTML met fictieve bronverwachtingen en controleren routes, SEO, tekstescaping, alt-tekst en pixels na verwerking. Ze publiceren daarna expliciet via de bestaande snapshotroute. De NL- en EN-pagina's blijven binnen hun website en elke publicatie bevat haar eigen mediabytes.

## Aansluiting van bestaande templates

[Onderzoek en hergebruik](onderzoek.md) inventariseert de tekstbindings, talen en afzonderlijke collecties voor werk, reizen en Nu. De [gesaneerde contactfixture](contact-template-proef.md) bewijst 27 vaste bindings op één bevroren template. Voor een bestaande website zijn nog een bevestigde broncommit, de geselecteerde routes en templates, rollen, mediabronnen en expliciete veldmapping nodig. Het fictieve `text-page`-schema dekt gewone tekstpagina's met eventueel één cover. Een echte renderer- en routevergelijking, rechtencontrole en omschakelproef horen bij die geselecteerde site.

```powershell
corepack pnpm --filter @draconis/api exec vitest run tests/cms-import-dry-run.test.ts tests/cms-import-apply.test.ts
```
