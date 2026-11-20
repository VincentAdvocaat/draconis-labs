import type Database from 'better-sqlite3';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import { FIXTURE_WEBSITES } from '../../media-fixture/fixture.js';
import { checksum } from '../../media-fixture/storage.js';
import { MAX_UPLOAD_ATTEMPTS } from '../../media-upload/schema.js';
import { validateEnvelope } from '../../media-upload/processor.js';

export const recoveryUploadSchema = z.union([z.literal(0), z.literal(1)]);
const legacyColumns = ['id', 'website', 'filename', 'mime', 'state', 'error'];
const newColumns = ['asset', 'file_version', 'attempts', 'owner_pid', 'source_checksum'];
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);

/** Read-only and migration-free, including genuine six-column pre-version jobs. */
export function checkRecoveryUpload(db: Database.Database, mediaRoot: string): 0 | 1 {
  const hasSchema = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='media_upload_schema'").get());
  const schema = hasSchema ? db.prepare('SELECT version FROM media_upload_schema').all() as { version: number }[] : [];
  if (hasSchema && (schema.length !== 1 || schema[0].version !== 1)) throw new Error('Unsupported upload schema');
  const version = hasSchema ? 1 : 0;
  const columns = (db.pragma('table_info(upload_jobs)') as { name: string }[]).map(column => column.name);
  const expected = version === 1 ? [...legacyColumns, ...newColumns] : legacyColumns;
  if (columns.length !== expected.length || expected.some(column => !columns.includes(column))) throw new Error('Upload schema shape mismatch');
  if (version === 1) {
    const index = (db.pragma('index_list(upload_jobs)') as { name: string; unique: number }[]).find(value => value.name === 'upload_job_file');
    const indexed = (db.pragma('index_info(upload_job_file)') as { name: string }[]).map(column => column.name);
    if (index?.unique !== 1 || JSON.stringify(indexed) !== JSON.stringify(['website', 'asset', 'file_version'])) throw new Error('Upload binding index missing');
  }
  const bindings = new Set<string>();
  for (const row of db.prepare('SELECT * FROM upload_jobs').all() as Record<string, unknown>[]) {
    z.string().uuid().parse(row.id); if (!FIXTURE_WEBSITES.includes(String(row.website))) throw new Error('Unknown upload website');
    z.string().min(1).max(200).parse(row.filename); z.enum(['image/png', 'image/jpeg', 'image/webp']).parse(row.mime);
    z.enum(['ready', 'failed']).parse(row.state); z.string().nullable().parse(row.error);
    const asset = version === 1 ? id.parse(row.asset) : String(row.id);
    const fileVersion = version === 1 ? z.number().int().positive().parse(row.file_version) : 1;
    const key = `${row.website}/${asset}/${fileVersion}`;
    if (bindings.has(key)) throw new Error('Duplicate upload asset/version binding'); bindings.add(key);
    if (version === 1) {
      z.number().int().min(0).max(MAX_UPLOAD_ATTEMPTS).parse(row.attempts);
      z.null().parse(row.owner_pid);
      z.string().regex(/^[a-f0-9]{64}$/).nullable().parse(row.source_checksum);
      if (fileVersion > 1 && !row.source_checksum) throw new Error('Version source checksum missing');
    }
    const assetExists = db.prepare('SELECT 1 FROM assets WHERE website=? AND id=?').get(row.website, asset);
    const file = db.prepare('SELECT state FROM files WHERE website=? AND asset=? AND version=?').get(row.website, asset, fileVersion) as { state: string } | undefined;
    // Existing M0 metadata purge deliberately leaves jobs and private bytes behind.
    // A fully removed asset is a tombstone, never a usable ready status (status returns404).
    if (assetExists && ((row.state === 'ready' && file?.state !== 'ready') || (row.state === 'failed' && fileVersion > 1 && file?.state !== 'failed')))
      throw new Error('Upload/file state binding mismatch');
    const source = fileVersion === 1 ? join(mediaRoot, 'private', String(row.website), asset, 'source')
      : join(mediaRoot, 'private', String(row.website), asset, String(fileVersion), 'source');
    if (!existsSync(source)) {
      if (row.state === 'ready') throw new Error('Ready upload source missing');
      continue; // Retain a failed missing-source diagnostic; retry still fails safely.
    }
    let ancestor = mediaRoot;
    for (const segment of relative(mediaRoot, source).split(sep)) {
      ancestor = join(ancestor, segment);
      if (lstatSync(ancestor).isSymbolicLink()) throw new Error('Unsafe upload source');
    }
    if (!lstatSync(source).isFile()) throw new Error('Invalid upload source');
    const bytes = readFileSync(source);
    if (row.source_checksum && checksum(bytes) !== row.source_checksum) throw new Error('Upload source checksum mismatch');
    validateEnvelope(bytes, String(row.filename), String(row.mime));
  }
  return version;
}
