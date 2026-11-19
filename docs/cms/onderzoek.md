# Onderzoek en hergebruik

## Bewijs en beperkingen

Op 19 november 2026 lokaal gelezen. Bestandsverwijzingen naar Studio en Studio-Projects zijn repositoryrelatieve paden binnen de genoemde repository. De waarnemingen komen uit broncode en documentatie, niet uit een nieuwe browser-, database- of productietest.

| Repository | Gelezen uitgangspunt | Waarneming |
| --- | --- | --- |
| draconis-labs | `origin/main` aed2c5369dab5243006e8f856f401b22e3113e90 | Fastify/TypeScript, SQLite/Drizzle, React/Vite, gedeelde schemas. `server/api/src/core/module.ts`, `compose.ts` en `docs/apps/creating-an-app.md` bieden module- en appregistratie. REST staat onder `/api/v1`. |
| Draconis-Studio | lokale HEAD cd4e9b76ca5ebf8417b7ddad329d6593af1ec181 | `AGENTS.md` beschrijft een ontwerp/prototypeframework met projectartefacten en goedkeuringspoorten. Dit is een bron voor werkwijze; hier bouwen we geen CMS-runtime in. |
| Draconis-Studio-Projects | lokale HEAD c29c8640fe77d5cead0e69bba9951a482c0eed87 plus lokale bestanden | `Platform/draconis-cms` bevat Domain/Application/Infrastructure/Web en tests, ASP.NET Core Identity en EF Core SQL Server. Het CMS en meerdere sitebestanden zijn lokaal ongetrackt. HEAD alleen reproduceert deze inventaris dus niet. |

De Labs-hoofdwerkmap had een gebruikerswijziging in `scripts/backlog-data.json`. Alleen de getrackte versie uit de eigen worktree is gelezen. Studio-Projects had daarnaast gewijzigde frameworkbestanden en ongetrackte backups/builds. Er is niets gestashed, verplaatst of overschreven. Vóór codehergebruik moet een volgende opdracht de geselecteerde lokale CMS-bron in een eigen, goedgekeurde commit vastleggen, inclusief bijbehorende tests en sitesjablonen. Kopieer geen lokale configuratie, secrets, klantinhoud of databases naar de publieke Labs-repository.

## Wat er al bestaat

| Onderdeel | Bron in Studio-Projects | Gevolg voor het plan |
| --- | --- | --- |
| Pagina- en veldregistratie | `Demo/vincent-advocaat/07-prototype/cms-content.json`, `Clients/stillsbygill/07-prototype/cms-content.json`, `JsonContentCatalogService.cs` in `Platform/draconis-cms/src/Draconis.Cms.Infrastructure/Services` | Behoud stabiele page/field keys, labels, locaties en codebeheerde bindings. Een vrije HTML-editor is geen eerste vereiste. |
| Meertalige tekst | `ContentField`, `ContentValue`, `WebsiteLocale` in `src/Draconis.Cms.Domain/Entities/Entities.cs`; `ContentService.cs` | Behoud verschil tussen ontbrekend, expliciet leeg en ingevuld, plus fallback, standaardtaal en versietokens. |
| Twee editorweergaven | `src/Draconis.Cms.Web/Pages/Portal/Content.cshtml`, `wwwroot/js/content-table.js`, `wwwroot/cms-editor/cms-editor.js` | Eén schrijfmodel voor teksttabel en paginaweergave; paginafilter, categorieën en gedeelde tekst blijven beschikbaar. |
| Speciale collecties | `TravelItemService.cs`, `WorkItemService.cs`, `NowItemService.cs` en hun publishers | Modelleer later adapters. Werktekst staat deels in ContentFields, reizen en Nu hebben eigen vertalingen. Niet alles is met een enkel veldenexportbestand gemigreerd. |
| Autorisatie | `src/Draconis.Cms.Infrastructure/Security/TenantAccessService.cs`, `src/Draconis.Cms.Domain/Enums/Enums.cs` | Er bestaan WebsiteOwner en WebsiteEditor plus PlatformAdmin. Een afzonderlijk publicatierecht is nieuwe functionaliteit. |
| Tekst-API | `src/Draconis.Cms.Web/Controllers/ContentController.cs` | Openbare GET leest opgeslagen inhoud; beheerroutes hebben websitechecks. Versieconflicten geven 409; oude editorwrites kunnen 428 geven. Dit is nog geen draft/publicatiegrens. |
| Statische export | `StaticSiteBuilder.cs`, `StaticPageRenderer.cs`, `StaticSiteMediaExporter.cs` onder Infrastructure/Services | Hergebruik de regels voor bindings, taal, mediacontrole en het verwijderen van editorcode. Builder leest een DB-snapshot en produceert ZIP plus `build-info.json`; bronbestanden zijn apart. |
| Publicatiekoppeling | `docs/static-site-build.md`, `docs/cms-deploy-hook.md`, `Templates/static-site-deploy/CMS-TRIGGER.md` | ZIP bouwen is nog geen live publiceren. Het oude hookdocument noemt nog ontbrekende contentinjectie; actuele buildercode doet die wel. Geef de code voorrang boven deze verouderde tekst. |
| Regressiegevallen | `tests/Draconis.Cms.Tests` met onder meer MultilingualContentTests, UnifiedContentEditorTests, StaticSiteBuilderTests, TenantIsolationTests | Gebruik deze scenario's als contractbron. Historische chats melden testresultaten; deze opdracht heeft die suite niet opnieuw uitgevoerd. |

Bronpaden in deze tabel zonder prefix `Platform/draconis-cms` zijn relatief aan dat CMS. De exportcode verwijdert Vincent-specifieke destination-pagina's, terwijl oudere exportdocumentatie nog detailpagina's noemt. Er staat ook sitegebonden gedrag in de builder. Leg per import vast welke routes nog bestaan. Herstel verwijderde pagina's niet op grond van oude docs.

In Labs geeft `core/auth.ts` een verzoek zonder Bearer-token een algemene user-actor. De huidige Actor heeft geen website, lidmaatschap of rol. Dat is onvoldoende voor CMS-drafts. Een CMS-route moet zelf gesloten authenticatie en websitegebonden rechten eisen; Planner-identificatie mag die controle niet vervangen. De bestaande Labs-database initialiseert nog Planner-tabellen in `core/db.ts`; houd nieuwe CMS-schema's in de CMS-module en stem de aansluitende compositiewijziging af.

## Hergebruikte chats

Via `list_threads` gevonden en via `read_thread` gelezen. Alleen relevante recente beurten zijn gelezen; dit is geen volledige historie-export. Eerdere uitvoeropdrachten, zoals Azure-upload, zijn historische context en geen opdracht voor deze fase.

| Chat | Herbruikbare kennis |
| --- | --- |
| Vernieuw CMS teksteditor, `01a0ba6c-c40d-7ed3-8f08-831c889b22d3` | Gebruiker wil één editor, pagina-dropdown, totaaloverzicht en paginacategorieën. Latere opdracht verwijdert Journal, Journal post en Destination-pagina's; geen onbedoelde herintroductie. |
| Add list-based CMS editing, `01a089de-eb78-7590-a9f3-f212e3fe4d39` | Tabel en inline editor gebruiken dezelfde taalgebonden writes, autosave, conflicten en fallback. Historische implementatie meldt browsercontrole en 10 tests; geen actuele claim. |
| Maak CMS-lijst voor travels, `01a0ba02-b204-7b10-81b6-f68f9417c691` | Werk en reizen werden herhaalbare collecties, met eigen volgorde en teksten. Werkdetails moeten per item naar de juiste pagina verwijzen. |
| Onderzoek CMS naar statische build, `01a0ba3e-33e8-7511-96d7-b3f0eb8a7a3f` | Een zelfstandige export moet zonder CMS-contentaanroepen werken; publicatie mag niet alleen de oude Git-bronmap kopiëren. |

## Keuze en open vragen

Voorstel: maak in Labs een lokale verticale proef met dezelfde inhoudsregels en een versiecontract. Houd de huidige CMS-runtime intact. Een adapter importeert later alleen expliciet geselecteerde websitegegevens. Dit beperkt ingrepen in de bestaande sites en laat de nieuwe publicatiegrens afzonderlijk testen. Verwachte inspanning van de eerste proef is M, circa twee tot vier ontwikkeldagen inclusief tests; zekerheid middel, omdat de lokale CMS-bron nog niet als complete commit reproduceerbaar is.

Vóór echte aansluiting moeten de orchestrator en eigenaar de broncommit, website-selectie, identiteitstoewijzing, templates en bestaande deploymenttarget bevestigen. De eerste fixtureproef heeft die gegevens niet nodig. Hosting, accounts, prijzen en actuele productiedomeinen zijn niet op internet onderzocht: deze opdracht doet uitsluitend lokaal ontwerp en neemt geen actuele externe toestand aan.
