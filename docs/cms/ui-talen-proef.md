# CMS-bediening in Nederlands en Engels

De bedieningstaal is een eigen tabbladkeuze. Ze verandert geen website, token, inhoudstaal, redactionele waarden, draftversies, conflictgegevens of publicatiekeuzes. De standaard na openen/herladen is NL; deze stap voegt geen servervoorkeur of nieuwe opslag toe. Browserdocumenttitel en `html lang` volgen de gekozen bedieningstaal. De inhoudstaal van een privépreview blijft die van haar gekozen paginarevisie.

`apps/cms/src/i18n.ts` bevat de getypeerde CMS-namespace volgens het bestaande Planner-patroon. Er is geen import uit de Planner-app, extra engine of dependency. De [vooraf gemaakte inventaris](ui-teksten-inventaris.md) en [concrete tekstenlijst](ui-strings-inventory.json) beschrijven de bestaande schermen. Statussen worden als vaste berichtkey met parameters bewaard en bij iedere render in de actuele taal opgebouwd. Daardoor verschijnt ook een laat antwoord na een taalwissel in de nieuwe bedieningstaal. Parametervervanging behandelt invoer letterlijk en voert niets uit.

De API-handlers, contentwrites en requestpayloads blijven gelijk. Bekende foutcodes voor media, incomplete inhoud, publicatieconflict en afgebroken/mislukte builds krijgen een vaste vertaling. Onbekende servermeldingen worden als begrensde concrete tekst getoond. Ze kunnen hun oorspronkelijke taal behouden; ze worden niet geraden of automatisch vertaald. Geen vrije HTML of uitvoerbare vertaaldata. Native bestandsdialoog en browsermeldingen volgen de browser/OS-taal.

## Verificatie

- De 16 gerichte tests voor echte componenthandlers en de vertaalnamespace slagen. Ze controleren dirty NL/EN, expliciete conflictkeuze, publicatieretry met dezelfde key/payload, taalwissel tijdens een lopend verzoek, key-/parameterdekking en veilige onbekende fouttekst.
- De eerste volledige parallelle run faalde met hook-/testtime-outs verspreid over bestaande API-fixtures. De assertions van die gevallen werden daardoor niet volledig bereikt. Er zijn geen bron-time-outs verhoogd. De gecontroleerde herhaling met `corepack pnpm --filter @draconis/api exec vitest run --maxWorkers=2` slaagt: alle 131 API/componenttests. Ook alle 15 shared-tests slagen. Dit bewijst de suite met begrensde paralleliteit; de oorspronkelijke parallelle run blijft als beperking vermeld.
- Workspace-typecheck, lint en build zijn groen. De normale CMS-start bouwde de actuele frontend opnieuw.
- Browser op 3023: Engelse bediening met Nederlandse content; EN-invoer blijft tijdens NL/EN-wisselen behouden. Een tweede tab veroorzaakt een echt EN-CAS-conflict. Lokale invoer en expliciete overnameknop blijven in beide talen aanwezig.
- Een tijdelijk genegeerd testbestand verbrak één HTTP-antwoord ná de succesvolle lokale activatie. Na taalwissel behield de browser zijn EN-selectie en retrykeuze. Retry leverde actieve versie 1; een read-only databasecontrole telde één attempt. De tijdelijke foutinjectie is verwijderd en de normale proefserver is herstart. Ze is geen productfunctie en zit niet in de PR.

Alle gegevens zijn fictief. Screenshots en lokale toegangsgegevens blijven genegeerd. Geen merge of deployment.

PR29 is read-only gereviewd door subagent `/root/review_pr29`, GPT-6 Astra op gemiddeld, op SHA `69b43c5457094c1196599055d9024600a835d0c8`. Er zijn geen noodzakelijke fixes gevonden. De reviewer draaide zelf de zestien gerichte tests, CMS-typecheck en diffcheck groen. De geverifieerde optionele P3-copyverduidelijking is uitgevoerd door `/root/fix_pr29_copy`, GPT-6.1 Sol op licht, in `7b77a7b8d249dcde043b0c500381a9a102f8dedc`: de Nederlandse bevestiging verwijst nu correct naar de al geladen EN-versie. Alleen tekst en inventaris veranderden; de zestien relevante tests en diffcheck slagen. De optionele extra assertions voor een late foutrespons, expliciet null/leeg en documentmetadata zijn niet toegevoegd; er is geen aangetoonde functionele fout en de gevraagde kernflows zijn gericht en in de browser gecontroleerd. Het volledige rapport en de opvolging staan duurzaam in de PR-beschrijving.

## Resterende publieke tekst

UI-keys zijn geen eindoplossing voor de website-inhoud. De [publieke tekstcatalogus](publieke-tekstcatalogus-ontwerp.md) inventariseert de huidige vaste taalkeuzelabels en beschrijft de afzonderlijke shared revisie/CAS/preview/releasepin-vertical. Die runtime is hier niet gebouwd. Volledige EN-image/portfolio-inhoud blijft eveneens open in de [acceptatiematrix](acceptatiematrix.md).
