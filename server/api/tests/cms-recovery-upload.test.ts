import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { createRecoveryFixture, backupRecoveryFixture, restoreRecoveryFixture } from '../src/modules/cms/recovery.js';
import { LocalUploadService } from '../src/media-upload/service.js';
import { MediaRightsService } from '../src/media-upload/rights.js';
import { CatalogService } from '../src/catalogus/service.js';
import { CatalogSnapshotConsumer } from '../src/catalogus/consumer.js';

const cleanup: Array<() => void> = [];
afterEach(() => { for (const action of cleanup.splice(0).reverse()) action(); });
function own(path: string, prefix: string) { cleanup.push(() => {
  if (dirname(resolve(path)) !== resolve(tmpdir()) || !path.includes(prefix)) throw new Error('Unsafe synthetic target');
  rmSync(path, { recursive: true, force: true });
}); return path; }
const target = (kind = 'recovery') => own(join(tmpdir(), `draconis-cms-${kind}-${randomUUID()}`), 'draconis-cms-');
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const png = () => sharp({ create: { width: 24, height: 16, channels: 3, background: 'red' } }).png().toBuffer();
const site = 'fixture-alpha';
const approve = (expectedVersion: number) => ({ expectedVersion, status: 'cleared', owner: 'Synthetic', source: 'Generated fixture', basis: 'Fictitious permission for recovery test', employee: 'Test', confirmed: true });
async function fixture() { const result = await createRecoveryFixture(target()); own(result.mediaRoot, 'draconis-media-fixture-'); return result; }
function rehashDb(root: string, mutate: (db: Database.Database) => void) {
  const path = join(root, 'media/media.sqlite'), db = new Database(path); try { mutate(db); } finally { db.close(); }
  const manifest = json(join(root, 'backup.json')), entry = manifest.files.find((file: { path: string }) => file.path === 'media/media.sqlite');
  const bytes = readFileSync(path); entry.bytes = bytes.length; entry.sha256 = hash(bytes); writeFileSync(join(root, 'backup.json'), JSON.stringify(manifest));
}

describe('offline recovery with upload job schema1', () => {
  it('retains v1/v2 sources, immutable NL/EN snapshots, refs and system reapproval audit across two opens', async () => {
    const source = await fixture(), uploads = new LocalUploadService(source.mediaRoot), rights = new MediaRightsService(source.mediaRoot);
    const catalog = new CatalogService(source.mediaRoot), consumer = new CatalogSnapshotConsumer(source.mediaRoot);
    let first: Awaited<ReturnType<LocalUploadService['upload']>>, second: Awaited<ReturnType<LocalUploadService['upload']>>;
    let snapshots: ReturnType<CatalogService['publish']>[] = [], pinId = '';
    try {
      first = await uploads.upload(site, await png(), 'first.png', 'image/png'); rights.setRights(site, first.assetId, approve(1));
      const item = catalog.save(site, { expectedVersion: 0, title: 'Proef', slug: 'version-recovery', description: '', categoryId: 'algemeen', metadata: {},
        media: { assetId: first.assetId, fileVersion: 1, usage: 'cover', altText: { nl: 'Rood vlak' }, decorative: false } });
      catalog.saveLocaleVariant(site, item.itemId, 'en', { expectedVersion: 1, title: 'Sample', slug: 'version-recovery-en', description: '', alt: 'A red square' });
      const version = catalog.list(site).version;
      snapshots = [catalog.publish(site, version), catalog.publish(site, version, { locale: 'en', fallbackLocale: 'nl' })];
      const snapshot = snapshots[1];
      pinId = consumer.preparePin(site, { owner: { module: 'test', siteId: 'demo', ownerId: 'page', revisionId: 'revision', kind: 'release', slot: 'portfolio', attemptId: 'retained-version' },
        ref: { websiteId: site, collectionId: 'portfolio', snapshotId: snapshot.snapshotId }, checksum: snapshot.checksum, localeContext: snapshot.localeContext! }).pinId;
      second = await uploads.uploadVersion(site, first.assetId, 2, 1, await png(), 'second.png', 'image/png');
    } finally { consumer.close(); catalog.close(); rights.close(); uploads.close(); }
    const backup = target('backup'); await backupRecoveryFixture(source.root, backup);
    expect(json(join(backup, 'backup.json')).uploadSchema).toBe(1);
    const restored = await restoreRecoveryFixture(backup, target()); own(restored.mediaRoot, 'draconis-media-fixture-');
    for (let repeat = 0; repeat < 2; repeat++) {
      const reader = new LocalUploadService(restored.mediaRoot), content = new CatalogService(restored.mediaRoot);
      try {
        expect(reader.status(site, second!.jobId)).toMatchObject({ assetId: first!.assetId, fileVersion: 2, state: 'ready', rights: 'unknown', metadataVersion: 4 });
        for (const path of [`private/${site}/${first!.assetId}/source`, `private/${site}/${first!.assetId}/2/source`, ...first!.variants.map(v => v.path), ...second!.variants.map(v => v.path)])
          expect(readFileSync(join(restored.mediaRoot, path))).toEqual(readFileSync(join(source.mediaRoot, path)));
        for (const snapshot of snapshots) expect(content.resolveSnapshot({ websiteId: site, collectionId: 'portfolio', snapshotId: snapshot.snapshotId })).toEqual(snapshot);
        const db = new Database(join(restored.mediaRoot, 'media.sqlite'));
        try {
          expect(db.prepare('SELECT state FROM catalog_consumer_pins WHERE id=?').get(pinId)).toEqual({ state: 'prepared' });
          expect(JSON.parse((db.prepare('SELECT decision FROM media_rights_audit WHERE asset=? ORDER BY version DESC LIMIT 1').get(first!.assetId) as { decision: string }).decision)).toMatchObject({ status: 'unknown', type: 'new-file-version', fileVersion: 2 });
        } finally { db.close(); }
      } finally { content.close(); reader.close(); }
    }
  }, 15000);

  it('restores a failed next-version job and retries the same binding with the retained source', async () => {
    const source = await fixture(); let uploads = new LocalUploadService(source.mediaRoot);
    const first = await uploads.upload(site, await png(), 'first.png', 'image/png'); uploads.close();
    uploads = new LocalUploadService(source.mediaRoot, path => { if (path.includes(join(first.assetId, '2', 'staging'))) throw new Error('Injected failed staging'); rmSync(path, { recursive: true, force: true }); });
    await expect(uploads.uploadVersion(site, first.assetId, 1, 1, await png(), 'next.png', 'image/png')).rejects.toThrow(); uploads.close();
    const db = new Database(join(source.mediaRoot, 'media.sqlite'));
    const failed = db.prepare('SELECT id FROM upload_jobs WHERE asset=? AND file_version=2').get(first.assetId) as { id: string }; db.close();
    const backup = target('backup'); await backupRecoveryFixture(source.root, backup);
    const restored = await restoreRecoveryFixture(backup, target()); own(restored.mediaRoot, 'draconis-media-fixture-');
    const retry = new LocalUploadService(restored.mediaRoot);
    try { expect(await retry.retryFailed(site, failed.id)).toMatchObject({ jobId: failed.id, assetId: first.assetId, fileVersion: 2, state: 'ready', attempts: 2 }); } finally { retry.close(); }
  }, 15000);

  it('rejects schema/binding/attempt/hash tampering even when the outer database hash is recomputed', async () => {
    const source = await fixture(), uploads = new LocalUploadService(source.mediaRoot);
    const first = await uploads.upload(site, await png(), 'first.png', 'image/png'); uploads.close();
    const backup = target('backup'); await backupRecoveryFixture(source.root, backup);
    const mutations = [
      (db: Database.Database) => db.exec('UPDATE media_upload_schema SET version=2'),
      (db: Database.Database) => db.exec('UPDATE upload_jobs SET attempts=6'),
      (db: Database.Database) => db.exec('UPDATE upload_jobs SET owner_pid=42'),
      (db: Database.Database) => db.exec('DROP INDEX upload_job_file'),
      (db: Database.Database) => db.exec('UPDATE upload_jobs SET file_version=99'),
      (db: Database.Database) => db.prepare('UPDATE upload_jobs SET source_checksum=? WHERE id=?').run('0'.repeat(64), first.jobId),
      (db: Database.Database) => db.exec('DROP TABLE media_upload_schema'),
    ];
    for (const mutate of mutations) {
      const copy = target('backup'); cpSync(backup, copy, { recursive: true }); rehashDb(copy, mutate);
      await expect(restoreRecoveryFixture(copy, target())).rejects.toThrow();
    }
    const mismatch = target('backup'); cpSync(backup, mismatch, { recursive: true });
    const manifest = json(join(mismatch, 'backup.json')); manifest.uploadSchema = 0; writeFileSync(join(mismatch, 'backup.json'), JSON.stringify(manifest));
    await expect(restoreRecoveryFixture(mismatch, target())).rejects.toThrow('Manifest/upload');
  }, 15000);

  it('accepts a genuine legacy six-column package without uploadSchema and migrates only on later open', async () => {
    const source = await fixture(), uploads = new LocalUploadService(source.mediaRoot);
    const first = await uploads.upload(site, await png(), 'legacy.png', 'image/png'); uploads.close();
    const backup = target('backup'); await backupRecoveryFixture(source.root, backup);
    rehashDb(backup, db => {
      db.exec('DROP INDEX upload_job_file');
      for (const column of ['asset', 'file_version', 'attempts', 'owner_pid', 'source_checksum']) db.exec(`ALTER TABLE upload_jobs DROP COLUMN ${column}`);
      db.exec('DROP TABLE media_upload_schema');
    });
    const manifest = json(join(backup, 'backup.json')); delete manifest.uploadSchema; writeFileSync(join(backup, 'backup.json'), JSON.stringify(manifest));
    const restored = await restoreRecoveryFixture(backup, target()); own(restored.mediaRoot, 'draconis-media-fixture-');
    const before = new Database(join(restored.mediaRoot, 'media.sqlite'));
    expect(before.prepare("SELECT 1 FROM sqlite_master WHERE name='media_upload_schema'").get()).toBeUndefined(); before.close();
    const reopened = new LocalUploadService(restored.mediaRoot);
    try { expect(reopened.status(site, first.assetId)).toMatchObject({ assetId: first.assetId, fileVersion: 1, state: 'ready' }); } finally { reopened.close(); }
  }, 15000);
});
