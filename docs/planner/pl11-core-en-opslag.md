# PL-11 · Eerste stap voor core en transport

Deze vervolgbranch bouwt op PR #9, onafhankelijk gereviewd op
`847687e60a9c4a5f211a11317e2bcc9f4fcf022c` in reviewchat
`01a1f4ac-a37c-7150-85c1-3c5ddabfd06e`. Die review vond geen noodzakelijke
fixes. De hier relevante optionele punten zijn meegenomen bij de uitbreiding:
rijke desktoprecords en negatieve IPC-controles. De [runtime-ADR](adr-001-windows-runtime.md)
blijft voorlopig.

## Wat werkt

`createPlannerService` ontvangt een `PlannerStorage`, klok en ID-generator.
De service bevat de bestaande taakaanmaak, wijzigingen, versieconflict,
lane-herordening, herhaling, historie en voorkeuren. De core importeert geen
Fastify, Electron of Drizzle. De SQLite-adapter in `packages/planner-sqlite`
ontvangt een databaseverbinding en beheert het bestaande schema, de bestaande
filters en JSON-serialisatie. De native binding komt van de host: API 12.11.1,
desktop 13.2.0 met Node-API-prebuilds.

De bestaande HTTP-module composeert dezelfde service met de API-verbinding.
De routefactory ontvangt service en actorbepaling expliciet. Een test registreert
twee verschillende SQLite-composities in dezelfde Fastify-app en controleert
dat taken en voorkeuren niet tussen die verbindingen lekken. Dit bewijst
compositie-isolatie, geen werkruimteautorisatie binnen één database.

Desktop composeert dezelfde service en adapter op zijn eigen `probe.sqlite`.
De beperkte preload biedt list/create/update; de kleine React-weergave kan een
taak aanmaken en door de lanes verplaatsen. Herhaling staat alleen in de core.
De oude geïsoleerde PL-02-tabel `probe_tasks` wordt één keer per ontbrekend ID
overgenomen naar `tasks`, in één transactie, zonder de brontabel te verwijderen.
Dit is uitsluitend compatibiliteit met de lokale proef, geen algemene import-
of herstelvoorziening voor gebruikersdatabases.

## Controles en bewijs

Op Windows/Node 24.3.0/pnpm 11.10.0 slagen frozen install, typecheck, lint,
build en 27 tests: 14 API, 7 core, 4 desktop-afzendercontroles en 2 shared.
De bestaande oude/actuele fixtures blijven alle oorspronkelijke cellen behouden.
Het OpenAPI-snapshot verandert niet. De nieuwe echte SQLite-test controleert
herordening, versieconflict, herhaling, voorkeuren en twee onafhankelijke
composities. De vier IPC-tests gebruiken dezelfde guard als de main-handlers
en weigeren een ander venster, ander frame of andere URL vóór de write.

De normale API-start gebruikt nu `node --import tsx dist/index.js`. De loader
lost de bestaande source-exports met relatieve `.js`-verwijzingen correct op.
`tsx` is hiervoor een runtime-dependency geworden. Er is geen repo-brede
wijziging van package-exports uitgevoerd.

```powershell
corepack pnpm build
corepack pnpm --filter @draconis/api smoke:start
```

De smoke-test start dat exacte Node-commando op loopback met een tijdelijke
database, controleert health, taakaanmaak, verplaatsing, teruglezen en de legacy-
alias, en sluit het eigen proces af. De test opent geen bestaande Planner-data.

Een verpakte desktoprun 0.3 startte met vijf synthetische PL-02-records in het
oude JSON-schema. Alle vijf bleven exact gelijk na overname naar de gedeelde
SQLite-tabellen. Iedere volgende run maakte een rijke taak met verschillende
plannedDate/dueDate, dueTime, tijdzone, labels, prioriteit en herhaling, verplaatste
die via doing naar done, weigerde een verouderde versie en maakte precies één
opvolger. Een tweede done-commando maakte geen tweede opvolger.

De create-payload bevatte ook vervalste maker, ID, lane en versie. Na validatie
waren die waarden nog steeds bepaald door de main-compositie. De daadwerkelijke
IPC-route en SQLite-write zijn daarmee beproefd; afzendervervalsing is met de
gedeelde guard getest en niet met een tweede verpakt aanvallervenster.

Bij 0.4 kwamen alle vijftien volledige 0.3-records exact terug, inclusief
ingevulde tijdzone/herhaling en versies groter dan 1. Na vijf verdere starts
stonden er 25 records. Zie de meetrapporten voor [0.3](evidence/pl11-v0.3.json),
[0.4](evidence/pl11-v0.4.json) en de [volledige vergelijking](evidence/pl11-upgrade-records.json).
Dit blijft een appmapvervanging op een bestaande werkplek, geen installerupgrade
of koude-VM-test. Pakketgrootte van beide versies was 403.309.964 bytes.

## Storygrens

Dit was de status van PR #12. De aansluitende [lokale clientstap](pl11-lokale-client.md)
heeft de hieronder nog open werkruimte-/client-/foutcriteria inmiddels uitgevoerd.

| PL-11-criterium | Status |
| --- | --- |
| Injecteerbare taak-use-cases en opslag | Gereed voor de bestaande lokale taakflow, inclusief geïnjecteerde HTTP-routefactory. |
| Gedeelde SQLite-adapter | HTTP en verpakte desktop gebruiken hetzelfde package op afzonderlijke databases. |
| Aanmaken, verplaatsen en teruglezen | Via HTTP en echte desktop-IPC bewezen. |
| Bestaande v1-/legacy-contracten | Regressies groen, OpenAPI-snapshot ongewijzigd. |
| Getypeerde React-client | Bestaande webclient behouden; beperkte desktopbridge getypeerd. Geen volledige web/desktop-clientwissel uitgevoerd. |
| Werkruimteroutes en overeenkomstige desktop-envelope | Nog te bouwen. PL-11 is als volledige story niet gereed. |
| Identieke transportfoutcodes | Core-conflict wordt via HTTP 409; desktop biedt nog de Electron-errorboodschap. De gedeelde workspace-foutenvelop ontbreekt. |
| Atomaire writes en meerdere schrijvers | PL-13. Herordening/recurrence gebruiken nog het bestaande sequentiële gedrag; geen concurrencygarantie. |

De volgende kleine stap is een getypeerde client met expliciete werkruimte-ID
per opdracht en een gedeelde foutenvelop. Werkruimteautorisatie, OIDC en
cloudopslag blijven afhankelijk van de fase-0-keuzes. De bestaande december-
quickentry-fout is niet in deze opslagstap veranderd.
