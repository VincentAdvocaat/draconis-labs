import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateContentField, CONTENT_PUBLICATION_RULES_V1 } from '@draconis/shared';
import { documentSlugSchema } from './slugs.js';
import { CmsError } from './model.js';
import type { CmsRepository } from './repository.js';
import type { DocumentDto, SiteSnapshot } from './documents.js';

const optionalText = (max: number) => z.string().max(max).nullable();
export const englishContentSchema = z.object({ schemaVersion: z.literal(1), locale: z.literal('en'),
  title: optionalText(200), slug: z.union([z.literal(''), documentSlugSchema]).nullable(), seoTitle: optionalText(200), seoDescription: optionalText(1000),
  blocks: z.array(z.object({ blockId: z.string().uuid(), type: z.literal('text'), heading: optionalText(200), body: optionalText(10_000) }).strict()).min(1).max(16),
}).strict().refine((content) => Buffer.byteLength(JSON.stringify(content)) <= 100_000, 'Pagina maximaal 100 KB');
export const localeSaveSchema = z.object({ expectedVersion: z.number().int().nonnegative(),
  expectedStructure: z.string().regex(/^[a-f0-9]{64}$/), content: englishContentSchema }).strict();
export type EnglishContent = z.infer<typeof englishContentSchema>;
interface Row { revision_id: string; version: number; content: string; structure: string }
export class CmsPageLocales {
  constructor(private repository: CmsRepository, private source: (site: string, page: string) => DocumentDto) {
    repository.db.transaction(() => repository.db.exec(`
      CREATE TABLE IF NOT EXISTS cms_locale_revisions(id TEXT PRIMARY KEY, website_id TEXT NOT NULL,
        page_id TEXT NOT NULL, locale TEXT NOT NULL CHECK(locale='en'), content TEXT NOT NULL, structure TEXT NOT NULL,
        actor_id TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(website_id,page_id) REFERENCES cms_documents(website_id,id));
      CREATE TABLE IF NOT EXISTS cms_locale_heads(website_id TEXT NOT NULL, page_id TEXT NOT NULL,
        locale TEXT NOT NULL CHECK(locale='en'), slug TEXT COLLATE NOCASE,
        revision_id TEXT NOT NULL REFERENCES cms_locale_revisions(id), version INTEGER NOT NULL,
        PRIMARY KEY(website_id,page_id,locale), UNIQUE(website_id,locale,slug),
        CHECK(slug IS NULL OR (slug COLLATE BINARY=lower(trim(slug)) AND length(slug)>0 AND slug NOT GLOB '*[^a-z0-9-]*')),
        FOREIGN KEY(website_id,page_id) REFERENCES cms_documents(website_id,id));
      CREATE TABLE IF NOT EXISTS cms_locale_config(website_id TEXT PRIMARY KEY REFERENCES cms_sites(id),default_locale TEXT NOT NULL CHECK(default_locale='nl'));
      INSERT OR IGNORE INTO cms_locale_config SELECT id,'nl' FROM cms_sites;
      INSERT OR IGNORE INTO cms_migrations VALUES(4);
    `))();
  }
  private structure(doc: DocumentDto) {
    return createHash('sha256').update(JSON.stringify(doc.content.blocks.map(({ blockId, type }) => ({ blockId, type })))).digest('hex');
  }
  get(site: string, page: string) {
    const source = this.source(site, page); const structure = this.structure(source);
    const row = this.repository.db.prepare(`SELECT h.revision_id,h.version,r.content,r.structure FROM cms_locale_heads h
      JOIN cms_locale_revisions r ON r.id=h.revision_id WHERE h.website_id=? AND h.page_id=? AND h.locale='en'`).get(site, page) as Row | undefined;
    const content: EnglishContent = row ? JSON.parse(row.content) : { schemaVersion: 1, locale: 'en', title: null, slug: null,
      seoTitle: null, seoDescription: null, blocks: source.content.blocks.filter((block) => block.type === 'text')
        .map(({ blockId }) => ({ blockId, type: 'text', heading: null, body: null })) };
    return { pageId: page, locale: 'en' as const, defaultLocale: 'nl' as const, revisionId: row?.revision_id ?? null,
      version: row?.version ?? 0, structure, savedStructure: row?.structure ?? structure,
      needsUpdate: !!row && row.structure !== structure, supported: source.content.blocks.every((block) => block.type === 'text'),
      sourceBlocks: source.content.blocks.map(({ blockId, type }) => ({ blockId, type })), content };
  }
  save(site: string, page: string, input: z.infer<typeof localeSaveSchema>, actor: string) {
    return this.repository.db.transaction(() => {
      const current = this.get(site, page);
      if (!current.supported) throw new CmsError(409, 'EN ondersteunt hier alleen tekstblokken. De NL-publicatie blijft beschikbaar.');
      if (current.version !== input.expectedVersion || current.structure !== input.expectedStructure)
        throw new CmsError(409, 'Taalversie of NL-blokstructuur gewijzigd. Jouw invoer blijft bewaard; laad de actuele structuur.');
      if (JSON.stringify(input.content.blocks.map(({ blockId, type }) => ({ blockId, type }))) !== JSON.stringify(current.sourceBlocks))
        throw new CmsError(409, 'EN-blokken moeten exact bij de actuele NL-structuur horen');
      const slug = input.content.slug || null;
      const snapshots = this.repository.db.prepare(`SELECT s.snapshot FROM cms_site_snapshots s JOIN cms_attempts a ON a.id=s.release_id
        WHERE a.website_id=? AND a.status IN ('building','published')`).all(site) as Array<{ snapshot: string }>;
      for (const row of snapshots) {
        const locked = (JSON.parse(row.snapshot) as SiteSnapshot).pages.find((item) => item.pageId === page && item.content.locale === 'en');
        if (locked && locked.content.slug !== slug) throw new CmsError(409, 'Gepubliceerde EN-slug staat vast; redirects vallen buiten deze stap');
      }
      if (slug && this.repository.db.prepare(`SELECT page_id FROM cms_locale_heads WHERE website_id=? AND locale='en' AND slug=? AND page_id<>?`).get(site, slug, page))
        throw new CmsError(409, 'Deze EN-slug bestaat al binnen de website');
      const id = randomUUID();
      this.repository.db.prepare('INSERT INTO cms_locale_revisions VALUES(?,?,?,\'en\',?,?,?,?)')
        .run(id, site, page, JSON.stringify(input.content), current.structure, actor, new Date().toISOString());
      this.repository.db.prepare(`INSERT INTO cms_locale_heads VALUES(?,?,'en',?,?,1)
        ON CONFLICT(website_id,page_id,locale) DO UPDATE SET slug=excluded.slug,revision_id=excluded.revision_id,version=version+1`)
        .run(site, page, slug, id);
      return this.get(site, page);
    }).immediate();
  }
  complete(site: string, page: string, revisionId?: string) {
    const current = this.get(site, page);
    if (!current.supported || current.needsUpdate) throw new CmsError(409, 'EN moet worden bijgewerkt naar de actuele tekstblokstructuur');
    if (revisionId && revisionId !== current.revisionId) throw new CmsError(409, 'EN-revisie gewijzigd');
    return this.completeContent(current.content);
  }
  previewRevision(site: string, page: string, revisionId: string) {
    this.source(site, page);
    const row = this.repository.db.prepare(`SELECT content FROM cms_locale_revisions WHERE website_id=? AND page_id=? AND id=? AND locale='en'`)
      .get(site, page, revisionId) as {content: string} | undefined;
    if (!row) throw new CmsError(404, 'EN-revisie niet gevonden');
    return this.completeContent(englishContentSchema.parse(JSON.parse(row.content)));
  }
  private completeContent(content: EnglishContent) {
    const context = { defaultLocale: 'nl' as const, locale: 'en' as const };
    for (const value of [content.title, content.slug, content.seoTitle, ...content.blocks.map((block) => block.body)]) {
      if (!validateContentField({ en: value }, context, CONTENT_PUBLICATION_RULES_V1.title).valid)
        throw new CmsError(400, 'Vul EN-titel, slug, SEO-titel en elk tekstblok rechtstreeks in. Geen NL-fallback.');
    }
    return { ...content, title: content.title!, slug: content.slug!, seoTitle: content.seoTitle!, seoDescription: content.seoDescription ?? '',
      blocks: content.blocks.map((block) => ({ ...block, heading: block.heading ?? '', body: block.body! })) };
  }
  plan(site: string) {
    return (this.repository.db.prepare(`SELECT page_id FROM cms_locale_heads WHERE website_id=? AND locale='en'`).all(site) as Array<{ page_id: string }>).
      map(({ page_id }) => { const draft = this.get(site, page_id); return { pageId: page_id, locale: 'en' as const,
        revisionId: draft.revisionId!, version: draft.version, structure: draft.structure, title: draft.content.title,
        slug: draft.content.slug, needsUpdate: draft.needsUpdate, supported: draft.supported }; });
  }
}
