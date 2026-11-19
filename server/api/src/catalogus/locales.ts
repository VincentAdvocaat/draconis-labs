import type Database from 'better-sqlite3';
import {
  CONTENT_LOCALES, CONTENT_PUBLICATION_RULES_V1, contentLocaleContextSchema, contentLocaleSchema,
  resolveContentField, validateContentField, type ContentLocale, type ContentLocaleContext, type LocalizedTextValues,
} from '@draconis/shared';
import { MediaContractError } from '../media-fixture/contracts.js';
import { itemInputSchema, type CatalogItem, type CatalogLocaleFields, type CatalogSnapshot } from './contracts.js';

type LocaleValues = Partial<Record<ContentLocale, CatalogLocaleFields>>;
const fields = ['title', 'slug', 'description', 'alt'] as const;

/** Locale persistence composes the reviewed pure contract; it does not translate. */
export class CatalogLocales {
  constructor(private readonly db: Database.Database) {
    db.transaction(() => {
      const schema = db.prepare('SELECT version FROM catalog_schema').get() as { version: number };
      if (schema.version === 3 || schema.version === 4) return;
      if (schema.version !== 2) throw new Error('Catalog locale migration requires schema 2');
      db.exec(`ALTER TABLE catalog_collections ADD COLUMN default_locale TEXT NOT NULL DEFAULT 'nl';
        CREATE TABLE catalog_locale_values(website TEXT NOT NULL,revision TEXT NOT NULL,locale TEXT NOT NULL,
          title TEXT,slug TEXT,description TEXT,alt TEXT,PRIMARY KEY(website,revision,locale));
        CREATE TABLE catalog_locale_slugs(website TEXT NOT NULL,collection TEXT NOT NULL,locale TEXT NOT NULL,
          slug TEXT NOT NULL,item TEXT NOT NULL,PRIMARY KEY(website,collection,locale,slug),UNIQUE(website,collection,locale,item));`);
      const revisions = db.prepare('SELECT website,id,json FROM catalog_revisions').all() as { website: string; id: string; json: string }[];
      for (const revision of revisions) {
        const item = JSON.parse(revision.json) as CatalogItem;
        this.insertValues(revision.website, revision.id, 'nl', this.defaultFields(item, 'nl'));
      }
      const items = db.prepare('SELECT website,id,slug FROM catalog_items').all() as { website: string; id: string; slug: string }[];
      for (const item of items) db.prepare('INSERT INTO catalog_locale_slugs VALUES(?,?,?,?,?)')
        .run(item.website, 'portfolio', 'nl', item.slug, item.id);
      db.exec('UPDATE catalog_schema SET version=3');
    })();
  }
  defaultLocale(website: string): ContentLocale {
    const row = this.db.prepare('SELECT default_locale FROM catalog_collections WHERE website=?').get(website) as { default_locale: string };
    return contentLocaleSchema.parse(row.default_locale);
  }
  context(website: string, selection: { locale?: ContentLocale; fallbackLocale?: ContentLocale } = {}): ContentLocaleContext {
    const defaultLocale = this.defaultLocale(website);
    return contentLocaleContextSchema.parse({ defaultLocale, locale: selection.locale ?? defaultLocale,
      ...(selection.fallbackLocale ? { fallbackLocale: selection.fallbackLocale } : {}) });
  }
  private defaultFields(item: CatalogItem, locale: ContentLocale): CatalogLocaleFields {
    return { title: item.title, slug: item.slug, description: item.description, alt: item.media.altText[locale] ?? null };
  }
  values(website: string, revision: string): LocaleValues {
    const rows = this.db.prepare('SELECT locale,title,slug,description,alt FROM catalog_locale_values WHERE website=? AND revision=? ORDER BY locale')
      .all(website, revision) as Array<CatalogLocaleFields & { locale: ContentLocale }>;
    const result: LocaleValues = {};
    for (const row of rows) result[row.locale] = { title: row.title, slug: row.slug, description: row.description, alt: row.alt };
    return result;
  }
  private insertValues(website: string, revision: string, locale: ContentLocale, value: CatalogLocaleFields) {
    this.db.prepare('INSERT INTO catalog_locale_values VALUES(?,?,?,?,?,?,?)')
      .run(website, revision, locale, value.title, value.slug, value.description, value.alt);
  }
  /** Called only inside the item's outer transaction, alongside refs and revision writes. */
  writeRevision(website: string, source: CatalogItem | undefined, item: CatalogItem,
    variant?: { locale: ContentLocale; values: CatalogLocaleFields }): CatalogItem {
    const defaultLocale = this.defaultLocale(website);
    const values = source ? this.values(website, source.revisionId) : {};
    values[defaultLocale] = this.defaultFields(item, defaultLocale);
    if (source && (source.media.assetId !== item.media.assetId || source.media.fileVersion !== item.media.fileVersion)) {
      for (const locale of CONTENT_LOCALES) if (locale !== defaultLocale && values[locale]) values[locale]!.alt = null;
    }
    for (const locale of CONTENT_LOCALES) if (locale !== defaultLocale && typeof item.media.altText[locale] === 'string') {
      values[locale] ??= { title: null, slug: null, description: null, alt: null };
      values[locale]!.alt = item.media.altText[locale];
    }
    if (variant) values[variant.locale] = variant.values;
    this.db.prepare('DELETE FROM catalog_locale_slugs WHERE website=? AND collection=? AND item=?').run(website, 'portfolio', item.itemId);
    try {
      for (const locale of CONTENT_LOCALES) {
        const value = values[locale];
        if (!value) continue;
        if (value.slug) this.db.prepare('INSERT INTO catalog_locale_slugs VALUES(?,?,?,?,?)').run(website, 'portfolio', locale, value.slug, item.itemId);
        this.insertValues(website, item.revisionId, locale, value);
      }
    } catch (error) {
      if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE')
        throw new MediaContractError(409, 'Slug already exists for website/collection/locale');
      throw error;
    }
    const altText: Record<string, string> = {};
    for (const locale of CONTENT_LOCALES) if (typeof values[locale]?.alt === 'string') altText[locale] = values[locale]!.alt!;
    return { ...item, media: { ...item.media, altText } };
  }
  private fieldValues(values: LocaleValues, field: keyof CatalogLocaleFields): LocalizedTextValues {
    return Object.fromEntries(CONTENT_LOCALES.map(locale => [locale, values[locale]?.[field] ?? null]));
  }
  diagnostics(website: string, item: CatalogItem, context: ContentLocaleContext) {
    const values = this.values(website, item.revisionId);
    const diagnostics = Object.fromEntries(fields.map(field => [field,
      resolveContentField(this.fieldValues(values, field), context, { allowFallback: true })]));
    return { itemId: item.itemId, version: item.version, context, values: values[context.locale] ?? {
      title: null, slug: null, description: null, alt: null,
    }, diagnostics };
  }
  publicationItem(website: string, item: CatalogItem, context: ContentLocaleContext) {
    const values = this.values(website, item.revisionId);
    const resolved = Object.fromEntries(fields.map(field => [field,
      validateContentField(this.fieldValues(values, field), context, CONTENT_PUBLICATION_RULES_V1[field])])) as
      Record<keyof CatalogLocaleFields, ReturnType<typeof validateContentField>>;
    const invalid: Array<keyof CatalogLocaleFields> = fields.filter(field => field !== 'alt' && !resolved[field].valid);
    if (item.media.decorative) {
      if (values[context.locale]?.alt !== '') invalid.push('alt');
    } else if (!resolved.alt.valid) invalid.push('alt');
    if (invalid.length) throw new MediaContractError(409, `Direct publication fields missing or invalid for ${context.locale}: ${invalid.join(', ')}`);
    if (!itemInputSchema.shape.slug.safeParse(resolved.slug.value).success) throw new MediaContractError(409, 'Invalid localized slug');
    const fieldSources = Object.fromEntries(fields.map(field => {
      if (field === 'alt' && item.media.decorative) return [field, resolveContentField(this.fieldValues(values, field), context, { allowFallback: false })];
      const { valid: _valid, issues: _issues, ...source } = resolved[field];
      return [field, source];
    })) as
      NonNullable<CatalogSnapshot['items'][number]['fieldSources']>;
    return { ...item, title: resolved.title.value!, slug: resolved.slug.value!, description: resolved.description.value ?? '',
      localeValues: values, fieldSources };
  }
}
