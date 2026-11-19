# Gezamenlijke lokale integratie

Deze tijdelijke branch combineert de gereviewde CMS-, Planner- en media/catalogusketens in één checkout. [Plan en exacte PR-DAG](plan.md), [machineleesbaar bewijs en blobvergelijking](bewijs.json). Alle oorspronkelijke GitHub-PRs blijven OPEN. Geen mainmerge of deployment uitgevoerd.

## Samenvoegbeslissingen

Volledige CMS-tip, volledige Planner-tip en volledige catalogus/docs-tip zijn ieder eenmaal geïntegreerd. Geen losse foundation- of consumercherry-picks. De gedeelde media- en catalogusservices waren al bytegelijk in CMS. De zelfstandige catalogusentrypoints, HTTP/UI/localetests en CLI ontbreken daar en komen uit de gereviewde catalogustip.

De exports voor contentlocale én Planner/bookings zijn verenigd in packages/shared/src/index.ts. server/api/package.json behoudt sharp en voegt Planner-core/sqlite en de gereviewde node --import tsx-startloader toe. De lockfile is vanuit deze verenigde manifests met pnpm11.10.0 opnieuw berekend en vervolgens met frozen install gecontroleerd. De catalogusversie van media-upload/app.ts is behouden omdat de cataloguscompositie het derde optionsargument nodig heeft voor expliciete publicread en exacte loopbackorigin; de standalone-default blijft weigeren. Catalogusstatusdocumentatie komt uit de laatste gereviewde docs-tip. API compose en SharedModal kwamen inhoudelijk uit Planner; CMS draait via zijn eigen bestaande loopbackstarter.

Een lokale tussencommit bevatte kort conflictmarkeringen nadat een manifestscript bewust op een extra startscriptverschil stopte maar de shell doorliep. Die ongepushte tussencommit is hersteld met amend vóór installatie, tests of runtime-start. De uiteindelijke mergegeschiedenis bevat die fout niet.

## Reproduceren

Voer scripts/verify-local-integration.ps1 uit vanuit deze checkout. Het controleert de pnpm-versie, frozen install, build voor workspace-artifacts, typecheck, lint, volledige tests en bestaande private/public startupsmokes. De CLI-parserfixture wordt apart gedraaid. Oude CMS/home/media- en Planner/databasefixtures zijn onderdeel van dezelfde volledige testsuite.

Normale handmatige starts vanuit dezelfde checkout:

- CMS: ./scripts/start-cms-fixture.ps1 -Port 3050 -NoOpen. De eigen genegeerde CMS-fixtureopslag wordt automatisch aangemaakt.
- Catalogus: corepack pnpm --filter @draconis/api exec tsx src/catalogus/start.ts --port=3051. Zonder root maakt dit een eigen synthetische mediamap; gebruik de gelogde root opnieuw voor een herstart en het nieuwe tijdelijke token voor de editor.
- Planner: corepack pnpm --filter @draconis/api demo:local. Dit maakt een eigen lege SQLite-database en expliciet fictief publiek kanaal, private API3041, private UI3042, publieke API3043 en publieke UI3044. Voor herstart met dezelfde gegevens gebruik de normale dist/index.js en dist/public.js-startcommands met DATABASE_PATH naar de gelogde eigen database en dezelfde HOST/PORT-variabelen; start de twee Vite-servers opnieuw zoals demo-local.mjs doet.

## Uitgevoerde acceptatie

Frozen install, typecheck, lint en volledige build zijn groen. Volledige tests: API306, PlannerUI20, shared18, planner-core7, desktop-probe6. Acht catalogusCLI-argumentchecks groen. Private startupsmoke bewijst CRUD, legacy/workspace, CORS en release/retry; publieke startupsmoke bewijst expliciet kanaal, reservering/replay, afwezigheid private routes en receipt/capaciteit na procesherstart.

Browseracceptatie gebruikte uitsluitend fictieve gegevens op gescheiden eigen opslag. Planner: taak maken/bewerken/opslaan; Modal ShiftTab naar laatste knop, Tab terug naar eerste en Escape met focusherstel. CMS importeert geen @draconis/ui/Modal, dus een niet-bestaande CMS-Modalflow wordt niet geclaimd. CMS: EN-home publiceren met expliciete shared-pin/taalselectie; echt synthetisch PNG uploaden, rechten expliciet vrijgeven, bronstructuur bevestigen, eigen EN-alt/bijschrift opslaan en opnieuw publiceren. Catalogus: fictief item en rechten, handmatige EN-variant, expliciete NL-descriptionfallback, gepinde publieke EN-snapshot. Publiek boeken: datum met native toetsen wijzigen, fictieve afspraak bevestigen, vervolgens na echte herstart in de private module terugzien met capaciteit1van1 bezet. De drie modules zijn echt gestopt en op dezelfde eigen opslag opnieuw gestart; taak, boeking, CMS-publicatie en catalogussnapshot bleven behouden. Daarna zijn alle zes eigen listeners gecontroleerd gesloten. Screenshots en procesdetails staan uitsluitend in de genegeerde runtime, zonder klantdata.

Dirty-close/async/retry en alle oude fixturevarianten zijn via de bestaande component/integratietests gecontroleerd; de browseracceptatie claimt geen onderschepte verloren commitresponse. Dit is een gecombineerde lokale fixture, geen productie-integratie met gedeelde authenticatie, back-up/restore, klantimport of deployment.

Onafhankelijke integratiereview volgt op de exacte PR-head. Daarna worden rapport/SHA/reviewer-id hier en bij de PR vastgelegd.
