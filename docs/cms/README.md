# CMS-plan

Ontwerp van 19 november 2026. De oorspronkelijke ontwerp-PR bevat alleen bouwopdrachten. De afzonderlijke lokale tekstproef is hieronder gelinkt; er zijn geen klantgegevens gekopieerd, cloudservices ingericht of bestaande websites gepubliceerd.

- [Onderzoek en hergebruik](onderzoek.md) beschrijft de aangetroffen repositories, chats en beperkingen.
- [Architectuur en gebruik](architectuur.md) legt pagina's, drafts, rollen, publicatie en modulegrenzen vast.
- [Backlog en verificatie](backlog.md) bevat afhankelijke bouwstappen, migratie en herstel.
- [Eerste bouwopdracht](eerste-bouwopdracht.md) is een afgebakende lokale demonstratie met fictieve tekst.
- [Lokale tekstproef](lokale-proef.md) documenteert de afzonderlijke CMS-01-implementatie en haar start-/testcommando's.
- [Afbeeldingreferentieproef](media-proef.md) koppelt één vaste fictieve PNG aan draft, privépreview en lokale release.
- [Echte uploadproef](upload-proef.md) verbindt de M1-processor en expliciete rechtenvrijgave met de normale CMS-browserflow.
- [Pagina's en blokken](paginas-blokken-proef.md) voegt nieuwe pagina's en volledige sitepublicaties toe met behoud van de bestaande home.
- [Centrale tekstredactie](centrale-tekstredactie.md) werkt de vervolgrichting voor pagina's, blokken en localevarianten uit.

De bestaande sites blijven hun huidige ASP.NET Core CMS gebruiken. Labs krijgt eerst een geïsoleerde CMS-proef binnen zijn bestaande app/API-structuur. Daarna toetsen we de adapter en migratie op een fictieve kopie. Een productiemigratie, merge of deployment vraagt een aparte opdracht van de orchestrator.

De oorspronkelijke ontwerpfase bleef onder `docs/cms`. De gelinkte lokale proeven hebben afzonderlijk geautoriseerde implementatiestappen. `scripts/backlog-data.json` blijft buiten deze wijzigingen. De backlogcodes `CMS-*` zijn lokale ontwerpcodes, geen bestaande Azure Boards-nummers. Zoek bij overdracht bestaande stories op voordat nieuwe work items worden aangemaakt.
