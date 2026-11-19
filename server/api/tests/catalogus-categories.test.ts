import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { checksum } from '../src/media-fixture/storage.js';
import { CatalogService } from '../src/catalogus/service.js';
import { CatalogSnapshotConsumer } from '../src/catalogus/consumer.js';
import type { CatalogSnapshot, ItemInput } from '../src/catalogus/contracts.js';
import { portfolioHtml } from '../src/catalogus/html.js';
import { buildCatalogApp } from '../src/catalogus/app.js';

const site = 'fixture-alpha';
const itemInput: ItemInput = { expectedVersion: 0, title: 'Proef', slug: 'proef', description: '', categoryId: 'algemeen', metadata: {},
  media: { assetId: 'photo', fileVersion: 1, usage: 'cover', altText: { nl: 'Een rood vlak' }, decorative: false } };
describe('website categories and pinned publication labels', () => {
  let fixture: ReturnType<typeof createMediaFixture>;
  let service: CatalogService;
  beforeEach(() => {
    fixture = createMediaFixture(); service = new CatalogService(fixture.root);
    service.setRights(site, 'photo', { expectedVersion: 1, status: 'cleared', owner: 'Synthetic', source: 'Test fixture',
      basis: 'Fictitious test permission only', employee: 'Test', confirmed: true });
  });
  afterEach(() => { service.close(); fixture.cleanup(); });
  const create = (nl = 'Projecten', en: string | null = 'Projects') => service.saveCategory(site, undefined, { expectedVersion: 0, labels: { nl, en } });
  const publish = () => service.publish(site, service.list(site).version);

  it('creates stable IDs, scopes every operation and enforces version CAS across real handles', () => {
    const first = create();
    const other = new CatalogService(fixture.root);
    try {
      expect(other.listCategories(site)).toContainEqual(first);
      const renamed = service.saveCategory(site, first.categoryId, { expectedVersion: 1, labels: { nl: 'Nieuw', en: null } });
      expect(renamed).toMatchObject({ categoryId: first.categoryId, version: 2, labels: { nl: 'Nieuw', en: null } });
      expect(() => other.saveCategory(site, first.categoryId, { expectedVersion: 1, labels: { nl: 'Verloren' } })).toThrow('version conflict');
      expect(() => other.saveCategory('fixture-beta', first.categoryId, { expectedVersion: 2, labels: { nl: 'Cross-site' } })).toThrow('not found');
      expect(other.listCategories('fixture-beta')).toHaveLength(1);
      expect(() => service.listCategories('other')).toThrow('access denied');
      expect(() => service.saveCategory(site, undefined, { expectedVersion: 0, labels: { nl: ' ' } })).toThrow();
    } finally { other.close(); }
  });

  it('pins category names and preserves old snapshot bytes, rights, alt and retained references after rename', () => {
    const category = create();
    service.save(site, { ...itemInput, categoryId: category.categoryId });
    const before = publish(), json = JSON.stringify(before), usages = fixture.store.usages(site, 'photo');
    expect(before.schemaVersion).toBe(3);
    expect(before.categories).toEqual([{ categoryId: category.categoryId, name: 'Projecten', sourceLocale: 'nl', isFallback: false }]);
    service.saveCategory(site, category.categoryId, { expectedVersion: 1, labels: { nl: 'Nieuw', en: 'New' } });
    expect(JSON.stringify(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: before.snapshotId }))).toBe(json);
    expect(portfolioHtml(before)).toContain('Projecten'); expect(portfolioHtml(before)).not.toContain('Nieuw');
    expect(fixture.store.usages(site, 'photo')).toEqual(usages);
    expect(publish().categories?.[0].name).toBe('Nieuw');
    expect(before.items[0].resolvedMedia.altText.nl).toBe(itemInput.media.altText.nl);
  });

  it('archives without removing references, blocks new selection and rejects delete even after item archive', () => {
    const category = create(), item = service.save(site, { ...itemInput, categoryId: category.categoryId });
    const before = publish();
    expect(() => service.removeCategory(site, category.categoryId, { expectedVersion: 1 })).toThrow('in use');
    service.archiveCategory(site, category.categoryId, { expectedVersion: 1 });
    service.close(); service = new CatalogService(fixture.root);
    expect(service.listCategories(site).find(value => value.categoryId === category.categoryId)).toMatchObject({ version: 2, archived: true });
    expect(() => service.save(site, { ...itemInput, slug: 'new', categoryId: category.categoryId })).toThrow('Archived category');
    const saved = service.save(site, { ...itemInput, itemId: item.itemId, expectedVersion: 1, categoryId: category.categoryId, title: 'Existing selection' });
    expect(saved.categoryId).toBe(category.categoryId);
    service.archive(site, item.itemId, 2);
    expect(() => service.removeCategory(site, category.categoryId, { expectedVersion: 2 })).toThrow('in use');
    expect(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: before.snapshotId })).toEqual(before);
    expect(() => fixture.store.purge(site, 'photo', 2, true)).toThrow('retained');
    const unused = create('Unused');
    expect(service.removeCategory(site, unused.categoryId, { expectedVersion: 1 })).toEqual({ removed: true });
    expect(() => service.removeCategory(site, 'algemeen', { expectedVersion: 1 })).toThrow('in use');
  });

  it('rolls back category writes and collection version if the atomic collection update fails', () => {
    const db = new Database(join(fixture.root, 'media.sqlite'));
    const before = service.list(site).version;
    try {
      db.exec("CREATE TRIGGER category_test_failure BEFORE UPDATE ON catalog_collections BEGIN SELECT RAISE(ABORT,'injected failure'); END;");
      expect(() => create()).toThrow('injected failure');
      expect(service.listCategories(site)).toHaveLength(1); expect(service.list(site).version).toBe(before);
    } finally { db.exec('DROP TRIGGER category_test_failure'); db.close(); }
  });

  it('requires the publication locale name and only uses explicitly selected fallback', () => {
    const category = create('Projecten', null);
    const item = service.save(site, { ...itemInput, categoryId: category.categoryId });
    service.saveLocaleVariant(site, item.itemId, 'en', { expectedVersion: 1, title: 'Sample', slug: 'sample', description: '', alt: 'A red square' });
    const version = service.list(site).version;
    expect(() => service.publish(site, version, { locale: 'en' })).toThrow('Category name');
    const fallback = service.publish(site, version, { locale: 'en', fallbackLocale: 'nl' });
    expect(fallback.categories?.[0]).toMatchObject({ name: 'Projecten', sourceLocale: 'nl', isFallback: true });
    service.saveCategory(site, category.categoryId, { expectedVersion: 1, labels: { nl: 'Projecten', en: '' } });
    expect(() => service.publish(site, service.list(site).version, { locale: 'en', fallbackLocale: 'nl' })).toThrow('Category name');
  });

  it('migrates schema3 while retaining v1/v2/v3 checksum bytes and consumer manifests across reopen', () => {
    service.save(site, itemInput);
    const current = publish();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    const snapshots: CatalogSnapshot[] = [current];
    try {
      for (const schemaVersion of [1, 2] as const) {
        const { categories: _categories, checksum: _checksum, localeContext: _context, ...payload } = current;
        const data = { ...payload, ...(schemaVersion === 2 ? { localeContext: current.localeContext } : {}),
          items: schemaVersion === 1 ? current.items.map(({ localeValues: _values, fieldSources: _sources, ...item }) => item) : current.items,
          schemaVersion, snapshotId: schemaVersion === 1 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222' };
        const old = { ...data, checksum: checksum(Buffer.from(JSON.stringify(data))) };
        db.prepare('INSERT INTO catalog_snapshots(website,id,json) VALUES(?,?,?)').run(site, old.snapshotId, JSON.stringify(old)); snapshots.push(old);
      }
      db.exec('DROP TABLE catalog_categories; UPDATE catalog_schema SET version=3');
    } finally { db.close(); }
    service.close(); service = new CatalogService(fixture.root);
    const consumer = new CatalogSnapshotConsumer(fixture.root);
    try {
      for (const snapshot of snapshots) {
        expect(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: snapshot.snapshotId })).toEqual(snapshot);
        const pin = consumer.preparePin(site, { owner: { module: 'test', siteId: 'demo', ownerId: 'page', revisionId: 'revision', kind: 'release', slot: 'portfolio', attemptId: snapshot.snapshotId },
          ref: { websiteId: site, collectionId: 'portfolio', snapshotId: snapshot.snapshotId }, checksum: snapshot.checksum, localeContext: snapshot.localeContext ?? { defaultLocale: 'nl', locale: 'nl' } });
        expect(consumer.materialize(site, pin.pinId).snapshot).toEqual(snapshot);
        expect(consumer.finalize(site, [pin.pinId], () => ({ status: 'published', activationId: snapshot.snapshotId })).pins[0].state).toBe('activated');
      }
    } finally { consumer.close(); }
  });

  it('protects category mutation routes with the existing private app boundary', async () => {
    const token = 'category-test-token-123456789012345678'; const app = await buildCatalogApp(fixture.root, token);
    try {
      const url = '/catalogus/api/fixture-alpha/categories';
      expect((await app.inject({ method: 'POST', url, payload: { expectedVersion: 0, labels: { nl: 'Test' } } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}`, origin: 'https://other.invalid' }, payload: { expectedVersion: 0, labels: { nl: 'Test' } } })).statusCode).toBe(403);
      expect((await app.inject({ url, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
});
