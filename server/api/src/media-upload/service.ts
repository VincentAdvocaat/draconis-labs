import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { FIXTURE_WEBSITES } from '../media-fixture/fixture.js';
import { assertFixtureRoot } from '../media-fixture/safety.js';
import { checksum } from '../media-fixture/storage.js';
import type { PublicVariant } from '../media-fixture/contracts.js';
import { processImage, UploadError, validateEnvelope } from './processor.js';

interface Job { id: string; website: string; filename: string; mime: string; state: string; error: string | null }

/** One request/worker at a time; HTTP admission happens before body parsing. */
export class LocalUploadService {
  private busy = false;
  private readonly db: Database.Database;
  readonly root: string;
  constructor(root: string, private readonly removeDirectory: (path: string) => void =
    path => { rmSync(path, { recursive: true, force: true }); }) {
    this.root = assertFixtureRoot(root);
    this.db = new Database(join(this.root, 'media.sqlite'));
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`CREATE TABLE IF NOT EXISTS upload_jobs (
      id TEXT PRIMARY KEY, website TEXT NOT NULL, filename TEXT NOT NULL,
      mime TEXT NOT NULL, state TEXT NOT NULL, error TEXT
    )`);
  }
  close() { this.db.close(); }
  authorizeWebsite(website: string) {
    if (!FIXTURE_WEBSITES.includes(website)) throw new UploadError(403, 'Fixture website not allowed');
  }
  private paths(website: string, id: string) {
    this.authorizeWebsite(website);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new UploadError(400, 'Invalid generated asset ID');
    const privateDir = join(this.root, 'private', website, id);
    const publicDir = join(this.root, 'public', website, id, '1');
    // These are server-generated paths. Refuse existing symlink ancestors before file operations.
    for (const path of [join(this.root, 'private'), join(this.root, 'private', website), privateDir,
      join(this.root, 'public'), join(this.root, 'public', website), dirname(publicDir), publicDir]) {
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new UploadError(409, 'Unsafe fixture storage path');
    }
    return { privateDir, publicDir, original: join(privateDir, 'source'), staging: join(privateDir, 'staging') };
  }
  status(website: string, id: string) {
    this.authorizeWebsite(website);
    const job = this.db.prepare('SELECT * FROM upload_jobs WHERE id=? AND website=?').get(id, website) as Job | undefined;
    if (!job) throw new UploadError(404, 'Upload job not found');
    const file = this.db.prepare('SELECT variants FROM files WHERE website=? AND asset=? AND version=1')
      .get(website, id) as { variants: string } | undefined;
    if (job.state === 'ready' && !file) throw new UploadError(404, 'Upload asset metadata was purged');
    const asset = this.db.prepare('SELECT rights FROM assets WHERE website=? AND id=?').get(website, id) as { rights: string } | undefined;
    return { assetId: id, fileVersion: 1, state: job.state, error: job.error,
      rights: asset?.rights ?? 'unknown', variants: file ? JSON.parse(file.variants) as PublicVariant[] : [] };
  }
  async upload(website: string, bytes: Buffer, filename: string, mime: string) {
    if (this.busy) throw new UploadError(429, 'One image processor at a time');
    this.authorizeWebsite(website);
    validateEnvelope(bytes, filename, mime);
    this.busy = true;
    try {
    const id = randomUUID();
    const paths = this.paths(website, id);
    mkdirSync(paths.privateDir, { recursive: true });
    writeFileSync(paths.original, bytes, { flag: 'wx' });
    this.db.prepare("INSERT INTO upload_jobs VALUES(?,?,?,?,'processing',NULL)").run(id, website, filename, mime);
    try { await this.process({ id, website, filename, mime, state: 'processing', error: null }); }
    catch (error) {
      if (error instanceof UploadError) throw new UploadError(error.statusCode, error.message, id);
      throw error;
    }
    return this.status(website, id);
    } finally { this.busy = false; }
  }
  private async process(job: Job) {
    const paths = this.paths(job.website, job.id);
    try {
      this.removeDirectory(paths.staging);
      mkdirSync(paths.staging, { recursive: true });
      const encoded = await processImage(readFileSync(paths.original), job.filename, job.mime);
      const variants: PublicVariant[] = [];
      for (const variant of encoded) {
        const name = `${variant.width}.${variant.extension}`;
        writeFileSync(join(paths.staging, name), variant.bytes, { flag: 'wx' });
        variants.push({ path: `public/${job.website}/${job.id}/1/${name}`, mime: variant.mime,
          bytes: variant.bytes.length, width: variant.width, height: variant.height, checksum: checksum(variant.bytes) });
      }
      mkdirSync(dirname(paths.publicDir), { recursive: true });
      this.removeDirectory(paths.publicDir);
      renameSync(paths.staging, paths.publicDir);
      this.db.transaction(() => {
        this.db.prepare("INSERT INTO assets(website,id,rights) VALUES(?,?,'unknown')").run(job.website, job.id);
        this.db.prepare("INSERT INTO files VALUES(?,?,1,'ready',?)").run(job.website, job.id, JSON.stringify(variants));
        this.db.prepare("UPDATE upload_jobs SET state='ready',error=NULL WHERE id=?").run(job.id);
      })();
    } catch (error) {
      let cleanupFailed = false;
      for (const path of [paths.staging, paths.publicDir]) {
        try { this.removeDirectory(path); } catch { cleanupFailed = true; }
      }
      const originalMessage = error instanceof UploadError ? error.message : 'Local processing failed';
      const message = cleanupFailed ? `${originalMessage}; cleanup incomplete, temporary files retained` : originalMessage;
      this.db.prepare("UPDATE upload_jobs SET state='failed',error=? WHERE id=?").run(message, job.id);
      throw new UploadError(error instanceof UploadError ? error.statusCode : 422, message);
    }
  }
  async recover() {
    const jobs = this.db.prepare("SELECT * FROM upload_jobs WHERE state='processing' ORDER BY rowid").all() as Job[];
    for (const job of jobs) {
      try { await this.process(job); }
      catch {
        const status = this.db.prepare('SELECT state FROM upload_jobs WHERE id=?').get(job.id) as { state: string } | undefined;
        if (status?.state !== 'failed') throw new UploadError(500, 'Recovery could not persist a failed job; local intervention required');
        // A durable failed status, including incomplete cleanup, permits the next job to recover.
      }
    }
  }

  async retryFailed(website: string, id: string) {
    this.authorizeWebsite(website);
    if (this.busy) throw new UploadError(429, 'One image processor at a time');
    const job = this.db.prepare('SELECT * FROM upload_jobs WHERE website=? AND id=?').get(website, id) as Job | undefined;
    if (!job) throw new UploadError(404, 'Upload job not found');
    if (job.state !== 'failed') throw new UploadError(409, 'Only a failed upload can be retried');
    this.busy = true;
    try {
      this.db.prepare("UPDATE upload_jobs SET state='processing',error=NULL WHERE id=?").run(id);
      await this.process(job);
      return this.status(website, id);
    } finally { this.busy = false; }
  }
}
