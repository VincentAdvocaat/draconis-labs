import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { MediaFixtureStore } from '../src/media-fixture/storage.js';
import { CatalogService } from '../src/catalogus/service.js';
import { buildCatalogApp } from '../src/catalogus/app.js';
import type { CatalogItem, CatalogSnapshot, ItemInput } from '../src/catalogus/contracts.js';
import { LocalUploadService } from '../src/media-upload/service.js';

const site = 'fixture-alpha';
const input: ItemInput = { expectedVersion: 0, title: 'Rood proefbeeld', slug: 'rood-proefbeeld',
  description: 'Een voorbeelditem', categoryId: 'algemeen', metadata: { year: 2026 },
  media: { assetId: 'photo', fileVersion: 1, usage: 'cover', altText: { nl: 'Een rood beeld' }, decorative: false } };
const decision = { expectedVersion: 1, status: 'cleared', owner: 'Test maker', source: 'Lokale testfixture',
  basis: 'Uitsluitend fictieve testtoestemming voor deze geautomatiseerde proef', employee: 'Test medewerker', confirmed: true };

describe('persisted catalog and portfolio module', () => {
  let fixture: ReturnType<typeof createMediaFixture>;
  let service: CatalogService;
  beforeEach(() => { fixture = createMediaFixture(); service = new CatalogService(fixture.root); service.setRights(site, 'photo', decision); });
  afterEach(() => { service.close(); fixture.cleanup(); });

  it('publishes only the explicitly entered, escaped credit from each immutable snapshot in NL and EN', async () => {
    const token = 'public-credit-functional-test-bearer-key';
    const app = await buildCatalogApp(fixture.root, token);
    const base = '/catalogus/api/' + site;
    const headers = { authorization: 'Bearer ' + token };
    const save = (payload: ItemInput) => app.inject({ method: 'POST', url: base + '/items', headers, payload });
    const publish = async (locale: 'nl' | 'en' = 'nl') => {
      const result = await app.inject({ method: 'POST', url: base + '/publish', headers,
        payload: { expectedVersion: service.list(site).version, locale } });
      expect(result.statusCode, result.body).toBe(200);
      return result.json() as CatalogSnapshot;
    };
    const url = (snapshot: CatalogSnapshot) => '/portfolio/' + site + '/' + snapshot.snapshotId;
    const publicCredit = 'Fictief & <beeld>';
    try {
      expect((await save({ ...input, publicPhotoCredit: 'a'.repeat(201) })).statusCode).toBe(400);
      const initial = await save(input);
      expect(initial.statusCode).toBe(200);
      const item = initial.json() as CatalogItem;
      const original = await publish();
      const originalHtml = await app.inject(url(original));
      expect(originalHtml.statusCode).toBe(200);
      expect(originalHtml.body).not.toContain('Foto door');
      expect(originalHtml.body).not.toContain(decision.owner);
      expect(original.items[0]).not.toHaveProperty('publicPhotoCredit');

      const update = await save({ ...input, itemId: item.itemId, expectedVersion: item.version, publicPhotoCredit: ' ' + publicCredit + ' ' });
      expect(update.statusCode, update.body).toBe(200);
      expect(update.json().publicPhotoCredit).toBe(publicCredit);
      expect((await app.inject(url(original))).body).toBe(originalHtml.body);
      const dutch = await publish();
      expect(dutch.items[0].publicPhotoCredit).toBe(publicCredit);
      const localized = service.saveLocaleVariant(site, item.itemId, 'en', { expectedVersion: update.json().version,
        title: 'Fixture image', slug: 'fixture-image', description: '', alt: 'A red picture' });
      const english = await publish('en');
      for (const [snapshot, label, slug] of [[dutch, 'Foto door', input.slug], [english, 'Photo by', 'fixture-image']] as const) {
        for (const route of [url(snapshot), url(snapshot) + '/items/' + slug]) {
          const result = await app.inject(route);
          expect(result.statusCode).toBe(200);
          expect(result.body).toContain(label + ' Fictief &amp; &lt;beeld&gt;');
          for (const privateText of [publicCredit, decision.owner, decision.basis, decision.employee])
            expect(result.body).not.toContain(privateText);
        }
      }

      const cleared = await save({ ...input, itemId: item.itemId, expectedVersion: localized.version, publicPhotoCredit: '   ' });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json()).not.toHaveProperty('publicPhotoCredit');
      const without = await publish();
      expect((await app.inject(url(without))).body).not.toContain('Foto door');
      expect((await app.inject(url(dutch))).body).toContain('Foto door Fictief');
      expect(service.resolveSnapshot(original)).toEqual(original);
      expect((await app.inject(url(original))).body).toBe(originalHtml.body);
    } finally { await app.close(); }
  });

  it('preserves credits for legacy edits to the same use and requires an explicit credit for a changed use', () => {
    const item = service.save(site, { ...input, publicPhotoCredit: 'Eerste credit' });
    const renamed = service.save(site, { ...input, itemId: item.itemId, expectedVersion: item.version, title: 'Andere titel' });
    expect(renamed.publicPhotoCredit).toBe('Eerste credit');
    const newMedia = { ...input.media, fileVersion: 2 };
    const replaced = service.save(site, { ...input, itemId: item.itemId, expectedVersion: renamed.version, media: newMedia });
    expect(replaced).not.toHaveProperty('publicPhotoCredit');
    const credited = service.save(site, { ...input, itemId: item.itemId, expectedVersion: replaced.version, media: newMedia, publicPhotoCredit: 'Nieuwe credit' });
    const cleared = service.save(site, { ...input, itemId: item.itemId, expectedVersion: credited.version, media: newMedia, publicPhotoCredit: null });
    expect(cleared).not.toHaveProperty('publicPhotoCredit');
  });

  it('migrates once and preserves drafts, immutable snapshot and retained refs after edit/archive/reopen', () => {
    const item = service.save(site, input);
    const snapshot = service.publish(site, 1);
    const ref = { websiteId: site, collectionId: 'portfolio' as const, snapshotId: snapshot.snapshotId };
    const bytes = service.variant(ref, item.itemId, 0).bytes;
    const edited = service.save(site, { ...input, itemId: item.itemId, expectedVersion: 1,
      title: 'Gewijzigd', media: { ...input.media, fileVersion: 2 } });
    service.archive(site, item.itemId, edited.version);
    expect(service.list(site).items).toEqual([]);
    expect(service.resolveSnapshot(ref)).toEqual(snapshot);
    expect(service.variant(ref, item.itemId, 0).bytes).toEqual(bytes);
    expect(() => fixture.store.purge(site, 'photo', 2, true)).toThrow('retained');
    expect(fixture.store.usages(site, 'photo')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'release', fileVersion: 1 }),
      expect.objectContaining({ kind: 'revision', fileVersion: 2 }),
    ]));
    service.close();
    service = new CatalogService(fixture.root);
    expect(service.resolveSnapshot(ref)).toEqual(snapshot);
    expect(service.list(site).version).toBe(3);
    expect(service.variant(ref, item.itemId, 0).bytes).toEqual(bytes);
  });

  it('enforces website slug uniqueness, optimistic item/collection versions and independent sites', () => {
    const item = service.save(site, input);
    expect(() => service.save(site, input)).toThrow('Slug already exists');
    expect(() => service.save(site, { ...input, itemId: item.itemId })).toThrow('version conflict');
    expect(() => service.publish(site, 0)).toThrow('version conflict');
    expect(service.save('fixture-beta', input).slug).toBe(input.slug);
    expect(() => service.save('fixture-beta', { ...input, itemId: item.itemId, expectedVersion: 1 })).toThrow('Item not found');
    expect(() => service.resolveSnapshot({ websiteId: 'fixture-beta', collectionId: 'portfolio', snapshotId: service.publish(site, 1).snapshotId })).toThrow('snapshot not found');
    expect(() => service.list('other')).toThrow('Website access denied');
  });

  it('keeps item/media writes atomic when the media reference or catalog insert fails', () => {
    expect(() => service.save(site, { ...input, media: { ...input.media, fileVersion: 999 } })).toThrow('Missing fileVersion');
    expect(service.list(site).version).toBe(0);
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      db.exec("CREATE TRIGGER fail_catalog BEFORE INSERT ON catalog_revisions BEGIN SELECT RAISE(ABORT,'forced insert failure'); END");
      expect(() => service.save(site, input)).toThrow('forced insert failure');
      expect(db.prepare("SELECT * FROM usages WHERE kind='revision'").all()).toEqual([]);
      expect(db.prepare('SELECT * FROM revisions').all()).toEqual([]);
      expect(service.list(site).version).toBe(0);
    } finally { db.close(); }
  });

  it('requires explicit versioned rights evidence, keeps an audit and rejects stale/false approvals', () => {
    expect(() => service.setRights(site, 'unlicensed', { ...decision, confirmed: false })).toThrow();
    expect(() => service.setRights(site, 'unlicensed', { ...decision, basis: '' })).toThrow();
    service.save(site, { ...input, media: { ...input.media, assetId: 'unlicensed' } });
    expect(() => service.publish(site, 1)).toThrow('Explicit employee rights approval required');
    expect(service.setRights(site, 'unlicensed', decision)).toEqual({ metadataVersion: 2, rights: 'cleared' });
    expect(() => service.setRights(site, 'unlicensed', decision)).toThrow('Rights version conflict');
    expect(service.publish(site, 1).items).toHaveLength(1);
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      const audit = db.prepare('SELECT decision FROM media_rights_audit WHERE website=? AND asset=?').get(site, 'unlicensed') as { decision: string };
      expect(JSON.parse(audit.decision)).toMatchObject(decision);
    } finally { db.close(); }
  });

  it('rolls back all new release registrations if any item fails public validation', () => {
    service.save(site, input);
    service.save(site, { ...input, slug: 'tweede', media: { ...input.media, assetId: 'unlicensed' } });
    expect(() => service.publish(site, 2)).toThrow('Explicit employee rights approval required');
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      expect(db.prepare('SELECT * FROM catalog_snapshots').all()).toEqual([]);
      expect(db.prepare("SELECT * FROM usages WHERE kind='release'").all()).toEqual([]);
      expect(db.prepare('SELECT * FROM releases').all()).toEqual([]);
    } finally { db.close(); }
  });

  it('validates schema metadata/slug/category and preserves reserved slugs after archive', () => {
    for (const invalid of [{ metadata: { price: 10 } }, { categoryId: 'shop' }, { slug: '../item' }])
      expect(() => service.save(site, { ...input, ...invalid })).toThrow();
    const item = service.save(site, input);
    service.archive(site, item.itemId, 1);
    expect(() => service.save(site, input)).toThrow('Slug already exists');
  });

  it('does not close an injected database and rejects injection from another database', () => {
    const db = new Database(join(fixture.root, 'media.sqlite'));
    const media = new MediaFixtureStore(fixture.root, [site], db);
    media.close();
    expect(db.open).toBe(true);
    db.close();
    const memory = new Database(':memory:');
    try { expect(() => new MediaFixtureStore(fixture.root, [site], memory)).toThrow('must belong'); }
    finally { memory.close(); }
  });

  it('reports persisted rights in upload status after explicit approval or blocking', async () => {
    const uploads = new LocalUploadService(fixture.root);
    try {
      const result = await uploads.upload(site, readFileSync(join(fixture.root, 'public', site, 'photo', '1', 'tiny.png')), 'fixture.png', 'image/png');
      expect(result.rights).toBe('unknown');
      service.setRights(site, result.assetId, decision);
      expect(uploads.status(site, result.assetId).rights).toBe('cleared');
      service.setRights(site, result.assetId, { ...decision, expectedVersion: 2, status: 'blocked' });
      expect(uploads.status(site, result.assetId).rights).toBe('blocked');
    } finally { uploads.close(); }
  });

  it('withdraws with CAS and explicit confirmation while preserving immutable data, audit and retained references', () => {
    const item = service.save(site, input);
    const snapshot = service.publish(site, 1);
    const ref = { websiteId: site, collectionId: 'portfolio' as const, snapshotId: snapshot.snapshotId };
    const usages = fixture.store.usages(site, 'photo');
    const withdrawal = { expectedVersion: 1, employee: 'Test medewerker', reason: 'Lokale testintrekking', confirmed: true };
    expect(() => service.withdraw(site, snapshot.snapshotId, { ...withdrawal, confirmed: false })).toThrow();
    expect(() => service.withdraw(site, snapshot.snapshotId, { ...withdrawal, expectedVersion: 99 })).toThrow('version or status conflict');
    expect(() => service.withdraw('fixture-beta', snapshot.snapshotId, withdrawal)).toThrow('not found for website');
    expect(service.withdraw(site, snapshot.snapshotId, withdrawal)).toMatchObject({ status: 'withdrawn', version: 2 });
    expect(() => service.withdraw(site, snapshot.snapshotId, withdrawal)).toThrow('version or status conflict');
    expect(() => service.resolveSnapshot(ref)).toThrow('snapshot not found');
    expect(() => service.variant(ref, item.itemId, 0)).toThrow('snapshot not found');
    expect(fixture.store.usages(site, 'photo')).toEqual(usages);
    expect(() => fixture.store.purge(site, 'photo', 2, true)).toThrow('retained');
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      const stored = db.prepare('SELECT json FROM catalog_snapshots WHERE id=?').get(snapshot.snapshotId) as { json: string };
      expect(JSON.parse(stored.json)).toEqual(snapshot);
      const audit = db.prepare('SELECT action,details FROM catalog_snapshot_audit WHERE snapshot=? ORDER BY version')
        .all(snapshot.snapshotId) as { action: string; details: string }[];
      expect(audit.map(a => a.action)).toEqual(['published', 'withdrawn']);
      expect(JSON.parse(audit[1].details)).toMatchObject(withdrawal);
    } finally { db.close(); }
    const replacement = service.publish(site, 1);
    expect(replacement.snapshotId).not.toBe(snapshot.snapshotId);
    service.setRights(site, 'photo', { ...decision, expectedVersion: 2, status: 'blocked' });
    expect(() => service.publish(site, 1)).toThrow('Explicit employee rights approval required');
    expect(service.resolveSnapshot({ ...ref, snapshotId: replacement.snapshotId })).toEqual(replacement);
    service.close(); service = new CatalogService(fixture.root);
    expect(service.listSnapshots(site)).toEqual(expect.arrayContaining([
      expect.objectContaining({ snapshotId: snapshot.snapshotId, status: 'withdrawn', version: 2 }),
    ]));
  });

  it('migrates existing schema 1 snapshots without changing their bytes or refs', () => {
    service.save(site, input);
    const snapshot = service.publish(site, 1);
    const usages = fixture.store.usages(site, 'photo');
    service.close();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      db.exec(`DROP TABLE catalog_snapshot_audit;
        ALTER TABLE catalog_items DROP COLUMN position;
        ALTER TABLE catalog_snapshots DROP COLUMN status;
        ALTER TABLE catalog_snapshots DROP COLUMN version;
        DROP TABLE catalog_locale_values;
        DROP TABLE catalog_locale_slugs;
        ALTER TABLE catalog_collections DROP COLUMN default_locale;
        UPDATE catalog_schema SET version=1;`);
    } finally { db.close(); }
    service = new CatalogService(fixture.root);
    expect(service.listSnapshots(site)[0]).toMatchObject({ snapshotId: snapshot.snapshotId, status: 'published', version: 1 });
    expect(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: snapshot.snapshotId })).toEqual(snapshot);
    expect(fixture.store.usages(site, 'photo')).toEqual(usages);
  });
});

describe('browser-facing catalog HTTP contract', () => {
  it('protects drafts/private preview, permits exact browser origin and renders only published pinned data', async () => {
    const fixture = createMediaFixture();
    const token = 'temporary-browser-catalog-fixture-token-123456789';
    const app = await buildCatalogApp(fixture.root, token);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const headers = { Authorization: `Bearer ${token}`, Origin: address, 'Content-Type': 'application/json' };
    try {
      expect((await fetch(`${address}/catalogus`)).status).toBe(200);
      expect((await fetch(`${address}/catalogus/api/${site}`)).status).toBe(401);
      const unsafe = await fetch(`${address}/catalogus/api/${site}/items`, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body: JSON.stringify(input) });
      expect(unsafe.status).toBe(403);
      const draft = await fetch(`${address}/catalogus/api/${site}/items`, { method: 'POST', headers,
        body: JSON.stringify({ ...input, title: '<script>alert(1)</script>' }) });
      expect(draft.status).toBe(200);
      const item = await draft.json() as { itemId: string };
      expect((await fetch(`${address}/catalogus/api/${site}/preview/photo/1`)).status).toBe(401);
      expect((await fetch(`${address}/catalogus/api/${site}/preview/photo/1`, { headers })).status).toBe(200);
      const publish = await fetch(`${address}/catalogus/api/${site}/publish`, { method: 'POST', headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(publish.status).toBe(409);
      expect((await fetch(`${address}/catalogus/api/${site}/rights/photo`, { method: 'PUT', headers, body: JSON.stringify(decision) })).status).toBe(200);
      const approvedPublish = await fetch(`${address}/catalogus/api/${site}/publish`, { method: 'POST', headers, body: JSON.stringify({ expectedVersion: 1 }) });
      expect(approvedPublish.status).toBe(200);
      const snapshot = await approvedPublish.json() as { snapshotId: string };
      const base = `${address}/portfolio/${site}/${snapshot.snapshotId}`;
      const html = await (await fetch(base)).text();
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).not.toContain('private');
      expect(html).not.toContain(fixture.root);
      const image = await fetch(`${base}/media/${item.itemId}/0`);
      expect(Buffer.from(await image.arrayBuffer())).toEqual(readFileSync(join(fixture.root, 'public', site, 'photo', '1', 'tiny.png')));
      expect((await fetch(`${address}/portfolio/fixture-beta/${snapshot.snapshotId}`)).status).toBe(404);
      expect((await fetch(`${base}/items/missing`)).status).toBe(404);
      const invalid = await fetch(`${address}/catalogus/api/${site}/items`, { method: 'POST', headers, body: '{}' });
      expect(invalid.status).toBe(400);
      expect((await fetch(`${address}/catalogus/api/${site}/snapshots`)).status).toBe(401);
      const withdrawal = { expectedVersion: 1, employee: 'Test medewerker', reason: 'Browserpublicatie intrekken', confirmed: true };
      expect((await fetch(`${address}/catalogus/api/fixture-beta/snapshots/${snapshot.snapshotId}/withdraw`, { method: 'POST', headers, body: JSON.stringify(withdrawal) })).status).toBe(404);
      expect((await fetch(`${address}/catalogus/api/${site}/snapshots/${snapshot.snapshotId}/withdraw`, { method: 'POST', headers, body: JSON.stringify({ ...withdrawal, confirmed: false }) })).status).toBe(400);
      const concurrent = await Promise.all([1, 2].map(() => fetch(`${address}/catalogus/api/${site}/snapshots/${snapshot.snapshotId}/withdraw`, { method: 'POST', headers, body: JSON.stringify(withdrawal) })));
      expect(concurrent.map(r => r.status).sort()).toEqual([200, 409]);
      for (const path of [base, `${base}/items/rood-proefbeeld`, `${base}/media/${item.itemId}/0`]) {
        const response = await fetch(path);
        expect(response.status).toBe(404);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      const info = await (await fetch(`${address}/catalogus/instance`)).text();
      expect(info).toContain('catalogus');
      expect(info).not.toContain(token);
      expect(info).not.toContain(fixture.root);
    } finally { await app.close(); fixture.cleanup(); }
  });
});
