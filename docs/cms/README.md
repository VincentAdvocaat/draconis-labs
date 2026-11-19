# CMS-plan

Ontwerp van 19 november 2026. Deze PR bevat alleen ontwerp; de beschreven modules, routes en migraties zijn bouwopdrachten. Er zijn geen klantgegevens gekopieerd, services ingericht of websites gepubliceerd.

- [Onderzoek en hergebruik](onderzoek.md) beschrijft de aangetroffen repositories, chats en beperkingen.
- [Architectuur en gebruik](architectuur.md) legt pagina's, drafts, rollen, publicatie en modulegrenzen vast.
- [Backlog en verificatie](backlog.md) bevat afhankelijke bouwstappen, migratie en herstel.
- [Eerste bouwopdracht](eerste-bouwopdracht.md) is een afgebakende lokale demonstratie met fictieve tekst.
- [Lokale tekstproef](lokale-proef.md) documenteert de afzonderlijke CMS-01-implementatie en haar start-/testcommando's.

De bestaande sites blijven hun huidige ASP.NET Core CMS gebruiken. Labs krijgt eerst een geïsoleerde CMS-proef binnen zijn bestaande app/API-structuur. Daarna toetsen we de adapter en migratie op een fictieve kopie. Een productiemigratie, merge of deployment vraagt een aparte opdracht van de orchestrator.

De instructie voor deze fase staat ontwerp met fictieve data toe. Alle wijzigingen blijven onder `docs/cms`; `scripts/backlog-data.json` en code in de drie repositories blijven buiten deze PR. De backlogcodes `CMS-*` zijn lokale ontwerpcodes, geen bestaande Azure Boards-nummers. Zoek bij overdracht bestaande stories op voordat nieuwe work items worden aangemaakt.
