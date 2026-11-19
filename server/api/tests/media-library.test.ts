import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { CatalogService } from '../src/catalogus/service.js';
import { MediaLibrary } from '../src/catalogus/library.js';
import { buildCatalogApp } from '../src/catalogus/app.js';

describe('read-only media library', () => {
  let fixture: ReturnType<typeof createMediaFixture>;
  let service: CatalogService;
  let db: Database.Database;
  beforeEach(() => {
    fixture = createMediaFixture(); service = new CatalogService(fixture.root);
    db = new Database(join(fixture.root, 'media.sqlite'));
    for (let index = 0; index < 23; index++) {
      const id = `asset-${String(index).padStart(2, '0')}`;
      db.prepare("INSERT INTO assets(website,id,rights) VALUES('fixture-alpha',?,'unknown')").run(id);
      db.prepare("INSERT INTO files SELECT website,?,1,'ready',variants FROM files WHERE website='fixture-alpha' AND asset='photo' AND version=1").run(id);
    }
  });
  afterEach(() => { db.close(); service.close(); fixture.cleanup(); });

  it('returns one asset per row, bounded stable pages and literal ID search with total', () => {
    const first = service.library('fixture-alpha', { q: 'asset-', limit: 10 });
    const second = service.library('fixture-alpha', { q: 'asset-', offset: 10, limit: 10 });
    const last = service.library('fixture-alpha', { q: 'asset-', offset: 20, limit: 10 });
    expect(first.total).toBe(23); expect(second.total).toBe(23);
    expect(first.items.map(a => a.assetId)).toEqual(Array.from({ length: 10 }, (_, i) => `asset-0${i}`));
    expect(new Set([...first.items, ...second.items, ...last.items].map(a => a.assetId)).size).toBe(23);
    expect(last.items).toHaveLength(3);
    expect(service.library('fixture-alpha', { q: 'asset-', offset: 23 }).items).toEqual([]);
    expect(service.library('fixture-alpha', { q: '%' }).total).toBe(0);
    expect(service.library('fixture-alpha', { q: 'ASSET-22' }).total).toBe(1);
    expect(service.library('fixture-alpha', { q: 'photo' }).items).toHaveLength(1);
    for (const query of [{ limit: 0 }, { limit: 51 }, { offset: -1 }, { offset: 0.5 }, { q: 'a'.repeat(101) }, { state: 'invalid' }, { surprise: true }])
      expect(() => service.library('fixture-alpha', query)).toThrow();
  });

  it('filters by latest file state and asset rights, excludes archived rows but retains their detail', () => {
    db.prepare("INSERT INTO files SELECT website,asset,3,'failed',variants FROM files WHERE website='fixture-alpha' AND asset='photo' AND version=1").run();
    expect(service.library('fixture-alpha', { q: 'photo', state: 'ready' }).total).toBe(0);
    expect(service.library('fixture-alpha', { q: 'photo', state: 'failed', rights: 'cleared' }).items[0].fileVersion).toBe(3);
    expect(service.library('fixture-alpha', { q: 'photo', rights: 'blocked' }).total).toBe(0);
    db.prepare("UPDATE assets SET archived=1 WHERE website='fixture-alpha' AND id='photo'").run();
    expect(service.library('fixture-alpha', { q: 'photo' }).total).toBe(0);
    expect(service.libraryDetail('fixture-alpha', 'photo')).toMatchObject({ archived: 1, versions: [{ fileVersion: 3 }, { fileVersion: 2 }, { fileVersion: 1 }] });
  });

  it('exposes only safe detail metadata and retained usages, with website isolation and zero writes', () => {
    fixture.store.saveReferences('fixture-alpha', { module: 'test', ownerId: 'owner', revisionId: 'revision', expectedVersion: 0,
      references: [{ assetId: 'photo', fileVersion: 1, usage: 'cover', altText: { nl: 'Rood' }, decorative: false }] });
    fixture.store.resolveRelease('fixture-alpha', { releaseId: 'release', revisionId: 'revision', locales: ['nl'] });
    const reader = new Database(join(fixture.root, 'media.sqlite'), { readonly: true });
    try {
      const library = new MediaLibrary(reader);
      const before = reader.prepare('SELECT total_changes() AS changes').get();
      library.list('fixture-alpha', {});
      const detail = library.detail('fixture-alpha', 'photo');
      expect(detail.usages).toHaveLength(2);
      expect(detail.versions).toHaveLength(2);
      expect(JSON.stringify(detail)).not.toMatch(/private|public\/|checksum|altText|original/);
      expect(reader.prepare('SELECT total_changes() AS changes').get()).toEqual(before);
      expect(() => library.detail('fixture-beta', 'asset-00')).toThrow('niet gevonden');
    } finally { reader.close(); }
    expect(() => service.library('other', {})).toThrow('access denied');
    expect(() => service.libraryDetail('fixture-alpha', '../photo')).toThrow();
  });

  it('keeps rows and total on one read snapshot while allowing live offset shifts between requests', () => {
    db.pragma('journal_mode = WAL');
    const library = new MediaLibrary(db);
    const prepare = db.prepare.bind(db);
    let inserted = false;
    db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (sql.includes('COUNT(*)')) {
        const get = statement.get.bind(statement);
        statement.get = ((...args: unknown[]) => {
          const result = get(...args);
          if (!inserted) {
            const writer = new Database(join(fixture.root, 'media.sqlite'));
            try { writer.prepare("INSERT INTO assets(website,id,rights) VALUES('fixture-alpha','asset-00a','unknown')").run(); inserted = true; }
            finally { writer.close(); }
          }
          return result;
        }) as typeof statement.get;
      }
      return statement;
    }) as typeof db.prepare;
    const before = library.list('fixture-alpha', { q: 'asset-', limit: 50 });
    expect(before.total).toBe(23); expect(before.items).toHaveLength(23);
    const after = library.list('fixture-alpha', { q: 'asset-', limit: 50 });
    expect(after.total).toBe(24); expect(after.items).toHaveLength(24);
  });

  it('retains token, origin, website and method boundaries for library and private previews', async () => {
    const token = 'library-test-token-1234567890123456789';
    const app = await buildCatalogApp(fixture.root, token);
    try {
      const url = '/catalogus/api/fixture-alpha/library';
      expect((await app.inject(url)).statusCode).toBe(401);
      const headers = { authorization: `Bearer ${token}` };
      expect((await app.inject({ url, headers })).statusCode).toBe(200);
      expect((await app.inject({ url, headers: { ...headers, origin: 'https://outside.invalid' } })).statusCode).toBe(403);
      expect((await app.inject({ url: url + '?limit=0', headers })).statusCode).toBe(400);
      expect((await app.inject({ url: '/catalogus/api/fixture-beta/library/asset-00', headers })).statusCode).toBe(404);
      expect((await app.inject({ url, method: 'POST', headers })).statusCode).toBe(404);
      expect((await app.inject({ url: '/catalogus/api/fixture-alpha/preview/pending/1', headers })).statusCode).toBe(404);
      const ready = await app.inject({ url: '/catalogus/api/fixture-alpha/preview/photo/1', headers });
      expect(ready.statusCode).toBe(200); expect(ready.headers['cache-control']).toBe('no-store');
    } finally { await app.close(); }
  });
});
