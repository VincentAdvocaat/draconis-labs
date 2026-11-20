import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { CatalogService } from '../src/catalogus/service.js';
import type { ItemInput } from '../src/catalogus/contracts.js';
import { buildCatalogApp } from '../src/catalogus/app.js';
const site = 'fixture-alpha';
const input: ItemInput = { expectedVersion: 0, title: 'Proef', slug: 'proef', description: '', categoryId: 'algemeen', metadata: {},
  media: { assetId: 'photo', fileVersion: 1, usage: 'cover', altText: { nl: 'Rood vlak' }, decorative: false } };

describe('explicit editorial catalogue order', () => {
  let fixture: ReturnType<typeof createMediaFixture>, service: CatalogService;
  beforeEach(() => {
    fixture = createMediaFixture(); service = new CatalogService(fixture.root);
    service.setRights(site, 'photo', { expectedVersion: 1, status: 'cleared', owner: 'Synthetic', source: 'Fixture', basis: 'Fictitious permission for tests', employee: 'Test', confirmed: true });
  });
  afterEach(() => { service.close(); fixture.cleanup(); });
  const create = (slug: string) => service.save(site, { ...input, slug, title: slug });
  const ids = () => service.list(site).items.map(item => item.itemId);

  it('appends new items, retains order through edits/archive/reopen and pins new versus old snapshots', () => {
    const a = create('z-last'), b = create('a-first'), c = create('m-middle');
    expect(ids()).toEqual([a.itemId, b.itemId, c.itemId]);
    const before = service.publish(site, 3), bytes = JSON.stringify(before), usages = fixture.store.usages(site, 'photo');
    const order = [c.itemId, a.itemId, b.itemId];
    expect(service.saveOrder(site, { expectedVersion: 3, itemIds: order })).toEqual({ version: 4, itemIds: order });
    expect(ids()).toEqual(order);
    service.save(site, { ...input, itemId: a.itemId, expectedVersion: 1, slug: 'zero-renamed' });
    expect(ids()).toEqual(order);
    service.archive(site, a.itemId, 2);
    expect(ids()).toEqual([c.itemId, b.itemId]);
    const d = create('aa-new'); expect(ids()).toEqual([c.itemId, b.itemId, d.itemId]);
    service.close(); service = new CatalogService(fixture.root);
    expect(ids()).toEqual([c.itemId, b.itemId, d.itemId]);
    expect(JSON.stringify(service.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: before.snapshotId }))).toBe(bytes);
    const current = service.publish(site, service.list(site).version);
    expect(current.items.map(item => item.itemId)).toEqual(ids());
    expect(fixture.store.usages(site, 'photo').length).toBeGreaterThan(usages.length);
  });

  it('rejects duplicates, missing, foreign, archived IDs and stale versions without changing positions/version/refs', () => {
    const a = create('a'), b = create('b');
    const beta = service.save('fixture-beta', input);
    const before = ids(), version = service.list(site).version, usages = fixture.store.usages(site, 'photo');
    for (const itemIds of [[a.itemId], [a.itemId, a.itemId], [a.itemId, beta.itemId], [], [a.itemId, b.itemId, beta.itemId]])
      expect(() => service.saveOrder(site, { expectedVersion: version, itemIds })).toThrow('exact active');
    expect(() => service.saveOrder(site, { expectedVersion: version - 1, itemIds: before })).toThrow('version conflict');
    expect(ids()).toEqual(before); expect(service.list(site).version).toBe(version);
    expect(fixture.store.usages(site, 'photo')).toEqual(usages);
    service.archive(site, b.itemId, 1);
    expect(() => service.saveOrder(site, { expectedVersion: version + 1, itemIds: before })).toThrow('exact active');
    expect(() => service.saveOrder('other', { expectedVersion: 0, itemIds: [] })).toThrow('access denied');
  });

  it('rolls back every position and collection CAS when a later write fails', () => {
    const a = create('a'), b = create('b'), c = create('c');
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      db.exec(`CREATE TRIGGER order_fail BEFORE UPDATE OF position ON catalog_items WHEN NEW.id='${a.itemId}' BEGIN SELECT RAISE(ABORT,'injected order failure'); END;`);
      expect(() => service.saveOrder(site, { expectedVersion: 3, itemIds: [c.itemId, a.itemId, b.itemId] })).toThrow('injected order failure');
      expect(ids()).toEqual([a.itemId, b.itemId, c.itemId]); expect(service.list(site).version).toBe(3);
    } finally { db.exec('DROP TRIGGER order_fail'); db.close(); }
  });

  it('initializes genuine schema4 positions in the exact legacy slug order without changing persisted payload bytes', () => {
    create('zeta'); create('alpha'); create('middle');
    const snapshot = service.publish(site, 3);
    service.close();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    const before = db.prepare('SELECT website,id,json FROM catalog_revisions ORDER BY website,id').all();
    const snapshotBytes = (db.prepare('SELECT json FROM catalog_snapshots WHERE id=?').get(snapshot.snapshotId) as { json: string }).json;
    db.exec('ALTER TABLE catalog_items DROP COLUMN position; UPDATE catalog_schema SET version=4'); db.close();
    service = new CatalogService(fixture.root);
    expect(service.list(site).items.map(item => item.slug)).toEqual(['alpha', 'middle', 'zeta']);
    const reopened = new Database(join(fixture.root, 'media.sqlite'));
    try {
      expect(reopened.prepare('SELECT website,id,json FROM catalog_revisions ORDER BY website,id').all()).toEqual(before);
      expect((reopened.prepare('SELECT json FROM catalog_snapshots WHERE id=?').get(snapshot.snapshotId) as { json: string }).json).toBe(snapshotBytes);
      expect(service.list(site).version).toBe(3);
    } finally { reopened.close(); }
    service.close(); service = new CatalogService(fixture.root);
    expect(service.list(site).items.map(item => item.slug)).toEqual(['alpha', 'middle', 'zeta']);
  });

  it('serializes two real writer processes so one expected collection version can win only once', async () => {
    const a = create('a'), b = create('b');
    const module = pathToFileURL(join(process.cwd(), 'src/catalogus/service.ts')).href;
    function writer(itemIds: string[]) {
      const code = `import {CatalogService} from ${JSON.stringify(module)}; const s=new CatalogService(${JSON.stringify(fixture.root)}); try{s.saveOrder('fixture-alpha',${JSON.stringify({ expectedVersion: 2, itemIds })}); console.log('200')}catch(e){console.log(e.statusCode??500)}finally{s.close()}`;
      return new Promise<number>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: process.cwd(), windowsHide: true });
        let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.on('error', reject);
        child.on('close', code => code === 0 ? resolve(Number(output.trim())) : reject(new Error('Writer exited ' + code)));
      });
    }
    expect((await Promise.all([writer([b.itemId, a.itemId]), writer([a.itemId, b.itemId])])).sort()).toEqual([200, 409]);
    expect(service.list(site).version).toBe(3);
    expect(new Set(ids())).toEqual(new Set([a.itemId, b.itemId]));
  });

  it('keeps the existing private HTTP boundary for order writes', async () => {
    const token = 'order-test-token-1234567890123456789', app = await buildCatalogApp(fixture.root, token);
    try {
      const url = '/catalogus/api/fixture-alpha/order', payload = { expectedVersion: 0, itemIds: [] };
      expect((await app.inject({ method: 'PUT', url, payload })).statusCode).toBe(401);
      expect((await app.inject({ method: 'PUT', url, payload, headers: { authorization: `Bearer ${token}`, origin: 'https://other.invalid' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'PUT', url, payload, headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });
});
