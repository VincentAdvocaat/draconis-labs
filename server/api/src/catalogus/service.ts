import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { FIXTURE_WEBSITES } from '../media-fixture/fixture.js';
import { assertFixtureRoot } from '../media-fixture/safety.js';
import { checksum, MediaFixtureStore } from '../media-fixture/storage.js';
import { MediaContractError } from '../media-fixture/contracts.js';
import { itemInputSchema, type CatalogItem, type CatalogRef, type CatalogSnapshot } from './contracts.js';
import { MediaRightsService } from '../media-upload/rights.js';

export class CatalogService {
  private readonly db: Database.Database;
  private readonly media: MediaFixtureStore;
  private readonly rights: MediaRightsService;
  private readonly root: string;
  constructor(root: string) {
    this.root = assertFixtureRoot(root);
    this.db = new Database(join(this.root, 'media.sqlite'));
    this.media = new MediaFixtureStore(this.root, FIXTURE_WEBSITES, this.db);
    this.rights = new MediaRightsService(this.root, this.db);
    this.db.transaction(() => {
      this.db.exec('CREATE TABLE IF NOT EXISTS catalog_schema(version INTEGER NOT NULL)');
      const version = this.db.prepare('SELECT version FROM catalog_schema').get() as { version: number } | undefined;
      if (version && version.version !== 1) throw new Error('Unsupported catalog schema version');
      if (!version) {
        this.db.exec(`
          CREATE TABLE catalog_collections(website TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0);
          CREATE TABLE catalog_items(website TEXT NOT NULL,id TEXT NOT NULL,slug TEXT NOT NULL,
            version INTEGER NOT NULL,revision TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(website,id),UNIQUE(website,slug));
          CREATE TABLE catalog_revisions(website TEXT NOT NULL,id TEXT NOT NULL,item TEXT NOT NULL,
            json TEXT NOT NULL,PRIMARY KEY(website,id));
          CREATE TABLE catalog_snapshots(website TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,
            PRIMARY KEY(website,id));
          INSERT INTO catalog_schema VALUES(1);
        `);
        for (const website of FIXTURE_WEBSITES) this.db.prepare('INSERT INTO catalog_collections(website) VALUES(?)').run(website);
      }
    })();
  }
  close() { this.rights.close(); this.media.close(); this.db.close(); }
  private authorize(website: string) {
    if (!FIXTURE_WEBSITES.includes(website)) throw new MediaContractError(403, 'Website access denied');
  }
  assets(website: string) {
    this.authorize(website);
    return this.db.prepare(`SELECT a.id AS assetId,a.metadata_version AS metadataVersion,a.rights,
      f.version AS fileVersion,f.state FROM assets a JOIN files f ON f.website=a.website AND f.asset=a.id
      WHERE a.website=? AND a.archived=0 ORDER BY a.id,f.version`).all(website);
  }
  setRights(website: string, assetId: string, input: unknown) {
    this.authorize(website);
    return this.rights.setRights(website, assetId, input);
  }
  list(website: string) {
    this.authorize(website);
    const row = this.db.prepare('SELECT version FROM catalog_collections WHERE website=?').get(website) as { version: number };
    const items = this.db.prepare(`SELECT r.json FROM catalog_items i JOIN catalog_revisions r
      ON i.website=r.website AND i.revision=r.id WHERE i.website=? AND i.archived=0 ORDER BY i.slug`)
      .all(website) as { json: string }[];
    return { websiteId: website, collectionId: 'portfolio' as const, version: row.version,
      category: { id: 'algemeen', name: 'Algemeen' }, items: items.map(r => JSON.parse(r.json) as CatalogItem) };
  }
  save(website: string, input: unknown) {
    this.authorize(website);
    const data = itemInputSchema.parse(input);
    return this.db.transaction(() => {
      const old = data.itemId ? this.db.prepare('SELECT version FROM catalog_items WHERE website=? AND id=?')
        .get(website, data.itemId) as { version: number } | undefined : undefined;
      if (data.itemId && !old) throw new MediaContractError(404, 'Item not found');
      if ((old?.version ?? 0) !== data.expectedVersion) throw new MediaContractError(409, 'Item version conflict');
      const id = data.itemId ?? randomUUID();
      const duplicate = this.db.prepare('SELECT id FROM catalog_items WHERE website=? AND slug=? AND id<>?').get(website, data.slug, id);
      if (duplicate) throw new MediaContractError(409, 'Slug already exists for website');
      const revisionId = randomUUID();
      const { expectedVersion, ...fields } = data;
      const item: CatalogItem = { ...fields, itemId: id, revisionId, version: expectedVersion + 1 };
      // Shared SQLite connection makes item revision and retained media references one transaction.
      this.media.saveReferences(website, { module: 'catalogus', ownerId: id,
        revisionId: `catalog-${revisionId}`, expectedVersion: 0, references: [item.media] });
      this.db.prepare('INSERT INTO catalog_revisions VALUES(?,?,?,?)').run(website, revisionId, id, JSON.stringify(item));
      this.db.prepare(`INSERT INTO catalog_items VALUES(?,?,?,?,?,0) ON CONFLICT(website,id)
        DO UPDATE SET slug=excluded.slug,version=excluded.version,revision=excluded.revision,archived=0`)
        .run(website, id, item.slug, item.version, revisionId);
      this.db.prepare('UPDATE catalog_collections SET version=version+1 WHERE website=?').run(website);
      return item;
    })();
  }
  archive(website: string, id: string, expectedVersion: number) {
    this.authorize(website);
    return this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE catalog_items SET archived=1,version=version+1
        WHERE website=? AND id=? AND version=? AND archived=0`).run(website, id, expectedVersion);
      if (!result.changes) throw new MediaContractError(409, 'Item not found or stale version');
      this.db.prepare('UPDATE catalog_collections SET version=version+1 WHERE website=?').run(website);
      // Historical revisions and all media usages remain retained.
    })();
  }
  publish(website: string, expectedCollectionVersion: number): CatalogSnapshot {
    this.authorize(website);
    return this.db.transaction(() => {
      const collection = this.list(website);
      if (collection.version !== expectedCollectionVersion) throw new MediaContractError(409, 'Collection version conflict');
      const snapshotId = randomUUID();
      const items = collection.items.map(item => {
        this.rights.requireApproval(website, item.media.assetId);
        const media = this.media.resolveRelease(website, { releaseId: `catalog-${snapshotId}-${item.itemId}`,
          revisionId: `catalog-${item.revisionId}`, locales: ['nl'] });
        return { ...item, resolvedMedia: media.references[0] };
      });
      const payload = { schemaVersion: 1 as const, websiteId: website, collectionId: 'portfolio' as const, snapshotId, items };
      const snapshot: CatalogSnapshot = { ...payload, checksum: checksum(Buffer.from(JSON.stringify(payload))) };
      this.db.prepare('INSERT INTO catalog_snapshots VALUES(?,?,?)').run(website, snapshotId, JSON.stringify(snapshot));
      return snapshot;
    })();
  }
  resolveSnapshot(ref: CatalogRef): CatalogSnapshot {
    this.authorize(ref.websiteId);
    if (ref.collectionId !== 'portfolio') throw new MediaContractError(404, 'Collection not found');
    const row = this.db.prepare('SELECT json FROM catalog_snapshots WHERE website=? AND id=?')
      .get(ref.websiteId, ref.snapshotId) as { json: string } | undefined;
    if (!row) throw new MediaContractError(404, 'Published snapshot not found');
    return JSON.parse(row.json) as CatalogSnapshot;
  }
  variant(ref: CatalogRef, itemId: string, variantIndex: number) {
    const item = this.resolveSnapshot(ref).items.find(i => i.itemId === itemId);
    const variant = Number.isSafeInteger(variantIndex) && variantIndex >= 0 ? item?.resolvedMedia.variants[variantIndex] : undefined;
    if (!variant) throw new MediaContractError(404, 'Snapshot image not found');
    return this.readVariant(variant);
  }
  preview(website: string, assetId: string, version: number) {
    this.authorize(website);
    const row = this.db.prepare("SELECT variants FROM files WHERE website=? AND asset=? AND version=? AND state='ready'")
      .get(website, assetId, version) as { variants: string } | undefined;
    if (!row) throw new MediaContractError(404, 'Ready image not found');
    const variant = (JSON.parse(row.variants) as CatalogSnapshot['items'][number]['resolvedMedia']['variants'])[0];
    if (!variant) throw new MediaContractError(404, 'Preview not found');
    return this.readVariant(variant);
  }
  private readVariant(variant: CatalogSnapshot['items'][number]['resolvedMedia']['variants'][number]) {
    const path = resolve(this.root, variant.path);
    const rel = relative(join(this.root, 'public'), path);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) throw new MediaContractError(409, 'Invalid public image path');
    let current = this.root;
    for (const segment of relative(this.root, path).split(sep)) {
      current = join(current, segment);
      if (!existsSync(current) || lstatSync(current).isSymbolicLink()) throw new MediaContractError(409, 'Snapshot image missing or unsafe');
    }
    const bytes = readFileSync(path);
    if (bytes.length !== variant.bytes || checksum(bytes) !== variant.checksum) throw new MediaContractError(409, 'Snapshot image changed');
    return { bytes, mime: variant.mime };
  }
}
