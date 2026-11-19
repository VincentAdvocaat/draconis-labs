import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { z } from 'zod';
import { validateContentField, type ContentLocaleContext } from '@draconis/shared';
import { MediaContractError } from '../media-fixture/contracts.js';

const labelsSchema = z.object({ nl: z.string().trim().min(1).max(200), en: z.string().trim().max(200).nullish() }).strict();
const inputSchema = z.object({ expectedVersion: z.number().int().nonnegative(), labels: labelsSchema }).strict();
const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
interface Row { id: string; version: number; archived: number; labels: string }
export interface CatalogCategory { categoryId: string; version: number; archived: boolean; labels: { nl: string; en: string | null } }

export class CatalogCategories {
  constructor(private db: Database.Database) {
    db.transaction(() => {
      const schema = db.prepare('SELECT version FROM catalog_schema').get() as { version: number };
      if (schema.version === 4) return;
      if (schema.version !== 3) throw new Error('Category migration requires catalog schema 3');
      db.exec(`CREATE TABLE IF NOT EXISTS catalog_categories(website TEXT NOT NULL,id TEXT NOT NULL,version INTEGER NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,labels TEXT NOT NULL,PRIMARY KEY(website,id));`);
      for (const row of db.prepare('SELECT website FROM catalog_collections').all() as { website: string }[])
        db.prepare('INSERT OR IGNORE INTO catalog_categories VALUES(?,?,1,0,?)').run(row.website, 'algemeen', JSON.stringify({ nl: 'Algemeen', en: 'General' }));
      db.exec('UPDATE catalog_schema SET version=4');
    }).immediate();
  }
  private decode(row: Row): CatalogCategory {
    return { categoryId: row.id, version: row.version, archived: Boolean(row.archived), labels: JSON.parse(row.labels) };
  }
  get(website: string, id: string) {
    const row = this.db.prepare('SELECT * FROM catalog_categories WHERE website=? AND id=?').get(website, id) as Row | undefined;
    if (!row) throw new MediaContractError(404, 'Category not found for website');
    return this.decode(row);
  }
  list(website: string) {
    return (this.db.prepare('SELECT * FROM catalog_categories WHERE website=? ORDER BY id').all(website) as Row[]).map(row => this.decode(row));
  }
  save(website: string, id: string | undefined, input: unknown) {
    const data = inputSchema.parse(input);
    return this.db.transaction(() => {
      if (!id) {
        if (data.expectedVersion !== 0) throw new MediaContractError(409, 'Category version conflict');
        id = randomUUID();
        this.db.prepare('INSERT INTO catalog_categories VALUES(?,?,1,0,?)').run(website, id, JSON.stringify({ nl: data.labels.nl, en: data.labels.en ?? null }));
      } else {
        const old = this.get(website, id);
        if (old.version !== data.expectedVersion) throw new MediaContractError(409, 'Category version conflict');
        this.db.prepare('UPDATE catalog_categories SET labels=?,version=version+1 WHERE website=? AND id=?')
          .run(JSON.stringify({ nl: data.labels.nl, en: data.labels.en ?? null }), website, id);
      }
      this.db.prepare('UPDATE catalog_collections SET version=version+1 WHERE website=?').run(website);
      return this.get(website, id!);
    }).immediate();
  }
  archive(website: string, id: string, input: unknown) {
    const data = versionSchema.parse(input);
    return this.db.transaction(() => {
      const category = this.get(website, id);
      if (id === 'algemeen') throw new MediaContractError(409, 'The system category cannot be archived');
      if (category.version !== data.expectedVersion || category.archived) throw new MediaContractError(409, 'Category version conflict');
      this.db.prepare('UPDATE catalog_categories SET archived=1,version=version+1 WHERE website=? AND id=?').run(website, id);
      this.db.prepare('UPDATE catalog_collections SET version=version+1 WHERE website=?').run(website);
      return this.get(website, id);
    }).immediate();
  }
  remove(website: string, id: string, input: unknown) {
    const data = versionSchema.parse(input);
    return this.db.transaction(() => {
      const category = this.get(website, id);
      if (category.version !== data.expectedVersion) throw new MediaContractError(409, 'Category version conflict');
      const used = this.db.prepare(`SELECT 1 FROM catalog_revisions WHERE website=? AND json_extract(json,'$.categoryId')=?
        UNION ALL SELECT 1 FROM catalog_snapshots s,json_each(s.json,'$.items') item
        WHERE s.website=? AND json_extract(item.value,'$.categoryId')=? LIMIT 1`).get(website, id, website, id);
      if (id === 'algemeen' || used) throw new MediaContractError(409, 'Category is in use by current or retained content');
      this.db.prepare('DELETE FROM catalog_categories WHERE website=? AND id=?').run(website, id);
      this.db.prepare('UPDATE catalog_collections SET version=version+1 WHERE website=?').run(website);
      return { removed: true };
    }).immediate();
  }
  requireSelection(website: string, id: string, previous?: string) {
    if (this.get(website, id).archived && previous !== id) throw new MediaContractError(409, 'Archived category cannot be selected');
  }
  publication(website: string, ids: string[], context: ContentLocaleContext) {
    return [...new Set(ids)].map(categoryId => {
      const category = this.get(website, categoryId);
      const value = validateContentField(category.labels, context, { required: true, allowFallback: true });
      if (!value.valid) throw new MediaContractError(409, 'Category name is missing for publication locale');
      return { categoryId, name: value.value!, sourceLocale: value.sourceLocale!, isFallback: value.isFallback };
    });
  }
}
