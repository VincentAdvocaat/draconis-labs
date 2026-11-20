# M0 lokale media-contractproef

Deze implementatie is een fixture-adapter, geen uploadmodule of aangesloten CMS. De branch `feature/media-contract-proef` begint op ontwerpcommit `039b47580e5c62a9578fc4868bbd0bb284e41b87` uit [docs-PR 6](https://github.com/VincentAdvocaat/draconis-labs/pull/6). Die ontwerp-PR is onafhankelijk gereviewd; P2 voor kleine bronafbeeldingen en P3 over lege bestanden zijn opgelost en gericht bevestigd. De vervolg-PR bevat door deze branchbasis ook de nog niet gemergede ontwerpdocumenten.

## Starten en controleren

Voer vanuit de root van deze worktree uit met Node 22+ en Corepack/pnpm:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @draconis/api exec tsx src/media-fixture/demo.ts
corepack pnpm --filter @draconis/api exec vitest run tests/media-fixture.test.ts
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

De demo is de lokale CLI-entrypoint. Zij toont twee gebruiken van één afbeelding, versie 1 in een behouden release, versie 2 in het gewijzigde concept en een geweigerde purge. De demo maakt zelf een nieuwe tijdelijke map en ruimt die in `finally` op. Geen server, poort, credentials of productieconfiguratie nodig. Er is geen wijziging aan de bestaande API-route-registratie.

`createMediaFixture()` maakt een eigen `draconis-media-fixture-*`-map direct onder de tijdelijke systeemmap, een marker, een SQLite-database en private/public submappen. Alleen deze expliciet gemarkeerde tijdelijke opslag mag de adapter openen. Hij importeert de planner-database niet en heeft geen fallbackpad. `fixture.cleanup()` controleert het uiteindelijke pad en eigendomstoken voordat het die map recursief verwijdert. Bij een crash blijft de map staan; herstel gebeurt door een eigen fixturehandle of na handmatige controle, niet via een brede opruimactie op alle tijdelijke bestanden.

## Interface voor CMS-proef

De nieuwe code staat onder `server/api/src/media-fixture`, zonder wijzigingen aan gedeelde contract- of entrypointbestanden.

```typescript
const fixture = createMediaFixture();
const { store } = fixture;
store.saveReferences('fixture-alpha', {
  module: 'cms', ownerId: 'home', revisionId: 'home-draft', expectedVersion: 0,
  references: [{ assetId: 'photo', fileVersion: 1, usage: 'hero',
    altText: { nl: 'Een rood proefbeeld' }, decorative: false }],
});
const manifest = store.resolveRelease('fixture-alpha', {
  releaseId: 'release-1', revisionId: 'home-draft', locales: ['nl'],
});
// Gebruik manifest.references[].variants[] voor lokale publieke bestandsinformatie.
fixture.cleanup();
```

`MediaFixtureStore` biedt daarnaast `list`, `select`, `usages`, `archive` en `purge`. Alle operaties toetsen de bij constructie expliciet toegestane website-ID's. Dit is een vertrouwde fixture-aanroepcontext, geen authenticatie voor eindgebruikers. De twee fictieve websites zijn `fixture-alpha` en `fixture-beta`; beiden hebben `photo`, `pending`, `unlicensed` en `blocked`, met fileVersions 1 en 2. Alleen `photo` is ready en cleared. De vaste fixture is een geldige 1x1 PNG; de processor/fallbackset voor gebruikersuploads hoort bij M1.

De volledige referentieset en de gebruiksregistraties worden samen in één SQLite-transactie opgeslagen. Een verouderde expectedVersion of gewijzigde owner bij dezelfde revisionId geeft 409. Een usage-slot is uniek per revision. Een niet-bestaande of cross-website asset/fileVersion wordt geweigerd. Incomplete drafts mogen nog ontbrekende alt of niet-vrijgegeven media hebben. De resolver blokkeert die bij publicatie.

Iedere te behouden historische CMS-revisie krijgt een eigen revisionId. De adapter bewaart deze registraties onbeperkt, totdat later een expliciet retentieprotocol wordt gebouwd. Een bijgewerkt concept vervangt alleen zijn eigen registraties. Releases bewaren een aparte gebruiksregistratie, zodat het leegmaken van het concept een gepubliceerde verwijzing niet vrijgeeft. Er bestaat in M0 geen verwijderoperatie voor historische revisies of releases.

De resolver legt fileVersion, locale-alt, derivatives en SHA-256 vast. Een identieke release-aanvraag is idempotent en verandert niet door latere conceptwijzigingen. Hergebruik van releaseId voor een andere revision/localeset geeft 409. Bij opnieuw opvragen controleert de adapter rechten, gereedheid en bestanden opnieuw. Een rechtenblokkade of beschadigd bestand weigert dus heruitgifte, zonder de behouden manifestregistratie te overschrijven. Publicatie bevat alleen relatieve publieke derivativepaden, geen absolute opslagpaden of private originelen.

## Grenzen en vervolgwerk

- `purge` vereist een expliciete actie, passende metadataVersion en nul behouden referenties. M0 verwijdert uitsluitend metadata; binaries blijven tot fixturecleanup staan. Er is nog geen productiegeschikte fysieke purge of herstelproces voor verweesde binaries.
- Er is geen uploadendpoint, MIME/decode-validator, transformatieworker, bibliotheek-UI, catalogus of website-ZIP. Ook de 1/200/320/640-processorfixtures uit M1 zijn nog niet gebouwd. De PNG-fixture bewijst alleen het contract.
- Er zijn geen credits/rechtenbewijzen, klantgegevens, locale-fallbacks, catalogus-snapshotVersion of release-finaliseringsworkflow geïmplementeerd. Deze fixture gebruikt een eenvoudige rechtenstatus en controleert alle gevraagde locales expliciet. De catalogus- en CMS-integratie blijven M3/M5.
- De manifestresolver schrijft geen lokale releasemap; het CMS kan deze module later gebruiken om een release te bouwen. Er is geen claim van online publicatie of veilige gelijktijdige verwerking van onbevoegde filesystem-wijzigingen. Opslag is een vertrouwde lokale fixturemap.
- Geen nieuwe dependencies, betaalde diensten, AI-calls, provisioning of deployments. Bestaande CMS en klantcheckouts zijn niet gewijzigd.

De gerichte tests bestrijken pinning na heropenen, websitegrenzen bij alle operaties, ontbrekende/ongeldige fileVersions, atomair herstel na mislukte save, conflicten, usage-slots, locale-alt/decorative, status/rechten/verloopdatum, archief, retained references, purge en corruptie/padbegrenzing van publieke bestanden. Ook de fixture-PNG zelf krijgt CRC- en decodecontrole.

De onafhankelijke review van PR 8 vond een P2 in de padbegrenzing. Een tekstuele `public/`-prefix kon via `public/../private/...` toch een geldig privébestand aanwijzen. Dit is eerst met een falende regressietest bevestigd en vervolgens opgelost door het genormaliseerde pad te begrenzen tot de publieke submap. De test controleert ook dat de geweigerde release geen release-record of extra gebruiksregistratie achterlaat. De gerichte herbeoordeling gebeurt in dezelfde reviewchat `01a1f4a7-9f62-7960-a3b2-ad7b2df0b726`.
