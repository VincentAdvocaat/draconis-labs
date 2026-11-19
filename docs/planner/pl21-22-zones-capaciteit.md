# PL-21/22 · Lokale zones en dagdeelcapaciteit

Deze vervolgstap bouwt op PR #28, code onafhankelijk herbeoordeeld op
`e42daa81f711ef862aa24575e8dac3287eaf1108`, met documentatiebasis `9b5c810`.
De [lokale demo](demo-lokaal.md) bevat de startcommando's. Cloud, PostgreSQL,
OIDC, installatie/signing en updatevertrouwen blijven open. De oorspronkelijke
[PL-01–18-matrix](pl14-15-lokale-contacten-afspraken.md) blijft als eerdere
lokale baseline gelden; dit is geen cloudacceptatie van PL-18.

## Gebieden en fictieve postcode-indeling

Er zijn vijf gebieden per lokale werkruimte, inclusief de blijvende
`standard`-zone. Bestaande slots en afspraken horen na migratie bij
**Standaardgebied**. Noord, Oost, Zuid en West zijn expliciet fictieve voorbeelden.
De medewerker kiest het gebied zelf; een afspraak verwijst via zijn slot naar
precies één gebied binnen dezelfde werkruimte.

De postcodeproef heeft uitsluitend demonstratiecodes:

| Fictieve code | Gebied |
| --- | --- |
| 0001 AA | Standaardgebied |
| 0002 AA | Noord (fictief) |
| 0003 AA | Oost (fictief) |
| 0004 AA | Zuid (fictief) |
| 0005 AA | West (fictief) |

Dit is geen echte Nederlandse geografische indeling. De resolver normaliseert
spaties/hoofdletters en geeft `UNKNOWN_POSTCODE`/404 bij een onbekende code,
`AMBIGUOUS_POSTCODE`/409 bij dubbele configuratie en 400 bij een ongeldig formaat.
Een dubbele toewijzing kiest nooit stilzwijgend één gebied. De lokale
configuratie is geïnjecteerd en in code vastgelegd; er is geen configuratie-UI,
geocoder, netwerkopvraging of klantadresopslag toegevoegd.

## Rooster, uitzonderingen en afspraken

De bestaande tijdzone, 90 kalenderdagen en twee configureerbare dagdelen blijven
gelden. Elk gebied heeft een standaardcapaciteit voor **nog niet aangemaakte**
slots. De concrete slotrij bewaart zijn eigen capaciteit en versie. Een
wijziging van de standaard verandert bestaande tijdvakken niet. De medewerker
kan een bestaand dagdeel met een verplichte versie aanpassen, ook naar nul.
De pilot accepteert uitsluitend gehele capaciteiten van 0 tot en met 100.

Beschikbaarheid en afspraaklijsten filteren op werkruimte, gebied en datum.
Zonder gebied blijft de bestaande client `standard` lezen. Een volle plek
houdt rekening met alle geplande en uitgevoerde afspraken. Annuleren geeft
capaciteit vrij. Een blokkade sluit alleen het gekozen slot en vereist nul
bezette plaatsen, ook wanneer het slot nog niet helemaal vol is.

Alle schrijvers gebruiken dezelfde `BEGIN IMMEDIATE`-poort. Capaciteit,
bezetting, blokkade en afspraakversie worden daar opnieuw gelezen. Een verlaging
onder bezetting geeft `CAPACITY_BELOW_OCCUPANCY`/409 en schrijft geen receipt.
Een volle of geblokkeerde bestemming laat de oorspronkelijke afspraak intact.
Een verplaatsing naar een ander gebied bewaart een nieuw gebiedssnapshot naast
het klantvenster; interne aankomst wordt opnieuw gekozen of leeggemaakt.
Gebeurtenis en idempotentie-uitkomst horen bij dezelfde transactie. De
idempotentiescope blijft werkruimte, actor, operatie en sleutel.

SQLite-triggers bewaken daarnaast overboeking, blokkeren van een bezet slot en
capaciteitverlaging door directe SQL-writers. Samengestelde foreign keys borgen
dat afspraak, slot, gebied en klant bij dezelfde werkruimte horen. Er is geen
gedeelde personeelscapaciteit over gebieden of automatische routeplanning.

## Migratie 3 en behoud

De migratie kopieert de vier betrokken tabellen tijdelijk, verwijdert
afhankelijke tabellen vóór hun ouder, maakt de nieuwe constraints/indexen aan en
zet de gegevens terug binnen dezelfde migratietransactie. Foreign keys worden
niet uitgezet. Bestaande IDs, taakrijen, klantrelaties, versies, klantvenster-JSON
en gebeurtenis-JSON blijven behouden. Oude gebeurtenissen krijgen geen
achteraf verzonnen gebiedspayload.

Oude afspraak-receipts krijgen alleen de aanvullende `zoneId`/`zoneName` in hun
uitkomst. De oorspronkelijke invoerhash en sleutel blijven gelijk. Een exact
herhaalde oude opdracht blijft daardoor dezelfde afspraak teruggeven via het
uitgebreide responseschema. Een fout midden in de tabelopbouw rolt schema,
gegevens en migratiemarker terug; reparatie en retry zijn getest.

Snapshot-importversie 1 blijft oude taken/voorkeuren importeren en weigert
boekingsdatabases. Volledige bestandsbackup en herstel bewaren ook deze nieuwe
tabellen. De migratie is op eigen synthetische bestanden beproefd; er is geen
echte gebruikersdatabase geopend.

## Bewijs en acceptatiegrens

- De suite omvat 113 tests: 86 API, 9 ReactDOM, 7 core, 5 shared en 6 desktop.
  De nieuwe migratie-/gedragstests draaien met SQLite 12.11.1 én 13.2.0.
- Twaalf nieuwe procesproeven gebruiken onafhankelijke verbindingen: capaciteit
  twee met drie schrijvers, drie gelijke sleutels, reserveren tegenover verlagen
  in beide volgordes, twee volle tegengestelde gebiedsverplaatsingen en dezelfde
  gebiedsverplaatsing tweemaal. De bestaande acht boekingsraces blijven behouden.
- De verpakte exe is vijfmaal gestart op een alleen-lezen Backup-API-kopie van
  het eerdere eigen PR-28-profiel. De oude tien afspraakvensters en 25
  gebeurtenispayloads zijn ongewijzigd vergeleken, evenals de oorspronkelijke
  bronhash. De nieuwe renderer bediende zonekeuze, capaciteit wijzigen en
  gebiedsverplaatsen via de werkelijke React-controls. Verdere capaciteit- en
  conflictcontroles gebruikten de daadwerkelijke renderer-SDK.
- De normale Chrome/HTTP-flow toont twee reserveringen in Noord, een zichtbare
  geweigerde verlaging naar één, verplaatsen naar Oost met aparte aankomsttijd,
  een blokkade die Noord niet raakt en standaard drie voor nieuwe Oost-slots
  terwijl oude slots één blijven. Browserherladen en een gecompileerde
  API-herstart behouden dezelfde REST-toestand.

Bewijs: `evidence/pl21-22-desktop.json`, `evidence/pl21-22-web.json` en de
bijbehorende web-PNG. De bekende verborgen Electron-screenshotbeperking blijft
gelden; die screenshot is geen aanvullend visueel bewijs.

PL-21 en PL-22 zijn hiermee lokaal uitgevoerd voor deze fictieve pilotindeling.
Dezelfde garanties op PostgreSQL en de eerdere cloud-/releasevoorwaarden blijven
open. Er is geen merge, deployment of cloudresource aangemaakt.
