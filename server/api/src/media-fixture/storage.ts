import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { assertFixtureRoot } from './safety.js';
import {
  MediaContractError, resolveReleaseSchema, saveReferencesSchema,
  type MediaReference, type PublicVariant, type ReleaseManifest,
  type ResolveRelease, type SaveReferences,
} from './contracts.js';

export const checksum = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

/** This adapter is deliberately fixture-only. No application database import. */
export class MediaFixtureStore {
  private readonly db: Database.Database;
  private readonly root: string;
  private readonly websites: ReadonlySet<string>;

  constructor(root: string, websites: string[]) {
    this.root = assertFixtureRoot(root);
    this.websites = new Set(websites);
    this.db = new Database(resolve(this.root, 'media.sqlite'));
    this.db.pragma('foreign_keys = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        website TEXT NOT NULL, id TEXT NOT NULL, metadata_version INTEGER NOT NULL DEFAULT 1,
        archived INTEGER NOT NULL DEFAULT 0, rights TEXT NOT NULL, expires_at TEXT,
        PRIMARY KEY(website, id)
      );
      CREATE TABLE IF NOT EXISTS files (
        website TEXT NOT NULL, asset TEXT NOT NULL, version INTEGER NOT NULL,
        state TEXT NOT NULL, variants TEXT NOT NULL,
        PRIMARY KEY(website, asset, version),
        FOREIGN KEY(website, asset) REFERENCES assets(website, id)
      );
      CREATE TABLE IF NOT EXISTS revisions (
        website TEXT NOT NULL, id TEXT NOT NULL, module TEXT NOT NULL, owner TEXT NOT NULL,
        version INTEGER NOT NULL, refs TEXT NOT NULL, PRIMARY KEY(website, id)
      );
      CREATE TABLE IF NOT EXISTS releases (
        website TEXT NOT NULL, id TEXT NOT NULL, request TEXT NOT NULL, manifest TEXT NOT NULL,
        PRIMARY KEY(website, id)
      );
      CREATE TABLE IF NOT EXISTS usages (
        website TEXT NOT NULL, kind TEXT NOT NULL, owner TEXT NOT NULL,
        asset TEXT NOT NULL, file_version INTEGER NOT NULL, slot TEXT NOT NULL,
        PRIMARY KEY(website, kind, owner, slot),
        FOREIGN KEY(website, asset, file_version) REFERENCES files(website, asset, version)
      );
    `);
  }

  close() { this.db.close(); }

  private authorize(website: string) {
    if (!this.websites.has(website)) throw new MediaContractError(403, 'Website access denied');
  }

  private asset(website: string, id: string) {
    const row = this.db.prepare('SELECT * FROM assets WHERE website=? AND id=?').get(website, id) as
      { id: string; metadata_version: number; archived: number; rights: string; expires_at: string | null } | undefined;
    if (!row) throw new MediaContractError(404, 'Asset not found for website');
    return row;
  }

  list(website: string, query = '', offset = 0, limit = 100) {
    this.authorize(website);
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new MediaContractError(400, 'Invalid pagination');
    return this.db.prepare(`SELECT id AS assetId, metadata_version AS metadataVersion, rights
      FROM assets WHERE website=? AND archived=0 AND instr(lower(id),lower(?))>0 ORDER BY id LIMIT ? OFFSET ?`)
      .all(website, query, limit, offset);
  }

  select(website: string, assetId: string) {
    this.authorize(website);
    const asset = this.asset(website, assetId);
    if (asset.archived) throw new MediaContractError(409, 'Archived asset cannot be selected');
    return { assetId, metadataVersion: asset.metadata_version, rights: asset.rights };
  }

  private variants(website: string, ref: MediaReference): PublicVariant[] {
    const file = this.db.prepare('SELECT state, variants FROM files WHERE website=? AND asset=? AND version=?')
      .get(website, ref.assetId, ref.fileVersion) as { state: string; variants: string } | undefined;
    if (!file) throw new MediaContractError(404, `Missing fileVersion for ${ref.usage}`);
    if (file.state !== 'ready') throw new MediaContractError(409, `File not ready for ${ref.usage}`);
    const asset = this.asset(website, ref.assetId);
    if (asset.rights !== 'cleared' || (asset.expires_at &&
      (!Number.isFinite(Date.parse(asset.expires_at)) || Date.parse(asset.expires_at) <= Date.now())))
      throw new MediaContractError(409, `Rights not cleared for ${ref.usage}`);
    return JSON.parse(file.variants) as PublicVariant[];
  }

  private register(website: string, kind: string, owner: string, refs: MediaReference[]) {
    this.db.prepare('DELETE FROM usages WHERE website=? AND kind=? AND owner=?').run(website, kind, owner);
    const insert = this.db.prepare('INSERT INTO usages VALUES(?,?,?,?,?,?)');
    for (const ref of refs) insert.run(website, kind, owner, ref.assetId, ref.fileVersion, ref.usage);
  }

  saveReferences(website: string, input: SaveReferences) {
    this.authorize(website);
    const request = saveReferencesSchema.parse(input);
    if (new Set(request.references.map(r => r.usage)).size !== request.references.length)
      throw new MediaContractError(400, 'Duplicate usage slot');
    return this.db.transaction(() => {
      const old = this.db.prepare('SELECT * FROM revisions WHERE website=? AND id=?').get(website, request.revisionId) as
        { version: number; refs: string; module: string; owner: string } | undefined;
      if ((old?.version ?? 0) !== request.expectedVersion ||
          (old && (old.module !== request.module || old.owner !== request.ownerId)))
        throw new MediaContractError(409, 'Revision conflict');
      const previous = old ? JSON.parse(old.refs) as MediaReference[] : [];
      for (const ref of request.references) {
        const asset = this.asset(website, ref.assetId);
        const file = this.db.prepare('SELECT 1 FROM files WHERE website=? AND asset=? AND version=?')
          .get(website, ref.assetId, ref.fileVersion);
        if (!file) throw new MediaContractError(404, `Missing fileVersion for ${ref.usage}`);
        if (asset.archived && !previous.some(r => r.assetId === ref.assetId && r.fileVersion === ref.fileVersion && r.usage === ref.usage))
          throw new MediaContractError(409, 'Archived asset cannot be newly referenced');
      }
      const version = request.expectedVersion + 1;
      this.db.prepare(`INSERT INTO revisions VALUES(?,?,?,?,?,?) ON CONFLICT(website,id)
        DO UPDATE SET version=excluded.version,refs=excluded.refs`)
        .run(website, request.revisionId, request.module, request.ownerId, version, JSON.stringify(request.references));
      this.register(website, 'revision', request.revisionId, request.references);
      return { version, references: request.references };
    })();
  }

  private verifyVariant(variant: PublicVariant) {
    const path = resolve(this.root, variant.path);
    const rel = relative(this.root, path);
    const publicRelative = relative(resolve(this.root, 'public'), path);
    if (!variant.path.startsWith('public/') || !publicRelative || isAbsolute(publicRelative) ||
        publicRelative === '..' || publicRelative.startsWith(`..${sep}`))
      throw new MediaContractError(409, 'Invalid public variant path');
    // Reject symlink components, including the file, before opening fixture bytes.
    let current = this.root;
    for (const segment of rel.split(sep)) {
      current = resolve(current, segment);
      if (!existsSync(current) || lstatSync(current).isSymbolicLink())
        throw new MediaContractError(409, 'Missing or unsafe public variant');
    }
    const bytes = readFileSync(path);
    if (bytes.length !== variant.bytes || checksum(bytes) !== variant.checksum)
      throw new MediaContractError(409, 'Public variant checksum mismatch');
  }

  resolveRelease(website: string, input: ResolveRelease): ReleaseManifest {
    this.authorize(website);
    const request = resolveReleaseSchema.parse(input);
    return this.db.transaction(() => {
      const existing = this.db.prepare('SELECT request,manifest FROM releases WHERE website=? AND id=?')
        .get(website, request.releaseId) as { request: string; manifest: string } | undefined;
      if (existing && existing.request !== JSON.stringify(request))
        throw new MediaContractError(409, 'Release ID already pinned to another request');
      const revision = this.db.prepare('SELECT refs FROM revisions WHERE website=? AND id=?')
        .get(website, request.revisionId) as { refs: string } | undefined;
      if (!revision) throw new MediaContractError(404, 'Revision not found');
      const refs: Array<MediaReference & { variants?: PublicVariant[] }> = existing
        ? (JSON.parse(existing.manifest) as ReleaseManifest).references : JSON.parse(revision.refs) as MediaReference[];
      const references = refs.map(ref => {
        const currentVariants = this.variants(website, ref);
        const variants = ref.variants ?? currentVariants;
        if (JSON.stringify(variants) !== JSON.stringify(currentVariants))
          throw new MediaContractError(409, 'Pinned fileVersion has changed');
        if (!variants.length) throw new MediaContractError(409, `No public variants for ${ref.usage}`);
        for (const locale of request.locales) {
          const alt = ref.altText[locale];
          if (ref.decorative ? Boolean(alt?.trim()) : !alt?.trim())
            throw new MediaContractError(409, `Invalid alt for ${ref.usage}/${locale}`);
        }
        for (const variant of variants) this.verifyVariant(variant);
        // Copy only the public contract, never storage records or private source paths.
        return { assetId: ref.assetId, fileVersion: ref.fileVersion, usage: ref.usage,
          altText: ref.altText, decorative: ref.decorative, variants };
      });
      const manifest: ReleaseManifest = existing ? JSON.parse(existing.manifest) as ReleaseManifest : {
        schemaVersion: 1, websiteId: website, releaseId: request.releaseId,
        revisionId: request.revisionId, locales: request.locales, references,
      };
      if (!existing) {
        this.db.prepare('INSERT INTO releases VALUES(?,?,?,?)')
          .run(website, request.releaseId, JSON.stringify(request), JSON.stringify(manifest));
        this.register(website, 'release', request.releaseId, references);
      }
      return manifest;
    })();
  }

  usages(website: string, assetId: string) {
    this.authorize(website);
    this.asset(website, assetId);
    return this.db.prepare(`SELECT kind,owner,file_version AS fileVersion,slot FROM usages
      WHERE website=? AND asset=? ORDER BY kind,owner,slot`).all(website, assetId);
  }

  archive(website: string, assetId: string, expectedMetadataVersion: number) {
    this.authorize(website);
    this.asset(website, assetId);
    const result = this.db.prepare(`UPDATE assets SET archived=1,metadata_version=metadata_version+1
      WHERE website=? AND id=? AND metadata_version=?`).run(website, assetId, expectedMetadataVersion);
    if (!result.changes) throw new MediaContractError(409, 'Metadata conflict');
    return { metadataVersion: expectedMetadataVersion + 1 };
  }

  /** Metadata purge only in M0. No public endpoint, no recursive filesystem deletion. */
  purge(website: string, assetId: string, expectedMetadataVersion: number, explicit: boolean) {
    this.authorize(website);
    if (explicit !== true) throw new MediaContractError(400, 'Explicit purge action required');
    return this.db.transaction(() => {
      const asset = this.asset(website, assetId);
      if (asset.metadata_version !== expectedMetadataVersion) throw new MediaContractError(409, 'Metadata conflict');
      if (this.usages(website, assetId).length) throw new MediaContractError(409, 'Asset retained by revision or release');
      this.db.prepare('DELETE FROM files WHERE website=? AND asset=?').run(website, assetId);
      this.db.prepare('DELETE FROM assets WHERE website=? AND id=?').run(website, assetId);
      return { purgedMetadata: true, filesRetainedUntilFixtureCleanup: true };
    })();
  }
}
