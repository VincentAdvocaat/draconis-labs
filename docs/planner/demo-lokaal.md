# Lokale Planner-demo

Deze demo gebruikt uitsluitend nieuwe fictieve gegevens. Zij maakt geen
cloudresources of accounts aan en installeert niets. De publieke stap bouwt
gestapeld op PR #30 voort. De [publieke boekingsregels](pl31-32-lokaal-publiek-boeken.md),
[zoneregels](pl21-22-zones-capaciteit.md)
en [eerdere storymatrix](pl14-15-lokale-contacten-afspraken.md)
onderscheiden lokale functionaliteit van de nog open cloud- en release-eisen.

## Web starten

Open PowerShell in de Planner-worktree. Deze eerste terminal blijft de API
draaien. Het uitgeprinte databasepad is het eigen demobestand; bewaar dat voor
een volgende start met dezelfde gegevens.

```powershell
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-public-booking
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
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-public-booking
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

## Lokale bezoekerspagina starten

Start eerst de twee webterminals hierboven en plan eventueel een fictieve
medewerkersafspraak. Open een derde terminal, vul exact het eerder uitgeprinte
eigen databasepad in en maak eenmaal het kanaal. Bewaar de uitgeprinte URL.
Een tweede actief kanaal voor dezelfde werkruimte wordt geweigerd.

```powershell
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-public-booking
$env:DATABASE_PATH = 'C:/Users/vince/AppData/Local/Temp/planner-demo-VERVANG/own.sqlite'
corepack pnpm --filter @draconis/api planner:channel --database $env:DATABASE_PATH --origin http://127.0.0.1:3044 --name 'Fictief onderhoud'
$env:PUBLIC_HOST = '127.0.0.1'
$env:PUBLIC_PORT = '3043'
corepack pnpm --filter @draconis/api start:public
```

Open een vierde terminal:

```powershell
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-public-booking
corepack pnpm --filter @draconis/planner dev:public
```

Open de kanaal-URL op poort 3044. Gebruik `0002 AA` voor Noord en kies een datum
binnen 90 dagen. Boek met fictieve contactgegevens en ververs daarna de interne
Afspraken-weergave voor dezelfde zone en datum. De publieke bevestiging toont
alleen tijdvak en referentie. Stop en herstart uitsluitend `start:public` in
dezelfde derde terminal om dezelfde database en hetzelfde kanaal te behouden.
Voer de kanaalaanmaak bij herstart niet opnieuw uit. De publieke frontendproxy
verwacht poort 3043 en de kanaalbinding verwacht exact origin 3044.

## Verpakte Windows-proef starten

Dit maakt een ongeïnstalleerde, niet ondertekende proef-exe. Het lokale profiel
is onafhankelijk van de webdemo; er vindt geen synchronisatie plaats.

```powershell
Set-Location C:/git/draconis-labs/.worktrees/feature/planner-local-public-booking
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
8. Activeer dezelfde fictieve klant opnieuw. Kies Noord en zet de ochtend op
   capaciteit twee. Boek twee afspraken; een derde plek wordt niet aangeboden.
   Probeer de capaciteit naar één te verlagen: dit geeft een duidelijke fout.
9. Verplaats één afspraak via Werkgebied naar Oost. Noord houdt één van twee
   plaatsen bezet. Blokkeer een leeg Oost-dagdeel en controleer dat hetzelfde
   dagdeel in Noord beschikbaar blijft.
10. Zet de standaardcapaciteit van Oost op drie. Open een nog niet aangemaakte
    datum: nieuwe slots hebben drie plaatsen. Oude Oost-slots blijven gelijk.
11. Zoek met **Fictieve postcodevoorbeelden** op `0002 AA`: Noord wordt gekozen.
    Een onbekend voorbeeld, zoals `9999 ZZ`, geeft een duidelijke fout. Dit
    gebruikt uitsluitend de getoonde fictieve indeling, geen echte dekking.

Een versieconflict vraagt om verversen. Bij een onbekende netwerkuitkomst biedt
de UI dezelfde handeling opnieuw aan met dezelfde opdrachtsleutel; start dan
geen tweede handeling. Een procesherstart hervat een verloren formulier niet.

## Acceptatie en vervolgstap

De lokale technische controles en synthetische browser-/desktopflows slagen.
Laat voor productacceptatie de tijdzone, 90 kalenderdagen, weekendboekingen,
08–12/13–17, statusovergangen en handmatig boeken in verstreken dagdelen van
vandaag beoordelen. Dit zijn expliciete pilotkeuzes, geen besloten cloudbeleid.

De vijf fictieve lokale zones en dagdeelcapaciteit zijn inmiddels lokaal
uitgevoerd en getoetst. Laat de indeling en pilotregels beoordelen voordat een
publiek boekingskanaal wordt toegevoegd. OIDC, PostgreSQL, cloudhosting, schone installatie,
signing en updatevertrouwen blijven afzonderlijk open.
