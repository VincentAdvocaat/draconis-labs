# Lokale demo van de derde consolidatie

Gebruik de checkout van PR46. Gereviewde bronnen: PR37 `fc43090d0f90892df97d7e033bef66b772c81aa8` → PR43 `22f5c66659ab4abadb6a1f65b34b92846dce959f` → PR46. De actuele integratiereviewhead en laatste documentatietip staan bij PR46 en het reviewrapport. Alle starters binden alleen op loopback en gebruiken eigen fictieve opslag.

## Controle en gewone bediening

```powershell
./scripts/verify-local-integration.ps1
corepack pnpm --filter @draconis/api demo:local
./scripts/start-cms-fixture.ps1 -Port 3055 -NoOpen
corepack pnpm --filter @draconis/api exec tsx src/catalogus/start.ts --port=3056
```

Start iedere demo in zijn eigen terminal. Deze normale starters hebben afzonderlijke opslag. Deel geen media-root tussen onafhankelijke writerprocessen. De gezamenlijke CMS/media-acceptatie gebruikt één eigenaar of sluit alle owners voor offline herstel.

Planner behoudt de bestaande taken/afspraken/zones/capaciteit en lokale publieke boeking. De demo verstuurt geen e-mail. CMS laat de gesaneerde contacttemplate en expliciete NL/EN-releasekeuze zien. Een nieuw concept verandert de gepubliceerde kop niet.

Catalogus: maak met fictieve inhoud een NL/EN-item en publiceer beide snapshots. Open assetdetail in Bibliotheek. Upload een nieuw eigen synthetisch PNG-bestand na expliciete bevestiging van het rechtengevolg. V2-ready zet assetrechten unknown; de itemkeuze blijft op v1. Bekijk de schone preview, geef opnieuw expliciet vrij en kies bewust de gewenste versie met passende NL/EN-alt. Publiceer nieuwe snapshots. Oude snapshot-URLs en reeds gekopieerde CMS-bytes blijven intact. Failed heeft een gerichte retry op dezelfde job/fileVersion, maximaal vijf pogingen.

## Eén gezamenlijke herhaalbare regressie

```powershell
corepack pnpm --filter @draconis/api exec vitest run tests/cms-version-export-integration.test.ts --maxWorkers=1 --no-file-parallelism
```

Deze case maakt en ruimt alleen eigen tijdelijke gemarkeerde fixtures op. Hij bewijst v1/v2-CMS-pins, herbevestiging, oude bytes, failed-v3-herstel, alle DB-rijen/pakketbestanden, nieuwe tokens, twee heropeningen en actieve/oude statische export. De volledige poort bevat ook alle geërfde brongevallen.

## Echte CLI-backup en statisch bekijken

Gebruik alleen een eigen nieuwe CMS09-fixture. Controleer native exitcodes voordat je een volgende stap uitvoert.

```powershell
$demoId = [guid]::NewGuid().ToString()
$source = Join-Path $env:TEMP "draconis-cms-recovery-v3-$demoId"
$package = Join-Path $env:TEMP "draconis-cms-backup-v3-$demoId"
$target = Join-Path $env:TEMP "draconis-cms-recovery-restored-v3-$demoId"
$export = Join-Path $env:TEMP "draconis-cms-export-v3-$demoId"
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts init --target $source
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts serve --source $source --port 3057
# Bewerk/publiceer fictieve inhoud via de getoonde eigen toegang. Stop die eigenaar eerst.
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts quiesce --source $source
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts backup --source $source --target $package
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts restore --source $package --target $target
corepack pnpm --filter @draconis/api exec tsx scripts/cms-export.ts --source $target --website demo-cms --release active --target $export
python -m http.server 3060 --bind 127.0.0.1 --directory $export
```

Open de hele webroot op `http://127.0.0.1:3060/sites/demo-cms/index.html`. Zonder eerdere expliciete publicatie wordt active terecht geweigerd. De gewone Python-host is geen volledige offlinebeveiliging; de acceptatieharness gebruikte aanvullend connect-src none. Voor een oudere publicatie vervang je active door diens published UUID en kies je een ander nieuw doel. Geen file://-garantie.

Na restore gebruik je uitsluitend de nieuwe toegang uit het nieuwe doel. Zet tokens niet in een back-uppakket of rapport. Stop alleen eigen terminals; quiesce beëindigt geen levende eigenaar. Geen automatische verwijdering van onbekende fixtures, branches of back-ups. Alle acceptatielisteners zijn afgesloten; dit document start niets automatisch.

Zie [bewijs](bewijs.md), [mergevoorstel](mainmergeplan.md) en [open criteria](open-criteria.md).

