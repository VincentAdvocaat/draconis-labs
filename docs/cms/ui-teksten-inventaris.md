# Inventaris CMS-bediening NL/EN

Basis: docs-head `e074f7cf999445c08d517e99a7dccc03118c05d2`, met onafhankelijk gereviewde runtimecode `f95389882d7b69d246f66070dec1d37c81123c56`. De inventaris is gemaakt vóór de taalwijziging door de JSX-tekst, labels, statuswrites, bevestigingen en foutpaden in de drie CMS-componenten te lezen.

| Schermdeel | Bestaande teksten binnen scope |
| --- | --- |
| Toegang en home | Appkop, uitleg, sitekeuze, lokaal token, openen, opslagstatus, titel/introductie en onopgeslagen wijzigingen. |
| Pagina's en blokken | Overzicht, nieuwe pagina, slug/SEO, tekst/beeld, toevoegen/verplaatsen, alt/decoratief/bijschrift, bewaren en privépreview. Bestaande typed documentcopy wordt onderdeel van dezelfde CMS-namespace. |
| Portfolio-keuze | Snapshotkeuze, checksum/context, paginataal versus bloktaal, redactionele labelvelden en ontbrekend-vlaggen. De eigen redactionele tekstwaarden worden niet vertaald door UI-keys. |
| EN-variant | Zelfde pagina-ID, inhoudstaal/defaulttaal, veldnamen, ontbrekend-vlaggen, structuurwaarschuwing/uitlijning, beperking tot tekstblokken en conflictkeuze. |
| Upload en rechten | Bestandsveld, limiet/uitleg, status/herstel/retry, assetkeuze, gereed/rechtenstatus, bewijsvelden, bevestiging en Publisher-acties. |
| Publicatie | Pagina-/taalselectie, behouden EN-publicaties, bouwen/retry/conflict/succes, actieve versie, publieke link en previewkader. |
| Bevestigingen en fouten | Site/pagina wisselen met invoer, EN-invoer verwerpen, clientvalidatie en bekende API-foutcodes. Onbekende servermeldingen blijven concrete gegevens en worden veilig als tekst weergegeven. |

De bedieningstaal krijgt één eigen NL/EN-keuze. Ze verandert geen contentlocale, site, token, drafts, conflictgegevens, gekozen revisies, pending commands of idempotencykeys. Een lopend verzoek mag later zijn status in de actuele bedieningstaal tonen. Getypeerde keys en veilige parametervervanging volgen het bestaande Planner-patroon in een eigen CMS-bestand; geen imports uit de Planner-app, extra engine of dependency.

## Regressies vóór uitvoering

- Bestaande NL-handler- en API-tests blijven gelden; alle writes en requestpayloads blijven gelijk.
- Bewerk NL of EN, wissel bedieningstaal en controleer onopgeslagen waarden plus ontbrekend/leeg.
- Krijg een EN-CAS-conflict, wissel taal en behoud lokale invoer en de expliciete overnamekeuze.
- Verlies een publicatieantwoord, wissel taal en retry exact dezelfde keuze met dezelfde key en payload.
- Wissel tijdens een lopend verzoek en controleer dat de late status in de actuele taal verschijnt zonder tweede write.
- Controleer vertaaldekking, veilige onbekende fouttekst, bekende codevertaling, upload-/rechtenlabels en contentlocale onafhankelijk van UI-locale.
- Browser: beide bedieningstalen met EN-invoer, conflict en publicatieretry. Daarna PR en onafhankelijke review.

Dit is uitsluitend de bediening. De [publieke tekstcatalogus](publieke-tekstcatalogus-ontwerp.md) beschrijft hoe nog vaste websiteteksten later via CMS-records worden beheerd; UI-codekeys zijn daarvoor geen eindoplossing.
