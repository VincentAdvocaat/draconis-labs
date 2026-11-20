import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { contentLocaleContextSchema } from '@draconis/shared';
import { catalogConsumerRequestSchema } from '../../catalogus/consumer.js';
import type { CatalogSnapshot } from '../../catalogus/contracts.js';
import type { SiteSnapshot } from './documents.js';

export const recoveryCatalogSchema = z.union([z.literal(3), z.literal(4), z.literal(5)]);
type Version = z.infer<typeof recoveryCatalogSchema>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const positive = z.number().int().positive();
const categoryLabels = z.object({ nl: z.string().trim().min(1).max(200), en: z.string().max(200).nullable() }).strict();
const requiredColumns: Record<string, string[]> = {
  assets: ['website', 'id', 'metadata_version', 'rights'], files: ['website', 'asset', 'version', 'variants'],
  revisions: ['website', 'id', 'refs'], releases: ['website', 'id', 'request', 'manifest'], usages: ['website', 'kind', 'owner', 'asset', 'file_version', 'slot'],
  upload_jobs: ['id', 'state'], media_rights_audit: ['website', 'asset', 'version', 'decision'],
  catalog_schema: ['version'], catalog_collections: ['website', 'version', 'default_locale'],
  catalog_items: ['website', 'id', 'slug', 'version', 'revision', 'archived'], catalog_revisions: ['website', 'id', 'item', 'json'],
  catalog_snapshots: ['website', 'id', 'json', 'status', 'version'], catalog_snapshot_audit: ['website', 'snapshot', 'version'],
  catalog_locale_values: ['website', 'revision', 'locale', 'title', 'slug', 'description', 'alt'],
  catalog_locale_slugs: ['website', 'collection', 'locale', 'slug', 'item'],
  catalog_consumer_pins: ['id', 'website', 'owner_key', 'snapshot_id', 'request', 'snapshot', 'state', 'version', 'activation_id'],
  catalog_consumer_pin_events: ['pin', 'version', 'action', 'details'],
};

/** Read-only validation. Never construct CatalogService here: its constructor migrates. */
export function checkRecoveryCatalog(db: Database.Database): Version {
  const versions = db.prepare('SELECT version FROM catalog_schema').all() as Array<{ version: number }>;
  if (versions.length !== 1) throw new Error('Unsupported catalog schema');
  const version = recoveryCatalogSchema.parse(versions[0]!.version);
  const tables = { ...requiredColumns, ...(version >= 4 ? { catalog_categories: ['website', 'id', 'version', 'archived', 'labels'] } : {}) };
  for (const [table, columns] of Object.entries(tables)) {
    const actual = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
    if (columns.some(column => !actual.some(value => value.name === column))) throw new Error(`Unsupported catalog table shape: ${table}`);
  }
  const itemColumns = db.pragma('table_info(catalog_items)') as Array<{ name: string; notnull: number; type: string }>;
  const position = itemColumns.find(column => column.name === 'position');
  if ((version === 5 && (!position || position.notnull !== 1 || position.type !== 'INTEGER')) || (version < 5 && position)) throw new Error('Catalog order schema mismatch');
  if (version === 3 && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='catalog_categories'").get()) throw new Error('Catalog category schema mismatch');
  const categories = new Set<string>();
  if (version >= 4) {
    for (const row of db.prepare('SELECT * FROM catalog_categories').all() as Array<{ website: string; id: string; version: number; archived: number; labels: string }>) {
      positive.parse(row.version); z.union([z.literal(0), z.literal(1)]).parse(row.archived); categoryLabels.parse(JSON.parse(row.labels));
      categories.add(row.website + '/' + row.id);
    }
    if (db.prepare(`SELECT 1 FROM catalog_collections c WHERE NOT EXISTS (
      SELECT 1 FROM catalog_categories k WHERE k.website=c.website AND k.id='algemeen' AND k.archived=0
    ) LIMIT 1`).get()) throw new Error('Active catalog system category is missing');
  }
  const category = (website: string, id: string) => {
    if (version >= 4 && !categories.has(website + '/' + id)) throw new Error('Retained catalog category is missing');
  };
  const revisions = new Set<string>();
  for (const row of db.prepare('SELECT * FROM catalog_revisions').all() as Array<{ website: string; id: string; item: string; json: string }>) {
    const value = JSON.parse(row.json) as { categoryId: string; itemId: string; revisionId: string };
    if (value.itemId !== row.item || value.revisionId !== row.id) throw new Error('Catalog revision identity mismatch');
    category(row.website, value.categoryId); revisions.add(row.website + '/' + row.item + '/' + row.id);
  }
  const activePositions = new Set<string>();
  for (const row of db.prepare('SELECT * FROM catalog_items').all() as Array<{ website: string; id: string; revision: string; version: number; archived: number; position?: number }>) {
    positive.parse(row.version); z.union([z.literal(0), z.literal(1)]).parse(row.archived);
    if (!revisions.has(row.website + '/' + row.id + '/' + row.revision)) throw new Error('Current catalog revision is missing');
    if (version === 5) {
      z.number().int().nonnegative().parse(row.position);
      const key = row.website + '/' + row.position;
      if (!row.archived && activePositions.has(key)) throw new Error('Duplicate active catalog order position');
      if (!row.archived) activePositions.add(key);
    }
  }
  const snapshots = new Map<string, CatalogSnapshot>();
  function snapshot(value: CatalogSnapshot, website: string, id: string) {
    if (![1, 2, 3].includes(value.schemaVersion) || value.websiteId !== website || value.snapshotId !== id || value.collectionId !== 'portfolio' || !Array.isArray(value.items)) throw new Error('Catalog snapshot identity mismatch');
    const { checksum, ...payload } = value;
    if (checksum !== hash(payload)) throw new Error('Catalog snapshot checksum mismatch');
    contentLocaleContextSchema.parse(value.localeContext ?? { defaultLocale: 'nl', locale: 'nl' });
    if (new Set(value.items.map(item => item.itemId)).size !== value.items.length) throw new Error('Duplicate catalog snapshot item');
    for (const item of value.items) {
      category(website, item.categoryId);
      if (!revisions.has(website + '/' + item.itemId + '/' + item.revisionId)) throw new Error('Snapshot revision is missing');
    }
    if (value.schemaVersion === 3) {
      if (version < 4 || !Array.isArray(value.categories)) throw new Error('Catalog snapshot category schema mismatch');
      const ids = value.categories.map(item => item.categoryId);
      if (new Set(ids).size !== ids.length || new Set(value.items.map(item => item.categoryId)).size !== ids.length) throw new Error('Catalog snapshot category coverage mismatch');
      for (const entry of value.categories) {
        z.object({ categoryId: z.string(), name: z.string().trim().min(1), sourceLocale: z.enum(['nl', 'en']), isFallback: z.boolean() }).strict().parse(entry);
        if (!value.items.some(item => item.categoryId === entry.categoryId)) throw new Error('Catalog snapshot category coverage mismatch');
      }
    }
  }
  for (const row of db.prepare('SELECT website,id,json FROM catalog_snapshots').all() as Array<{ website: string; id: string; json: string }>) {
    const value = JSON.parse(row.json) as CatalogSnapshot; snapshot(value, row.website, row.id); snapshots.set(row.website + '/' + row.id, value);
  }
  for (const row of db.prepare('SELECT * FROM catalog_consumer_pins').all() as Array<{ id: string; website: string; owner_key: string; snapshot_id: string; request: string; snapshot: string; state: string; version: number; activation_id: string | null }>) {
    const request = catalogConsumerRequestSchema.parse(JSON.parse(row.request));
    const value = JSON.parse(row.snapshot) as CatalogSnapshot;
    snapshot(value, row.website, row.snapshot_id);
    const stored = snapshots.get(row.website + '/' + row.snapshot_id);
    if (!stored || JSON.stringify(stored) !== JSON.stringify(value) || request.ref.websiteId !== row.website || request.ref.snapshotId !== row.snapshot_id || request.checksum !== value.checksum ||
      hash(request.owner) !== row.owner_key || JSON.stringify(request.localeContext) !== JSON.stringify(value.localeContext ?? { defaultLocale: 'nl', locale: 'nl' })) throw new Error('Retained catalog pin mismatch');
    positive.parse(row.version);
    if (!['prepared', 'activated'].includes(row.state) || (row.state === 'prepared' && row.activation_id !== null) ||
      (row.state === 'activated' && row.activation_id !== request.owner.attemptId)) throw new Error('Retained catalog activation mismatch');
    const event = db.prepare('SELECT MAX(version) AS version FROM catalog_consumer_pin_events WHERE pin=?').get(row.id) as { version: number | null };
    if (event.version !== row.version) throw new Error('Retained catalog pin events are missing');
  }
  return version;
}

export function checkCmsRecoveryPins(cms: Database.Database, media: Database.Database) {
  const requests = (media.prepare('SELECT request FROM catalog_consumer_pins').all() as Array<{ request: string }>).map(row => catalogConsumerRequestSchema.parse(JSON.parse(row.request)));
  const rows = cms.prepare("SELECT s.release_id,s.snapshot FROM cms_site_snapshots s JOIN cms_attempts a ON a.id=s.release_id WHERE a.status='published'").all() as Array<{ release_id: string; snapshot: string }>;
  for (const row of rows) {
    const site = JSON.parse(row.snapshot) as SiteSnapshot;
    for (const page of site.pages) for (const block of page.content.blocks) if (block.type === 'portfolio') {
      const expected = { module: 'cms', siteId: site.websiteId, ownerId: page.pageId, revisionId: page.revisionId, kind: 'release', slot: block.blockId, attemptId: row.release_id };
      const pin = requests.find(request => Object.entries(expected).every(([key, value]) => request.owner[key as keyof typeof request.owner] === value));
      if (!pin || JSON.stringify(pin.ref) !== JSON.stringify(block.ref) || pin.checksum !== block.checksum || JSON.stringify(pin.localeContext) !== JSON.stringify(block.localeContext)) throw new Error('Published CMS catalog pin is missing or changed');
    }
  }
}
