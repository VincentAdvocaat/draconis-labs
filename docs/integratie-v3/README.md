# Derde lokale consolidatie

Eigen branch `feature/local-modules-integration-v3` vanaf PR43 `22f5c66659ab4abadb6a1f65b34b92846dce959f`. Twee volledige gereviewde tips zijn met gewone mergecommits opgenomen:

| Bron | Volledige tip | Gereviewde runtime |
| --- | --- | --- |
| [PR44](https://github.com/VincentAdvocaat/draconis-labs/pull/44), statische CMS-export | `b4ef056286fe8d028e418eb99eb10d9472bf0e58` | `349db0b3bfc2e2c85bfe852a7788ea3a9b571c69` |
| [PR45](https://github.com/VincentAdvocaat/draconis-labs/pull/45), bestandsversies | `29fa8357276911795e006f976be56d0dc236f4b2` | dezelfde tip |

Beide bronreviews zijn gesloten. PR44 had twee P2-contractfixes en PR45 één P2-retryfix; Sol6.1 low implementeerde die en dezelfde Astra-medium reviewers herbeoordeelden ze. Zie het [PR44-rapport](../cms/review-pr44.md) en het integraal overgenomen [PR45-rapport](review-pr45.json). Die bronreviews vervangen de afzonderlijke integratiereview niet.

## Integratiegrens

De voorafgaande ancestor-, pad- en merge-treecontrole vond één gezamenlijk gewijzigd pad: `docs/media-catalogus/status.md`. De wijzigingen raken andere rijen en zijn automatisch verenigd. Er waren geen conflicten. De gezamenlijke mergetip vóór integratiebewijs is `f022f7800a989c63f5e13dba3fe60471b4c46445`.

Er is geen extra runtimecompatibiliteitscode toegevoegd. Alle CMS-, catalogus- en uploadcode blijft blobgelijk aan de betreffende bron. De integratie voegt één gezamenlijke regressiecase, bewijs en een seriële API-uitvoering in de bestaande checkoutpoort toe. Bestaande timeouts blijven gelijk. De nieuwe gecombineerde case heeft een eigen begrensd budget van30s.

CMS-schema8 en catalogusschema5 blijven behouden. Uploadschema1 en het additieve `uploadSchema: 0|1` in herstelmanifestformat1 komen volledig uit PR45. De statische export leest alleen de gepubliceerde CMS-inventaris en heeft geen mediaDB-/uploadschema-afhankelijkheid. Zie [blobherkomst](blobherkomst.md) en [bewijs](bewijs.md).

## Reproduceren

```powershell
./scripts/verify-local-integration.ps1
# Gerichte gezamenlijke case:
corepack pnpm --filter @draconis/api exec vitest run tests/cms-version-export-integration.test.ts --maxWorkers=1 --no-file-parallelism
```

Gebruik voor een handmatige export de bestaande [M5-instructie](../cms/statische-export-proef.md), uitsluitend met nieuwe eigen synthetische opslag. Bronfixtures uit vorige chats zijn historisch bewijs en worden niet gewijzigd.

## Open criteria en vervolgbesluit

M2-bestandsversies en lokale M5-exportacceptatie zijn nu verenigd; bredere M4-portfoliofuncties, echte M6-klantimport, CMS-template-/route-lifecycle en productie-identiteit/hosting blijven open. Bestaande gekopieerde releases worden door een rechtenwijziging of nieuwe upload niet ingetrokken. Twee databases en bestanden zijn niet live crash-atomair. Geen algemene JS-analyse, URL-rewrite, file://-garantie of cryptografisch ondertekende releaseketen.

Deze taak wijzigt PR43 en main niet en voert geen deployment uit. Een latere expliciete opdracht kan de gewone mergeketen PR37→PR43→deze PR naar main laten doorlopen, telkens na controle van de actuele tips en base. De reeds opgenomen bron-PR's hoeven dan niet afzonderlijk opnieuw te worden gemerged. Geen automatische sluiting of branchverwijdering. Het bestaande [mainmergeplan](../integratie-v2/mainmergeplan.md) blijft een voorstel.

## Overdracht

[Lokale demo](lokale-demo.md), [actueel mergevoorstel](mainmergeplan.md), [geprioriteerde open criteria](open-criteria.md) en [integratiereviewstatus](review-pr46.md).

[Afrondingsregister van19 CMS/integratie-PRs](pr-afronding.md), [machineleesbare exacte heads](pr-afronding.json) en [lokale bestanden](lokale-bestanden.json).
