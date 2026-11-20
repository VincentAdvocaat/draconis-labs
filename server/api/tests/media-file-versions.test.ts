import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { checksum } from '../src/media-fixture/storage.js';
import { LocalUploadService } from '../src/media-upload/service.js';
import { MediaRightsService } from '../src/media-upload/rights.js';
import { CatalogService } from '../src/catalogus/service.js';
import { CatalogSnapshotConsumer } from '../src/catalogus/consumer.js';
import { buildUploadApp } from '../src/media-upload/app.js';

const site = 'fixture-alpha';
const image = (width = 32) => sharp({ create: { width, height: 20, channels: 3, background: 'red' } }).png().toBuffer();
const decision = (expectedVersion: number, status: 'cleared' | 'blocked' = 'cleared') => ({ expectedVersion, status,
  owner: 'Synthetic maker', source: 'Local generated PNG', basis: 'Fictitious permission for version test only', employee: 'Test fixture', confirmed: true });
describe('new file versions on an existing asset', () => {
  let fixture: ReturnType<typeof createMediaFixture>, service: LocalUploadService, rights: MediaRightsService;
  beforeEach(() => { fixture = createMediaFixture(); service = new LocalUploadService(fixture.root); rights = new MediaRightsService(fixture.root); });
  afterEach(() => { service.close(); rights.close(); fixture.cleanup(); });

  it('preserves pinned NL/EN bytes/refs and requires asset-wide reapproval before future use', async () => {
    const first = await service.upload(site, await image(), 'first.png', 'image/png');
    rights.setRights(site, first.assetId, decision(1));
    const catalog = new CatalogService(fixture.root), consumer = new CatalogSnapshotConsumer(fixture.root);
    try {
      const item = catalog.save(site, { expectedVersion: 0, title: 'Proef', slug: 'proef', description: 'Beschrijving', categoryId: 'algemeen', metadata: {},
        media: { assetId: first.assetId, fileVersion: 1, usage: 'cover', altText: { nl: 'Een rood vlak' }, decorative: false } });
      catalog.saveLocaleVariant(site, item.itemId, 'en', { expectedVersion: 1, title: 'Sample', slug: 'sample', description: null, alt: 'A red square' });
      const nl = catalog.publish(site, 2), en = catalog.publish(site, 2, { locale: 'en', fallbackLocale: 'nl' });
      const oldJson = [JSON.stringify(nl), JSON.stringify(en)], usages = fixture.store.usages(site, first.assetId);
      const oldBytes = nl.items[0].resolvedMedia.variants.map(v => checksum(readFileSync(join(fixture.root, v.path))));
      const source = checksum(readFileSync(join(fixture.root, 'private', site, first.assetId, 'source')));
      const pin = consumer.preparePin(site, { owner: { module: 'test', siteId: 'demo', ownerId: 'page', revisionId: 'revision', kind: 'release', slot: 'portfolio', attemptId: 'old-attempt' },
        ref: { websiteId: site, collectionId: 'portfolio', snapshotId: en.snapshotId }, checksum: en.checksum, localeContext: en.localeContext! });
      const retained = fixture.store.usages(site, first.assetId);
      const second = await service.uploadVersion(site, first.assetId, 2, 1, await image(64), 'second.png', 'image/png');
      expect(second).toMatchObject({ assetId: first.assetId, fileVersion: 2, state: 'ready', rights: 'unknown', metadataVersion: 4, attempts: 1 });
      expect(second.jobId).not.toBe(first.assetId);
      expect(catalog.list(site).items[0].media.fileVersion).toBe(1);
      expect([nl, en].map(s => JSON.stringify(catalog.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: s.snapshotId })))).toEqual(oldJson);
      expect(nl.items[0].resolvedMedia.variants.map(v => checksum(readFileSync(join(fixture.root, v.path))))).toEqual(oldBytes);
      expect(checksum(readFileSync(join(fixture.root, 'private', site, first.assetId, 'source')))).toBe(source);
      expect(fixture.store.usages(site, first.assetId)).toEqual(retained);
      expect(retained.length).toBeGreaterThan(usages.length);
      expect(() => consumer.materialize(site, pin.pinId)).toThrow('approval');
      expect(() => catalog.publish(site, 2)).toThrow('approval');
      expect(catalog.variant({ websiteId: site, collectionId: 'portfolio', snapshotId: nl.snapshotId }, item.itemId, 0).bytes.length).toBeGreaterThan(0);
      expect(() => rights.setRights(site, first.assetId, decision(2))).toThrow('version conflict');
      rights.setRights(site, first.assetId, decision(4));
      expect(consumer.materialize(site, pin.pinId).snapshot).toEqual(en);
      expect(() => fixture.store.purge(site, first.assetId, 5, true)).toThrow('retained');
    } finally { consumer.close(); catalog.close(); }
  });

  it('blocks approval during processing and preserves a block set before ready completion', async () => {
    const first = await service.upload(site, await image(), 'first.png', 'image/png');
    rights.setRights(site, first.assetId, decision(1));
    const pending = service.uploadVersion(site, first.assetId, 2, 1, await image(128), 'new.png', 'image/png');
    expect(() => rights.setRights(site, first.assetId, decision(3))).toThrow('pending file version');
    rights.setRights(site, first.assetId, decision(3, 'blocked'));
    const another = new LocalUploadService(fixture.root);
    try { await another.recover(); } finally { another.close(); }
    expect((await pending)).toMatchObject({ rights: 'blocked', metadataVersion: 5 });
    expect(() => rights.requireApproval(site, first.assetId)).toThrow('approval');
  });

  it('fails safely and retries the same reserved version after reopening without altering old rights or bytes', async () => {
    const first = await service.upload(site, await image(), 'first.png', 'image/png'); rights.setRights(site, first.assetId, decision(1));
    const oldHash = checksum(readFileSync(join(fixture.root, first.variants[0].path)));
    service.close(); let failOnce = true;
    service = new LocalUploadService(fixture.root, path => {
      if (path.includes(join(first.assetId, '2', 'staging')) && failOnce) { failOnce = false; throw new Error('Injected transient lock'); }
      rmSync(path, { recursive: true, force: true });
    });
    await expect(service.uploadVersion(site, first.assetId, 2, 1, await image(64), 'new.png', 'image/png')).rejects.toThrow();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    let jobId: string;
    try {
      jobId = (db.prepare('SELECT id FROM upload_jobs WHERE asset=? AND file_version=2').get(first.assetId) as { id: string }).id;
      expect(db.prepare('SELECT rights FROM assets WHERE id=?').get(first.assetId)).toEqual({ rights: 'cleared' });
      expect(db.prepare('SELECT COUNT(*) AS count FROM media_rights_audit WHERE asset=?').get(first.assetId)).toEqual({ count: 1 });
    } finally { db.close(); }
    service.close(); service = new LocalUploadService(fixture.root);
    expect(service.status(site, jobId!)).toMatchObject({ fileVersion: 2, state: 'failed', rights: 'cleared' });
    expect(await service.retryFailed(site, jobId!)).toMatchObject({ assetId: first.assetId, jobId: jobId!, fileVersion: 2, state: 'ready', rights: 'unknown', attempts: 2 });
    expect(checksum(readFileSync(join(fixture.root, first.variants[0].path)))).toBe(oldHash);
    await expect(service.retryFailed(site, jobId!)).rejects.toThrow('failed upload');
  });

  it('rejects invalid envelopes before reservation and bounds retries of a bad decoder/source', async () => {
    const first = await service.upload(site, await image(), 'first.png', 'image/png');
    await expect(service.uploadVersion(site, first.assetId, 1, 1, await image(), 'fake.jpg', 'image/jpeg')).rejects.toMatchObject({ statusCode: 415 });
    const broken = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(30)]);
    await expect(service.uploadVersion(site, first.assetId, 1, 1, broken, 'bad.png', 'image/png')).rejects.toThrow();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    const job = db.prepare('SELECT id FROM upload_jobs WHERE asset=? AND file_version=2').get(first.assetId) as { id: string }; db.close();
    for (let attempt = 1; attempt < 5; attempt++) await expect(service.retryFailed(site, job.id)).rejects.toThrow();
    expect(service.status(site, job.id)).toMatchObject({ fileVersion: 2, state: 'failed', attempts: 5, variants: [] });
    await expect(service.retryFailed(site, job.id)).rejects.toMatchObject({ statusCode: 409 });
    const interrupted = new Database(join(fixture.root, 'media.sqlite'));
    interrupted.prepare("UPDATE upload_jobs SET state='processing' WHERE id=?").run(job.id);
    interrupted.prepare("UPDATE files SET state='processing' WHERE asset=? AND version=2").run(first.assetId);
    interrupted.close(); await service.recover();
    const checked = new Database(join(fixture.root, 'media.sqlite'));
    expect(checked.prepare('SELECT state FROM files WHERE asset=? AND version=2').get(first.assetId)).toEqual({ state: 'failed' }); checked.close();
    const next = await service.uploadVersion(site, first.assetId, 2, 2, await image(64), 'valid.png', 'image/png');
    expect(next.fileVersion).toBe(3);
  });

  it('rejects cross-site/archived/stale inputs and source tampering without touching a ready file', async () => {
    const first = await service.upload(site, await image(), 'first.png', 'image/png');
    await expect(service.uploadVersion('fixture-beta', first.assetId, 1, 1, await image(), 'next.png', 'image/png')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.uploadVersion(site, first.assetId, 9, 1, await image(), 'next.png', 'image/png')).rejects.toMatchObject({ statusCode: 409 });
    const broken = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(30)]);
    await expect(service.uploadVersion(site, first.assetId, 1, 1, broken, 'bad.png', 'image/png')).rejects.toThrow();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    const job = db.prepare('SELECT id FROM upload_jobs WHERE asset=? AND file_version=2').get(first.assetId) as { id: string }; db.close();
    writeFileSync(join(fixture.root, 'private', site, first.assetId, '2', 'source'), await image(64));
    await expect(service.retryFailed(site, job.id)).rejects.toThrow('checksum mismatch');
    fixture.store.archive(site, first.assetId, 2);
    await expect(service.uploadVersion(site, first.assetId, 3, 2, await image(), 'next.png', 'image/png')).rejects.toMatchObject({ statusCode: 409 });
    expect(service.status(site, first.jobId).state).toBe('ready');
  });

  it('migrates real six-column legacy jobs and recovers a pre-commit version1 orphan without losing source bytes', async () => {
    const first = await service.upload(site, await image(), 'old.png', 'image/png'); service.close();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    db.exec(`ALTER TABLE upload_jobs RENAME TO newer_jobs;
      CREATE TABLE upload_jobs(id TEXT PRIMARY KEY,website TEXT NOT NULL,filename TEXT NOT NULL,mime TEXT NOT NULL,state TEXT NOT NULL,error TEXT);
      INSERT INTO upload_jobs SELECT id,website,filename,mime,'processing',error FROM newer_jobs;
      DROP TABLE newer_jobs; DROP TABLE media_upload_schema;`);
    db.prepare('DELETE FROM files WHERE website=? AND asset=?').run(site, first.assetId);
    db.prepare('DELETE FROM assets WHERE website=? AND id=?').run(site, first.assetId); db.close();
    const original = readFileSync(join(fixture.root, 'private', site, first.assetId, 'source'));
    service = new LocalUploadService(fixture.root); await service.recover();
    expect(service.status(site, first.assetId)).toMatchObject({ assetId: first.assetId, fileVersion: 1, state: 'ready', attempts: 1 });
    expect(readFileSync(join(fixture.root, 'private', site, first.assetId, 'source'))).toEqual(original);
  });

  function child(code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const processChild = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: process.cwd(), windowsHide: true });
      let output = '', error = ''; processChild.stdout.on('data', chunk => { output += chunk; }); processChild.stderr.on('data', chunk => { error += chunk; });
      processChild.on('error', reject); processChild.on('close', status => status === 0 ? resolve(output.trim()) : reject(new Error(error || String(status))));
    });
  }
  it('reserves one next version across two real writers using the same CAS', async () => {
    const first = await service.upload(site, await image(), 'old.png', 'image/png'), bytes = (await image(64)).toString('base64');
    const module = pathToFileURL(join(process.cwd(), 'src/media-upload/service.ts')).href;
    const code = `import {LocalUploadService} from ${JSON.stringify(module)};const s=new LocalUploadService(${JSON.stringify(fixture.root)});try{await s.uploadVersion('fixture-alpha',${JSON.stringify(first.assetId)},1,1,Buffer.from(${JSON.stringify(bytes)},'base64'),'next.png','image/png');console.log('201')}catch(e){console.log(e.statusCode??500)}finally{s.close()}`;
    expect((await Promise.all([child(code), child(code)])).sort()).toEqual(['201', '409']);
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try { expect(db.prepare('SELECT version FROM files WHERE asset=? ORDER BY version').all(first.assetId)).toEqual([{ version: 1 }, { version: 2 }]); } finally { db.close(); }
  });

  it('recovers after a real owner process exits with a reserved version and preserves the old ready bytes', async () => {
    const first = await service.upload(site, await image(), 'old.png', 'image/png'), bytes = (await image(64)).toString('base64');
    const module = pathToFileURL(join(process.cwd(), 'src/media-upload/service.ts')).href;
    await child(`import {LocalUploadService} from ${JSON.stringify(module)};const s=new LocalUploadService(${JSON.stringify(fixture.root)});s.uploadVersion('fixture-alpha',${JSON.stringify(first.assetId)},1,1,Buffer.from(${JSON.stringify(bytes)},'base64'),'next.png','image/png');process.exit(0);`);
    const old = readFileSync(join(fixture.root, first.variants[0].path));
    service.close(); service = new LocalUploadService(fixture.root); await service.recover();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      const job = db.prepare('SELECT id FROM upload_jobs WHERE asset=? AND file_version=2').get(first.assetId) as { id: string };
      expect(service.status(site, job.id)).toMatchObject({ state: 'ready', fileVersion: 2, attempts: 2, rights: 'unknown' });
    } finally { db.close(); }
    expect(readFileSync(join(fixture.root, first.variants[0].path))).toEqual(old);
  });

  it('requires explicit HTTP intent/CAS and keeps token, origin, website and bounded body checks', async () => {
    const token = 'version-test-token-1234567890123456789', app = await buildUploadApp(fixture.root, token);
    try {
      const first = await service.upload(site, await image(), 'old.png', 'image/png'), payload = await image(64);
      const url = `/websites/${site}/media/${first.assetId}/versions`;
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'image/png', 'x-media-filename': 'next.png',
        'x-media-metadata-version': '1', 'x-media-file-version': '1', 'x-media-confirm-invalidation': 'true' };
      expect((await app.inject({ method: 'POST', url, payload, headers: { ...headers, authorization: '' } })).statusCode).toBe(401);
      expect((await app.inject({ method: 'POST', url, payload, headers: { ...headers, origin: 'https://other.invalid' } })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url, payload, headers: { ...headers, 'x-media-confirm-invalidation': '' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url, payload, headers })).statusCode).toBe(201);
      expect((await app.inject({ method: 'POST', url, payload, headers })).statusCode).toBe(409);
    } finally { await app.close(); }
  });
});
