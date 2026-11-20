# Lokale inventarisatie

Gelezen op 19 november 2026. Dit is een broncode-inventarisatie, geen bewijs van productiegedrag. De twee Studio-checkouts bevatten veel lokale en niet-gevolgde bestanden. Hun HEAD alleen reproduceert de waarnemingen daarom niet. Geen van die bestanden is gewijzigd.

## Draconis Labs

Basis van de eigen worktree is `origin/main` op `aed2c5369dab5243006e8f856f401b22e3113e90`. De branch is `feature/media-catalogus-ontwerp`.

| Bron in Labs | Waarneming | Betekenis |
| --- | --- | --- |
| `README.md`, `package.json` | pnpm-workspace, React/Vite Planner, Fastify API, gedeelde TypeScript-contracten | Lokale proef kan in bestaande workspace, zonder nieuwe hosting |
| `server/api/src/index.ts` | Planner- en preferences-routes | Hier bestaat nog geen gedeelde media- of catalogusmodule |
| `server/api/src/db.ts` | SQLite, foreign keys, lokaal configureerbaar databasepad | Geschikt voor geïsoleerde fixtureopslag; niet de CMS-database |
| `.cursor/rules/worktrees-and-branches.mdc` | Eigen worktree, feature/bugfix-branch en scripts verplicht | Deze docs wijzigen uitsluitend `docs/media-catalogus` |

De gebruikerswijziging in de hoofdcheckout `scripts/backlog-data.json` blijft onaangeroerd. Deze backlog staat alleen in Markdown, niet op een live board.

## Draconis Studio

Lokale HEAD `cd4e9b76ca5ebf8417b7ddad329d6593af1ec181`.

`README.md` en `AGENTS.md` beschrijven een discovery- en prototypeframework met agents, workflows en templates. Het is geen runtime voor een beeldbibliotheek. Statische sites zijn de standaard. Gate 5 vereist toestemming voor productie. Geen actief klantproject geselecteerd of gewijzigd: deze opdracht inventariseert uitsluitend en schrijft in Labs.

## Draconis Studio Projects

Lokale HEAD `c29c8640fe77d5cead0e69bba9951a482c0eed87`. `ACTIVE` wijst naar `Clients/stillsbygill`. `README.md` plaatst het gedeelde CMS onder `Platform/draconis-cms`. De huidige lokale CMS-bestanden zijn niet door deze HEAD gedekt. Maak bij latere integratie eerst een afzonderlijk reproduceerbaar bronpakket/commit; kopieer geen volledige vuile checkout.

Onderstaande paden zijn relatief aan Studio-Projects.

| Bron | Gelezen gedrag | Consequentie voor ontwerp |
| --- | --- | --- |
| `Platform/draconis-cms/src/Draconis.Cms.Domain/Entities/Entities.cs` | `MediaAsset` heeft website-ID, pad, naam, MIME, bytes, alt en datum; `WorkItem`, `TravelItem` en pagina-categorieën bestaan | Bestaande IDs behouden; catalogus niet verwarren met `ContentCatalog` of pagina-categorieën |
| `Platform/draconis-cms/src/Draconis.Cms.Infrastructure/Services/LocalMediaService.cs` | Upload schrijft naar `App_Data/media/{websiteId}`; gebruikt opgegeven MIME/extensie; geen decode- of derivativeproces in deze service | Validatie, status, versies en rechten zijn uitbreidingen, geen bestaande garanties |
| `Platform/draconis-cms/src/Draconis.Cms.Web/Controllers/ContentController.cs` | Upload vereist toegang en kent requestlimiet 20.000.000 bytes; bestandsroute is anoniem | Private originelen vereisen aanpassing vóór integratie; huidige URL is geen privébestandgarantie |
| `Platform/draconis-cms/src/Draconis.Cms.Infrastructure/Services/StaticSiteMediaExporter.cs` | Kopieert CMS-bestanden en `/uploads/` naar export; controleert website-ID en padbegrenzing | Hergebruik exportconcept, voeg gepinde derivatives en manifestvalidatie toe |
| `Platform/draconis-cms/src/Draconis.Cms.Application/Content/ContentContracts.cs` | Media-DTO en upload/get/open-interface; tekst en mediareferenties nu deels als stringwaarden | Introduceer adapter naar getypeerde referenties, behoud legacy lezen tijdens migratie |
| `Platform/draconis-cms/src/Draconis.Cms.Infrastructure/DependencyInjection.cs` | CMS gebruikt EF Core SQL Server en Identity | Niet aannemen dat CMS al op Labs-SQLite draait |
| `Clients/stillsbygill/07-prototype/assets/photos/manifest.json` | Lokale foto's met bron-URL en bytes | Bruikbaar voor inventarisatie, geen bewijs van publicatierechten |
| `Clients/stillsbygill/07-prototype/js/gallery.js` | Bestaande carousel en vergrootweergave | Portfolio-adapter moet bestaande weergave kunnen behouden |
| `Demo/vincent-advocaat/10-publish/site/work-pages.json` en `work-*.html` | Bestaande werkdetailpagina's in lokale export | Geen automatische omzetting van werk/reisinhoud naar generieke items |

## Open punten

De exacte website waarop de gebruiker de eerste module wil toepassen is nog niet gekozen. De lokale proef gebruikt daarom twee fictieve websites. Rechten op bestaande foto's, schaal, gewenste categorieën en concrete catalogusvelden moeten vóór klantmigratie vaststaan. De eerste proef hangt daar niet van af.

Er is geen CMS gestart, geen database geopend, geen upload uitgevoerd en geen website gebouwd tijdens dit ontwerponderzoek.
