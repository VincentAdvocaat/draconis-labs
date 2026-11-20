# Resterende oorspronkelijke criteria na PR46

Gebaseerd op de oorspronkelijke [mediafasen](../media-catalogus/backlog.md), [CMS-backlog](../cms/backlog.md) en [eerdere inventarisatie](../integratie-v2/open-criteria.md). PR46 verenigt M2-bestandsversies en lokale M5-exportacceptatie met CMS09-herstel. De458-testpoort en lokale fixtures maken de bredere oorspronkelijke criteria niet automatisch compleet.

## Kleinste lokale vervolgstap

Eerste voorstel: uitsluitend snapshotgebonden categoriefilterlinks met een Alle-itemslink in de zelfstandige portfolio. Categorieën, locale-namen en gepinde volgorde bestaan al. Geen schema-/CMS-/uploadwijziging nodig als filtering alleen de bestaande snapshot leest. Accepteer NL/EN, lege/onbekende categorie, behoud van snapshotvolgorde, gewone toetsenbordlinks en focus/terugnavigatie op mobiel en desktop. Oude snapshot-JSON en bestaande routes/beeldbytes blijven gelijk. Eén eigen PR en onafhankelijke review. Dit voorstel start de feature nog niet.

## Geprioriteerde afbakening en afhankelijkheden

| Volgorde | Oorspronkelijk gat | Kleinste afgebakende stap | Afhankelijkheid en acceptatie |
| --- | --- | --- | --- |
| 1 | M4 daadwerkelijk categoriefilter | Alleen de hierboven beschreven snapshotlinks | Bestaande categorie-/snapshotcontracten; geen nieuwe collectie, cover of multi-image |
| 2 | CMS02 routelevenscyclus | De redacteur kan de slug van een gewone NL-pagina wijzigen. Bij publicatie krijgt de actieve pagina het nieuwe adres en geeft het vorige adres 404. | De eerdere gepinde release behoudt haar oorspronkelijke adres. Een andere pagina kan een eerder gepubliceerde slug niet overnemen. Verwijderen en herstellen staan nog open. |
| 3 | M4 zichtbare credits | Eerst vastleggen welke expliciete publieke credit per gebruik wordt gepind, daarna één renderpad | Bestaand rechtenbewijs is geen automatische toestemming alle private auditvelden te publiceren. Ontbrekend/verplicht/locale en oud snapshot testen |
| 4 | M6/CMS07 synthetische import | Dry-run van één klein herkenbaar oud fictief schema naar een nieuwe kopie, met mapping en uitzonderingen | Stabiele route-/locale-/media-IDmapping, bronhashes, twee fictieve tenants; daarna pas afzonderlijk idempotente apply+rollback. Geen echte brondata |
| 5 | M4 selectie/cover/multi-image | Eerst één bewuste coverselectie binnen een begrensde item-mediarelatie | Huidig item gebruikt één mediaref. Meerdere beelden vragen expliciet schema-/snapshot-/per-use-alt-/retentiemodel en migratie; niet als kleine filterfix meenemen |
| 6 | CMS03 localeconfig/fallback | Eén configureerbare extra fictieve taal en zichtbare onvolledigheidsdiagnose | Huidige NL/EN-aannames over CMS, catalogus en releasepins inventariseren; defaults, bewust leeg versus ontbrekend, expliciete fallback en oude releases testen |

Een gecombineerde migratie-engine voor media en CMS, algemeen templateframework, extra collecties, batch en lightbox horen niet automatisch in deze stappen. De keuzes hierboven vermijden dat een zichtbare kleine wijziging ongemerkt een breed datamodelproject wordt. De eigenaar kan de volgorde wijzigen op basis van echte gebruiksprioriteit.

## Productie- en platformgrenzen

| Gebied | Nog nodig |
| --- | --- |
| CMS04/platformidentity | Provider/testtenant, echte Viewer/Editor/Publisher/Owner-capabilities, sessie-/agentkeybeleid en website-isolatieacceptatie |
| Planner PostgreSQL/cloud | Werkende adapter en onafhankelijke concurrency/import/herstelproef in toegewezen testomgeving; SQLite-bewijs vervangt dit niet |
| Hosting/operatie | Account- en kostengrens, deployment/CI, monitoring, bewaartermijnen/offsite backup en hersteldoelen |
| Windowsdistributie | Schone beschikbare Windows-testomgeving, standaardgebruiker, upgrade/behoud/uninstall; signing/updateketen apart |
| Outlook/Microsoft365 | Testtenant, consent, datakeuze, conflict-/agenda/outboxregels; er is geen e-mail verstuurd |
| Echte import/omschakeling | Gerichte bron-/rechtenopdracht, mappingbesluit en gecontroleerde herstel-/rollbackacceptatie vóór live wijzigingen |

De lokale stappen zijn zonder betaalde diensten uitvoerbaar op nieuwe fictieve opslag. Externe accounts, provisioning, kosten en klantgegevens worden niet uit deze consolidatie afgeleid. Geen vervolgfeature, cloudresource of live task aangemaakt.

