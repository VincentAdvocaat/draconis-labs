import type Database from 'better-sqlite3';
import { z } from 'zod';
import { MediaContractError } from '../media-fixture/contracts.js';

const inputSchema = z.object({ expectedVersion: z.number().int().nonnegative(), itemIds: z.array(z.string().uuid()).max(10000) }).strict();

export class CatalogOrder {
  constructor(private db: Database.Database) {
    db.transaction(() => {
      const schema = db.prepare('SELECT version FROM catalog_schema').get() as { version: number };
      if (schema.version === 5) return;
      if (schema.version !== 4) throw new Error('Order migration requires catalog schema 4');
      db.exec('ALTER TABLE catalog_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
      const rows = db.prepare('SELECT website,id FROM catalog_items ORDER BY website,slug').all() as { website: string; id: string }[];
      const positions = new Map<string, number>();
      for (const row of rows) {
        const position = positions.get(row.website) ?? 0;
        db.prepare('UPDATE catalog_items SET position=? WHERE website=? AND id=?').run(position, row.website, row.id);
        positions.set(row.website, position + 1);
      }
      db.exec('UPDATE catalog_schema SET version=5');
    }).immediate();
  }
  positionForItem(website: string, id: string) {
    const old = this.db.prepare('SELECT position,archived FROM catalog_items WHERE website=? AND id=?').get(website, id) as { position: number; archived: number } | undefined;
    if (old && !old.archived) return old.position;
    const row = this.db.prepare('SELECT COALESCE(MAX(position),-1)+1 AS position FROM catalog_items WHERE website=?').get(website) as { position: number };
    return row.position;
  }
  save(website: string, input: unknown) {
    const data = inputSchema.parse(input);
    return this.db.transaction(() => {
      const collection = this.db.prepare('SELECT version FROM catalog_collections WHERE website=?').get(website) as { version: number };
      if (collection.version !== data.expectedVersion) throw new MediaContractError(409, 'Collection order version conflict');
      const active = this.db.prepare('SELECT id FROM catalog_items WHERE website=? AND archived=0').all(website) as { id: string }[];
      const ids = new Set(data.itemIds);
      if (ids.size !== data.itemIds.length || ids.size !== active.length || active.some(row => !ids.has(row.id)))
        throw new MediaContractError(409, 'Order requires the exact active website item set');
      data.itemIds.forEach((id, position) => this.db.prepare('UPDATE catalog_items SET position=? WHERE website=? AND id=?').run(position, website, id));
      this.db.prepare('UPDATE catalog_collections SET version=version+1 WHERE website=?').run(website);
      return { version: collection.version + 1, itemIds: data.itemIds };
    }).immediate();
  }
}
