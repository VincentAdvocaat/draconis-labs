import Database from 'better-sqlite3';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { createCatalogConsumerFixture } from '../../catalogus/consumer-fixture.js';
import { assertFixtureRoot } from '../../media-fixture/safety.js';
import { buildCmsApp } from './app.js';

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const markerSchema = z.object({ version: z.literal(1), synthetic: z.literal(true), id: z.uuid(), mediaRoot: z.string() }).strict();
const entrySchema = z.object({ path: z.string(), bytes: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const manifestSchema = z.object({ format: z.literal('cms-synthetic-backup'), version: z.literal(1), complete: z.literal(true),
  sourceId: z.uuid(), consistency: z.literal('offline-single-owner'), cmsSchema: z.literal(8), catalogSchema: z.literal(3),
  files: z.array(entrySchema).min(2).max(20000) }).strict();
type Manifest = z.infer<typeof manifestSchema>;
export interface RecoveryHooks { afterFile?: (path: string) => void }

// This first recovery tool deliberately accepts only new, direct temporary fixtures.
// It never opens an arbitrary customer runtime, backup location or user directory.
function checkedTemp(path: string, prefix: string, mustExist: boolean) {
  const absolute = resolve(path);
  if (dirname(absolute) !== realpathSync(tmpdir()) || !basename(absolute).startsWith(prefix)) throw new Error('Explicit synthetic temporary target required');
  if (mustExist) {
    if (!lstatSync(absolute).isDirectory() || lstatSync(absolute).isSymbolicLink() || realpathSync(absolute) !== absolute) throw new Error('Unsafe fixture root');
  } else if (existsSync(absolute)) throw new Error('Target already exists; overwrite is forbidden');
  return absolute;
}
function json(path: string): unknown { return JSON.parse(readFileSync(path, 'utf8')); }
function regular(path: string) {
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error('Only regular files are supported');
  return readFileSync(path);
}
function source(root: string) {
  root = checkedTemp(root, 'draconis-cms-recovery-', true);
  const marker = markerSchema.parse(JSON.parse(regular(join(root, '.cms-recovery-fixture')).toString('utf8')));
  const mediaRoot = assertFixtureRoot(marker.mediaRoot);
  if (regular(join(mediaRoot, '.cms-recovery-owner')).toString('utf8') !== marker.id) throw new Error('Media owner mismatch');
  if ((json(join(root, 'media-root.json')) as { root?: string }).root !== mediaRoot) throw new Error('Media pointer mismatch');
  return { root, mediaRoot, marker };
}
function safePath(path: string) {
  if (path.length > 500 || !/^(?:cms\/cms\.db|media\/media\.sqlite|cms\/releases\/.+|media\/(?:public|private)\/.+)$/.test(path) ||
    path.split('/').some(part => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === '.' || part === '..' || part.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('Unsafe backup path');
  return path;
}
function list(root: string, prefix = ''): string[] {
  if (!existsSync(root)) return [];
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) throw new Error('Unsafe inventory directory');
  const result: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name), name = prefix + entry.name;
    if (lstatSync(path).isSymbolicLink()) throw new Error('Symlinks are forbidden');
    if (entry.isDirectory()) result.push(...list(path, name + '/'));
    else if (entry.isFile()) result.push(name);
    else throw new Error('Unsupported filesystem entry');
  }
  return result.sort();
}
function write(path: string, bytes: string | Buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx', flush: true });
}
function removeOwned(path: string, prefix: string) {
  checkedTemp(path, prefix, true);
  rmSync(path, { recursive: true });
}
function credentials(root: string) {
  const tokens = { editor: randomBytes(32).toString('hex'), publisher: randomBytes(32).toString('hex') };
  write(join(root, 'local-access.json'), JSON.stringify(tokens));
  write(join(root, 'recovery-config.json'), JSON.stringify({ credentials: Object.entries(tokens).map(([role, token]) => ({
    name: `recovery-${role}`, role, websiteIds: ['demo-cms'], tokenHash: digest(token) })) }));
}
export async function openRecoveryFixture(root: string, uiRoot?: string) {
  const checked = source(root);
  const config = json(join(checked.root, 'recovery-config.json')) as { credentials: unknown };
  return buildCmsApp({ runtimeRoot: checked.root, mediaRoot: checked.mediaRoot, credentials: config.credentials,
    enableMedia: true, enableUploads: true, enablePortfolio: true, enablePages: true, enableSharedNavigation: true,
    enableContactTemplate: true, uiRoot });
}
/** Recover only fixed stale coordination files after an interrupted local process.
 * Never stop a process or infer that a live PID is safe to take over. */
export function quiesceRecoveryFixture(sourceRoot: string) {
  const { root, mediaRoot } = source(sourceRoot);
  const lock = join(root, '.recovery.lock');
  writeFileSync(lock, String(process.pid), { flag: 'wx' });
  try {
    if (existsSync(join(mediaRoot, '.catalog-consumer-acquiring'))) throw new Error('Inspect interrupted catalog acquisition manually');
    const stale: Array<{ path: string; bytes: Buffer }> = [];
    for (const path of [join(root, 'runtime.lock'), join(mediaRoot, '.catalog-consumer-owner.json')]) {
      if (!existsSync(path)) continue;
      const bytes = regular(path);
      const pid = path.endsWith('runtime.lock') ? Number(bytes.toString()) : (JSON.parse(bytes.toString()) as { pid: number }).pid;
      if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid owner PID');
      try { process.kill(pid, 0); throw new Error('Stop the live owner first'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
      stale.push({ path, bytes });
    }
    for (const file of stale) {
      if (!regular(file.path).equals(file.bytes)) throw new Error('Owner changed during offline check');
      unlinkSync(file.path);
    }
    return { root, offline: true };
  } finally { unlinkSync(lock); }
}
export async function createRecoveryFixture(target: string) {
  const root = checkedTemp(target, 'draconis-cms-recovery-', false);
  mkdirSync(root);
  let mediaRoot: string | undefined;
  try {
    const fixture = createCatalogConsumerFixture();
    mediaRoot = fixture.root;
    fixture.consumer.close(); fixture.catalog.close(); fixture.media.close();
    const marker = { version: 1, synthetic: true, id: randomUUID(), mediaRoot };
    write(join(root, '.cms-recovery-fixture'), JSON.stringify(marker));
    write(join(mediaRoot, '.cms-recovery-owner'), marker.id);
    write(join(root, 'media-root.json'), JSON.stringify({ root: mediaRoot }));
    credentials(root);
    const config = json(join(root, 'recovery-config.json')) as { credentials: unknown };
    const running = await buildCmsApp({ runtimeRoot: root, mediaRoot, credentials: config.credentials, seed: true,
      enableMedia: true, enableUploads: true, enablePortfolio: true, enablePages: true, enableSharedNavigation: true, enableContactTemplate: true });
    await running.app.close();
    return { root, mediaRoot };
  } catch (error) {
    if (mediaRoot) removeOwned(mediaRoot, 'draconis-media-fixture-');
    removeOwned(root, 'draconis-cms-recovery-'); throw error;
  }
}
function checkDatabase(path: string, kind: 'cms' | 'media') {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (db.pragma('integrity_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Database integrity failed');
    if (kind === 'cms') {
      const versions = db.prepare('SELECT version FROM cms_migrations ORDER BY version').all();
      if (JSON.stringify(versions) !== JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ version: i + 1 })))) throw new Error('Unsupported CMS schema');
      if (db.prepare("SELECT 1 FROM cms_attempts WHERE status='building'").get()) throw new Error('Finish or reconcile in-flight builds before backup');
    } else {
      if ((db.prepare('SELECT version FROM catalog_schema').get() as { version: number }).version !== 3) throw new Error('Unsupported catalog schema');
      if (db.prepare("SELECT 1 FROM upload_jobs WHERE state='processing'").get()) throw new Error('Finish or reconcile uploads before backup');
    }
  } finally { db.close(); }
}
function validatePayload(root: string) {
  checkDatabase(join(root, 'cms/cms.db'), 'cms'); checkDatabase(join(root, 'media/media.sqlite'), 'media');
  const cms = new Database(join(root, 'cms/cms.db'), { readonly: true });
  const media = new Database(join(root, 'media/media.sqlite'), { readonly: true });
  try {
    if (cms.prepare("SELECT 1 FROM cms_active a JOIN cms_attempts r ON r.id=a.release_id WHERE r.status<>'published' OR r.website_id<>a.website_id").get()) throw new Error('Invalid active release pointer');
    for (const template of cms.prepare('SELECT hash,bundle FROM cms_contact_templates').all() as Array<{ hash: string; bundle: string }>) {
      if (digest(JSON.stringify(JSON.parse(template.bundle))) !== template.hash) throw new Error('Template hash mismatch');
    }
    // Every retained successful release, not just its active pointer, must remain readable.
    for (const row of cms.prepare("SELECT id,website_id FROM cms_attempts WHERE status='published'").all() as Array<{ id: string; website_id: string }>) {
      const prefix = safePath(`cms/releases/${row.website_id}/${row.id}/release.json`);
      const manifest = json(join(root, prefix)) as { schemaVersion: number; releaseId: string; websiteId: string; files: Record<string, string> };
      if (manifest.schemaVersion !== 1 || manifest.releaseId !== row.id || manifest.websiteId !== row.website_id) throw new Error('Invalid retained release');
      for (const [path, hash] of Object.entries(manifest.files)) {
        if (digest(regular(join(root, safePath(`cms/releases/${row.website_id}/${row.id}/${path}`)))) !== hash) throw new Error('Retained release hash mismatch');
      }
    }
    for (const row of media.prepare('SELECT variants FROM files').all() as Array<{ variants: string }>) {
      for (const variant of JSON.parse(row.variants) as Array<{ path: string; bytes: number; checksum: string }>) {
        const bytes = regular(join(root, safePath('media/' + variant.path)));
        if (bytes.length !== variant.bytes || digest(bytes) !== variant.checksum) throw new Error('Retained media hash mismatch');
      }
    }
  } finally { cms.close(); media.close(); }
}
export async function backupRecoveryFixture(sourceRoot: string, target: string, hooks: RecoveryHooks = {}) {
  const { root, mediaRoot, marker } = source(sourceRoot);
  const output = checkedTemp(target, 'draconis-cms-backup-', false);
  const lock = join(root, '.recovery.lock');
  writeFileSync(lock, String(process.pid), { flag: 'wx' });
  const guards: Database.Database[] = [];
  let created = false;
  try {
    if (existsSync(join(root, 'runtime.lock')) || existsSync(join(mediaRoot, '.catalog-consumer-owner.json')) || existsSync(join(mediaRoot, '.catalog-consumer-acquiring'))) throw new Error('Stop the owning CMS and catalog consumer before backup');
    // Reserve both SQLite writers for the complete copy. Filesystem quiescence still
    // requires the documented single offline owner; this is not a live atomic backup.
    for (const path of [join(root, 'cms.db'), join(mediaRoot, 'media.sqlite')]) {
      regular(path);
      const db = new Database(path, { fileMustExist: true, timeout: 0 }); guards.push(db); db.exec('BEGIN IMMEDIATE');
    }
    checkDatabase(join(root, 'cms.db'), 'cms'); checkDatabase(join(mediaRoot, 'media.sqlite'), 'media');
    mkdirSync(output); created = true;
    for (const [input, path] of [[join(root, 'cms.db'), 'cms/cms.db'], [join(mediaRoot, 'media.sqlite'), 'media/media.sqlite']]) {
      mkdirSync(dirname(join(output, path!)), { recursive: true });
      const db = new Database(input!, { readonly: true, fileMustExist: true });
      try { await db.backup(join(output, path!)); } finally { db.close(); }
      const copy = new Database(join(output, path!));
      try { copy.pragma('journal_mode = DELETE'); } finally { copy.close(); }
      hooks.afterFile?.(path!);
    }
    const sources = [ ['cms/releases', join(root, 'releases')], ['media/public', join(mediaRoot, 'public')], ['media/private', join(mediaRoot, 'private')] ];
    const before: Array<{ input: string; path: string; sha256: string }> = [];
    for (const [prefix, directory] of sources) for (const file of list(directory!)) {
      const path = safePath(prefix + '/' + file), input = join(directory!, file), bytes = regular(input);
      before.push({ input, path, sha256: digest(bytes) }); write(join(output, path), bytes); hooks.afterFile?.(path);
    }
    for (const [prefix, directory] of sources) {
      const expected = before.filter(file => file.path.startsWith(prefix + '/')).map(file => file.path.slice(prefix!.length + 1));
      if (JSON.stringify(list(directory!)) !== JSON.stringify(expected)) throw new Error('Source file inventory changed');
    }
    for (const file of before) if (digest(regular(file.input)) !== file.sha256) throw new Error('Source files changed during backup');
    validatePayload(output);
    const files = list(output).map(path => { safePath(path); const bytes = regular(join(output, path)); return { path, bytes: bytes.length, sha256: digest(bytes) }; });
    const manifest: Manifest = { format: 'cms-synthetic-backup', version: 1, complete: true, sourceId: marker.id,
      consistency: 'offline-single-owner', cmsSchema: 8, catalogSchema: 3, files };
    // Written last. A crash or failed copy without this marker is never restorable.
    write(join(output, 'backup.json'), JSON.stringify(manifest, null, 2));
    return { root: output, files: files.length };
  } catch (error) {
    if (created) removeOwned(output, 'draconis-cms-backup-'); throw error;
  } finally {
    for (const db of guards.reverse()) { if (db.inTransaction) db.exec('ROLLBACK'); db.close(); }
    unlinkSync(lock);
  }
}
export async function restoreRecoveryFixture(packageRoot: string, target: string, hooks: RecoveryHooks = {}) {
  const backup = checkedTemp(packageRoot, 'draconis-cms-backup-', true);
  const root = checkedTemp(target, 'draconis-cms-recovery-', false);
  const manifest = manifestSchema.parse(JSON.parse(regular(join(backup, 'backup.json')).toString('utf8')));
  const paths = manifest.files.map(file => safePath(file.path));
  if (new Set(paths.map(path => path.toLowerCase())).size !== paths.length || !paths.includes('cms/cms.db') || !paths.includes('media/media.sqlite')) throw new Error('Duplicate or missing required backup files');
  if (JSON.stringify(list(backup)) !== JSON.stringify([...paths, 'backup.json'].sort())) throw new Error('Backup inventory mismatch');
  for (const file of manifest.files) { const bytes = regular(join(backup, file.path)); if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error('Backup hash mismatch'); }
  validatePayload(backup);
  let mediaRoot: string | undefined, created = false;
  try {
    mkdirSync(root); created = true;
    mediaRoot = mkdtempSync(join(realpathSync(tmpdir()), 'draconis-media-fixture-'));
    for (const file of manifest.files) {
      const bytes = regular(join(backup, file.path));
      if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error('Backup changed during restore');
      const output = file.path.startsWith('cms/') ? join(root, file.path.slice(4)) : join(mediaRoot, file.path.slice(6));
      write(output, bytes); hooks.afterFile?.(file.path);
    }
    // Validate copied bytes before producing ownership markers or fresh credentials.
    for (const file of manifest.files) {
      const output = file.path.startsWith('cms/') ? join(root, file.path.slice(4)) : join(mediaRoot, file.path.slice(6));
      if (digest(regular(output)) !== file.sha256) throw new Error('Restored hash mismatch');
    }
    const id = randomUUID();
    write(join(mediaRoot, '.media-fixture'), randomUUID()); write(join(mediaRoot, '.cms-recovery-owner'), id);
    write(join(root, 'media-root.json'), JSON.stringify({ root: mediaRoot }));
    credentials(root);
    write(join(root, '.cms-recovery-fixture'), JSON.stringify({ version: 1, synthetic: true, id, mediaRoot }));
    return { root, mediaRoot, sourceId: manifest.sourceId };
  } catch (error) {
    if (mediaRoot) removeOwned(mediaRoot, 'draconis-media-fixture-');
    if (created) removeOwned(root, 'draconis-cms-recovery-'); throw error;
  }
}
