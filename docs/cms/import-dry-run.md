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

De vervolgstap voor CMS07 en M6 is een afzonderlijke idempotente import met conflictafhandeling, renderervergelijking en rollback. Dit fixtureschema bevat gewone tekstpagina’s met optioneel één cover.

```powershell
corepack pnpm --filter @draconis/api exec vitest run tests/cms-import-dry-run.test.ts
```
