import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { CatalogService } from '../src/catalogus/service.js';
import type { CatalogSnapshot } from '../src/catalogus/contracts.js';
import { backupRecoveryFixture, createRecoveryFixture, openRecoveryFixture, restoreRecoveryFixture } from '../src/modules/cms/recovery.js';

const roots: string[] = [], mediaRoots: string[] = [];
const target = (kind = 'recovery') => { const root = join(tmpdir(), `draconis-cms-${kind}-${randomUUID()}`); roots.push(root); return root; };
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const base = '/api/v1/cms/websites/demo-cms';
let source: Awaited<ReturnType<typeof createRecoveryFixture>>, restored: Awaited<ReturnType<typeof restoreRecoveryFixture>>, backup: string;
let snapshots: CatalogSnapshot[], rawSnapshots: string[], before: string[], publishedHtml: string[], categoryId: string, itemIds: string[], sourceHashes: string[];
const auth = (root: string) => ({ authorization: 'Bearer ' + json(join(root, 'local-access.json')).publisher });
function rows(path: string) {
  const db = new Database(path, { readonly: true });
  try { return JSON.stringify((db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map(row => [row.name, db.prepare(`SELECT * FROM "${row.name}" ORDER BY rowid`).all()])); }
  finally { db.close(); }
}
afterAll(() => {
  for (const path of [...roots, ...mediaRoots]) {
    if (dirname(resolve(path)) !== resolve(tmpdir()) || !/^draconis-(?:cms-|media-fixture-)/.test(path.split(/[\\/]/).pop()!)) throw Error('Unsafe cleanup');
    rmSync(path, { recursive: true, force: true });
  }
});
beforeAll(async () => {
  source = await createRecoveryFixture(target()); mediaRoots.push(source.mediaRoot);
  const app = await openRecoveryFixture(source.root), headers = auth(source.root);
  const catalog = new CatalogService(source.mediaRoot);
  try {
    const category = catalog.saveCategory('fixture-alpha', undefined, { expectedVersion: 0, labels: { nl: 'Projecten', en: 'Projects' } }); categoryId = category.categoryId;
    for (const slug of ['alpha', 'bravo']) {
      const item = catalog.save('fixture-alpha', { expectedVersion: 0, slug, title: 'Project ' + slug, description: 'Fictief', categoryId, metadata: {},
        media: { assetId: 'photo', fileVersion: 1, usage: 'cover', altText: { nl: 'Fictieve pixel' }, decorative: false } });
      catalog.saveLocaleVariant('fixture-alpha', item.itemId, 'en', { expectedVersion: item.version, title: 'Example ' + slug, slug: 'example-' + slug, description: 'Fictional', alt: 'Fictional pixel' });
    }
    const publish = (locale: 'nl' | 'en') => catalog.publish('fixture-alpha', catalog.list('fixture-alpha').version, { locale });
    const old = [publish('nl'), publish('en')];
    for (const [index, snapshot] of old.entries()) {
      const doc = (await app.app.inject({ method: 'POST', url: base + '/documents', headers, payload: { title: 'Projecten ' + index, slug: 'projecten-' + index } })).json();
      const saved = await app.app.inject({ method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers, payload: { expectedVersion: doc.version, content: {
        ...doc.content, blocks: [{ ...doc.content.blocks[0], body: 'Fictieve projecten' }, { blockId: randomUUID(), type: 'portfolio',
          ref: { websiteId: 'fixture-alpha', collectionId: 'portfolio', snapshotId: snapshot.snapshotId }, checksum: snapshot.checksum, localeContext: snapshot.localeContext }] } } });
      expect(saved.statusCode, saved.body).toBe(200);
    }
    const plan = (await app.app.inject({ url: base + '/site-plan', headers })).json();
    const release = await app.app.inject({ method: 'POST', url: base + '/releases', headers: { ...headers, 'idempotency-key': 'catalog-recovery' }, payload: {
      revisionId: plan.pages[0].revisionId, expectedActiveVersion: plan.activeVersion,
      expectedPages: plan.pages.map(({ pageId, revisionId, version }: { pageId: string; revisionId: string; version: number }) => ({ pageId, revisionId, version })),
      expectedShared: { revisionId: plan.shared.revisionId, version: plan.shared.version }, expectedContact: { revisionId: plan.contactTemplate.revisionId, version: plan.contactTemplate.version, templateHash: plan.contactTemplate.template.hash, locales: ['nl', 'en'] } } });
    expect(release.statusCode, release.body).toBe(200);
    publishedHtml = await Promise.all(['/sites/demo-cms/projecten-0.html', '/sites/demo-cms/projecten-1.html', '/sites/demo-cms/en/contact-fixture.html'].map(async url => (await app.app.inject(url)).body));
    catalog.saveCategory('fixture-alpha', categoryId, { expectedVersion: category.version, labels: { nl: 'Werk', en: 'Work' } });
    itemIds = catalog.list('fixture-alpha').items.map(item => item.itemId).reverse();
    catalog.saveOrder('fixture-alpha', { expectedVersion: catalog.list('fixture-alpha').version, itemIds });
    snapshots = [...old, publish('nl'), publish('en')]; rawSnapshots = snapshots.map(value => JSON.stringify(value));
    const archived = catalog.saveCategory('fixture-alpha', undefined, { expectedVersion: 0, labels: { nl: 'Archief', en: null } });
    catalog.archiveCategory('fixture-alpha', archived.categoryId, { expectedVersion: archived.version });
    const home = (await app.app.inject({ url: base + '/pages/home', headers })).json();
    expect((await app.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers, payload: { expectedVersion: home.pageVersion,
      values: { ...home.values, title: 'New retained integration draft' } } })).statusCode).toBe(200);
  } finally { catalog.close(); await app.app.close(); }
  before = [rows(join(source.root, 'cms.db')), rows(join(source.mediaRoot, 'media.sqlite'))];
  sourceHashes = [sha(readFileSync(join(source.root, 'cms.db'))), sha(readFileSync(join(source.mediaRoot, 'media.sqlite')))];
  backup = target('backup'); await backupRecoveryFixture(source.root, backup);
  restored = await restoreRecoveryFixture(backup, target()); mediaRoots.push(restored.mediaRoot);
});

describe('reviewed CMS/catalog integration recovery', () => {
  it('preserves all rows and old/new NL/EN snapshot bytes before any startup migration', () => {
    expect(json(join(backup, 'backup.json')).catalogSchema).toBe(5);
    expect([rows(join(restored.root, 'cms.db')), rows(join(restored.mediaRoot, 'media.sqlite'))]).toEqual(before);
    expect([sha(readFileSync(join(source.root, 'cms.db'))), sha(readFileSync(join(source.mediaRoot, 'media.sqlite')))]).toEqual(sourceHashes);
    expect(snapshots[0]!.items.map(item => item.itemId).reverse()).toEqual(itemIds);
    expect(snapshots[2]!.items.map(item => item.itemId)).toEqual(itemIds);
    expect(snapshots[0]!.categories!.find(item => item.categoryId === categoryId)!.name).toBe('Projecten');
    expect(snapshots[3]!.categories!.find(item => item.categoryId === categoryId)!.name).toBe('Work');
    expect(auth(restored.root)).not.toEqual(auth(source.root));
  });
  it('keeps published consumers and current category/order/CAS stable through two restarts', async () => {
    for (let restart = 0; restart < 2; restart++) {
      const app = await openRecoveryFixture(restored.root), catalog = new CatalogService(restored.mediaRoot);
      try {
        expect(catalog.list('fixture-alpha').items.map(item => item.itemId)).toEqual(itemIds);
        expect(catalog.listCategories('fixture-alpha').find(item => item.categoryId === categoryId)!.labels.en).toBe('Work');
        expect(snapshots.map(value => JSON.stringify(catalog.resolveSnapshot({ websiteId: 'fixture-alpha', collectionId: 'portfolio', snapshotId: value.snapshotId })))).toEqual(rawSnapshots);
        expect(() => catalog.removeCategory('fixture-alpha', categoryId, { expectedVersion: 2 })).toThrow('in use');
        expect(() => catalog.saveOrder('fixture-alpha', { expectedVersion: 0, itemIds })).toThrow('version conflict');
        const home = (await app.app.inject({ url: base + '/pages/home', headers: auth(restored.root) })).json();
        expect(home.values.title).toBe('New retained integration draft');
        expect((await app.app.inject({ url: base + '/pages/home', headers: auth(source.root) })).statusCode).toBe(401);
        expect(await Promise.all(['/sites/demo-cms/projecten-0.html', '/sites/demo-cms/projecten-1.html', '/sites/demo-cms/en/contact-fixture.html'].map(async url => (await app.app.inject(url)).body))).toEqual(publishedHtml);
      } finally { catalog.close(); await app.app.close(); }
    }
  });
  it('rejects semantic loss after outer file hashes are recomputed', async () => {
    const cases = [
      "DELETE FROM catalog_categories WHERE id='" + categoryId + "'",
      'ALTER TABLE catalog_items DROP COLUMN position',
      "UPDATE catalog_snapshots SET json=json_set(json,'$.items[0].title','Changed without checksum')",
      'DELETE FROM catalog_consumer_pin_events; DELETE FROM catalog_consumer_pins',
      'UPDATE catalog_schema SET version=4',
    ];
    for (const sql of cases) {
      const copy = target('backup'); cpSync(backup, copy, { recursive: true });
      const path = join(copy, 'media/media.sqlite'), db = new Database(path); db.exec(sql); db.close();
      const manifest = json(join(copy, 'backup.json')), entry = manifest.files.find((file: { path: string }) => file.path === 'media/media.sqlite');
      entry.bytes = readFileSync(path).length; entry.sha256 = sha(readFileSync(path)); writeFileSync(join(copy, 'backup.json'), JSON.stringify(manifest));
      await expect(restoreRecoveryFixture(copy, target())).rejects.toThrow();
    }
  });
  it('rejects manifest/database version disagreement before creating a destination', async () => {
    const copy = target('backup'); cpSync(backup, copy, { recursive: true });
    const manifest = json(join(copy, 'backup.json')); manifest.catalogSchema = 4; writeFileSync(join(copy, 'backup.json'), JSON.stringify(manifest));
    await expect(restoreRecoveryFixture(copy, target())).rejects.toThrow('schema mismatch');
  });
});

describe('explicit legacy media schemas', () => {
  for (const version of [3, 4]) it(`backs up and restores schema ${version} before a deliberate startup upgrade`, async () => {
    const fixture = await createRecoveryFixture(target()); mediaRoots.push(fixture.mediaRoot);
    const db = new Database(join(fixture.mediaRoot, 'media.sqlite'));
    db.exec('ALTER TABLE catalog_items DROP COLUMN position');
    if (version === 3) {
      db.exec('DROP TABLE catalog_categories');
      for (const row of db.prepare('SELECT website,id,json FROM catalog_snapshots').all() as Array<{ website: string; id: string; json: string }>) {
        const value = JSON.parse(row.json); delete value.checksum; delete value.categories; value.schemaVersion = 2; const snapshot = { ...value, checksum: sha(JSON.stringify(value)) };
        db.prepare('UPDATE catalog_snapshots SET json=? WHERE website=? AND id=?').run(JSON.stringify(snapshot), row.website, row.id);
      }
    }
    db.prepare('UPDATE catalog_schema SET version=?').run(version); db.close();
    const before = rows(join(fixture.mediaRoot, 'media.sqlite')), output = target('backup');
    await backupRecoveryFixture(fixture.root, output); expect(json(join(output, 'backup.json')).catalogSchema).toBe(version);
    const result = await restoreRecoveryFixture(output, target()); mediaRoots.push(result.mediaRoot);
    expect(rows(join(result.mediaRoot, 'media.sqlite'))).toBe(before);
    const app = await openRecoveryFixture(result.root); await app.app.close();
    const upgraded = new Database(join(result.mediaRoot, 'media.sqlite')); expect(upgraded.prepare('SELECT version FROM catalog_schema').get()).toEqual({ version: 5 }); upgraded.close();
  });
});
