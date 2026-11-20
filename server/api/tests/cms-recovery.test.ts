import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupRecoveryFixture, createRecoveryFixture, openRecoveryFixture, quiesceRecoveryFixture, restoreRecoveryFixture } from '../src/modules/cms/recovery.js';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action(); });
function target(kind = 'recovery') {
  const path = join(tmpdir(), `draconis-cms-${kind}-${randomUUID()}`);
  cleanup.push(() => {
    if (dirname(resolve(path)) !== resolve(tmpdir()) || !path.includes('draconis-cms-')) throw Error('Unsafe cleanup');
    rmSync(path, { recursive: true, force: true });
  }); return path;
}
function ownMedia(root: string) { cleanup.push(() => {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes('draconis-media-fixture-')) throw Error('Unsafe cleanup');
  rmSync(root, { recursive: true, force: true });
}); }
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
async function fixture() { const created = await createRecoveryFixture(target()); ownMedia(created.mediaRoot); return created; }
async function opened(root: string) { const app = await openRecoveryFixture(root); cleanup.push(() => app.app.close()); return app; }
const base = '/api/v1/cms/websites/demo-cms';
const auth = (root: string) => ({ authorization: `Bearer ${read(join(root, 'local-access.json')).publisher}` });

describe('offline synthetic CMS recovery', () => {
  it('restores immutable releases, newer drafts, templates and media/catalog pins with new credentials across restart', async () => {
    const source = await fixture(); const running = await opened(source.root); const headers = auth(source.root);
    const cms = running.app;
    const home = (await cms.inject({ url: base + '/pages/home', headers })).json();
    const saved = await cms.inject({ method: 'PUT', url: base + '/pages/home/draft', headers, payload: {
      expectedVersion: home.pageVersion, values: { title: 'Published synthetic page', intro: 'Fixture only',
        image: { assetId: 'photo', fileVersion: 1, usage: 'hero', altText: { nl: 'Fictieve pixel' }, decorative: false } } } });
    expect(saved.statusCode).toBe(200);
    const media = new Database(join(source.mediaRoot, 'media.sqlite'));
    const snapshot = JSON.parse((media.prepare("SELECT json FROM catalog_snapshots WHERE website='fixture-alpha' LIMIT 1").get() as { json: string }).json); media.close();
    const doc = (await cms.inject({ method: 'POST', url: base + '/documents', headers, payload: { title: 'Projecten', slug: 'projecten' } })).json();
    expect((await cms.inject({ method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers, payload: { expectedVersion: doc.version,
      content: { ...doc.content, blocks: [{ ...doc.content.blocks[0], body: 'Fictieve projecten' }, { blockId: randomUUID(), type: 'portfolio',
        ref: { websiteId: 'fixture-alpha', collectionId: 'portfolio', snapshotId: snapshot.snapshotId }, checksum: snapshot.checksum, localeContext: snapshot.localeContext }] } } })).statusCode).toBe(200);
    const plan = (await cms.inject({ url: base + '/site-plan', headers })).json();
    const release = await cms.inject({ method: 'POST', url: base + '/releases', headers: { ...headers, 'idempotency-key': 'recovery-release' }, payload: {
      revisionId: plan.pages[0].revisionId, expectedActiveVersion: plan.activeVersion, expectedPages: plan.pages.map(({ pageId, revisionId, version }: { pageId: string; revisionId: string; version: number }) => ({ pageId, revisionId, version })),
      expectedShared: { revisionId: plan.shared.revisionId, version: plan.shared.version }, expectedContact: {
        revisionId: plan.contactTemplate.revisionId, version: plan.contactTemplate.version, templateHash: plan.contactTemplate.template.hash, locales: ['nl', 'en'] } } });
    expect(release.statusCode, release.body).toBe(200); expect(release.json().status).toBe('published');
    const page = (await cms.inject({ url: base + '/pages/home', headers })).json();
    expect((await cms.inject({ method: 'PUT', url: base + '/pages/home/draft', headers, payload: {
      expectedVersion: page.pageVersion, values: { ...page.values, title: 'New unpublished draft' } } })).statusCode).toBe(200);
    const oldHtml = (await cms.inject('/sites/demo-cms/index.html')).body;
    const portfolioHtml = (await cms.inject('/sites/demo-cms/projecten.html')).body;
    const contactHtml = (await cms.inject('/sites/demo-cms/en/contact-fixture.html')).body;
    const imageUrl = '/sites/demo-cms/' + /<img src="([^"]+)"/.exec(oldHtml)![1];
    const oldImage = (await cms.inject(imageUrl)).rawPayload;
    await running.app.close();
    const sourceHashes = [hash(join(source.root, 'cms.db')), hash(join(source.mediaRoot, 'media.sqlite'))];
    const backup = target('backup'); await backupRecoveryFixture(source.root, backup);
    expect([hash(join(source.root, 'cms.db')), hash(join(source.mediaRoot, 'media.sqlite'))]).toEqual(sourceHashes);
    expect(JSON.stringify(read(join(backup, 'backup.json')))).not.toContain('local-access');
    expect(readdirSync(backup)).toEqual(['backup.json', 'cms', 'media']);
    const restored = await restoreRecoveryFixture(backup, target()); ownMedia(restored.mediaRoot);
    expect(auth(restored.root)).not.toEqual(headers);
    for (let restart = 0; restart < 2; restart++) {
      const app = await opened(restored.root);
      expect((await app.app.inject({ url: base + '/pages/home', headers })).statusCode).toBe(401);
      const current = (await app.app.inject({ url: base + '/pages/home', headers: auth(restored.root) })).json();
      expect(current.values.title).toBe('New unpublished draft'); expect(current.activeReleaseId).toBe(release.json().releaseId);
      expect((await app.app.inject('/sites/demo-cms/index.html')).body).toBe(oldHtml);
      expect((await app.app.inject('/sites/demo-cms/projecten.html')).body).toBe(portfolioHtml);
      expect((await app.app.inject('/sites/demo-cms/en/contact-fixture.html')).body).toBe(contactHtml);
      expect((await app.app.inject(imageUrl)).rawPayload).toEqual(oldImage);
      expect(app.repository.db.pragma('foreign_key_check')).toEqual([]);
      await app.app.close();
    }
    const restoredMedia = new Database(join(restored.mediaRoot, 'media.sqlite'));
    expect(restoredMedia.prepare("SELECT COUNT(*) AS n FROM catalog_consumer_pins WHERE state='activated'").get()).toMatchObject({ n: 1 }); restoredMedia.close();
  });
  it('requires the stopped sole owner and prevents startup during backup', async () => {
    const source = await fixture(); const running = await opened(source.root);
    expect(() => quiesceRecoveryFixture(source.root)).toThrow('live owner');
    const output = target('backup'); await expect(backupRecoveryFixture(source.root, output)).rejects.toThrow('Stop'); expect(existsSync(output)).toBe(false);
    await running.app.close();
    let checked = false;
    await backupRecoveryFixture(source.root, output, { afterFile: () => {
      if (checked) return; checked = true;
      expect(existsSync(join(source.root, '.recovery.lock'))).toBe(true);
      const competing = new Database(join(source.root, 'cms.db'), { timeout: 0 });
      expect(() => competing.exec('BEGIN IMMEDIATE')).toThrow(); competing.close();
    } });
    writeFileSync(join(source.root, '.recovery.lock'), 'fixture');
    await expect(openRecoveryFixture(source.root)).rejects.toThrow('Offline recovery');
    rmSync(join(source.root, '.recovery.lock'));
    writeFileSync(join(source.root, 'runtime.lock'), '2147483647');
    expect(quiesceRecoveryFixture(source.root).offline).toBe(true);
    expect(existsSync(join(source.root, 'runtime.lock'))).toBe(false);
  });
  it('recovers a crashed recovery lease explicitly, preserving source bytes and allowing restart and backup', async () => {
    const source = await fixture();
    const lock = join(source.root, '.recovery.lock');
    const before = [hash(join(source.root, 'cms.db')), hash(join(source.mediaRoot, 'media.sqlite'))];
    writeFileSync(lock, '2147483647');
    await expect(openRecoveryFixture(source.root)).rejects.toThrow('Offline recovery');
    await expect(backupRecoveryFixture(source.root, target('backup'))).rejects.toThrow();
    expect(quiesceRecoveryFixture(source.root).offline).toBe(true);
    expect(existsSync(lock)).toBe(false);
    expect([hash(join(source.root, 'cms.db')), hash(join(source.mediaRoot, 'media.sqlite'))]).toEqual(before);
    const running = await opened(source.root); await running.app.close();
    await backupRecoveryFixture(source.root, target('backup'));
  });
  it('preserves live, invalid, changed and unprovably dead recovery owners', async () => {
    const source = await fixture(), lock = join(source.root, '.recovery.lock');
    for (const owner of [String(process.pid), '', 'garbage', '-1', '1.5', '2147483648', ' 2147483647']) {
      writeFileSync(lock, owner);
      expect(() => quiesceRecoveryFixture(source.root)).toThrow();
      expect(readFileSync(lock, 'utf8')).toBe(owner);
    }
    writeFileSync(lock, '2147483647');
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(Error('denied'), { code: 'EPERM' }); });
    try { expect(() => quiesceRecoveryFixture(source.root)).toThrow('denied'); }
    finally { kill.mockRestore(); }
    expect(readFileSync(lock, 'utf8')).toBe('2147483647');
    const changed = vi.spyOn(process, 'kill').mockImplementation(() => {
      writeFileSync(lock, String(process.pid)); throw Object.assign(Error('gone'), { code: 'ESRCH' });
    });
    try { expect(() => quiesceRecoveryFixture(source.root)).toThrow('Owner changed'); }
    finally { changed.mockRestore(); }
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid));
  });
  it('serializes recovery acquisition and leaves a replacement lease intact on release', async () => {
    const source = await fixture(), lock = join(source.root, '.recovery.lock');
    let checked = false;
    await backupRecoveryFixture(source.root, target('backup'), { afterFile: () => {
      if (checked) return; checked = true;
      expect(() => quiesceRecoveryFixture(source.root)).toThrow();
      expect(readFileSync(lock, 'utf8')).toBe(String(process.pid));
      writeFileSync(lock, '2147483647');
    } });
    expect(readFileSync(lock, 'utf8')).toBe('2147483647');
    expect(quiesceRecoveryFixture(source.root).offline).toBe(true);
  });
  it('rejects corruption, missing and extra files, incomplete manifests, traversal and unknown schemas before creating a target', async () => {
    const source = await fixture();
    const backup = target('backup'); await backupRecoveryFixture(source.root, backup);
    const path = join(backup, 'backup.json'), original = readFileSync(path);
    const mutate = async (change: (manifest: ReturnType<typeof read>) => void) => {
      const manifest = JSON.parse(original.toString()); change(manifest); writeFileSync(path, JSON.stringify(manifest));
      const destination = target(); await expect(restoreRecoveryFixture(backup, destination)).rejects.toThrow(); expect(existsSync(destination)).toBe(false); writeFileSync(path, original);
    };
    await mutate(m => { m.complete = false; }); await mutate(m => { m.version = 999; });
    await mutate(m => { m.files[0].path = '../escape'; }); await mutate(m => { m.files.push({ ...m.files[0], path: m.files[0].path.toUpperCase() }); });
    await mutate(m => { m.files[0].sha256 = '0'.repeat(64); });
    const dbPath = join(backup, 'cms/cms.db'), bytes = readFileSync(dbPath);
    writeFileSync(dbPath, 'corrupt'); await expect(restoreRecoveryFixture(backup, target())).rejects.toThrow('hash'); writeFileSync(dbPath, bytes);
    rmSync(dbPath); await expect(restoreRecoveryFixture(backup, target())).rejects.toThrow('inventory'); writeFileSync(dbPath, bytes);
    writeFileSync(join(backup, 'extra'), 'unexpected'); await expect(restoreRecoveryFixture(backup, target())).rejects.toThrow('inventory'); rmSync(join(backup, 'extra'));
    const db = new Database(dbPath); db.prepare('INSERT INTO cms_migrations VALUES (999)').run(); db.close();
    const manifest = read(path); const entry = manifest.files.find((file: { path: string }) => file.path === 'cms/cms.db'); entry.bytes = readFileSync(dbPath).length; entry.sha256 = hash(dbPath); writeFileSync(path, JSON.stringify(manifest));
    await expect(restoreRecoveryFixture(backup, target())).rejects.toThrow('Unsupported CMS schema');
  });
  it('cleans only newly owned partial outputs and permits retry without changing the source', async () => {
    const source = await fixture(), output = target('backup');
    const before = hash(join(source.root, 'cms.db'));
    await expect(backupRecoveryFixture(source.root, output, { afterFile: () => { throw Error('disk failure'); } })).rejects.toThrow('disk failure');
    expect(existsSync(output)).toBe(false); expect(existsSync(join(source.root, '.recovery.lock'))).toBe(false);
    await backupRecoveryFixture(source.root, output);
    const restored = target(); await expect(restoreRecoveryFixture(output, restored, { afterFile: () => { throw Error('disk failure'); } })).rejects.toThrow('disk failure');
    expect(existsSync(restored)).toBe(false); expect(hash(join(source.root, 'cms.db'))).toBe(before);
    const done = await restoreRecoveryFixture(output, restored); ownMedia(done.mediaRoot);
    await expect(restoreRecoveryFixture(output, restored)).rejects.toThrow('overwrite');
    await expect(backupRecoveryFixture(source.root, output)).rejects.toThrow('overwrite');
    const marker = join(source.root, '.cms-recovery-fixture'); rmSync(marker);
    await expect(backupRecoveryFixture(source.root, target('backup'))).rejects.toThrow();
    await expect(createRecoveryFixture(join(tmpdir(), 'ordinary-user-folder'))).rejects.toThrow('synthetic');
  });
  it('refuses missing referenced media even when the outer inventory hashes would otherwise be complete', async () => {
    const source = await fixture();
    rmSync(join(source.mediaRoot, 'public/fixture-alpha/photo/1/tiny.png'));
    const output = target('backup'); await expect(backupRecoveryFixture(source.root, output)).rejects.toThrow(); expect(existsSync(output)).toBe(false);
  });
  it('rejects symlink inventory roots without copying their contents', async () => {
    const source = await fixture();
    symlinkSync(source.mediaRoot, join(source.root, 'releases'), process.platform === 'win32' ? 'junction' : 'dir');
    const output = target('backup');
    await expect(backupRecoveryFixture(source.root, output)).rejects.toThrow('Unsafe inventory');
    expect(existsSync(output)).toBe(false);
    unlinkSync(join(source.root, 'releases'));
  });
});
