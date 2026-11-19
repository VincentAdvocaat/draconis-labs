# Lokale Planner-demo

Deze demo gebruikt uitsluitend nieuwe fictieve gegevens. Zij maakt geen
cloudresources of accounts aan en installeert niets. De code staat in PR #28,
gestapeld op #23. De [actuele storymatrix en grenzen](pl14-15-lokale-contacten-afspraken.md)
onderscheiden lokale functionaliteit van de nog open cloud- en release-eisen.

## Web starten

Open PowerShell in de Planner-worktree. Deze eerste terminal blijft de API
draaien. Het uitgeprinte databasepad is het eigen demobestand; bewaar dat voor
een volgende start met dezelfde gegevens.

```powershell
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-bookings
corepack pnpm install --frozen-lockfile
corepack pnpm build
$plannerDemo = Join-Path $env:TEMP ('planner-demo-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $plannerDemo | Out-Null
$env:DATABASE_PATH = Join-Path $plannerDemo 'own.sqlite'
$env:HOST = '127.0.0.1'
$env:PORT = '3041'
Write-Output $env:DATABASE_PATH
corepack pnpm --filter @draconis/api start
```

Open een tweede PowerShell-terminal:

```powershell
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-bookings
$env:VITE_API_URL = 'http://127.0.0.1:3041'
corepack pnpm --filter @draconis/planner exec vite --host 127.0.0.1 --port 3042 --strictPort
```

Open [de lokale webapp](http://127.0.0.1:3042/). Als een poort al bezet is, stop
dan alleen de eigen demo of kies twee vrije poorten en pas de API-URL aan.
De standaard ontwikkelstart op 3001/5173 met Vite-proxy blijft ook beschikbaar.
Voor herstart van deze demo: stop de API met Ctrl+C en voer in dezelfde eerste
terminal opnieuw `corepack pnpm --filter @draconis/api start` uit. Maak daarbij
geen nieuwe `$plannerDemo` aan. Een nieuwe browserpagina start bij Taken; kies
dezelfde datum om eerdere afspraken terug te zien.

## Verpakte Windows-proef starten

Dit maakt een ongeïnstalleerde, niet ondertekende proef-exe. Het lokale profiel
is onafhankelijk van de webdemo; er vindt geen synchronisatie plaats.

```powershell
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-bookings
corepack pnpm --filter @draconis/desktop-probe build
corepack pnpm --filter @draconis/desktop-probe package
$env:PLANNER_PROBE_PROFILE = Join-Path $env:TEMP ('planner-window-demo-' + [guid]::NewGuid().ToString('N'))
Remove-Item Env:PLANNER_PROBE_OUTPUT -ErrorAction SilentlyContinue
Write-Output $env:PLANNER_PROBE_PROFILE
& ./apps/desktop-probe/dist/packages/DraconisPlannerProbe-win32-x64/DraconisPlannerProbe.exe
```

Sluit het venster en voer alleen de laatste opdracht opnieuw uit voor dezelfde
profielmap. De bestaande taakweergave en de nieuwe Afspraken/Relaties-schermen
gebruiken allemaal de lokale IPC-client. De renderer heeft in deze proef geen
netwerktoegang; de Windows-netwerkadapter is niet uitgeschakeld.

## Kort demonstratiescenario

1. Maak in Relaties **Fictieve onderhoudsklant** met `demo@example.test` aan.
   Zoek dezelfde klant opnieuw; voeg hem niet nogmaals toe.
2. Open Afspraken en kies morgen. Vul een fictieve blokkadereden in en blokkeer
   de ochtend. Boek voor dezelfde klant de middag, met interne aankomst 14:15.
   Het klantvenster blijft 13:00–17:00. De middag wordt Bezet.
3. Geef de ochtend vrij. Probeer een ochtendafspraak met aankomst 12:00: de UI
   toont dat deze buiten het halfopen venster ligt en maakt geen afspraak.
4. Verplaats de bestaande middagafspraak naar de ochtend met interne aankomst
   09:15. De middag komt vrij. Boek daar nog een afspraak voor dezelfde klant.
5. Rond de ochtendafspraak af: de ochtend blijft bezet. Annuleer de tweede
   afspraak: de middag komt vrij. Blokkeer en geef die middag opnieuw vrij.
6. Herlaad de webapp of herstart de exe met dezelfde profielmap. Klantkaart,
   afspraken, status, vensters en geschiedenis blijven bewaard.
7. Archiveer de klant. De klant verdwijnt uit nieuwe afspraakselectie. Met
   **Ook gearchiveerde relaties** is de klantkaart inclusief historie te vinden.

Een versieconflict vraagt om verversen. Bij een onbekende netwerkuitkomst biedt
de UI dezelfde handeling opnieuw aan met dezelfde opdrachtsleutel; start dan
geen tweede handeling. Een procesherstart hervat een verloren formulier niet.

## Acceptatie en vervolgstap

De lokale technische controles en synthetische browser-/desktopflows slagen.
Laat voor productacceptatie de tijdzone, 90 kalenderdagen, weekendboekingen,
08–12/13–17, statusovergangen en handmatig boeken in verstreken dagdelen van
vandaag beoordelen. Dit zijn expliciete pilotkeuzes, geen besloten cloudbeleid.

De kleinste voorgestelde volgende bouwstap is vijf **fictieve lokale zones** met
eigen dagdeelcapaciteit. Acceptatie: zonekeuze is zichtbaar, een blokkade raakt
één zone, bij capaciteit twee slagen exact twee van drie gelijktijdige
reserveringen en een verlaging onder bezetting faalt atomair. Dit voorstel is
nog niet geïmplementeerd. OIDC, PostgreSQL, cloudhosting, schone installatie,
signing en updatevertrouwen blijven afzonderlijk open.
