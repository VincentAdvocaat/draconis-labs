import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { checksum } from '../src/media-fixture/storage.js';
import { CatalogService } from '../src/catalogus/service.js';
import { buildCatalogApp } from '../src/catalogus/app.js';
import type { CatalogSnapshot, ItemInput } from '../src/catalogus/contracts.js';

const site = 'fixture-alpha';
const input: ItemInput = { expectedVersion: 0, title: 'Rood proefbeeld', slug: 'rood', description: 'Nederlandse beschrijving',
  categoryId: 'algemeen', metadata: { year: 2026 },
  media: { assetId: 'photo', fileVersion: 1, usage: 'cover', altText: { nl: 'Een rood vlak' }, decorative: false } };
const rights = { expectedVersion: 1, status: 'cleared', owner: 'Test maker', source: 'Synthetische testfixture',
  basis: 'Expliciete fictieve toestemming uitsluitend voor lokale tests', employee: 'Test medewerker', confirmed: true };
const en = { expectedVersion: 1, title: 'Red sample', slug: 'red', description: null, alt: 'A red square' };

describe('catalog locale persistence and publication', () => {
  let fixture: ReturnType<typeof createMediaFixture>;
  let service: CatalogService;
  beforeEach(() => { fixture = createMediaFixture(); service = new CatalogService(fixture.root); service.setRights(site, 'photo', rights); });
  afterEach(() => { service.close(); fixture.cleanup(); });

  it('retains NL IDs and values, diagnoses fallback without materializing it, and requires direct EN fields', () => {
    const item = service.save(site, input);
    const before = service.publish(site, 1);
    const editor = service.localeVariant(site, item.itemId, 'en', 'nl');
    expect(editor.values).toEqual({ title: null, slug: null, description: null, alt: null });
    expect(editor.diagnostics.title).toMatchObject({ sourceLocale: 'nl', isFallback: true, value: input.title });
    expect(() => service.publish(site, 1, { locale: 'en', fallbackLocale: 'nl' })).toThrow('Direct publication fields');
    expect(service.list(site).items[0]).toEqual(item);
    expect(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: before.snapshotId })).toEqual(before);
    const saved = service.saveLocaleVariant(site, item.itemId, 'en', en);
    expect(saved.version).toBe(2);
    expect(service.list(site).items[0]).toMatchObject({ itemId: item.itemId, title: input.title, slug: input.slug });
    const published = service.publish(site, 2, { locale: 'en', fallbackLocale: 'nl' });
    expect(published.localeContext).toEqual({ defaultLocale: 'nl', locale: 'en', fallbackLocale: 'nl' });
    expect(published.items[0]).toMatchObject({ itemId: item.itemId, title: en.title, slug: en.slug,
      description: input.description, resolvedMedia: { fileVersion: 1, altText: { nl: input.media.altText.nl, en: en.alt } },
      fieldSources: { title: { sourceLocale: 'en', isFallback: false }, description: { sourceLocale: 'nl', isFallback: true } } });
    expect(published.items[0].localeValues?.en?.description).toBeNull();
    service.close(); service = new CatalogService(fixture.root);
    expect(service.localeVariant(site, item.itemId, 'en').values).toEqual({ title: en.title, slug: en.slug, description: null, alt: en.alt });
  });

  it('omits missing optional description unless fallback is explicit and preserves deliberate empty description', () => {
    const item = service.save(site, input);
    service.saveLocaleVariant(site, item.itemId, 'en', en);
    const without = service.publish(site, 2, { locale: 'en' });
    expect(without.items[0].description).toBe('');
    expect(without.items[0].fieldSources?.description).toMatchObject({ missing: true, isFallback: false });
    service.saveLocaleVariant(site, item.itemId, 'en', { ...en, expectedVersion: 2, description: '' });
    const deliberate = service.publish(site, 3, { locale: 'en', fallbackLocale: 'nl' });
    expect(deliberate.items[0].description).toBe('');
    expect(deliberate.items[0].fieldSources?.description).toMatchObject({ explicitEmpty: true, sourceLocale: 'en', isFallback: false });
  });

  it.each(['title', 'slug', 'alt'] as const)('rejects blank direct EN %s even with explicit fallback', field => {
    const item = service.save(site, input);
    service.saveLocaleVariant(site, item.itemId, 'en', { ...en, [field]: '' });
    expect(() => service.publish(site, 2, { locale: 'en', fallbackLocale: 'nl' })).toThrow('Direct publication fields');
  });

  it('requires explicit empty EN alt for decorative usage', () => {
    const item = service.save(site, { ...input, media: { ...input.media, decorative: true, altText: { nl: '' } } });
    service.saveLocaleVariant(site, item.itemId, 'en', { ...en, alt: null });
    expect(() => service.publish(site, 2, { locale: 'en' })).toThrow('alt');
    service.saveLocaleVariant(site, item.itemId, 'en', { ...en, expectedVersion: 2, alt: '' });
    expect(service.publish(site, 3, { locale: 'en' }).items[0].resolvedMedia.decorative).toBe(true);
  });

  it('enforces real site/collection/locale slug constraints, including rollback on a duplicate EN slug', () => {
    const first = service.save(site, input);
    const second = service.save(site, { ...input, title: 'Tweede', slug: 'tweede' });
    service.saveLocaleVariant(site, first.itemId, 'en', { ...en, slug: 'rood' });
    expect(() => service.saveLocaleVariant(site, second.itemId, 'en', { ...en, slug: 'rood' })).toThrow('website/collection/locale');
    expect(service.localeVariant(site, second.itemId, 'en').version).toBe(1);
    expect(service.localeVariant(site, second.itemId, 'en').values.title).toBeNull();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      expect(() => db.prepare('INSERT INTO catalog_locale_slugs VALUES(?,?,?,?,?)').run(site, 'portfolio', 'en', 'rood', second.itemId)).toThrow();
      expect(() => db.prepare('INSERT INTO catalog_locale_slugs VALUES(?,?,?,?,?)').run(site, 'other-collection', 'en', 'rood', second.itemId)).not.toThrow();
      expect(db.prepare('SELECT * FROM catalog_locale_values WHERE website=? AND locale=?').all(site, 'en')).toHaveLength(1);
    } finally { db.close(); }
    const beta = service.save('fixture-beta', input);
    expect(service.saveLocaleVariant('fixture-beta', beta.itemId, 'en', { ...en, slug: 'rood' }).values.slug).toBe('rood');
  });

  it('keeps locale versions/CAS and preserves translations on default edits while invalidating old alt on image change', () => {
    const item = service.save(site, input);
    service.saveLocaleVariant(site, item.itemId, 'en', en);
    expect(() => service.saveLocaleVariant(site, item.itemId, 'en', en)).toThrow('version conflict');
    service.save(site, { ...input, itemId: item.itemId, expectedVersion: 2, title: 'Gewijzigde NL-titel' });
    expect(service.localeVariant(site, item.itemId, 'en').values.alt).toBe(en.alt);
    const previous = service.publish(site, 3, { locale: 'en' });
    service.save(site, { ...input, itemId: item.itemId, expectedVersion: 3, media: { ...input.media, fileVersion: 2 } });
    expect(service.localeVariant(site, item.itemId, 'en').values.alt).toBeNull();
    expect(() => service.publish(site, 4, { locale: 'en' })).toThrow('alt');
    expect(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: previous.snapshotId })).toEqual(previous);
  });

  it('serializes competing HTTP writes to the same site/collection/EN slug through the real constraint', async () => {
    const first = service.save(site, input);
    const second = service.save(site, { ...input, slug: 'ander-item', title: 'Ander item' });
    const token = 'local-concurrent-slug-token-123456789012345';
    const app = await buildCatalogApp(fixture.root, token);
    try {
      const results = await Promise.all([first, second].map(item => app.inject({
        method: 'PUT', url: `/catalogus/api/${site}/items/${item.itemId}/locales/en`,
        headers: { authorization: `Bearer ${token}` }, payload: { ...en, slug: 'shared-slug' },
      })));
      expect(results.map(result => result.statusCode).sort()).toEqual([200, 409]);
      const slugs = [first, second].map(item => service.localeVariant(site, item.itemId, 'en').values.slug);
      expect(slugs.filter(slug => slug === 'shared-slug')).toHaveLength(1);
    } finally { await app.close(); }
  });

  it('migrates a real legacy snapshot/default item without rewriting IDs, JSON, refs or withdrawn state', () => {
    const item = service.save(site, input);
    const current = service.publish(site, 1);
    const { localeContext: _context, checksum: _hash, ...fields } = current;
    const legacyPayload = { ...fields, schemaVersion: 1 as const, items: current.items.map(({ localeValues: _values, fieldSources: _sources, ...value }) => value) };
    const legacy: CatalogSnapshot = { ...legacyPayload, checksum: checksum(Buffer.from(JSON.stringify(legacyPayload))) };
    const refs = fixture.store.usages(site, 'photo');
    service.close();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      db.prepare('UPDATE catalog_snapshots SET json=? WHERE id=?').run(JSON.stringify(legacy), legacy.snapshotId);
      db.exec(`DROP TABLE catalog_locale_values; DROP TABLE catalog_locale_slugs;
        ALTER TABLE catalog_items DROP COLUMN position;
        ALTER TABLE catalog_collections DROP COLUMN default_locale; UPDATE catalog_schema SET version=2;`);
    } finally { db.close(); }
    service = new CatalogService(fixture.root);
    expect(service.list(site)).toMatchObject({ defaultLocale: 'nl', items: [expect.objectContaining({ itemId: item.itemId, slug: input.slug })] });
    expect(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: legacy.snapshotId })).toEqual(legacy);
    expect(fixture.store.usages(site, 'photo')).toEqual(refs);
    service.withdraw(site, legacy.snapshotId, { expectedVersion: 1, confirmed: true, employee: 'Test medewerker', reason: 'Test migratie en intrekken' });
    service.close(); service = new CatalogService(fixture.root);
    expect(() => service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: legacy.snapshotId })).toThrow('snapshot not found');
  });

  it('releases all connections when an unsupported migration prevents app creation', async () => {
    service.close();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    db.exec('UPDATE catalog_schema SET version=99'); db.close();
    await expect(buildCatalogApp(fixture.root, 'local-migration-test-token-123456789012345')).rejects.toThrow('Unsupported catalog schema');
    const restore = new Database(join(fixture.root, 'media.sqlite'));
    restore.exec('UPDATE catalog_schema SET version=5'); restore.close();
    service = new CatalogService(fixture.root);
  });
});

it('renders an EN public snapshot with its own slug/alt and marked NL-description fallback, while old and withdrawn routes remain pinned', async () => {
  const fixture = createMediaFixture();
  const token = 'local-locale-http-test-token-123456789012345';
  const app = await buildCatalogApp(fixture.root, token);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: address };
  const base = `${address}/catalogus/api/${site}`;
  const request = (path: string, method: string, body: unknown) => fetch(base + path, { method, headers, body: JSON.stringify(body) });
  try {
    await request('/rights/photo', 'PUT', rights);
    const item = await (await request('/items', 'POST', input)).json() as { itemId: string };
    const nl = await (await request('/publish', 'POST', { expectedVersion: 1, locale: 'nl' })).json() as CatalogSnapshot;
    expect((await request(`/items/${item.itemId}/locales/en`, 'PUT', en)).status).toBe(200);
    const english = await (await request('/publish', 'POST', { expectedVersion: 2, locale: 'en', fallbackLocale: 'nl' })).json() as CatalogSnapshot;
    const publicBase = `${address}/portfolio/${site}/${english.snapshotId}`;
    const html = await (await fetch(publicBase)).text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('Red sample');
    expect(html).toContain('alt="A red square"');
    expect(html).toContain(`items/${en.slug}`);
    expect(html).toContain('lang="nl" data-fallback="true"');
    expect(html).toContain(input.description);
    expect((await fetch(`${publicBase}/items/${en.slug}`)).status).toBe(200);
    expect((await fetch(`${publicBase}/items/${input.slug}`)).status).toBe(404);
    expect(await (await fetch(`${address}/portfolio/${site}/${nl.snapshotId}`)).text()).toContain(input.title);
    expect((await fetch(`${base}/items/${item.itemId}/locales/en`)).status).toBe(401);
    expect((await fetch(`${base}/items/${item.itemId}/locales/fr`, { headers })).status).toBe(400);
    await request(`/snapshots/${english.snapshotId}/withdraw`, 'POST', { expectedVersion: 1, employee: 'Test medewerker', reason: 'Taalproef intrekken', confirmed: true });
    expect((await fetch(publicBase)).status).toBe(404);
    expect((await fetch(`${publicBase}/media/${item.itemId}/0`)).status).toBe(404);
    expect((await fetch(`${address}/portfolio/${site}/${nl.snapshotId}`)).status).toBe(200);
    expect(readFileSync(join(fixture.root, 'public', site, 'photo', '1', 'tiny.png')).length).toBeGreaterThan(0);
  } finally { await app.close(); fixture.cleanup(); }
});
