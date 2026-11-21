# Distributie van Planner

## Webinstallatie

De medewerkersapp heeft een eigen webmanifest met een stabiele ID, scope,
start-URL, themakleur en PNG-iconen van 192 en 512 pixels. De publieke
boekingspagina heeft een eigen build. Installeer Planner via het browsermenu
op HTTPS of op loopback voor een lokale proef. Controleer in een apart
browserprofiel dat Planner in een zelfstandig venster opent en na herstart
dezelfde fictieve taak toont. [Installatie in Edge](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux)

De productiebuild van Planner bewaart de statische shell en gebundelde
bestanden in de serviceworkercache. Een navigatie probeert eerst het netwerk
en valt bij een verbindingsfout terug op die shell. Een geopende app kan de
laatst geladen gegevens blijven tonen. Een offline herstart laadt alleen het
scherm, omdat API-antwoorden, taakgegevens en boekingsgegevens niet
persistent worden gecachet.

Zonder verbinding pauzeert de browserclient mutaties. Na herstel controleert
de app de API en leest zij de werkruimte opnieuw voordat schrijven weer
beschikbaar is. Een boeking waarvan het antwoord is weggevallen kan de
gebruiker met dezelfde sleutel opnieuw proberen. Er is geen wachtrij voor
nieuwe offline wijzigingen. De Windows-client houdt zijn eigen lokale modus.
AB#287 houdt installatie van de overkoepelende shell en een updatemelding open.

## Windows

Voer de Squirrel-proef vanaf de repository uit op Windows x64 met Node,
pnpm en de bestaande Electron-toolchain. Gebruik een standaardgebruiker.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @draconis/desktop-probe exec node scripts/verify-installer.mjs
```

De proef bouwt twee unsigned installers met een eigen package-ID. Windows
installeert onder de lokale appmap van die gebruiker. Het SQLite-profiel,
de backup en alle rapporten staan onder een unieke map in
`apps/desktop-probe/dist/installer-acceptance`. Gebruik uitsluitend fictieve
gegevens. De proef opent de geïnstalleerde exe, controleert herstel na
herstart, draait versie B over A, herstelt de backup in een tweede profiel
en controleert dat uninstall het oorspronkelijke profiel bewaart.
Het volledige draaiboek bevat extra punten voor een schone releaseomgeving.
[Installatiedraaiboek](installatie-upgradeproef.md)

## Resultaat op de Windows-ontwikkelwerkplek

- Chrome 157.0.8103.79 en Edge 156.0.4314.58 installeerden de gebouwde
  medewerkersapp in aparte profielen. Beide rapporteerden nul
  installatiefouten, openden in standalone modus en toonden dezelfde
  fictieve SQLite-taak bij herstart. Een tweede shellversie werd geladen bij
  de volgende opening van dezelfde app. De twee testinstallaties zijn
  verwijderd.
- Windows 11 Home x64 build 26200, Electron 45.4.1 en Node 24.22.3.
  Squirrel installeerde 0.21.0 en daarna 0.22.0 met dezelfde test-ID.
  De herstart vóór upgrade, upgrade, herstart daarna en backupherstel
  behielden de volledige vergeleken taak- en afspraakrecords. Vóór upgrade
  telde de backup vier taken, één voorkeur, twee relaties, acht afspraken,
  zestien afspraakgebeurtenissen, twaalf slots en 28 idempotentierecords.
  Beide builds gebruikten SQLite-migraties 1 t/m 4.
- Uninstall verwijderde de Planner-exe en behield de SHA-256 van het profiel.
  De verwijdermarkering en `Update.exe` bleven in de testinstallatiemap
  achter. Beide installers hadden Authenticode-status `NotSigned`.

| Artefact | SHA-256 |
| --- | --- |
| Setup 0.21.0 | `22071e9ad25827a486b9cd73dbbeecfe980cac83fe646db46eac005a87ebefc2` |
| Setup 0.22.0 | `c385467e1453f1ff4abb8df2a64ac7a644b35c209918f53201b416875167cd1d` |
| SQLite-backup vóór upgrade | `da3dcf46263eac57bdc0d0dd0734ddf824c5326307a53733a3346bb7e692ac24` |

## Releasecriteria

| Onderdeel | Nodig voor acceptatie |
| --- | --- |
| Schone Windows-installatie | Een verse Windows x64-VM met standaardgebruiker en een wegwerpsnapshot. Test de eerste start zonder vooraf geïnstalleerde ontwikkeltools, het bedoelde startmenusnelkoppelingspad, eventuele reputatiemeldingen, A→B met een echte schemaverhoging en het afgesproken databehoud bij uninstall. |
| Signing en updates | De release-eigenaar kiest certificaatuitgever, kostendekking, beheer van de signingsleutel en distributiekanaal. De releasejob ondertekent en timestampt installer en uitvoerbare bestanden. Verifieer de keten op de schone VM, controleer dat de gekozen updater een gewijzigd of verkeerd ondertekend pakket weigert en oefen herstel als de HTTPS-feed uitvalt of upgrade/migratie faalt. |
| Outlook, PL-41 t/m PL-43 | De producteigenaar kiest de interne Microsoft 365-testagenda, toegestane afspraakvelden en de conflictverantwoordelijke. De tenantbeheerder regelt een testregistratie en toestemming met de minimale agenda-rechten. Accepteer uitgaande projectie met stabiele opdracht-ID, retries en zichtbare foutstatus. Houd uitgaande events intern. Voor inkomende bezetting is een besluit nodig over het venster, verwijderingen, eigen uitgezonden events, herstel van een verlopen delta-cursor en botsingen met bevestigde afspraken. |
| Lokale/cloudsynchronisatie, PL-51/52 | De producteigenaar kiest bronhouder per record, welke wijzigingen offline zijn toegestaan en hoe gebruikers apparaten en werkruimtes koppelen. Leg vast hoe de client versies, verwijderingen, intrekking van toegang, hervatten en heropbouw behandelt. Beproef twee gelijktijdige wijzigingen en twee claims op de laatste plek. De cloud bevestigt gedeelde capaciteit. |

Broncriteria staan in de [Planner-backlog](backlog.md) en in [Azure Boards AB#287](https://dev.azure.com/vadvocaat/Draconis-labs/_workitems/edit/287), [AB#288](https://dev.azure.com/vadvocaat/Draconis-labs/_workitems/edit/288) en [AB#293](https://dev.azure.com/vadvocaat/Draconis-labs/_workitems/edit/293).
