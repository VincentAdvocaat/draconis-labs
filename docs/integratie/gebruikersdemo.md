# Lokale gebruikersdemo

Deze checkout bevat Planner, CMS en catalogus. Gebruik alleen fictieve gegevens. De services zijn na de acceptatieproef gestopt; onderstaande opdrachten starten nieuwe eigen loopbackinstanties. Er is geen klantdatabase of livewebsite nodig.

## Voorbereiden

Open PowerShell in de integratiecheckout en voer uit:

```powershell
./scripts/verify-local-integration.ps1
```

Dit gebruikt de gepinde pnpm11.10.0, installeert frozen en controleert build, types, lint, tests en de private/publieke startupsmokes. De huidige proef is uitgevoerd met Node24.3.0. De desktopbuild is een lokale proef, geen ondertekend installatiepakket.

## Drie modules starten

Gebruik drie PowerShell-vensters in dezelfde checkout. Laat de vensters open en gebruik Ctrl+C om de eigen starters te stoppen.

```powershell
# Venster 1: Planner met private en publieke demo
corepack pnpm --filter @draconis/api demo:local
```

Open de getoonde private URL op poort3042. De starter toont daarnaast de publieke URL met een nieuw fictief kanaal op poort3044 en de eigen tijdelijke gegevensmap. Bewaar die gegevensmap voor een herstartproef. De private en publieke API gebruiken poort3041 en3043. De starter weigert een bezette poort en stopt geen ander proces.

```powershell
# Venster 2: CMS
./scripts/start-cms-fixture.ps1 -Port 3050 -NoOpen
```

Open http://127.0.0.1:3050. Kopieer het publisher-token uit het toegangsbestand waarvan de starter het exacte lokale pad toont. Dit is uitsluitend een lokaal proeftoken. Home heeft een NL-bron; kies English bewerken voor de EN-variant. Publiceren vraagt expliciet de navigatierevisie en gewenste EN-concepten.

```powershell
# Venster 3: zelfstandige catalogus
corepack pnpm --filter @draconis/api exec tsx src/catalogus/start.ts --port=3051
```

Open de getoonde /catalogus-URL. Gebruik het tijdelijke medewerker-token uit dat venster. Zonder --root maakt de starter een eigen synthetische mediamap. Noteer de getoonde fixtureRoot. Herstarten op dezelfde catalogusgegevens kan met dezelfde opdracht plus --root=<die-eigen-fixtureRoot>; het medewerker-token is na herstart nieuw.

## Kort uitproberen

1. Planner: maak een fictieve taak, open Details, wijzig beschrijving en sla op. Tab/ShiftTab blijven binnen de dialoog; Escape sluit een ongewijzigde dialoog en brengt focus terug naar de taak.
2. Open de publieke Planner-URL uit de starter. Gebruik bijvoorbeeld demopostcode0001 AA, kies een datum en beschikbaar dagdeel, voer een fictieve naam in en bevestig. In de private Afsprakenweergave staat die afspraak met verbruikte capaciteit. Er wordt geen e-mail verstuurd.
3. CMS: upload een eigen synthetisch PNG, sla NL-alt op en leg een fictieve rechtenvrijgave vast. Vul EN-titel, slug index, SEO, introductie en eigen alt/bijschrift in. Bevestig een gewijzigde beeldbron expliciet. Bekijk de opgeslagen revisie en publiceer de gekozen navigatie- en EN-revisie. De NL-index blijft bestaan.
4. Catalogus: kies een vast proefbeeld, leg rechten vast, sla een fictief item op en maak de EN-variant. Publiceer expliciet EN; eventuele NL-fallback voor optionele beschrijving is een afzonderlijke keuze. Een snapshot is immutable. De zelfstandige catalogus en CMS gebruiken bewust gescheiden synthetische opslag.

Voor een procesherstart met dezelfde Planner-data staan de normale dist/index.js- en dist/public.js-commands en hun omgevingsvariabelen in server/api/scripts/demo-local.mjs. Gebruik uitsluitend de eigen getoonde database. Het verificatiescript bewijst daarnaast private/publieke herstart met eigen tijdelijke fixtures. De integratieacceptatie heeft alle modules werkelijk op dezelfde eigen data herstart en daarna alle eigen listeners gecontroleerd gestopt.

Dit is een lokale demo. Echte klanttemplate-aansluiting, klantimport, productie-identiteit, back-up/restore, signing en deployment zijn niet geleverd door deze integratie.
