# Lokale Planner-acceptatiematrix

Stand 19 november 2026, na de lokale PL-31/32-proef. De PR-reeks is gestapeld
en niet gemerged. Deze matrix beschrijft bewijs op de bestaande Windows-
ontwikkelwerkplek met fictieve gegevens. Zij accepteert geen cloudrelease.

De [toetsenbordvervolgstap](toetsenbord-demo.md) voegt concrete dialog-, fout-
en bevestigingsfocuscontroles toe, met 155 tests en een gezamenlijke lokale
start. Het [installatiedraaiboek](installatie-upgradeproef.md) is voorbereid;
installatie en uninstall zijn niet uitgevoerd. De ongemergde keten blijft
#9 → #12 → #15 → #20 → #23 → #28 → #30 → #33 plus deze vervolgstap.

| Onderdeel | Lokale uitkomst en bewijs | Resterend |
| --- | --- | --- |
| Bestaande taken, historie, voorkeuren en herhaling | Gedeelde kern en SQLite via HTTP en desktop; contract- en regressietests. [PL-11](pl11-lokale-client.md), [atomiciteit](pl13-sqlite-atomiciteit.md) | PostgreSQL en volledige dagelijks-gebruikacceptatie |
| Werkruimtecontext | Expliciet gebonden clients en adapters; late responses en A/B-isolatie getest | OIDC, lidmaatschap, rollen, afmelden en echte werkruimtekiezer |
| Lokale desktopstart en opslag | Gebundelde ongeïnstalleerde exe; renderer/preload/SQLite, data na herstart en appmapvervanging behouden. [ADR](adr-001-windows-runtime.md) | Schone machine, echte installatie/upgrade, signing, updates en definitieve runtimekeuze |
| Relaties | Aanmaken, wijzigen, zoeken, archiveren en klantkaart; normale lokale UI en regressies. [PL-14/15](pl14-15-lokale-contacten-afspraken.md) | Brede toegankelijkheids- en gebruikersacceptatie |
| Handmatige afspraken | Plannen, verplaatsen, afronden, annuleren, blokkeren/vrijgeven; versieconflict, rollback en races getest. [PL-14/15](pl14-15-lokale-contacten-afspraken.md) | Dezelfde garanties op PostgreSQL |
| Klanttijdvak en interne aankomst | Onafhankelijke velden in medewerkersapp; publieke projectie sluit interne tijd uit | Cloudclients met dezelfde werkruimte |
| Zones en capaciteit | Vijf fictieve zones, demo-postcodes, standaard en slotuitzondering; twee van drie schrijvers winnen bij capaciteit twee. [PL-21/22](pl21-22-zones-capaciteit.md) | Echte gebiedsindeling en roosters na gebruikersbesluit |
| Publiek kanaal en beschikbaarheid | Eén expliciet lokaal kanaal, exacte origin en werkruimte; publieke API zonder private CRUD, minimale projectie, begrensde body en limiter. [PL-31/32](pl31-32-lokaal-publiek-boeken.md) | HTTPS-hosting, gedistribueerde limiter en productievoorzieningen |
| Publieke reservering | Contact, afspraak, aanvraag en receipts atomair; exacte retry, publieke/medewerkersraces en herstart via HTTP getest. Normale Chrome-boeking zichtbaar in medewerkersapp | Onbevestigd browserformulier herstellen na afsluiten, e-mailvoorziening en cloudacceptatie |
| Bevestiging | Willekeurige referentie en klanttijdvak; geen publiek PII-opvraagpad; sessionStorage alleen publieke projectie | Geen berichtbezorging geleverd |
| Migraties | Genummerde migraties tot 4; ruwe vensters/events/receipts behouden en foutrollback; beide SQLite-bindings getest | PostgreSQL-dialectmigratie en echte productupgrade |
| Backup, import en herstel | Snapshot-import voor ondersteunde taakdata; afzonderlijke volledige bestandsbackup/herstel voor boekingsdata. [PL-13](pl13-snapshot-import-herstel.md) | Cloud-PITR en herstel op schone machine |
| Fouten en netwerkverlies | Foutenvelop, onbekende uitkomst en retry met dezelfde sleutel/payload; geen automatische cloud-naar-lokaal-write | Brede handmatige toetsenbord-/focuscontrole en alle verbroken-netwerkscenario's |
| Verificatie huidige stap | 148 tests, typecheck, lint, build en twee startup-smokes groen; browserbewijs en reviewrapport bij PR #33 | Geen bewijs voor productiebelasting of volledige WCAG-conformiteit |
| Outlook en synchronisatie | Niet uitgevoerd | Aparte account-/consentkeuzes en expliciete scope; geen externe berichten verstuurd |

## Eerstvolgende kosteloze stap

Doorloop de resterende normale bediening met toetsenbord en focusherstel in
de medewerkers- en bezoekersschermen, inclusief foutmeldingen en verversen.
Bereid daarna een reproduceerbaar installatie-/upgradedraaiboek voor de
bestaande unsigned Squirrel-proef voor, met eigen synthetisch profiel en
expliciete scheiding van een echte installatietest op een schone machine.
Die voorbereiding kan met de aanwezige Node/Electron-toolchain.

De lokale PostgreSQL-proef draait inmiddels in Docker. De proef dekt taken,
voorkeuren en idempotente taakcreatie, met de twee SQLite-fixtures als bron.
De open criteria voor Fastify, boekingsdata en managed herstel staan bij de
[PostgreSQL-proef](pl13-postgres-proef.md).

Cloudhosting, identity, signing en Outlook blijven afzonderlijke beslissingen.
