import { createMediaFixture } from '../media-fixture/fixture.js';
import { CatalogService } from './service.js';
import { CatalogSnapshotConsumer, type CatalogConsumerOwner } from './consumer.js';
import type { CatalogSnapshot } from './contracts.js';

/** Synthetic local data only. Does not approve or inspect customer media. */
export function createCatalogConsumerFixture() {
  const fixture = createMediaFixture();
  const catalog = new CatalogService(fixture.root);
  const website = 'fixture-alpha';
  catalog.setRights(website, 'photo', { expectedVersion: 1, status: 'cleared', owner: 'Synthetic test maker',
    source: 'Fixed local 1x1 test PNG', basis: 'Fictitious permission for automated fixtures only', employee: 'Test fixture', confirmed: true });
  const item = catalog.save(website, { expectedVersion: 0, title: 'Rood proefbeeld', slug: 'rood', description: 'Nederlandse beschrijving',
    categoryId: 'algemeen', metadata: { year: 2026 },
    media: { assetId: 'photo', fileVersion: 1, usage: 'cover', altText: { nl: 'Een rood vlak' }, decorative: false } });
  catalog.saveLocaleVariant(website, item.itemId, 'en', { expectedVersion: 1, title: 'Red sample', slug: 'red', description: null, alt: 'A red square' });
  const nl = catalog.publish(website, 2);
  const en = catalog.publish(website, 2, { locale: 'en', fallbackLocale: 'nl' });
  const consumer = new CatalogSnapshotConsumer(fixture.root);
  return { root: fixture.root, website, catalog, consumer, media: fixture.store, item, nl, en,
    request(snapshot: CatalogSnapshot = nl, owner: Partial<CatalogConsumerOwner> = {}) {
      return { owner: { module: 'cms', siteId: 'demo-cms', ownerId: 'page-one', revisionId: 'page-revision-one',
        kind: 'release' as const, slot: 'portfolio-one', attemptId: 'cms-attempt-one', ...owner },
      ref: { websiteId: website, collectionId: 'portfolio' as const, snapshotId: snapshot.snapshotId },
      checksum: snapshot.checksum, localeContext: snapshot.localeContext! };
    },
    cleanup() { consumer.close(); catalog.close(); fixture.cleanup(); },
  };
}
