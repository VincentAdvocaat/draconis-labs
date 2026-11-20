# PL-14/15/16 · Lokale contacten en afspraken

Deze vertical bouwt op de gereviewde snapshotstap PR #23 (`edf7d55`). Eén lokale
werkruimte gebruikt dezelfde React-schermen, getypeerde opdrachten, core en
SQLite-adapter via HTTP en Electron-IPC. Taken blijven beschikbaar. Cloud,
PostgreSQL, lidmaatschap, publieke boekingen en Outlook zijn nog niet gerealiseerd.

## Expliciete pilotkeuzes

- Europe/Amsterdam, 90 kalenderdagen vanaf vandaag, inclusief vandaag en
  exclusief dag 90. Ook weekenddagen en verstreken dagdelen van vandaag zijn
  handmatig planbaar; er is nog geen kantooruren- of achterafboekingsbeleid.
- Ochtend 08:00–12:00 en middag 13:00–17:00, ieder capaciteit één. De core
  ontvangt een configureerbaar rooster; deze eerste UI bevat geen roosterbeheer.
  Slots worden bij het openen van een datum binnen de horizon aangemaakt en
  bestaan dus vóór een reserveringsopdracht. Bestaande slots blijven bewaard bij
  latere roosterwijziging; nieuwe dagdelen mogen daarmee niet overlappen.
- Eén impliciet werkgebied. De nieuwe zakelijke tabellen hebben werkruimte-ID's;
  queries en samengestelde foreign keys bewaken dezelfde werkruimte. De lokale
  HTTP-/desktop-samenstelling accepteert uitsluitend `local`. Dit is geen
  cloudautorisatie of overdracht tussen werkruimten.
- Gepland mag worden verplaatst, afgerond of geannuleerd. Uitgevoerd blijft
  capaciteit bezetten. Geannuleerd geeft capaciteit vrij; heropenen valt buiten
  deze versie. Een bezet dagdeel kan pas na verplaatsen of annuleren worden
  geblokkeerd. Vrijgeven verwijdert uitsluitend de gekozen blokkade.

Relaties kunnen worden gemaakt, gewijzigd, gezocht en gearchiveerd. Gedeelde
e-mailadressen of telefoonnummers zijn toegestaan. Archiveren verwijdert geen
klantkaart of geschiedenis; de klant verdwijnt uit nieuwe afspraakselectie.
Een bestaande afspraak van een inmiddels gearchiveerde klant blijft beheerbaar.

## Tijdvakken en transacties

De afspraak bewaart het toegezegde klantvenster met lokale datum, dagdeel,
tijdzone en opgeloste UTC-grenzen. Een afzonderlijke interne aankomsttijd moet
binnen het halfopen venster liggen. Bij verplaatsen wordt deze opnieuw gekozen
of leeggemaakt. Temporal 0.5.1 valideert kalenderdatums en weigert ongeldige of
dubbelzinnige lokale slotgrenzen; het opdrachtcontract accepteert interne tijden
uitsluitend met expliciete offset. De UI weigert een dubbelzinnige tijd in
plaats van zelf een offset te kiezen. [Temporal-polyfill](https://github.com/js-temporal/temporal-polyfill).

Alle contacten-/afsprakenmutaties, beschikbaarheidsmaterialisatie en reads lopen
via dezelfde geïnjecteerde synchrone transactiepoort. SQLite neemt
`BEGIN IMMEDIATE` vóór reads. Binnen die lock worden versie, contactstatus,
bezetting en blokkade opnieuw gelezen. Een partiële unique index bewaakt
capaciteit één ook op databaseniveau. Een volle bestemming laat afspraak en
bronslot intact. Afspraak, gebeurtenis en opdrachtuitkomst worden in één
transactie vastgelegd; een fout rolt alles terug. Busy-wachten is maximaal
5 seconden; daarna volgt `UNAVAILABLE`/503.

De idempotentie-identiteit is werkruimte, actor, operatie en UUID-sleutel.
Een SHA256 van canonieke gevalideerde invoer bewaakt hergebruik: dezelfde
invoer geeft de oorspronkelijke uitkomst terug, andere invoer geeft 409.
De write-lock serialiseert ook de ontvangstregistratie. De UI bewaart bij
onbekende netwerkuitkomst dezelfde opdracht en sleutel bij opnieuw proberen,
ook bij navigatie naar Taken en terug. Een procesherstart bewaart serverreceipts,
maar hervat geen verloren UI-formulier. Auditgebeurtenissen bevatten actor,
tijdstip en oude/nieuwe vensters; geen naam/e-mail/telefoon.

Migratie 2 voegt alleen nieuwe tabellen/indexen toe. Bestaande taakrijen worden
niet aangepast. Snapshot-importversie 1 blijft beperkt tot het oude takenschema
en weigert een bron met boekingstabellen/migratie 2, zodat er geen contacten
stilzwijgend verloren gaan. Volledige backup/restore bewaart ook de nieuwe tabellen.

## Normale entrypoints en bewijs

Web gebruikt de bestaande pnpm dev-entrypoints met lokale HTTP-routes onder
`/api/v1/workspaces/local`; er is geen onversiede alias voor boekingen. Desktop
bundelt nu dezelfde React-weergaven in de bestaande proefshell, inclusief lokale
CSS en automatische JSX-transformatie. Webfilters blijven URL-synchronisatie
gebruiken; `file:`-vensters houden hun exacte entry-URL voor de ongewijzigde
IPC-afzendercontrole. De renderer heeft geen netwerktoegang in deze proef.

- 91 tests: 66 API, 7 core, 5 shared, 7 ReactDOM en 6 desktop. De nieuwe
  gedragstests draaien met SQLite 12.11.1 en 13.2.0. Acht procesproeven houden
  de eerste write-lock vast en bewijzen reserveren/reserveren,
  reserveren/blokkeren, blokkeren/reserveren en dezelfde sleutel tweemaal.
- ReactDOM bewijst verplaatsen naar een andere datum met oorspronkelijke versie
  en aparte aankomst, plus herhalen van dezelfde onbekende opdracht na navigatie.
- De verpakte Windows-exe is vijfmaal gestart met een eigen nieuwe synthetische
  profielmap. **Klant aanmaken en afspraak plannen gebeurden via de echte
  React-formulieren.** Verplaatsen, blokkeren/vrijgeven, afronden, annuleren,
  archiveren, idempotentie en versieconflict gebruikten de daadwerkelijke
  renderer-SDK via preload/IPC. Taken, klantkaarten, afspraken en gebeurtenissen
  zijn exact vergeleken tussen procesherstarts.
- De machine is de bestaande ontwikkelwerkplek; OS-cache is niet geleegd.
  Installatie/upgrade op een schone Windows-machine, signing en updatevertrouwen
  blijven open volgens ADR-001. Deze proef installeert of publiceert niets.

Het compacte runtimebewijs staat in `evidence/pl14-15-desktop.json`. De normale
Chrome-webapp is met een aparte eigen SQLite-demo via HTTP bediend: klant maken,
ochtend blokkeren/vrijgeven, middag boeken met interne aankomst 14:15, zichtbare
bezetting, aankomst op de uitgesloten eindgrens weigeren, verplaatsen naar
08:00–12:00 met 09:15 intern, annuleren, middag blokkeren/vrijgeven en opnieuw
laden. De annulering en vrije capaciteit bleven zichtbaar na herladen.

Deze controle vond een ontbrekende CORS-methodenconfiguratie bij een aparte
`VITE_API_URL`: DELETE kwam door de preflight niet op de server. De API staat
nu de ondersteunde PATCH/DELETE-methoden expliciet toe. De gecompileerde
starttest bewijst beide preflights en tweemaal vrijgeven met dezelfde sleutel.
De ongewijzigde blokkade vóór herstel is ook via de HTTP-read bevestigd.

De onafhankelijke review vond daarnaast een late contactmutatie die na
navigatie oude zoekresultaten teruglaadde. Voltooiing gebruikt nu de actuele
reload-functie. Twee ReactDOM-regressies (succes en definitieve fout) falen met
de oude closure en slagen met de fix. Een volledige reviewrun liep onder
suitebelasting op twee tijdslimieten; beide gevallen slaagden afzonderlijk.
Alleen de import-/CLI-integratiegevallen hebben daarom een ruimere expliciete
tijdslimiet gekregen, zonder gewijzigde functionele verwachtingen.

De verborgen desktop-screenshotcapture blijft soms het eerste frame tonen;
zij geldt niet als visueel bewijs van het afsprakenscherm. Het packagedbewijs
berust op daadwerkelijke formulieracties, DOM-resultaten, SDK-uitkomsten en
duurzame vergelijking na herstart. Het zichtbare afsprakenscherm is aanvullend
in de normale Chrome-browser gecontroleerd.

## Status oorspronkelijke stories

| Story | Lokale stand | Nog open voor volledige acceptatie |
| --- | --- | --- |
| PL-01 | Synthetische oude/huidige taakfixtures en regressies | Brede handmatige taakbediening/gebruikte clients inventariseren |
| PL-02 | Werkende Electron-proef, native SQLite en gedeelde UI | Vergelijkbare Tauri-proef en schone installatie/upgrade |
| PL-03 | Niet uitgevoerd | OIDC/accountkoppeling, cloud-/hosting- en herstelkeuzes |
| PL-04 | Pilotregels hierboven expliciet en getest | Producteigenaaracceptatie en cloudrollen |
| PL-11 | Geïnjecteerde core + SQLite, HTTP en IPC gedeeld | Asynchrone PostgreSQL-adapter |
| PL-12 | Expliciete lokale client/werkruimte, foutgrens en lifecycle | Cloudidentiteit/lidmaatschap/isolatie |
| PL-13 | Genummerde migraties, atomiciteit, snapshot/import/herstel | PG, cloudimport, hersteldoelen en operationele omschakeling |
| PL-14 | Lokale relaties/klantkaart/zoeken/archiveren | Cloudvariant en productacceptatie |
| PL-15 | Lokale afspraken/dagdelen/blokkades/versies/idempotentie | Dezelfde garanties op PostgreSQL |
| PL-16 | Gedeelde navigatie en lokale schermen | Cloudmodus, werkruimtekiezer en verdere toegankelijkheidscontrole |
| PL-17/18 | Niet uitgevoerd | Zie backlog; geen cloud-/releaseclaim |

De oorspronkelijke backlog bevat geen PL-05 tot en met PL-10.

De eerstvolgende productstap is de lokale demonstratie met fictieve klanten
doorlopen en de pilotregels laten beoordelen. Daarna worden concrete
gebruikersbevindingen opgepakt; aanvullende infrastructuur volgt uit de nog
openstaande beslissingen, niet uit deze lokale vertical.
