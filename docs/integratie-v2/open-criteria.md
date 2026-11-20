# Resterende oorspronkelijke criteria

Inventarisatie van de oorspronkelijke [media M0-M6](../media-catalogus/backlog.md), [CMS](../cms/backlog.md) en [Planner](../planner/backlog.md). Dit is een statusvergelijking met de aanwezige proeven, geen nieuwe implementatieopdracht of wijziging van Azure Boards. De modules zijn lokaal bruikbaar, maar niet over de volle oorspronkelijke productiescope af.

## Media en catalogus

| Fase | Huidig bewijs | Oorspronkelijk resterend en uitvoeringsgrens |
| --- | --- | --- |
| M0 | Twee sites, pinned fileVersion/CAS, resolverhashes, retentie/purgeweigering en cross-site-tests | Productie-identiteit en fysieke individuele assetpurge buiten volledige fixturecleanup blijven open. Voor een beheerflow zijn retentie- en back-upregels nodig; lokaal fictief te testen. |
| M1 | Echte upload/decoder, grenzen, metadata verwijderen, kleine bronnen/fallback, jobherstel | De kernproef is aanwezig. Algemene opslagoperatie en eventuele batch/client-idempotency zijn bredere vervolgwensen, geen stilzwijgend extra criterium in deze consolidatie. |
| M2 | Zoeken, filters, paginering, versiedetail/retained gebruik en expliciete rechtenaudit | Nieuwe fileVersion beheren via UI en bredere toetsenbordacceptatie; lokaal uitvoerbaar. Echte medewerkeridentiteit vraagt platformidentity. |
| M3 | Vaste portfolio-collectie, typed metadata, CRUD/archief, websitecategorieën met locale/CAS, volgorde en immutable snapshots | De v1-criteria zijn lokaal afgedekt. Meer collecties/configureerbare schemas vragen productkeuze; geen algemene genericiteitsclaim. |
| M4 | Raster/detail, lege staat, snapshotvolgorde/categorielabels, alt/decorative en mobiele proef | Afzonderlijke portfolioselectie/cover, daadwerkelijke categoriefilterlinks, zichtbare vereiste credits en gerichte keyboard/focusacceptatie. Dit zijn oorspronkelijke lokale gaten. Lightbox/responsive bronkeuze alleen waar nodig, geen automatische scopeuitbreiding. |
| M5 | Gepinde CMS-consumer, volledige pinset, derivatives/exportbytes, finale rechtencontrole, herstartreconcile en vorige releasebehoud | Zelfstandige statische exportacceptatie buiten de CMS/API-host moet expliciet als gebruikersproef worden aangetoond. Eigen intrekking van reeds gekopieerde CMS-releases blijft een afzonderlijke lifecyclekeuze. Twee DB's zijn niet live crash-atomair; unknownpins blijven retained. |
| M6 | Additieve fixtures/migraties en nu gezamenlijke offline backup/restore | Dry-run, mapping/uitzonderingen, idempotente import van synthetische oude schema's, rollback en twee-tenantsacceptatie ontbreken nog als complete migratieproef. Kosteloos lokaal op fixtures mogelijk. Echte klantinventaris/import/omschakeling vraagt eigen bron- en rechtenopdracht. |

Batch, tags, meer collecties en lightbox worden niet als noodzakelijke fixes voor PR43 opgevoerd. De oorspronkelijke bron-/rechtenbesluiten en echte collectie/websitekeuze blijven bij de eigenaar.

## CMS

| Gebied | Bewezen grens | Open oorspronkelijk criterium |
| --- | --- | --- |
| CMS01/02/05/06 | Draft/revisie/CAS, pages/SEO/typed blocks, immutable site-release, media/portfolio en failurebehoud | Routelevenscyclus met rename/redirect/verwijderen en bredere revisiehistoriebediening; lokaal op fictieve data. |
| CMS03/22/23/24 | NL/EN-redactie, per-use alt, expliciete taalpublicatie, gedeelde teksten, bedienings-i18n en één contactfixture | Derde taal/localeconfig/fallbackdiagnostiek en websitebreed zoekbaar tekstoverzicht; andere echte templates blijven onaangesloten. Geen generiek templateframework nodig verklaard. |
| CMS04 | Lokale scoped editor/publishertokens, origincontroles | Platformidentiteit, volledige rolmatrix Viewer/Editor/Publisher/Owner, sessieverloop en echte agentkeys. Account/providerafstemming vereist. |
| CMS07/08 | Gesaneerde contactfixture met bronhash/provenance, vaste routes en templatepins | Reproduceerbare dry-run/importmapping en idempotency van synthetische legacydata, concrete websiteadapter/fake deployuitkomsten/rollback. Echte site-import en live target vereisen aparte opdracht. |
| CMS09 | Offline single-owner backup/restore van eigen synthetische CMS/media/catalogus naar nieuwe roots, inclusief schema3/4/5 en nieuwe secrets | Productieback-upbeleid, bewaartermijnen/offsite opslag, schaal-/tijdmeting en echte hersteldoelen. Dit is geen reeds geaccepteerde productie-SLA. |
| CMS10 | Lokale demo, regressiepoort en onafhankelijke PR-reviews | Volledige oorspronkelijke acceptatie hangt nog af van bovenstaande identity/import/adapter/operationele gaten en eigenaarsbesluit. |

## Planner

De bestaande Plannercode en sharedcontracten zijn blobgelijk aan PR37. De huidige private/public startup- en boekingsherstartsmokes zijn opnieuw groen. De eerder gereviewde lokale flows voor taken, contacten/afspraken, zones/capaciteit, publieke boeking, snapshot/import en desktopproef blijven geldig binnen hun gerapporteerde grenzen.

| Oorspronkelijke stories | Resterende grens |
| --- | --- |
| PL01/02 en PL17 Windowsdistributie | Een gebouwd unsigned pakket is geen volledige installer-/upgradeacceptatie. Schone Windows-VM, standaardgebruiker, A→B-installatie, behoud en uninstallpolicy moeten worden uitgevoerd op beschikbaar testmateriaal. Signing/updateketen vragen certificaat/distributiekeuze. Een VM wordt niet automatisch geprovisioneerd. |
| PL03/12, clouddeel PL16 en platform E3 | OIDC-provider, echte lidmaatschappen/rollen/agentkeys en web/Windows-accountkoppeling vereisen testaccount/tenant en secretbeleid. Lokale clientkeuze of testtoken bewijst dit niet. |
| PL13 en platform E5 | Werkende PostgreSQL-adapter, onafhankelijke PostgreSQL-concurrency/dry-run/import/herstel en toegewezen testomgeving blijven open. SQLite-bewijs vervangt die adapter niet. Geen database/cloudservice stilzwijgend provisionen. |
| PL18 en platform E6/E7 | Operationele pilotacceptatie, monitoring/hersteldoelen en echte cloudrelease blijven afhankelijk van hosting/identity/CI-accounts. |
| PL21/22 en PL31/32 | De lokale zone/capaciteit/publieke boeking is bewezen. Productierouting, publieke hosting en eventuele e-mail/outbox zijn aparte besluiten; er is geen e-mail verstuurd door de proef. |
| PL41-43 | Outlook/Microsoft365-consent, agenda/outbox/delta en conflictregels hebben een testtenant en expliciete gegevenskeuze nodig. |
| PL51/52 | Lokaal/cloud synchronisatie is een afzonderlijk bronhouder/conflictontwerp met gebruikersacceptatie, geen impliciete functie van deze consolidatie. |

## Kleinste volgende acceptatievoorstel

Na sluiting van PR43 kan één afgebakende M4-stap worden gekozen: snapshotgebonden categoriefilterlinks met een Alle-itemslink. De geordende snapshot en locale-categorienamen bestaan al; de huidige renderer toont alleen labels en filtert uitsluitend op itemslug. Bewijs per NL/EN-snapshot dat categoriekeuze de gepinde volgorde/namen respecteert, oude snapshots bytegelijk blijven, onbekende categorie veilig wordt afgehandeld en toetsenbord/focus werkt met gewone links. Geen nieuwe collectie, coverworkflow, multi-image, lightbox of CMS-UI toevoegen.

Dit is alleen een voorstel voor een echt oorspronkelijk gat. Er is geen vervolgfeature gestart. Een alternatieve nog kleinere verificatiestap is de bestaande releasekopie op een zelfstandige lokale statische host openen en alle links/derivatives zonder CMS/API controleren; eventuele gevonden fout bepaalt dan pas de fixscope.
