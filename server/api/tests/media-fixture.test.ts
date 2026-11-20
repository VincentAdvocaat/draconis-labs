import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, inflateSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaContractError, type MediaReference, type SaveReferences } from '../src/media-fixture/contracts.js';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { MediaFixtureStore } from '../src/media-fixture/storage.js';

const website = 'fixture-alpha';
const ref: MediaReference = { assetId: 'photo', fileVersion: 1, usage: 'hero',
  altText: { nl: 'Proefbeeld', en: 'Fixture image' }, decorative: false };
const request = (references = [ref], expectedVersion = 0): SaveReferences => ({
  module: 'cms', ownerId: 'home', revisionId: 'draft', expectedVersion, references,
});
const release = { releaseId: 'release', revisionId: 'draft', locales: ['nl', 'en'] };

describe('isolated media contract fixture', () => {
  let fixture: ReturnType<typeof createMediaFixture>;
  beforeEach(() => { fixture = createMediaFixture(); });
  afterEach(() => { if (existsSync(fixture.root)) fixture.cleanup(); });
  function mutate(sql: string, ...args: (string | number)[]) {
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try { db.prepare(sql).run(...args); } finally { db.close(); }
  }

  it('pins fileVersion, variants and alt while a concept advances and after reopening', () => {
    const store = fixture.store;
    store.saveReferences(website, request([ref, { ...ref, usage: 'portfolio' }]));
    const original = store.resolveRelease(website, release);
    store.saveReferences(website, request([{ ...ref, fileVersion: 2, altText: { nl: 'Gewijzigd', en: 'Changed' } }], 1));
    expect(store.resolveRelease(website, release)).toEqual(original);
    expect(original.references.map(r => r.fileVersion)).toEqual([1, 1]);
    expect(new Set(original.references.flatMap(r => r.variants.map(v => v.path))).size).toBe(1);
    fixture.close();
    const reopened = new MediaFixtureStore(fixture.root, [website]);
    try {
      expect(reopened.resolveRelease(website, release)).toEqual(original);
      expect(() => reopened.purge(website, 'photo', 1, true)).toThrow('retained');
    } finally { reopened.close(); }
  });

  it('retains all saved revisions and release references after the current draft removes media', () => {
    const store = fixture.store;
    store.saveReferences(website, { ...request(), revisionId: 'history' });
    store.saveReferences(website, request());
    store.resolveRelease(website, release);
    store.saveReferences(website, request([], 1));
    expect(store.usages(website, 'photo')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'revision', owner: 'history' }),
      expect.objectContaining({ kind: 'release', owner: 'release' }),
    ]));
    expect(() => store.purge(website, 'photo', 1, true)).toThrow('retained');
  });

  it('keeps references and version unchanged after any failed update', () => {
    const store = fixture.store;
    store.saveReferences(website, request());
    expect(() => store.saveReferences(website, request([{ ...ref, assetId: 'missing' }], 1))).toThrow('Asset not found');
    expect(store.usages(website, 'photo')).toHaveLength(1);
    expect(store.saveReferences(website, request([], 1)).version).toBe(2);
    expect(store.usages(website, 'photo')).toHaveLength(0);
  });

  it('rejects optimistic conflicts, changed owners and duplicate slots', () => {
    const store = fixture.store;
    store.saveReferences(website, request());
    expect(() => store.saveReferences(website, request())).toThrow('Revision conflict');
    expect(() => store.saveReferences(website, { ...request([], 1), ownerId: 'other' })).toThrow('Revision conflict');
    expect(() => store.saveReferences(website, request([ref, ref], 1))).toThrow('Duplicate usage');
    expect(() => store.archive(website, 'photo', 2)).toThrow('Metadata conflict');
  });

  it('scopes every operation to authorized websites without leaking beta references', () => {
    const store = new MediaFixtureStore(fixture.root, [website]);
    try {
      const operations = [
        () => store.list('fixture-beta'), () => store.select('fixture-beta', 'photo'),
        () => store.saveReferences('fixture-beta', request()), () => store.resolveRelease('fixture-beta', release),
        () => store.usages('fixture-beta', 'photo'), () => store.archive('fixture-beta', 'photo', 1),
        () => store.purge('fixture-beta', 'photo', 1, true),
      ];
      for (const operation of operations) {
        expect(operation).toThrow(expect.objectContaining({ statusCode: 403 }));
      }
      fixture.store.saveReferences('fixture-beta', request());
      expect(store.usages(website, 'photo')).toEqual([]);
      expect(() => store.resolveRelease(website, release)).toThrow('Revision not found');
      mutate("INSERT INTO assets(website,id,rights) VALUES('fixture-beta','beta-only','cleared')");
      expect(() => store.saveReferences(website, request([{ ...ref, assetId: 'beta-only' }]))).toThrow('Asset not found');
    } finally { store.close(); }
  });

  it.each([0, -1, 1.5, 999])('rejects invalid or missing fileVersion %s', version => {
    expect(() => fixture.store.saveReferences(website, request([{ ...ref, fileVersion: version }]))).toThrow();
    expect(fixture.store.usages(website, 'photo')).toEqual([]);
  });

  it.each(['pending', 'unlicensed', 'blocked'])('blocks release for %s while allowing incomplete drafts', assetId => {
    fixture.store.saveReferences(website, request([{ ...ref, assetId }]));
    expect(() => fixture.store.resolveRelease(website, release)).toThrow(MediaContractError);
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try { expect(db.prepare('SELECT * FROM releases').all()).toEqual([]); } finally { db.close(); }
  });

  it.each([
    { altText: { nl: 'Alleen Nederlands' }, decorative: false },
    { altText: { nl: ' ', en: 'Valid' }, decorative: false },
    { altText: { nl: 'Beschrijving', en: '' }, decorative: true },
  ])('rejects invalid locale-alt/decorative in release: %j', attributes => {
    fixture.store.saveReferences(website, request([{ ...ref, ...attributes }]));
    expect(() => fixture.store.resolveRelease(website, release)).toThrow('Invalid alt');
  });

  it('accepts explicitly decorative media with empty alt', () => {
    fixture.store.saveReferences(website, request([{ ...ref, decorative: true, altText: { nl: '', en: '' } }]));
    expect(fixture.store.resolveRelease(website, release).references[0].decorative).toBe(true);
  });

  it('rechecks rights before reissuing a pinned release, including invalid or expired dates', () => {
    fixture.store.saveReferences(website, request());
    fixture.store.resolveRelease(website, release);
    for (const expires of ['2000-01-01', 'invalid-date']) {
      mutate('UPDATE assets SET expires_at=? WHERE website=? AND id=?', expires, website, 'photo');
      expect(() => fixture.store.resolveRelease(website, release)).toThrow('Rights not cleared');
    }
    mutate("UPDATE assets SET rights='blocked',expires_at=NULL WHERE website=? AND id=?", website, 'photo');
    expect(() => fixture.store.resolveRelease(website, release)).toThrow('Rights not cleared');
  });

  it('archives from selection but permits existing pinned usage and prevents new usage', () => {
    const store = fixture.store;
    store.saveReferences(website, request());
    store.archive(website, 'photo', 1);
    expect(store.list(website, 'photo')).toEqual([]);
    expect(() => store.select(website, 'photo')).toThrow('Archived');
    store.saveReferences(website, request([ref], 1));
    expect(() => store.saveReferences(website, { ...request(), revisionId: 'new' })).toThrow('Archived');
    expect(store.resolveRelease(website, release).references).toHaveLength(1);
  });

  it('requires explicit purge, zero retained references and matching metadata version', () => {
    const store = fixture.store;
    expect(() => store.purge(website, 'photo', 1, false)).toThrow('Explicit');
    expect(() => store.purge(website, 'photo', 99, true)).toThrow('Metadata conflict');
    expect(store.purge(website, 'photo', 1, true)).toEqual({ purgedMetadata: true, filesRetainedUntilFixtureCleanup: true });
    expect(() => store.select(website, 'photo')).toThrow('Asset not found');
    expect(store.select('fixture-beta', 'photo')).toHaveProperty('assetId', 'photo');
  });

  it('rejects changed release requests, missing/corrupted files, unsafe paths and empty variant sets', () => {
    const store = fixture.store;
    store.saveReferences(website, request());
    const manifest = store.resolveRelease(website, release);
    expect(() => store.resolveRelease(website, { ...release, locales: ['nl'] })).toThrow('already pinned');
    const variant = manifest.references[0].variants[0];
    const path = join(fixture.root, variant.path);
    const original = readFileSync(path);
    writeFileSync(path, 'corrupt');
    expect(() => store.resolveRelease(website, release)).toThrow('checksum');
    writeFileSync(path, original);
    rmSync(path);
    expect(() => store.resolveRelease(website, release)).toThrow('Missing or unsafe');
    writeFileSync(path, original);
    for (const variants of [[{ ...variant, path: 'public/../../private/source.png' }], []]) {
      mutate('UPDATE files SET variants=? WHERE website=? AND asset=? AND version=1', JSON.stringify(variants), website, 'photo');
      expect(() => store.resolveRelease(website, { ...release, releaseId: 'new' })).toThrow(MediaContractError);
    }
  });

  it('rejects unmarked or non-fixture roots and cleans only its marked temporary directory', () => {
    expect(() => new MediaFixtureStore(process.cwd(), [website])).toThrow('temporary media fixture');
    const root = fixture.root;
    fixture.cleanup();
    expect(existsSync(root)).toBe(false);
  });

  it('rejects a valid private original reached through public/.. without retaining a failed release', () => {
    const store = fixture.store;
    store.saveReferences(website, request());
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      const row = db.prepare("SELECT variants FROM files WHERE website=? AND asset='photo' AND version=1")
        .get(website) as { variants: string };
      const variants = JSON.parse(row.variants);
      variants[0].path = 'public/../private/fixture-alpha/photo/1/original.png';
      db.prepare("UPDATE files SET variants=? WHERE website=? AND asset='photo' AND version=1")
        .run(JSON.stringify(variants), website);
      expect(() => store.resolveRelease(website, release)).toThrow(expect.objectContaining({ statusCode: 409 }));
      expect(db.prepare('SELECT * FROM releases').all()).toEqual([]);
      expect(store.usages(website, 'photo')).toEqual([
        { kind: 'revision', owner: 'draft', fileVersion: 1, slot: 'hero' },
      ]);
    } finally { db.close(); }
  });

  it('paginates and exports only public derivatives without storage paths', () => {
    expect(fixture.store.list(website, '', 0, 1)).toHaveLength(1);
    expect(() => fixture.store.list(website, '', 0, 101)).toThrow('pagination');
    fixture.store.saveReferences(website, request());
    const manifest = JSON.stringify(fixture.store.resolveRelease(website, release));
    expect(manifest).not.toContain('private');
    expect(manifest).not.toContain(fixture.root);
    expect(manifest).not.toContain('original.png');
  });

  it('uses a valid complete 1x1 PNG fixture with correct chunk checksums', () => {
    const bytes = readFileSync(join(fixture.root, 'public/fixture-alpha/photo/1/tiny.png'));
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    let offset = 8;
    const chunks = new Map<string, Buffer>();
    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const kind = bytes.subarray(offset + 4, offset + 8);
      const data = bytes.subarray(offset + 8, offset + 8 + length);
      expect(crc32(Buffer.concat([kind, data]))).toBe(bytes.readUInt32BE(offset + 8 + length));
      chunks.set(kind.toString('ascii'), data);
      offset += length + 12;
    }
    expect(chunks.get('IHDR')!.readUInt32BE(0)).toBe(1);
    expect(chunks.get('IHDR')!.readUInt32BE(4)).toBe(1);
    expect(inflateSync(chunks.get('IDAT')!)).toEqual(Buffer.from([0, 255, 0, 0, 255]));
    expect(chunks.has('IEND')).toBe(true);
  });
});
