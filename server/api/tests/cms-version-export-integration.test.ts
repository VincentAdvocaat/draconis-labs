import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterEach, expect, it } from 'vitest';
import { LocalUploadService } from '../src/media-upload/service.js';
import { MediaRightsService } from '../src/media-upload/rights.js';
import { CatalogService } from '../src/catalogus/service.js';
import type { CatalogSnapshot } from '../src/catalogus/contracts.js';
import { createRecoveryFixture, openRecoveryFixture, backupRecoveryFixture, restoreRecoveryFixture } from '../src/modules/cms/recovery.js';
import { exportStaticRelease } from '../src/modules/cms/static-export.js';

const roots: string[] = [];
const target = (kind: string) => { const path = join(tmpdir(), `draconis-cms-${kind}-${randomUUID()}`); roots.push(path); return path; };
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function rows(path: string) {
  const db = new Database(path, { readonly: true });
  try { return (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
    .map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]); }
  finally { db.close(); }
}
afterEach(() => { for (const path of roots.splice(0)) {
  if (dirname(resolve(path)) !== resolve(tmpdir()) || !/^draconis-(?:cms-|media-fixture-)/.test(path.split(/[\\/]/).pop()!)) throw Error('Unsafe fixture cleanup');
  rmSync(path, { recursive: true, force: true });
} });

it('retains real CMS version pins and export bytes through failed upload, offline restore and retry', async () => {
  const source = await createRecoveryFixture(target('recovery')); roots.push(source.mediaRoot);
  const site = 'fixture-alpha', base = '/api/v1/cms/websites/demo-cms';
  const image = (color: string) => sharp({ create: { width: 24, height: 16, channels: 3, background: color } }).png().toBuffer();
  const approval = (expectedVersion: number) => ({ expectedVersion, status: 'cleared', owner: 'Synthetic', source: 'Generated', basis: 'Fictitious permission', employee: 'Test', confirmed: true });
  let uploads = new LocalUploadService(source.mediaRoot);
  const rights = new MediaRightsService(source.mediaRoot), catalog = new CatalogService(source.mediaRoot);
  const running = await openRecoveryFixture(source.root);
  const headers = { authorization: 'Bearer ' + json(join(source.root, 'local-access.json')).publisher };
  async function request(method: 'GET' | 'PUT' | 'POST', path: string, payload?: unknown) {
    const result = await running.app.inject({ method, url: base + path, headers: { ...headers, 'idempotency-key': randomUUID() }, ...(payload ? { payload } : {}) });
    expect(result.statusCode, result.body).toBeGreaterThanOrEqual(200); expect(result.statusCode, result.body).toBeLessThan(300); return result.json();
  }
  const publish = async () => {
    const plan = await request('GET', '/site-plan');
    return request('POST', '/releases', { revisionId: plan.pages[0].revisionId, expectedActiveVersion: plan.activeVersion,
      expectedPages: plan.pages.map(({ pageId, revisionId, version }: { pageId: string; revisionId: string; version: number }) => ({ pageId, revisionId, version })),
      expectedShared: { revisionId: plan.shared.revisionId, version: plan.shared.version },
      expectedContact: { revisionId: plan.contactTemplate.revisionId, version: plan.contactTemplate.version, templateHash: plan.contactTemplate.template.hash, locales: ['nl', 'en'] } });
  };
  const pages: string[] = [], snapshots: CatalogSnapshot[] = [];
  async function bind(pair: CatalogSnapshot[]) {
    for (const [index, snapshot] of pair.entries()) {
      const page = pages[index] ? await request('GET', `/documents/${pages[index]}`)
        : await request('POST', '/documents', { title: 'Version proof ' + index, slug: 'version-proof-' + index });
      pages[index] = page.pageId;
      await request('PUT', `/documents/${page.pageId}/draft`, { expectedVersion: page.version, content: { ...page.content,
        blocks: [{ ...page.content.blocks[0], body: 'Synthetic version proof' }, { blockId: randomUUID(), type: 'portfolio',
          ref: { websiteId: site, collectionId: 'portfolio', snapshotId: snapshot.snapshotId }, checksum: snapshot.checksum, localeContext: snapshot.localeContext }] } });
    }
  }
  let first!: Awaited<ReturnType<LocalUploadService['upload']>>, second!: typeof first, failedJob = '', oldRelease = '', currentRelease = '';
  let oldHtml: Buffer[] = [], newHtml: Buffer[] = [], oldImages: string[] = [];
  try {
    first = await uploads.upload(site, await image('red'), 'v1.png', 'image/png'); rights.setRights(site, first.assetId, approval(1));
    const input = { title: 'Versieproef', slug: 'versieproef', description: '', categoryId: 'algemeen', metadata: {},
      media: { assetId: first.assetId, fileVersion: 1, usage: 'cover', altText: { nl: 'Rood vlak' }, decorative: false } };
    const item = catalog.save(site, { ...input, expectedVersion: 0 });
    catalog.saveLocaleVariant(site, item.itemId, 'en', { expectedVersion: 1, title: 'Version proof', slug: 'version-proof', description: '', alt: 'Red square' });
    const pair = () => [catalog.publish(site, catalog.list(site).version), catalog.publish(site, catalog.list(site).version, { locale: 'en' })];
    snapshots.push(...pair()); await bind(snapshots); oldRelease = (await publish()).releaseId;
    oldHtml = await Promise.all([0, 1].map(async index => (await running.app.inject(`/sites/demo-cms/version-proof-${index}.html`)).rawPayload));
    oldImages = first.variants.map(v => hash(readFileSync(join(source.mediaRoot, v.path))));
    second = await uploads.uploadVersion(site, first.assetId, 2, 1, await image('blue'), 'v2.png', 'image/png');
    expect(second).toMatchObject({ state: 'ready', fileVersion: 2, rights: 'unknown', metadataVersion: 4 });
    expect(catalog.list(site).items.find(row => row.itemId === item.itemId)!.media.fileVersion).toBe(1);
    expect(() => catalog.publish(site, catalog.list(site).version)).toThrow('approval');
    expect(first.variants.map(v => hash(readFileSync(join(source.mediaRoot, v.path))))).toEqual(oldImages);
    rights.setRights(site, first.assetId, approval(4));
    const selected = catalog.save(site, { ...input, itemId: item.itemId, expectedVersion: 2, media: { ...input.media, fileVersion: 2, altText: { nl: 'Blauw vlak' } } });
    catalog.saveLocaleVariant(site, item.itemId, 'en', { expectedVersion: selected.version, title: 'Version proof', slug: 'version-proof', description: '', alt: 'Blue square' });
    snapshots.push(...pair()); await bind(snapshots.slice(2)); currentRelease = (await publish()).releaseId;
    newHtml = await Promise.all([0, 1].map(async index => (await running.app.inject(`/sites/demo-cms/version-proof-${index}.html`)).rawPayload));
    expect(newHtml).not.toEqual(oldHtml);
    uploads.close(); uploads = new LocalUploadService(source.mediaRoot, path => {
      if (path.includes(join(first.assetId, '3', 'staging'))) throw Error('Synthetic transient staging failure');
      rmSync(path, { recursive: true, force: true });
    });
    await expect(uploads.uploadVersion(site, first.assetId, 5, 2, await image('green'), 'v3.png', 'image/png')).rejects.toThrow();
    const db = new Database(join(source.mediaRoot, 'media.sqlite'), { readonly: true });
    try { failedJob = (db.prepare('SELECT id FROM upload_jobs WHERE asset=? AND file_version=3').get(first.assetId) as { id: string }).id;
      expect(db.prepare("SELECT COUNT(*) AS count FROM catalog_consumer_pins WHERE state='activated'").get()).toEqual({ count: 4 }); }
    finally { db.close(); }
    expect(uploads.status(site, failedJob)).toMatchObject({ fileVersion: 3, state: 'failed', rights: 'cleared' });
  } finally { uploads.close(); rights.close(); catalog.close(); await running.app.close(); }
  const before = [rows(join(source.root, 'cms.db')), rows(join(source.mediaRoot, 'media.sqlite'))];
  const backup = target('backup'); await backupRecoveryFixture(source.root, backup);
  const manifest = json(join(backup, 'backup.json')); expect(manifest).toMatchObject({ cmsSchema: 8, catalogSchema: 5, uploadSchema: 1 });
  const restored = await restoreRecoveryFixture(backup, target('recovery')); roots.push(restored.mediaRoot);
  expect([rows(join(restored.root, 'cms.db')), rows(join(restored.mediaRoot, 'media.sqlite'))]).toEqual(before);
  for (const file of manifest.files) {
    const output = file.path.startsWith('cms/') ? join(restored.root, file.path.slice(4)) : join(restored.mediaRoot, file.path.slice(6));
    expect(hash(readFileSync(output))).toBe(file.sha256);
  }
  expect(json(join(restored.root, 'local-access.json'))).not.toEqual(json(join(source.root, 'local-access.json')));
  const currentExport = target('export'), oldExport = target('export');
  exportStaticRelease({ sourceRoot: restored.root, websiteId: 'demo-cms', release: 'active', targetRoot: currentExport });
  exportStaticRelease({ sourceRoot: restored.root, websiteId: 'demo-cms', release: oldRelease, targetRoot: oldExport });
  expect(json(join(currentExport, 'export-manifest.json')).releaseId).toBe(currentRelease);
  for (const index of [0, 1]) {
    expect(readFileSync(join(oldExport, `sites/demo-cms/version-proof-${index}.html`))).toEqual(oldHtml[index]);
    expect(readFileSync(join(currentExport, `sites/demo-cms/version-proof-${index}.html`))).toEqual(newHtml[index]);
  }
  for (let restart = 0; restart < 2; restart++) {
    const app = await openRecoveryFixture(restored.root), content = new CatalogService(restored.mediaRoot), retry = new LocalUploadService(restored.mediaRoot);
    try {
      expect((await app.app.inject({ url: base + '/pages/home', headers })).statusCode).toBe(401);
      const fresh = { authorization: 'Bearer ' + json(join(restored.root, 'local-access.json')).publisher };
      expect((await app.app.inject({ url: base + '/pages/home', headers: fresh })).statusCode).toBe(200);
      expect(snapshots.map(snapshot => content.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: snapshot.snapshotId }))).toEqual(snapshots);
      for (const index of [0, 1]) expect((await app.app.inject(`/sites/demo-cms/version-proof-${index}.html`)).rawPayload).toEqual(newHtml[index]);
      if (!restart) expect(await retry.retryFailed(site, failedJob)).toMatchObject({ jobId: failedJob, assetId: first.assetId, fileVersion: 3, state: 'ready', attempts: 2, rights: 'unknown' });
      else expect(retry.status(site, failedJob)).toMatchObject({ state: 'ready', fileVersion: 3, attempts: 2 });
      expect(first.variants.map(v => hash(readFileSync(join(restored.mediaRoot, v.path))))).toEqual(oldImages);
    } finally { retry.close(); content.close(); await app.app.close(); }
  }
}, 30000);
