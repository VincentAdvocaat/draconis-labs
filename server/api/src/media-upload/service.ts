import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { FIXTURE_WEBSITES } from '../media-fixture/fixture.js';
import { assertFixtureRoot } from '../media-fixture/safety.js';
import { checksum } from '../media-fixture/storage.js';
import type { PublicVariant } from '../media-fixture/contracts.js';
import { processImage, UploadError, validateEnvelope } from './processor.js';
import { ensureUploadSchema, MAX_UPLOAD_ATTEMPTS } from './schema.js';
import { MediaRightsService } from './rights.js';

interface Job { id: string; website: string; asset: string | null; file_version: number; filename: string; mime: string;
  state: string; error: string | null; attempts: number; owner_pid: number | null; source_checksum: string | null }
const live = (pid: number) => { try { process.kill(pid, 0); return true; } catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error;
} };

/** One admitted request per app; durable job ownership also protects recovery across local workers. */
export class LocalUploadService {
  private busy = false;
  private readonly db: Database.Database;
  private readonly rights: MediaRightsService;
  readonly root: string;
  constructor(root: string, private readonly removeDirectory: (path: string) => void =
    path => { rmSync(path, { recursive: true, force: true }); }) {
    this.root = assertFixtureRoot(root);
    this.db = new Database(join(this.root, 'media.sqlite'));
    this.db.pragma('foreign_keys = ON');
    try { ensureUploadSchema(this.db); this.rights = new MediaRightsService(root, this.db); } catch (error) { this.db.close(); throw error; }
  }
  close() { this.db.close(); }
  authorizeWebsite(website: string) {
    if (!FIXTURE_WEBSITES.includes(website)) throw new UploadError(403, 'Fixture website not allowed');
  }
  private paths(job: Job) {
    this.authorizeWebsite(job.website);
    const asset = job.asset ?? job.id;
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(asset) || !Number.isSafeInteger(job.file_version) || job.file_version < 1)
      throw new UploadError(400, 'Invalid asset/version binding');
    const privateAsset = join(this.root, 'private', job.website, asset);
    const privateDir = job.file_version === 1 ? privateAsset : join(privateAsset, String(job.file_version));
    const publicDir = join(this.root, 'public', job.website, asset, String(job.file_version));
    for (const path of [join(this.root, 'private'), join(this.root, 'private', job.website), privateAsset, privateDir,
      join(this.root, 'public'), join(this.root, 'public', job.website), dirname(publicDir), publicDir]) {
      if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())) throw new UploadError(409, 'Unsafe fixture storage path');
    }
    return { privateDir, publicDir, original: join(privateDir, 'source'), staging: join(privateDir, 'staging') };
  }
  private job(website: string, id: string) {
    this.authorizeWebsite(website);
    const job = this.db.prepare('SELECT * FROM upload_jobs WHERE id=? AND website=?').get(id, website) as Job | undefined;
    if (!job) throw new UploadError(404, 'Upload job not found');
    return job;
  }
  status(website: string, id: string) {
    const job = this.job(website, id), assetId = job.asset ?? job.id;
    const file = this.db.prepare('SELECT state,variants FROM files WHERE website=? AND asset=? AND version=?')
      .get(website, assetId, job.file_version) as { state: string; variants: string } | undefined;
    if (job.state === 'ready' && !file) throw new UploadError(404, 'Upload asset metadata was purged');
    const asset = this.db.prepare('SELECT rights,metadata_version FROM assets WHERE website=? AND id=?').get(website, assetId) as { rights: string; metadata_version: number } | undefined;
    return { jobId: job.id, assetId, fileVersion: job.file_version, state: job.state, error: job.error, attempts: job.attempts,
      maxAttempts: MAX_UPLOAD_ATTEMPTS, rights: asset?.rights ?? 'unknown', metadataVersion: asset?.metadata_version,
      variants: file?.state === 'ready' ? JSON.parse(file.variants) as PublicVariant[] : [] };
  }
  private insertJob(website: string, id: string, asset: string, fileVersion: number, filename: string, mime: string, bytes: Buffer) {
    this.db.prepare(`INSERT INTO upload_jobs(id,website,filename,mime,state,error,asset,file_version,attempts,owner_pid,source_checksum)
      VALUES(?,?,?,?,'processing',NULL,?,?,0,?,?)`).run(id, website, filename, mime, asset, fileVersion, process.pid, checksum(bytes));
    return this.job(website, id);
  }
  async upload(website: string, bytes: Buffer, filename: string, mime: string) {
    if (this.busy) throw new UploadError(429, 'One image processor at a time');
    this.authorizeWebsite(website); validateEnvelope(bytes, filename, mime);
    const id = randomUUID();
    return this.run(this.insertJob(website, id, id, 1, filename, mime, bytes), bytes);
  }
  async uploadVersion(website: string, assetId: string, expectedMetadataVersion: number, expectedFileVersion: number,
    bytes: Buffer, filename: string, mime: string) {
    if (this.busy) throw new UploadError(429, 'One image processor at a time');
    this.authorizeWebsite(website); validateEnvelope(bytes, filename, mime);
    if (![expectedMetadataVersion, expectedFileVersion].every(value => Number.isSafeInteger(value) && value > 0)) throw new UploadError(400, 'Explicit positive metadata and latest file versions required');
    const job = this.db.transaction(() => {
      const asset = this.db.prepare('SELECT metadata_version,archived FROM assets WHERE website=? AND id=?').get(website, assetId) as { metadata_version: number; archived: number } | undefined;
      if (!asset) throw new UploadError(404, 'Asset not found for website');
      if (asset.archived) throw new UploadError(409, 'Archived asset cannot receive a new version');
      const latest = this.db.prepare('SELECT MAX(version) AS version FROM files WHERE website=? AND asset=?').get(website, assetId) as { version: number | null };
      if (asset.metadata_version !== expectedMetadataVersion || latest.version !== expectedFileVersion) throw new UploadError(409, 'Asset or latest file version conflict');
      if (this.db.prepare("SELECT 1 FROM upload_jobs WHERE website=? AND asset=? AND state='processing'").get(website, assetId)) throw new UploadError(409, 'An asset version is already processing');
      const version = expectedFileVersion + 1;
      this.db.prepare("INSERT INTO files VALUES(?,?,?,'processing','[]')").run(website, assetId, version);
      this.db.prepare('UPDATE assets SET metadata_version=metadata_version+1 WHERE website=? AND id=?').run(website, assetId);
      return this.insertJob(website, randomUUID(), assetId, version, filename, mime, bytes);
    }).immediate();
    return this.run(job, bytes);
  }
  private async run(job: Job, bytes: Buffer) {
    this.busy = true;
    try {
      try {
        const paths = this.paths(job); mkdirSync(paths.privateDir, { recursive: true });
        writeFileSync(paths.original, bytes, { flag: 'wx', flush: true });
        await this.process(job, true);
      } catch (error) {
        if (this.job(job.website, job.id).state === 'processing') this.fail(job, error);
        throw new UploadError(error instanceof UploadError ? error.statusCode : 422, this.job(job.website, job.id).error ?? 'Local upload failed', job.asset ?? job.id, job.file_version, job.id);
      }
      return this.status(job.website, job.id);
    } finally { this.busy = false; }
  }
  private claim(job: Job, fresh: boolean) {
    return this.db.transaction(() => {
      const current = this.job(job.website, job.id);
      if (current.state !== 'processing') return undefined;
      if (current.owner_pid !== null && (!Number.isSafeInteger(current.owner_pid) || current.owner_pid < 1)) throw new UploadError(409, 'Invalid upload owner PID');
      if (current.owner_pid !== null && live(current.owner_pid) && !(fresh && current.owner_pid === process.pid)) return undefined;
      if (current.attempts >= MAX_UPLOAD_ATTEMPTS) {
        this.fail(current, new UploadError(409, 'Retry limit reached'));
        return undefined;
      }
      this.db.prepare('UPDATE upload_jobs SET owner_pid=?,attempts=attempts+1 WHERE id=?').run(process.pid, current.id);
      return this.job(job.website, job.id);
    }).immediate();
  }
  private async process(input: Job, fresh = false) {
    const job = this.claim(input, fresh);
    if (!job) return;
    const assetId = job.asset ?? job.id;
    try {
      if (this.isReady(job)) throw new UploadError(409, 'A ready file version cannot be overwritten');
      const paths = this.paths(job);
      if (!lstatSync(paths.original).isFile() || lstatSync(paths.original).isSymbolicLink()) throw new UploadError(409, 'Unsafe private source');
      const source = readFileSync(paths.original), sourceHash = checksum(source);
      if (job.source_checksum && sourceHash !== job.source_checksum) throw new UploadError(409, 'Private source checksum mismatch');
      if (!job.source_checksum) this.db.prepare('UPDATE upload_jobs SET source_checksum=? WHERE id=?').run(sourceHash, job.id);
      this.removeDirectory(paths.staging); mkdirSync(paths.staging, { recursive: true });
      const encoded = await processImage(source, job.filename, job.mime);
      this.paths(job);
      const variants: PublicVariant[] = [];
      for (const variant of encoded) {
        const name = `${variant.width}.${variant.extension}`;
        writeFileSync(join(paths.staging, name), variant.bytes, { flag: 'wx' });
        variants.push({ path: `public/${job.website}/${assetId}/${job.file_version}/${name}`, mime: variant.mime,
          bytes: variant.bytes.length, width: variant.width, height: variant.height, checksum: checksum(variant.bytes) });
      }
      mkdirSync(dirname(paths.publicDir), { recursive: true });
      this.removeDirectory(paths.publicDir); renameSync(paths.staging, paths.publicDir);
      this.db.transaction(() => {
        if (job.file_version === 1) {
          this.db.prepare("INSERT INTO assets(website,id,rights) VALUES(?,?,'unknown')").run(job.website, assetId);
          this.db.prepare("INSERT INTO files VALUES(?,?,1,'ready',?)").run(job.website, assetId, JSON.stringify(variants));
        } else {
          this.db.prepare("UPDATE files SET state='ready',variants=? WHERE website=? AND asset=? AND version=? AND state<>'ready'").run(JSON.stringify(variants), job.website, assetId, job.file_version);
          this.rights.invalidateForNewVersion(job.website, assetId, job.file_version, job.id);
        }
        this.db.prepare("UPDATE upload_jobs SET state='ready',owner_pid=NULL,error=NULL WHERE id=?").run(job.id);
      }).immediate();
    } catch (error) {
      this.fail(job, error);
      throw new UploadError(error instanceof UploadError ? error.statusCode : 422,
        this.job(job.website, job.id).error ?? 'Local processing failed', assetId, job.file_version, job.id);
    }
  }
  private isReady(job: Job) {
    return Boolean(this.db.prepare("SELECT 1 FROM files WHERE website=? AND asset=? AND version=? AND state='ready'").get(job.website, job.asset ?? job.id, job.file_version));
  }
  private fail(job: Job, error: unknown) {
    let cleanupFailed = false;
    if (!this.isReady(job)) {
      try { const paths = this.paths(job); for (const path of [paths.staging, paths.publicDir]) {
        try { this.removeDirectory(path); } catch { cleanupFailed = true; }
      } } catch { cleanupFailed = true; }
    }
    const originalMessage = error instanceof UploadError ? error.message : 'Local processing failed';
    const message = cleanupFailed ? `${originalMessage}; cleanup incomplete, temporary files retained` : originalMessage;
    this.db.transaction(() => {
      this.db.prepare("UPDATE files SET state='failed',variants='[]' WHERE website=? AND asset=? AND version=? AND state<>'ready'").run(job.website, job.asset ?? job.id, job.file_version);
      this.db.prepare("UPDATE upload_jobs SET state='failed',owner_pid=NULL,error=? WHERE id=?").run(message, job.id);
    }).immediate();
  }
  async recover() {
    if (this.busy) throw new UploadError(429, 'One image processor at a time');
    this.busy = true;
    try {
      const jobs = this.db.prepare("SELECT * FROM upload_jobs WHERE state='processing' ORDER BY rowid").all() as Job[];
      for (const job of jobs) { try { await this.process(job); } catch {
        if (this.job(job.website, job.id).state !== 'failed') throw new UploadError(500, 'Recovery could not persist failed status');
      } }
    } finally { this.busy = false; }
  }
  async retryFailed(website: string, id: string) {
    if (this.busy) throw new UploadError(429, 'One image processor at a time');
    const job = this.db.transaction(() => {
      const current = this.job(website, id);
      if (current.state !== 'failed' || current.attempts >= MAX_UPLOAD_ATTEMPTS || this.isReady(current)) throw new UploadError(409, 'Only an unready failed upload below the retry limit can be retried');
      const assetId = current.asset ?? current.id;
      if (this.db.prepare("SELECT 1 FROM upload_jobs WHERE website=? AND COALESCE(asset,id)=? AND state='processing' AND id<>?").get(website, assetId, id)) throw new UploadError(409, 'An asset version is already processing');
      this.db.prepare("UPDATE files SET state='processing' WHERE website=? AND asset=? AND version=? AND state<>'ready'").run(website, assetId, current.file_version);
      this.db.prepare("UPDATE upload_jobs SET state='processing',owner_pid=?,error=NULL WHERE id=?").run(process.pid, id);
      return this.job(website, id);
    }).immediate();
    this.busy = true;
    try { await this.process(job, true); return this.status(website, id); }
    finally { this.busy = false; }
  }
}
