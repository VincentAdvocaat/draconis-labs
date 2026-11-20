import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const siteSchema = z.enum(['demo-cms', 'demo-other']);
const selectionSchema = z.union([z.literal('active'), z.uuid()]);
const sourceManifestSchema = z.object({ schemaVersion: z.literal(1), websiteId: siteSchema,
  releaseId: z.uuid(), revisionId: z.uuid(), files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).passthrough();
export interface StaticExportInput { sourceRoot: string; websiteId: string; release: string; targetRoot: string }
export interface StaticExportHooks { afterFile?: (path: string) => void }

function temporary(path: string, prefix: string, existing: boolean) {
  const absolute = resolve(path);
  if (dirname(absolute) !== realpathSync(tmpdir()) || !basename(absolute).startsWith(prefix)) throw new Error('Explicit synthetic temporary path required');
  if (existing) {
    if (lstatSync(absolute).isSymbolicLink() || !lstatSync(absolute).isDirectory() || realpathSync(absolute) !== absolute) throw new Error('Unsafe source root');
  } else if (existsSync(absolute)) throw new Error('Export target already exists; overwrite is forbidden');
  return absolute;
}
function checkedPath(root: string, parts: string[]) {
  let path = root;
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) throw new Error('Unsafe release file');
  }
  return path;
}
const read = (root: string, parts: string[]) => readFileSync(checkedPath(root, parts));
function filename(name: string) {
  const parts = name.split('/');
  if (name.length > 500 || parts.some(part => !/^[a-zA-Z0-9_.-]+$/.test(part) || part === '.' || part === '..' || part.endsWith('.') || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) ||
    !/\.(?:html|css|js|png|jpe?g|webp)$/.test(name)) throw new Error('Unsupported public export path');
  return parts;
}
function closure(files: Map<string, Buffer>, basePath: string) {
  const origin = 'http://static.invalid';
  function link(page: string, value: string, resource: boolean) {
    value = value.replace(/&amp;/g, '&');
    if (!value) return;
    const url = new URL(value, origin + basePath + page);
    if (url.origin !== origin) {
      if (!resource && ['https:', 'mailto:'].includes(url.protocol)) return;
      throw new Error('External resource is outside the static export');
    }
    if (/%(?:2f|5c)/i.test(url.pathname)) throw new Error('Encoded path separator is forbidden');
    const path = decodeURIComponent(url.pathname);
    const name = path.slice(basePath.length);
    if (!path.startsWith(basePath) || !files.has(name)) throw new Error(`Missing static link target in ${page}`);
    if (url.hash && name.endsWith('.html')) {
      const id = decodeURIComponent(url.hash.slice(1));
      const ids = [...files.get(name)!.toString('utf8').matchAll(/\s(?:id|name)\s*=\s*(["'])(.*?)\1/gi)].map(match => match[2]);
      if (!ids.includes(id)) throw new Error(`Missing static fragment target in ${page}`);
    }
  }
  for (const [name, bytes] of files) {
    if (name.endsWith('.html')) {
      if (/<base\b/i.test(bytes.toString('utf8'))) throw new Error('HTML base tags are not supported');
      for (const tag of bytes.toString('utf8').matchAll(/<[^>]+>/g)) for (const match of tag[0].matchAll(/\s(href|src)\s*=\s*(["'])(.*?)\2/gi))
        link(name, match[3]!, match[1]!.toLowerCase() !== 'href' || !/^<a\b/i.test(tag[0]));
    } else if (name.endsWith('.css')) {
      for (const match of bytes.toString('utf8').matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) link(name, match[2]!, true);
      if (/@import\b/i.test(bytes.toString('utf8'))) throw new Error('CSS imports are not supported by this fixture exporter');
    }
  }
}

/** Copies an existing published artifact. No renderer, media store or migration is opened. */
export function exportStaticRelease(input: StaticExportInput, hooks: StaticExportHooks = {}) {
  const site = siteSchema.parse(input.websiteId), selection = selectionSchema.parse(input.release);
  const source = temporary(input.sourceRoot, 'draconis-cms-recovery-', true);
  const target = temporary(input.targetRoot, 'draconis-cms-export-', false);
  z.object({ version: z.literal(1), synthetic: z.literal(true), id: z.uuid() }).passthrough().parse(JSON.parse(read(source, ['.cms-recovery-fixture']).toString('utf8')));
  checkedPath(source, ['cms.db']);
  const db = new Database(join(source, 'cms.db'), { readonly: true, fileMustExist: true });
  let selected: { id: string; revision_id: string; status: string; website_id: string } | undefined;
  try {
    db.exec('BEGIN');
    const id = selection === 'active' ? (db.prepare('SELECT release_id FROM cms_active WHERE website_id=?').get(site) as { release_id: string } | undefined)?.release_id : selection;
    if (!id) throw new Error('No active published release');
    selected = db.prepare('SELECT id,revision_id,status,website_id FROM cms_attempts WHERE website_id=? AND id=?').get(site, id) as typeof selected;
    if (!selected || selected.status !== 'published') throw new Error('Unknown or unpublished release');
    z.uuid().parse(selected.id); z.uuid().parse(selected.revision_id);
  } finally { if (db.inTransaction) db.exec('ROLLBACK'); db.close(); }
  const prefix = ['releases', site, selected.id];
  const manifestBytes = read(source, [...prefix, 'release.json']);
  const manifest = sourceManifestSchema.parse(JSON.parse(manifestBytes.toString('utf8')));
  if (manifest.websiteId !== site || manifest.releaseId !== selected.id || manifest.revisionId !== selected.revision_id) throw new Error('Release manifest identity mismatch');
  const names = Object.keys(manifest.files);
  if (!names.length || names.length > 4096 || !names.some(name => name.endsWith('.html')) || new Set(names.map(name => name.toLowerCase())).size !== names.length) throw new Error('Invalid public file inventory');
  const files = new Map<string, Buffer>(); let size = 0;
  for (const name of names) {
    const bytes = read(source, [...prefix, ...filename(name)]);
    if (sha(bytes) !== manifest.files[name]) throw new Error('Published file hash mismatch');
    size += bytes.length; if (size > 256 * 1024 * 1024) throw new Error('Synthetic export exceeds 256 MiB');
    files.set(name, bytes);
  }
  const basePath = `/sites/${site}/`;
  closure(files, basePath);
  if (sha(read(source, [...prefix, 'release.json'])) !== sha(manifestBytes)) throw new Error('Release manifest changed during export');
  const publicManifest = { format: 'cms-static-export', schemaVersion: 1, complete: true,
    websiteId: site, releaseId: selected.id, revisionId: selected.revision_id, basePath,
    sourceManifestSha256: sha(manifestBytes), files: Object.fromEntries([...files].map(([name, bytes]) => [name, { sha256: sha(bytes), bytes: bytes.length }])) };
  // Only a complete directory is moved into the requested destination.
  const staging = mkdtempSync(join(realpathSync(tmpdir()), 'draconis-cms-export-stage-'));
  const owner = lstatSync(staging, { bigint: true });
  try {
    const siteRoot = join(staging, 'sites', site);
    for (const [name, bytes] of files) {
      const output = join(siteRoot, name); mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, bytes, { flag: 'wx', flush: true }); hooks.afterFile?.(name);
      if (sha(readFileSync(output)) !== manifest.files[name]) throw new Error('Export copy hash mismatch');
    }
    writeFileSync(join(staging, 'export-manifest.json'), JSON.stringify(publicManifest, null, 2), { flag: 'wx', flush: true });
    if (existsSync(target)) throw new Error('Export target appeared during copy; overwrite is forbidden');
    renameSync(staging, target);
    return { root: target, websiteId: site, releaseId: selected.id, basePath, files: files.size };
  } catch (error) {
    // Compare the directory identity, including on Windows; never delete a replacement.
    if (existsSync(staging)) {
      const current = lstatSync(staging, { bigint: true });
      if (!current.isSymbolicLink() && current.dev === owner.dev && current.ino === owner.ino && realpathSync(staging) === staging) rmSync(staging, { recursive: true });
    }
    throw error;
  }
}
