# Gepinde catalogusconsument voor CMS

Deze interne lokale interface bouwt voort op PR 19, commit `8eca7997e55aabf7788b013c96b118d72991b568`. Alleen gecontroleerde tijdelijke mediafixtures worden ondersteund. Er is geen HTTP-route, CMS-blok of nieuwe dependency toegevoegd. CMS beheert zijn eigen blokken, revisies, buildbestanden en actieve release.

## Aanroepen

```ts
import { CatalogSnapshotConsumer } from '../../catalogus/consumer.js';
const consumer = new CatalogSnapshotConsumer(mediaFixtureRoot);
const pin = consumer.preparePin('fixture-alpha', {
  owner: { module: 'cms', siteId: 'demo-cms', ownerId: pageId, revisionId,
    kind: 'release', slot: blockId, attemptId },
  ref: { websiteId: 'fixture-alpha', collectionId: 'portfolio', snapshotId },
  checksum: selectedSnapshot.checksum,
  localeContext: selectedSnapshot.localeContext,
});
const { snapshot, files } = consumer.materialize('fixture-alpha', pin.pinId);
// CMS rendert snapshot en kopieert files[].bytes met eigen veilige bestandsnamen.
// files geeft itemId/variantIndex, mime, dimensies, checksum, assetId/fileVersion.
await writeCmsRelease(snapshot, files);
// Dit is de laatste await vóór de gate. Verzamel alle portfolio-pins van de attempt.
const result = consumer.finalize('fixture-alpha', allPinIds, pins => {
  const attempt = repository.activate(cmsAttempt); // synchroon, eigen CMS CAS/transactie
  return { status: attempt.status === 'published' ? 'published' : 'not-published',
    activationId: attemptId };
});
consumer.close();
```

De consumerautoriteit moet de website voor de CMS-site bepalen. `siteId` is eigenaaradministratie, geen authenticatieclaim. Geef geen door de browser gekozen website aan de service door zonder CMS-autorisatie. `CatalogConsumerRequest`, `CatalogConsumerPin`, `CatalogConsumerOwner` en activatietypen zijn geëxporteerd uit `consumer.ts`.

`preparePin` is duurzaam en idempotent voor dezelfde eigenaar en aanvraag. Alle eigenaarvelden vormen de sleutel, inclusief immutable revisie, slot en bij releases de attempt. Een andere snapshot/checksum/taalcontext bij dezelfde eigenaar geeft conflict. Conceptpins gebruiken `kind: 'draft'`; voor een release maakt CMS aparte pins met `kind: 'release'` en `attemptId`. `getPin` en `listPins` bieden websitegescheiden administratie, met module/attemptId/ownerId-filters. Snapshot-JSON, gekozen locale/fallback en checksum blijven vast. Schema-1-fixtures hebben uitsluitend hun bestaande verklaarde NL-context.

Voor de asynchrone build legt preparePin eigen M0-releasereferenties vast, naast de bronreferenties. Ook onbekende of mislukte activaties houden die referenties. Er is bewust geen automatische pinverwijdering of retentie-opruiming. Een toekomstige opruimactie vereist aantoonbare kennis over CMS-concepten, attempts en releases.

`materialize` levert uitsluitend gehashte publieke derivatives, zonder private bronbestanden of kopieerpaden. CMS exporteert alleen benodigde publieke velden; het interne pinobject en de snapshot met opslagrelatieve variantpaden horen niet integraal in een publieke bundel. CMS bewaart de pin-ID's bij zijn attempt vóór de asynchrone build.

## Laatste controle en procesgrens

`finalize` houdt één SQLite IMMEDIATE-transactie op `media.sqlite` vast. Alle pins in één batch moeten dezelfde website, module, CMS-site en attempt hebben. De batch moet exact de volledige duurzame releasepinset van die attempt bevatten; weglaten wordt vóór de callback geweigerd. Een geactiveerde attempt accepteert geen nieuwe slots. Een nieuwe CMS-build gebruikt een nieuwe attempt. Voor alle slots worden actuele snapshotstatus, checksum, taalcontext, expliciete rechtenaudit, ready-bestandsversies, variantmetadata en bytes/hashes gecontroleerd. Pas daarna wordt precies één synchrone CMS-activatiecallback aangeroepen. Een rechtenblokkade of bronintrekking tijdens de build voorkomt die callback. De vorige CMS-release blijft dan actief. Een guard per fixture-root weigert geneste finalize/reconcile/prepare-aanroepen, ook via een tweede handle. De guard komt in finally vrij, ook na een callbackfout. Native async callbacks worden vooraf geweigerd; andere Promise-resultaten worden geweigerd nadat de functie is aangeroepen. De callback is vertrouwde integratiecode en mag geen async werk starten of bronbestanden veranderen.

Dit is een lokale integratie met één eigenaarproces voor deze consumer en onveranderlijke derivativebestanden. De eigenaarfile weigert een tweede consumerproces; meerdere handles in hetzelfde proces mogen wel. Een apart directoryslot serialiseert het overnemen van een bewezen gestopt proces. Een crash tijdens die korte overname laat het directoryslot staan en weigert automatisch herstel. Inspecteer dan eerst de fixture en eigenaarprocessen. Deze guard vergrendelt geen willekeurige bestandsschrijvers. Gebruik geen onafhankelijke processen die dezelfde bronbestanden wijzigen. SQLite serializeert meewerkende databasewriters tijdens de gate, niet het hele bestandssysteem.

## Twee databases en herstel

`cms.db` en `media.sqlite` zijn **niet crash-atomair**. De volgorde voorkomt verlies van referenties:

1. Prepare legt de consumerpin en eigen M0-referenties vast vóór build/activatie.
2. De finale mediagate controleert alle bronnen en roept synchroon CMS-activatie aan.
3. Na een bevestigde CMS-commit markeert dezelfde mediatransactie de pins activated en schrijft een auditgebeurtenis.

Bij een fout vóór de CMS-commit blijft de vorige release actief. Bij een CMS-commit gevolgd door een fout vóór de mediacommit kan CMS al gepubliceerd zijn terwijl de pin nog prepared is. Dat is een te herstellen administratief verschil; alle bronreferenties blijven behouden. Ook een teruggegeven fout na CMS-commit betekent dus niet automatisch dat CMS ongepubliceerd is.

Na heropenen zoekt CMS met `listPins(website, { module: 'cms', attemptId })` de pins terug. Roep `reconcile(website, pinIds, owner => inspectCmsAttempt(owner.attemptId))` aan met een synchrone lookup van de echte, duurzame CMS-status. De lookup retourneert `{status: 'published', activationId: owner.attemptId}` of `not-published`/`unknown`. Alleen bewezen published markeert prepared pins activated. Unknown en not-published geven niets vrij. Herstel activeert geen CMS-release opnieuw en heeft geen actuele bronvrijgave nodig om een reeds gebeurde activatie administratief vast te leggen. Als een attempt meerdere slots heeft, gebruikt CMS de volledige bewaarde pinset.

Bronintrekking verwijdert geen eerder gekopieerde CMS-publicatie. Daarvoor blijft een eigen expliciete CMS-intrekking nodig. De consumer biedt geen gedistribueerde transactie, rollback van een CMS-commit of algemene multiprocesgarantie.

## Bewijs en overdracht

`createCatalogConsumerFixture` levert een synthetisch NL/EN-item, expliciete fictieve testrechten, twee gepubliceerde snapshots en de consumer. Het is herbruikbaar voor de CMS-integratietests. De tests gebruiken twee echte SQLite-bestanden en simuleren fouten vóór en na de externe commit. Een eigen kindproces sluit ook daadwerkelijk af na CMS-commit, midden in de mediatransactie zonder close-handlers. Beide databases worden daarna heropend en de pin wordt vanuit de duurzame CMS-status hersteld. Dit bewijst behoud/herstel voor die volgorde; het is geen fysieke stroomuitvaltest van het bestandssysteem.

De interface is gebouwd; de CMS-blokintegratie en gezamenlijke browserproef zijn afzonderlijk werk in de CMS-branch. Neem alleen de onafhankelijk gereviewde consumercommit over. Geen klantdata, betaalde diensten, merge of deployment zijn hiervoor gebruikt.
