# Lokale gebruikersdemo

Gebruik de checkout van PR43 en uitsluitend fictieve data. Alle onderstaande services binden op loopback. Er is geen hostingaccount of betaalde service nodig. De eigen acceptatielisteners zijn afgesloten.

## Voorbereiden en modules starten

```powershell
./scripts/verify-local-integration.ps1
```

Dit draait frozen install, build, types, lint, tests, compiled startup-/bookingherstartsmokes en catalogus-CLI-controles. Laat iedere eigen starter in een afzonderlijke terminal lopen.

```powershell
# Planner: eigen fictieve data; de starter toont private en publieke URL's.
corepack pnpm --filter @draconis/api demo:local

# CMS: lokale beheersite met contactfixture.
./scripts/start-cms-fixture.ps1 -Port 3055 -NoOpen

# Zelfstandige catalogus: eigen tijdelijke mediafixture, URL en toegang.
corepack pnpm --filter @draconis/api exec tsx src/catalogus/start.ts --port=3056
```

Deze normale starters hebben elk eigen fictieve opslag. Deel niet zonder meer een media-root tussen onafhankelijke writerprocessen. De gezamenlijke browseracceptatie gebruikte één owning Node-eventloop met CMS en catalogus; de reproduceerbare gecombineerde service-/backupscenario's staan in `tests/cms-recovery-catalog.test.ts`.

Planner: probeer taak/details/toetsenbord, interne afspraken en het lokale publieke boekingskanaal uit. Gebruik alleen de door de starter getoonde fictieve postcode/zone. Een booking verstuurt geen e-mail. De code is in deze consolidatie ongewijzigd.

Catalogus: laad met het eigen tijdelijke token. Zoek een asset in Bibliotheek, open Details voor versies en retained gebruik. Maak een NL/EN-categorie en een fictief item met directe NL/EN-alt. Publiceer NL/EN, sla een gewijzigde volgorde expliciet op en hernoem de categorie. Een nieuwe snapshot gebruikt de nieuwe volgorde/naam; eerdere snapshot-URLs blijven hun oude bytes gebruiken.

CMS: open met het publisher-token uit het getoonde lokale toegangsbestand. Open Contacttemplate, kies inhoudstaal, bewerk fictieve pagina- en gedeelde velden en sla ze afzonderlijk op. Open Exacte contactpreview. Haal de publicatieselectie op en vink gedeelde revisie en contact NL/EN expliciet aan. Publiceer lokaal. Een nieuwer concept verandert de actieve site niet. Dit is een gesaneerde fixture, geen echte website-import.

## Offline herstel uitproberen

CMS09 accepteert alleen fixtures die zijn eigen init-opdracht heeft aangemaakt; een normale CMS-root of klantmap wordt niet geïmporteerd. Kies steeds volledig nieuwe namen.

```powershell
$demoId = [guid]::NewGuid().ToString()
$source = Join-Path $env:TEMP "draconis-cms-recovery-source-$demoId"
$package = Join-Path $env:TEMP "draconis-cms-backup-$demoId"
$target = Join-Path $env:TEMP "draconis-cms-recovery-restored-$demoId"
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts init --target $source
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts serve --source $source --port 3057
# Bewerk/publiceer fictief via de browser. Stop daarna eerst de eigenaar.
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts quiesce --source $source
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts backup --source $source --target $package
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts restore --source $package --target $target
corepack pnpm --filter @draconis/api exec tsx scripts/cms-recovery.ts serve --source $target --port 3057
```

Gebruik na restore de nieuwe gegevens uit `$target/local-access.json`; oude tokens horen niet te werken. Controleer het nieuwere concept en de eerdere publicatie, sla een nieuw concept op en herstart de eigen doelinstantie. Geef nooit plaintext toegang door als onderdeel van een back-uppakket. Bestaande doelen worden niet overschreven, onbekende schemas geweigerd. Na een hard afgebroken eigenaar behandelt quiesce uitsluitend aantoonbaar dode locks. Het beëindigt geen levend proces.

Stop uitsluitend je eigen terminals/processen. Verwijder fixtures, branches of back-ups niet automatisch. Deze demo levert geen signing, OIDC, Outlook, echte import, publieke hosting of mainmerge.
