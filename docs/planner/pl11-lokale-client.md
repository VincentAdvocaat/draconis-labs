# PL-11 · Lokale client, werkruimte en fouten

Vervolg op PR #12, onafhankelijk beoordeeld op
`f86519c0271bf393017c55ac43a53e05f528d812` in reviewchat
`01a1f4b9-55ca-75d1-a810-bfdfd8c2bfdb`. De [opslagstap](pl11-core-en-opslag.md)
en deze clientstap vormen samen de lokale PL-11-acceptatie. PL-02 blijft
voorlopig volgens de [Windows-ADR](adr-001-windows-runtime.md).

## Contract

De gewone webclient en de verpakte desktopweergave gebruiken
`createPlannerClient(transport, workspaceId)` uit shared. De werkruimte wordt
bij constructie vastgelegd en bij elke opdracht meegestuurd. Iedere client
heeft zijn eigen context. De web-App ontvangt de client als prop; zijn standaard
is HTTP met ID `local`. Desktop injecteert de beperkte preload-transportfunctie
en hetzelfde lokale ID. In beide weergaven staat het werkruimte-ID zichtbaar.
Bij vervanging van de webclient wordt oude schermdata gewist en worden late
lijst-/voorkeurenresponses en mutatieresultaten van de vorige client genegeerd.
Er is nog geen werkruimtekiezer gebouwd.

HTTP gebruikt `/api/v1/workspaces/{workspaceId}` met daaronder `/tasks`,
`/tasks/{id}`, `/history` en `/preferences`. Desktop stuurt het getypeerde
commando via `probe:command`. Beide adapters roepen dezelfde gevalideerde
`executePlannerCommand` en dezelfde core-service aan. De actor komt uit de
HTTP-actorresolver of de vaste lokale desktopcompositie, nooit uit het commando.

Er is precies één lokale context per geopende opslagverbinding. Alleen `local`
wordt aanvaard; een ander ID geeft 404 met `WORKSPACE_NOT_FOUND`. De API en de
desktopproef hebben elk hun eigen database. Dit contract synchroniseert geen
gegevens tussen die databases en bewijst geen cloudlidmaatschap of isolatie
tussen meerdere werkruimten in één database. Die onderwerpen blijven PL-12/PL-13.

Succes heeft de vorm `{ ok: true, value }`; verwijderen geeft `value: null`.
Een fout heeft de vorm `{ ok: false, error: { code, status, message, task? } }`.
De renderer maakt daar lokaal een `PlannerClientError` van. Een versieconflict
wordt `PlannerConflictError` met de actuele taak. Het IPC-bericht bevat gewone
data, zodat de foutcode niet verloren gaat door Electrons Error-serialisatie.

| Code | Status | Gedrag |
| --- | --- | --- |
| `INVALID_INPUT` | 400 | Schema weigert de opdracht; er wordt niets geschreven. |
| `WORKSPACE_NOT_FOUND` | 404 | Context hoort niet bij de geopende opslag. |
| `TASK_NOT_FOUND` | 404 | Taak ontbreekt in de gekozen lokale opslag. |
| `VERSION_CONFLICT` | 409 | Actuele taak gaat mee voor conflictbediening. |
| `UNAUTHORIZED` | 401 | HTTP-actorresolver weigert de bestaande Bearer-key. |
| `UNAVAILABLE` | 503 | HTTP niet bereikbaar of geen geldige envelope; geen lokale fallbackwrite. |
| `INTERNAL_ERROR` | 500 | Opslag-/uitvoeringsfout zonder interne details in het antwoord. |

De bestaande `/api/v1/planner`-routes en `/api/planner`-alias houden hun oorspronkelijke
payloads, statuses en legacy-headers. Het nieuwe contract heeft geen onversieerde
alias. Het OpenAPI-snapshot voegt de nieuwe paden en gedeelde schemas toe. Een
aparte manifesttest vergelijkt de canonieke SHA256 van ieder eerder pad met de
PR-12-baseline. Alle bestaande paddefinities blijven exact gelijk.

## Oude proefdata en verwijderen

De oorspronkelijke PL-02-tabel blijft als bron behouden. Import en een
voltooiingsmarker worden samen in één SQLite-transactie geschreven. Een
bestaand ID in `tasks` wordt nooit overschreven. Bij volgende starts wordt een
voltooide bron niet opnieuw geïmporteerd. Daardoor blijft een via de nieuwe
client verwijderde oude taak ook na herstart verwijderd.

De tests gebruiken het exacte PL-02-SQL-schema en fictieve records uit het
eerste bewijs. Zij controleren een nieuwer bestaand record met versie 7,
delete/herstart, een fout na een al ingevoegd geldig bronrecord, rollback van
records én marker, behoud van de gehele bron en een geslaagde herpoging na herstel.
Deze import is geen algemene migratie-/herstelvoorziening uit PL-13.

## Bewijs

Frozen install, typecheck, lint, build en 34 tests slagen op Windows met Node
24.3.0 en pnpm 11.10.0. Daarvan zijn er 16 API, 7 core, 6 desktop en 5 shared.
De API-clienttest gebruikt echte Fastify-routes en SQLite en vergelijkt HTTP
met de desktop-commandotransportfunctie voor create/move/read, historie,
voorkeuren, verwijderen en gedeelde foutcodes. Verkeerde context kan niet lezen
of schrijven. De normale API-startsmoke controleert daarnaast de geregistreerde
workspace-routes en weigering van een verkeerd ID, naast de bestaande routes.

De verpakte desktop gebruikt dezelfde client als de kleine React-weergave.
In versie 0.5 werden vijf oude proeftaken geïmporteerd, via die client verwijderd
en telkens na herstart niet opnieuw ingevoerd. Iedere run maakte en voltooide
ook een rijke herhaaltaak. Versie 0.6 las de tien resterende volledige records
exact gelijk terug, inclusief tijdzone en herhaling, en schreef door tot twintig.
Alle tien runs bevestigden `WORKSPACE_NOT_FOUND`, `VERSION_CONFLICT`,
`INVALID_INPUT`, vaste maker/ID/aanmaakversie en voorkeuren-roundtrip.

Zie [0.5](evidence/pl11-v0.5.json), [0.6](evidence/pl11-v0.6.json) en de
[volledige recordvergelijking](evidence/pl11-client-upgrade-records.json).
Pakketgrootte was 403.647.970 bytes. De eerste start per versie duurde 3.933 en
4.838 ms tot de renderer gereed was; volgende starts 525–875 ms. Dit zijn
processen op een bestaande werkplek met warme OS-cache en wisselende belasting.
Het zijn geen representatieve koude-VM-metingen of performanceacceptatie.

## Acceptatie en opvolging

De lokale PL-11-criteria zijn uitgevoerd: injecteerbare core en client,
gedeelde SQLite-adapter, expliciete werkruimteroutes en IPC-context, dezelfde
taak aanmaken/verplaatsen/teruglezen en gedeelde foutcodes. De wijziging van het
OpenAPI-snapshot is verklaard en de oude contracten blijven getest.

PL-12 blijft nodig voor echte werkruimten, identiteit en toegang. PL-13 is de
volgende afzonderlijke opslagstap: genummerde migraties, taakversies onder een
transactie, gelijktijdige afronding en volledige rollback van taak, opvolger en
herordening. Deze clientstap voegt geen garantie voor meerdere schrijvers toe. De huidige
optionele taakversie uit het bestaande invoercontract blijft behouden; het verplichten
van de versie op workspace-writes hoort bij die afzonderlijke PL-13-versiestap.
PostgreSQL, cloudhosting en hersteldoelen blijven afhankelijk van de fase-0-keuzes.
De volledige bestaande web-UI is niet met pointer-/toetsenbordautomatisering getest.
