# PL-01 taakbaseline

Uitgangspunt is `aed2c5369dab5243006e8f856f401b22e3113e90`, de gemergede
ontwerp-PR #5. De fixtures bevatten uitsluitend fictieve gegevens. Er is geen
bestaande ontwikkel- of gebruikersdatabase geopend, gekopieerd of gemigreerd.

`server/api/tests/fixtures/legacy.sql` legt de door de huidige opstartcode
ondersteunde vorm zonder planning-uitbreidingen en versie vast. Dit is een
gereconstrueerde testvorm, geen bewezen export van een historische release.
`current.sql` past daarop de zes huidige kolommen toe. Beide vormen bevatten
drie stabiele IDs, twee todo-posities, historie, maker, labels, prioriteit en een
voorkeurenrecord. De actuele vorm bevat versie 7, een geplande datum die afwijkt
van de deadline, tijdzone, tijd, tweewekelijkse herhaling en een parentreferentie.

## Reproduceren

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

De root heeft nu een expliciet `test`-script. De bestaande pipeline-aanroep
`corepack pnpm test` voert daarmee daadwerkelijk de package-suites uit.
Op Windows met Node 24.3.0 en pnpm 11.10.0 slagen 22 tests. Typecheck, lint en
build slagen voor alle zeven packages. Het OpenAPI-snapshot is ongewijzigd.
Linux/Node 22 uit Azure Pipelines is in deze lokale proef niet uitgevoerd.

## Vastgelegde acceptatiegevallen

| Geval | Controle en verwachte uitkomst |
| --- | --- |
| Oude en huidige database openen | Alle oorspronkelijke SQL-cellen en voorkeuren blijven exact behouden. Alleen ontbrekende kolommen worden toegevoegd. |
| Volledige v1-response | Alle velden van de fictieve inspectietaak worden exact vergeleken, inclusief nulls, versie en JSON-herhaling. |
| Legacy-alias | Identieke payload, `Deprecation: true`, `Sunset: 2026-12-31` en link naar v1. |
| Onbewerkte en gepagineerde lijst | Lijst met drie taken tegenover twee items, total 3, page 1, pageSize 2. |
| Volgorde | API sorteert lane alfabetisch, dan positie. Binnen todo komt positie 1000 vóór 2000. Het bestaande bord sorteert elke zichtbare lane op positie. |
| Dag- en veldfilters | Vaste klok op 19 november 2026; vandaag toont beide actieve taken. Exacte dag, lane, label en prioriteit leveren de bedoelde taak. |
| Historie | De afgeronde fictieve taak verschijnt vanaf 18 november. |
| Voorkeuren | Bestaande Nederlandse voorkeuren blijven behouden; PATCH naar Engels wordt teruggelezen. |
| Verplaatsen | PATCH verplaatst een bestaande taak naar doing met positie 1500 en verhoogt de versie. |
| Verouderde versie | Tweede PATCH met de oude versie geeft 409; de geslaagde wijziging blijft staan. |
| Afronden en herhaling | Twee opeenvolgende done-PATCHes maken bij de actuele fixture één opvolger op 4 december, met dezelfde labels/tijd en juiste parent. Geen gelijktijdigheidsclaim. |
| CRUD en duurzaamheid | Nieuwe taak krijgt datumfallback en versie 1; alleen die fictieve taak wordt verwijderd. Een onafhankelijke DB-verbinding leest de bewaarde wijziging terug. |
| Snelle invoer | De door de UI gebruikte parser draait als dezelfde functie in planner-core. Tests dekken Nederlands/Engels, morgen, weekstart, jaargrens, schrikkeljaar en invoer zonder datum. |

De automatische test beproeft de API-bewerking achter drag-and-drop. Pointer-
en toetsenborddragging en de volledige bestaande UI zijn niet end-to-end
bediend. Een visuele UI-regressierun blijft nodig bij de PL-11-clientwijziging.

## Bekende bestaande fouten

`nextMonthFrom` levert in december `2026-13-01` op. De parser is ongewijzigd
verplaatst en de test benoemt deze bestaande fout expliciet. Dit is geen geldige
kalenderdatum en geen productacceptatie van dit gedrag. Pak de correctie gericht
op bij de volgende taakinteractie-wijziging met december-naar-januari-regressie.
De bestaande datumregex valideert bovendien de vorm, geen kalendergeldigheid.

Atomaire recurrence, gelijktijdige writers, werkruimten en import/herstel zijn
acceptatiepunten voor PL-11/PL-13 en zijn met deze baseline nog niet bewezen.
