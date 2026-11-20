import type Database from 'better-sqlite3';

export const MAX_UPLOAD_ATTEMPTS = 5;

/** Independent upload migration; catalogue and CMS schema versions stay unchanged. */
export function ensureUploadSchema(db: Database.Database) {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_upload_schema'").get()) {
    const rows = db.prepare('SELECT version FROM media_upload_schema').all() as { version: number }[];
    if (rows.length !== 1 || rows[0].version !== 1) throw new Error('Unsupported media upload schema');
    return;
  }
  db.transaction(() => {
    db.exec(`CREATE TABLE IF NOT EXISTS upload_jobs(id TEXT PRIMARY KEY,website TEXT NOT NULL,filename TEXT NOT NULL,
      mime TEXT NOT NULL,state TEXT NOT NULL,error TEXT);
      CREATE TABLE IF NOT EXISTS media_upload_schema(version INTEGER NOT NULL);`);
    const schema = db.prepare('SELECT version FROM media_upload_schema').all() as { version: number }[];
    if (schema.length) {
      if (schema.length !== 1 || schema[0].version !== 1) throw new Error('Unsupported media upload schema');
      return;
    }
    db.exec(`ALTER TABLE upload_jobs ADD COLUMN asset TEXT;
      ALTER TABLE upload_jobs ADD COLUMN file_version INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE upload_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE upload_jobs ADD COLUMN owner_pid INTEGER;
      ALTER TABLE upload_jobs ADD COLUMN source_checksum TEXT;
      UPDATE upload_jobs SET asset=id;
      CREATE UNIQUE INDEX upload_job_file ON upload_jobs(website,asset,file_version);
      INSERT INTO media_upload_schema VALUES(1);`);
  }).immediate();
}
