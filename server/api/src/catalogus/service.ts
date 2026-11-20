import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import Database from 'better-sqlite3';
import { CONTENT_LOCALES, contentLocaleSchema, type ContentLocale } from '@draconis/shared';
import { FIXTURE_WEBSITES } from '../media-fixture/fixture.js';
import { assertFixtureRoot } from '../media-fixture/safety.js';
import { checksum, MediaFixtureStore } from '../media-fixture/storage.js';
import { MediaContractError } from '../media-fixture/contracts.js';
import { itemInputSchema, localeVariantInputSchema, withdrawalSchema, type CatalogItem, type CatalogRef, type CatalogSnapshot } from './contracts.js';
import { MediaRightsService } from '../media-upload/rights.js';
import { CatalogLocales } from './locales.js';
import { MediaLibrary } from './library.js';
import { CatalogCategories } from './categories.js';
import { CatalogOrder } from './order.js';

export class CatalogService {
  private readonly db: Database.Database;
  private readonly media: MediaFixtureStore;
  private readonly rights: MediaRightsService;
  private readonly root: string;
  private readonly locales: CatalogLocales;
  private readonly categories: CatalogCategories;
  private readonly order: CatalogOrder;
  constructor(root: string) {
    this.root = assertFixtureRoot(root);
    this.db = new Database(join(this.root, 'media.sqlite'));
    try {
    this.media = new MediaFixtureStore(this.root, FIXTURE_WEBSITES, this.db);
    this.rights = new MediaRightsService(this.root, this.db);
    this.db.transaction(() => {
      this.db.exec('CREATE TABLE IF NOT EXISTS catalog_schema(version INTEGER NOT NULL)');
      const version = this.db.prepare('SELECT version FROM catalog_schema').get() as { version: number } | undefined;
      if (version && ![1, 2, 3, 4, 5].includes(version.version)) throw new Error('Unsupported catalog schema version');
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
      if (!version || version.version === 1) {
        this.db.exec(`
          ALTER TABLE catalog_snapshots ADD COLUMN status TEXT NOT NULL DEFAULT 'published';
          ALTER TABLE catalog_snapshots ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
          CREATE TABLE catalog_snapshot_audit(website TEXT NOT NULL,snapshot TEXT NOT NULL,version INTEGER NOT NULL,
            action TEXT NOT NULL,details TEXT NOT NULL,recorded_at TEXT NOT NULL,PRIMARY KEY(website,snapshot,version));
          INSERT INTO catalog_snapshot_audit SELECT website,id,1,'migrated-published','{}',
            strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM catalog_snapshots;
          UPDATE catalog_schema SET version=2;
        `);
      }
    })();
    this.locales = new CatalogLocales(this.db);
    this.categories = new CatalogCategories(this.db);
    this.order = new CatalogOrder(this.db);
    } catch (error) { this.db.close(); throw error; }
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
  library(website: string, input: unknown) {
    this.authorize(website);
    return new MediaLibrary(this.db).list(website, input);
  }
  listCategories(website: string) { this.authorize(website); return this.categories.list(website); }
  saveOrder(website: string, input: unknown) { this.authorize(website); return this.order.save(website, input); }
  saveCategory(website: string, id: string | undefined, input: unknown) { this.authorize(website); return this.categories.save(website, id, input); }
  archiveCategory(website: string, id: string, input: unknown) { this.authorize(website); return this.categories.archive(website, id, input); }
  removeCategory(website: string, id: string, input: unknown) { this.authorize(website); return this.categories.remove(website, id, input); }
  libraryDetail(website: string, assetId: string) {
    this.authorize(website);
    return new MediaLibrary(this.db).detail(website, assetId);
  }
  setRights(website: string, assetId: string, input: unknown) {
    this.authorize(website);
    return this.rights.setRights(website, assetId, input);
  }
  list(website: string) {
    this.authorize(website);
    const row = this.db.prepare('SELECT version FROM catalog_collections WHERE website=?').get(website) as { version: number };
    const items = this.db.prepare(`SELECT r.json FROM catalog_items i JOIN catalog_revisions r
      ON i.website=r.website AND i.revision=r.id WHERE i.website=? AND i.archived=0 ORDER BY i.position,i.id`)
      .all(website) as { json: string }[];
    return { websiteId: website, collectionId: 'portfolio' as const, version: row.version,
      defaultLocale: this.locales.defaultLocale(website), locales: CONTENT_LOCALES,
      category: { id: 'algemeen', name: this.categories.get(website, 'algemeen').labels.nl }, categories: this.categories.list(website), items: items.map(r => JSON.parse(r.json) as CatalogItem) };
  }
  save(website: string, input: unknown) {
    this.authorize(website);
    const data = itemInputSchema.parse(input);
    return this.db.transaction(() => {
      const old = data.itemId ? this.db.prepare(`SELECT i.version,r.json FROM catalog_items i JOIN catalog_revisions r
        ON i.website=r.website AND i.revision=r.id WHERE i.website=? AND i.id=?`)
        .get(website, data.itemId) as { version: number; json: string } | undefined : undefined;
      if (data.itemId && !old) throw new MediaContractError(404, 'Item not found');
      if ((old?.version ?? 0) !== data.expectedVersion) throw new MediaContractError(409, 'Item version conflict');
      this.categories.requireSelection(website, data.categoryId, old ? (JSON.parse(old.json) as CatalogItem).categoryId : undefined);
      const id = data.itemId ?? randomUUID();
      const duplicate = this.db.prepare('SELECT id FROM catalog_items WHERE website=? AND slug=? AND id<>?').get(website, data.slug, id);
      if (duplicate) throw new MediaContractError(409, 'Slug already exists for website');
      const revisionId = randomUUID();
      const { expectedVersion, ...fields } = data;
      const item = this.locales.writeRevision(website, old ? JSON.parse(old.json) as CatalogItem : undefined,
        { ...fields, itemId: id, revisionId, version: expectedVersion + 1 });
      this.commitRevision(website, item);
      return item;
    })();
  }
  private commitRevision(website: string, item: CatalogItem) {
    // Caller owns the outer transaction, including locale slugs, refs and revision writes.
    this.media.saveReferences(website, { module: 'catalogus', ownerId: item.itemId,
      revisionId: `catalog-${item.revisionId}`, expectedVersion: 0, references: [item.media] });
    this.db.prepare('INSERT INTO catalog_revisions VALUES(?,?,?,?)').run(website, item.revisionId, item.itemId, JSON.stringify(item));
    const position = this.order.positionForItem(website, item.itemId);
    this.db.prepare(`INSERT INTO catalog_items(website,id,slug,version,revision,archived,position) VALUES(?,?,?,?,?,0,?) ON CONFLICT(website,id)
      DO UPDATE SET slug=excluded.slug,version=excluded.version,revision=excluded.revision,archived=0,position=excluded.position`)
      .run(website, item.itemId, item.slug, item.version, item.revisionId, position);
    this.db.prepare('UPDATE catalog_collections SET version=version+1 WHERE website=?').run(website);
  }
  private currentItem(website: string, id: string) {
    const row = this.db.prepare(`SELECT i.version,r.json FROM catalog_items i JOIN catalog_revisions r
      ON i.website=r.website AND i.revision=r.id WHERE i.website=? AND i.id=? AND i.archived=0`)
      .get(website, id) as { version: number; json: string } | undefined;
    if (!row) throw new MediaContractError(404, 'Item not found');
    return { ...JSON.parse(row.json) as CatalogItem, version: row.version };
  }
  localeVariant(website: string, id: string, localeInput: unknown, fallbackInput?: unknown) {
    this.authorize(website);
    const locale = contentLocaleSchema.parse(localeInput);
    const fallbackLocale = fallbackInput === undefined ? undefined : contentLocaleSchema.parse(fallbackInput);
    return this.locales.diagnostics(website, this.currentItem(website, id), this.locales.context(website, { locale, fallbackLocale }));
  }
  saveLocaleVariant(website: string, id: string, localeInput: unknown, input: unknown) {
    this.authorize(website);
    const locale = contentLocaleSchema.parse(localeInput);
    if (locale === this.locales.defaultLocale(website)) throw new MediaContractError(400, 'Use the default item editor for the default locale');
    const data = localeVariantInputSchema.parse(input);
    return this.db.transaction(() => {
      const source = this.currentItem(website, id);
      if (source.version !== data.expectedVersion) throw new MediaContractError(409, 'Item version conflict');
      const item = this.locales.writeRevision(website, source, { ...source, revisionId: randomUUID(), version: source.version + 1 }, {
        locale, values: { title: data.title ?? null, slug: data.slug ?? null, description: data.description ?? null, alt: data.alt ?? null },
      });
      this.commitRevision(website, item);
      return this.localeVariant(website, id, locale);
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
  publish(website: string, expectedCollectionVersion: number, selection: { locale?: ContentLocale; fallbackLocale?: ContentLocale } = {}): CatalogSnapshot {
    this.authorize(website);
    return this.db.transaction(() => {
      const collection = this.list(website);
      if (collection.version !== expectedCollectionVersion) throw new MediaContractError(409, 'Collection version conflict');
      const localeContext = this.locales.context(website, selection);
      const snapshotId = randomUUID();
      const items = collection.items.map(item => {
        const localized = this.locales.publicationItem(website, item, localeContext);
        this.rights.requireApproval(website, item.media.assetId);
        const media = this.media.resolveRelease(website, { releaseId: `catalog-${snapshotId}-${item.itemId}`,
          revisionId: `catalog-${item.revisionId}`, locales: [localeContext.locale] });
        return { ...localized, resolvedMedia: media.references[0] };
      });
      const categories = this.categories.publication(website, items.map(item => item.categoryId), localeContext);
      const payload = { schemaVersion: 3 as const, websiteId: website, collectionId: 'portfolio' as const, snapshotId, localeContext, categories, items };
      const snapshot: CatalogSnapshot = { ...payload, checksum: checksum(Buffer.from(JSON.stringify(payload))) };
      this.db.prepare('INSERT INTO catalog_snapshots(website,id,json) VALUES(?,?,?)').run(website, snapshotId, JSON.stringify(snapshot));
      this.db.prepare('INSERT INTO catalog_snapshot_audit VALUES(?,?,1,?,?,?)')
        .run(website, snapshotId, 'published', JSON.stringify({ checksum: snapshot.checksum }), new Date().toISOString());
      return snapshot;
    })();
  }
  resolveSnapshot(ref: CatalogRef): CatalogSnapshot {
    this.authorize(ref.websiteId);
    if (ref.collectionId !== 'portfolio') throw new MediaContractError(404, 'Collection not found');
    const row = this.db.prepare("SELECT json FROM catalog_snapshots WHERE website=? AND id=? AND status='published'")
      .get(ref.websiteId, ref.snapshotId) as { json: string } | undefined;
    if (!row) throw new MediaContractError(404, 'Published snapshot not found');
    return JSON.parse(row.json) as CatalogSnapshot;
  }
  listSnapshots(website: string) {
    this.authorize(website);
    const rows = this.db.prepare('SELECT id,status,version,json FROM catalog_snapshots WHERE website=? ORDER BY rowid DESC')
      .all(website) as { id: string; status: string; version: number; json: string }[];
    return rows.map(row => {
      const snapshot = JSON.parse(row.json) as CatalogSnapshot;
      return { snapshotId: row.id, status: row.status, version: row.version,
        checksum: snapshot.checksum, itemCount: snapshot.items.length, locale: snapshot.localeContext?.locale ?? 'nl' };
    });
  }
  withdraw(website: string, id: string, input: unknown) {
    this.authorize(website);
    const decision = withdrawalSchema.parse(input);
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT version,status FROM catalog_snapshots WHERE website=? AND id=?')
        .get(website, id) as { version: number; status: string } | undefined;
      if (!row) throw new MediaContractError(404, 'Snapshot not found for website');
      if (row.version !== decision.expectedVersion || row.status !== 'published')
        throw new MediaContractError(409, 'Snapshot version or status conflict');
      const version = row.version + 1;
      this.db.prepare("UPDATE catalog_snapshots SET status='withdrawn',version=? WHERE website=? AND id=? AND version=?")
        .run(version, website, id, row.version);
      this.db.prepare('INSERT INTO catalog_snapshot_audit VALUES(?,?,?,?,?,?)')
        .run(website, id, version, 'withdrawn', JSON.stringify(decision), new Date().toISOString());
      return { snapshotId: id, status: 'withdrawn', version };
    })();
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
