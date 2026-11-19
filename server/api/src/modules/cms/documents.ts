import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { mediaReferenceSchema, type MediaReference } from '../../media-fixture/contracts.js';
import { CmsError, encode, type ReleaseInput } from './model.js';
import type { CmsRepository } from './repository.js';
import type { CmsMedia } from './media.js';
import type { CmsUploads } from './upload.js';

const reserved = /^(index|api|sites|media|assets|con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
export const documentSlugSchema = z.string().trim().toLowerCase().min(1).max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).refine((slug) => !reserved.test(slug), 'Deze slug is gereserveerd');
const textBlock = z.object({ blockId: z.string().uuid(), type: z.literal('text'),
  heading: z.string().max(200), body: z.string().max(10_000) }).strict();
const imageBlock = z.object({ blockId: z.string().uuid(), type: z.literal('image'),
  reference: mediaReferenceSchema, caption: z.string().max(1000) }).strict();
export const documentContentSchema = z.object({
  schemaVersion: z.literal(1), locale: z.literal('nl'), title: z.string().trim().min(1).max(200),
  slug: documentSlugSchema, seoTitle: z.string().trim().min(1).max(200), seoDescription: z.string().max(1000),
  blocks: z.array(z.discriminatedUnion('type', [textBlock, imageBlock])).min(1).max(16),
}).strict().superRefine((content, context) => {
  if (Buffer.byteLength(JSON.stringify(content)) > 100_000) context.addIssue({ code: 'custom', message: 'Pagina mag maximaal 100 KB beslaan' });
  if (new Set(content.blocks.map((block) => block.blockId)).size !== content.blocks.length)
    context.addIssue({ code: 'custom', message: 'Blok-ID moet uniek zijn' });
  if (content.blocks.filter((block) => block.type === 'image').length > 1)
    context.addIssue({ code: 'custom', message: 'Deze stap ondersteunt één afbeeldingsblok per pagina' });
  for (const block of content.blocks) if (block.type === 'image' && block.reference.usage !== `block-${block.blockId}`)
    context.addIssue({ code: 'custom', message: 'Beeldgebruik moet bij het stabiele blok-ID horen' });
});
export const createDocumentSchema = z.object({ title: z.string().trim().min(1).max(200), slug: documentSlugSchema }).strict();
export const saveDocumentSchema = z.object({ expectedVersion: z.number().int().positive(), content: documentContentSchema }).strict();
export type DocumentContent = z.infer<typeof documentContentSchema>;
export interface DocumentDto { pageId: string; revisionId: string; version: number; content: DocumentContent; published: boolean }
interface SnapshotPage { pageId: string; revisionId: string; version: number; file: string;
  content: DocumentContent; mediaRevisionId: string | null }
export interface SiteSnapshot { schemaVersion: 1; websiteId: string; pages: SnapshotPage[] }
export interface RenderedSite { files: Array<{ path: string; bytes: Buffer }>; metadata: Record<string, unknown>; revalidate: () => void }
interface DocumentRow { id: string; revision_id: string; version: number; content: string; media_revision_id: string | null }

export class CmsDocuments {
  constructor(private repository: CmsRepository, private media?: CmsMedia, private uploads?: CmsUploads) {
    const db = repository.db;
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cms_documents (
          id TEXT NOT NULL, website_id TEXT NOT NULL REFERENCES cms_sites(id), slug TEXT NOT NULL,
          revision_id TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(website_id,id), UNIQUE(website_id,slug)
        );
        CREATE TABLE IF NOT EXISTS cms_document_revisions (
          id TEXT PRIMARY KEY, website_id TEXT NOT NULL REFERENCES cms_sites(id), page_id TEXT NOT NULL,
          parent_id TEXT, content TEXT NOT NULL, media_revision_id TEXT, actor_id TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cms_site_snapshots (
          release_id TEXT PRIMARY KEY REFERENCES cms_attempts(id), snapshot TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS cms_home_identity (
          website_id TEXT PRIMARY KEY REFERENCES cms_sites(id), page_id TEXT NOT NULL DEFAULT 'home'
        );
        INSERT OR IGNORE INTO cms_home_identity(website_id) SELECT website_id FROM cms_pages;
        INSERT OR IGNORE INTO cms_migrations VALUES(3);
      `);
    })();
    repository.setSiteSnapshots(this);
  }

  private rows(websiteId: string): DocumentRow[] {
    return this.repository.db.prepare(`SELECT p.id,p.revision_id,p.version,r.content,r.media_revision_id
      FROM cms_documents p JOIN cms_document_revisions r ON r.id=p.revision_id
      WHERE p.website_id=? ORDER BY p.slug,p.id`).all(websiteId) as DocumentRow[];
  }
  get(websiteId: string, pageId: string): DocumentDto {
    this.repository.page(websiteId);
    const row = this.rows(websiteId).find((item) => item.id === pageId);
    if (!row) throw new CmsError(404, 'Pagina niet gevonden');
    return { pageId, revisionId: row.revision_id, version: row.version, content: JSON.parse(row.content) as DocumentContent,
      published: this.wasPublished(websiteId, pageId) };
  }
  plan(websiteId: string) {
    const home = this.repository.page(websiteId);
    return { ...this.repository.active(websiteId), pages: [
      { pageId: 'home', revisionId: home.revisionId, version: home.pageVersion, title: home.values.title, file: 'index.html' },
      ...this.rows(websiteId).map((row) => { const content = JSON.parse(row.content) as DocumentContent;
        return { pageId: row.id, revisionId: row.revision_id, version: row.version, title: content.title, file: `${content.slug}.html` }; }),
    ] };
  }
  create(websiteId: string, input: z.infer<typeof createDocumentSchema>, actor: string): DocumentDto {
    return this.repository.db.transaction(() => {
      this.repository.page(websiteId);
      if (this.rows(websiteId).length >= 32) throw new CmsError(400, 'Maximaal 32 extra pagina’s in deze proef');
      this.assertSlug(websiteId, input.slug);
      const pageId = randomUUID();
      const content: DocumentContent = { schemaVersion: 1, locale: 'nl', ...input, seoTitle: input.title,
        seoDescription: '', blocks: [{ blockId: randomUUID(), type: 'text', heading: '', body: '' }] };
      const revision = this.insert(websiteId, pageId, null, content, null, [], actor);
      this.repository.db.prepare('INSERT INTO cms_documents VALUES(?,?,?,?,1)').run(pageId, websiteId, input.slug, revision);
      return this.get(websiteId, pageId);
    }).immediate();
  }
  private assertSlug(websiteId: string, slug: string, excludeId = '') {
    const occupied = this.repository.db.prepare('SELECT id FROM cms_documents WHERE website_id=? AND slug=? AND id<>?')
      .get(websiteId, slug, excludeId);
    if (occupied) throw new CmsError(409, 'Deze slug bestaat al binnen de website');
  }
  private references(content: DocumentContent): MediaReference[] {
    return content.blocks.flatMap((block) => block.type === 'image' ? [block.reference] : []);
  }
  private insert(websiteId: string, pageId: string, parent: string | null, content: DocumentContent,
    previousMedia: string | null, previousRefs: MediaReference[], actor: string): string {
    const id = randomUUID(); const refs = this.references(content);
    let mediaRevision: string | null = null;
    if (refs.length) {
      if (!this.media) throw new CmsError(503, 'Mediaopslag niet beschikbaar. Herstel de mediamap en herstart de proef.');
      if (previousMedia && JSON.stringify(refs) === JSON.stringify(previousRefs)) mediaRevision = previousMedia;
      else {
        this.media.store.saveReferences(this.media.websiteScope(websiteId), { module: 'cms', ownerId: pageId,
          revisionId: id, expectedVersion: 0, references: refs });
        mediaRevision = id;
      }
    }
    this.repository.db.prepare('INSERT INTO cms_document_revisions VALUES(?,?,?,?,?,?,?,?)')
      .run(id, websiteId, pageId, parent, JSON.stringify(content), mediaRevision, actor, new Date().toISOString());
    return id;
  }
  save(websiteId: string, pageId: string, input: z.infer<typeof saveDocumentSchema>, actor: string): DocumentDto {
    return this.repository.db.transaction(() => {
      const prior = this.get(websiteId, pageId);
      if (prior.version !== input.expectedVersion) throw new CmsError(409, 'Paginaconcept gewijzigd. Haal de nieuwste versie op.');
      this.assertSlug(websiteId, input.content.slug, pageId);
      this.assertPinnedSlug(websiteId, pageId, input.content.slug);
      const previousMedia = this.revision(websiteId, pageId, prior.revisionId).mediaRevisionId;
      const revision = this.insert(websiteId, pageId, prior.revisionId, input.content, previousMedia, this.references(prior.content), actor);
      const result = this.repository.db.prepare(`UPDATE cms_documents SET slug=?,revision_id=?,version=version+1
        WHERE website_id=? AND id=? AND version=?`).run(input.content.slug, revision, websiteId, pageId, input.expectedVersion);
      if (!result.changes) throw new CmsError(409, 'Paginaconcept gewijzigd');
      return this.get(websiteId, pageId);
    }).immediate();
  }
  private wasPublished(websiteId: string, pageId: string): boolean {
    const snapshots = this.repository.db.prepare(`SELECT s.snapshot FROM cms_site_snapshots s JOIN cms_attempts a ON a.id=s.release_id
      WHERE a.website_id=? AND a.status='published'`).all(websiteId) as Array<{ snapshot: string }>;
    return snapshots.some((row) => (JSON.parse(row.snapshot) as SiteSnapshot).pages.some((page) => page.pageId === pageId));
  }
  private assertPinnedSlug(websiteId: string, pageId: string, slug: string): void {
    // begin captures snapshots and save checks their route identity under the same
    // CMS IMMEDIATE writer lock. Text drafts remain editable during a pending build.
    const snapshots = this.repository.db.prepare(`SELECT s.snapshot FROM cms_site_snapshots s JOIN cms_attempts a ON a.id=s.release_id
      WHERE a.website_id=? AND a.status IN ('building','published')`).all(websiteId) as Array<{ snapshot: string }>;
    for (const row of snapshots) {
      const pinned = (JSON.parse(row.snapshot) as SiteSnapshot).pages.find((page) => page.pageId === pageId);
      if (pinned && pinned.content.slug !== slug)
        throw new CmsError(409, 'De slug staat vast tijdens en na publicatie. Wijzigen vereist een redirect en valt buiten deze stap');
    }
  }
  private revision(websiteId: string, pageId: string, revisionId: string) {
    const row = this.repository.db.prepare('SELECT content,media_revision_id FROM cms_document_revisions WHERE website_id=? AND page_id=? AND id=?')
      .get(websiteId, pageId, revisionId) as { content: string; media_revision_id: string | null } | undefined;
    if (!row) throw new CmsError(404, 'Paginarevisie niet gevonden');
    return { content: JSON.parse(row.content) as DocumentContent, mediaRevisionId: row.media_revision_id };
  }
  capture(websiteId: string, input: ReleaseInput): string {
    const plan = this.plan(websiteId);
    if (!input.expectedPages) throw new CmsError(428, 'Haal eerst de volledige paginaselectie op');
    if (new Set(input.expectedPages.map((page) => page.pageId)).size !== input.expectedPages.length || input.expectedPages.length !== plan.pages.length)
      throw new CmsError(409, 'De paginaselectie is gewijzigd. Haal haar opnieuw op.');
    for (const current of plan.pages) {
      const selected = input.expectedPages.find((page) => page.pageId === current.pageId);
      if (!selected || selected.revisionId !== current.revisionId || selected.version !== current.version)
        throw new CmsError(409, 'Een paginaversie is gewijzigd. Haal de paginaselectie opnieuw op.');
    }
    const home = plan.pages[0];
    if (input.revisionId !== home.revisionId) throw new CmsError(409, 'De home-revisie komt niet overeen met de selectie');
    const values = this.repository.revision(websiteId, home.revisionId);
    const homeContent: DocumentContent = { schemaVersion: 1, locale: 'nl', title: values.title, slug: 'index', seoTitle: values.title,
      seoDescription: '', blocks: [{ blockId: 'home-text', type: 'text', heading: '', body: values.intro },
        ...(values.image ? [{ blockId: 'home-image', type: 'image' as const, reference: values.image, caption: '' }] : [])] };
    const pages: SnapshotPage[] = [{ ...home, content: homeContent, mediaRevisionId: this.repository.mediaRevision(websiteId, home.revisionId) },
      ...plan.pages.slice(1).map((page) => ({ ...page, ...this.revision(websiteId, page.pageId, page.revisionId) }))];
    return JSON.stringify({ schemaVersion: 1, websiteId, pages } satisfies SiteSnapshot);
  }
  persist(releaseId: string, snapshot: string): void {
    this.repository.db.prepare('INSERT INTO cms_site_snapshots VALUES(?,?)').run(releaseId, snapshot);
  }
  private snapshot(websiteId: string, releaseId: string): SiteSnapshot {
    const row = this.repository.db.prepare(`SELECT s.snapshot FROM cms_site_snapshots s JOIN cms_attempts a ON a.id=s.release_id
      WHERE a.website_id=? AND a.id=?`).get(websiteId, releaseId) as { snapshot: string } | undefined;
    if (!row) throw new CmsError(404, 'Website-snapshot niet gevonden');
    return JSON.parse(row.snapshot) as SiteSnapshot;
  }
  private render(content: DocumentContent, images: Map<string, { src: string; alt: string }>, navigation = ''): string {
    const blocks = content.blocks.map((block) => block.type === 'text'
      ? `<section>${block.heading ? `<h2>${encode(block.heading)}</h2>` : ''}<p>${encode(block.body).replace(/\n/g, '<br>')}</p></section>`
      : `<figure><img src="${encode(images.get(block.reference.usage)!.src)}" alt="${encode(images.get(block.reference.usage)!.alt)}" width="160" height="160">` +
        (block.caption ? `<figcaption>${encode(block.caption)}</figcaption>` : '') + '</figure>').join('');
    return '<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      `<title>${encode(content.seoTitle)}</title><meta name="description" content="${encode(content.seoDescription)}"></head><body>` +
      navigation + `<main><h1>${encode(content.title)}</h1>${blocks}</main></body></html>`;
  }
  preview(websiteId: string, pageId: string, revisionId: string): string {
    const { content } = this.revision(websiteId, pageId, revisionId);
    const images = new Map<string, { src: string; alt: string }>();
    for (const ref of this.references(content)) {
      if (!this.uploads) throw new CmsError(503, 'Mediaopslag niet beschikbaar voor privépreview');
      images.set(ref.usage, this.uploads.preview(websiteId, ref));
    }
    return this.render(content, images);
  }
  build(websiteId: string, releaseId: string): RenderedSite {
    const snapshot = this.snapshot(websiteId, releaseId);
    const validate = () => {
      const output = new Map<string, Array<{ reference: MediaReference; bytes: Buffer; extension: string; alt: string }>>();
      for (const page of snapshot.pages) {
        if (!page.content.title.trim() || !page.content.seoTitle.trim() ||
            (page.pageId !== 'home' && !page.content.blocks.some((block) => block.type === 'text' && block.body.trim())))
          throw new CmsError(400, 'Elke nieuwe pagina vereist titel, SEO-titel en een ingevuld tekstblok');
        const refs = this.references(page.content);
        if (!refs.length) { output.set(page.pageId, []); continue; }
        if (!this.media || !this.uploads || !page.mediaRevisionId) throw new CmsError(503, 'Mediaopslag niet beschikbaar voor publicatie');
        for (const ref of refs) this.uploads.requireApproval(websiteId, ref.assetId);
        const manifest = this.media.store.resolveRelease(this.media.websiteScope(websiteId), {
          releaseId: `${releaseId}-${page.pageId}`, revisionId: page.mediaRevisionId, locales: ['nl'],
        });
        output.set(page.pageId, manifest.references.map((reference) => {
          const variant = reference.variants.find((item) => item.mime === 'image/png')
            ?? reference.variants.find((item) => item.mime === 'image/jpeg') ?? reference.variants.find((item) => item.mime === 'image/webp');
          if (!variant) throw new CmsError(409, 'Publieke beeldvariant ontbreekt');
          const bytes = readFileSync(join(this.media!.root, variant.path));
          if (bytes.length !== variant.bytes || createHash('sha256').update(bytes).digest('hex') !== variant.checksum) throw new CmsError(409, 'Beeldvariant gewijzigd');
          return { reference, bytes, extension: variant.mime === 'image/png' ? 'png' : variant.mime === 'image/jpeg' ? 'jpg' : 'webp',
            alt: reference.decorative ? '' : reference.altText.nl };
        }));
      }
      return output;
    };
    const resolved = validate();
    const files: RenderedSite['files'] = [];
    const nav = '<nav>' + snapshot.pages.map((page) => `<a href="${encode(page.file)}">${encode(page.content.title)}</a>`).join(' ') + '</nav>';
    for (const page of snapshot.pages) {
      const images = new Map<string, { src: string; alt: string }>();
      for (const image of resolved.get(page.pageId) ?? []) {
        const name = page.pageId === 'home' ? `hero.${image.extension}` : `${page.pageId}.${image.extension}`;
        const path = `media/${releaseId}/${name}`;
        images.set(image.reference.usage, { src: path, alt: image.alt }); files.push({ path, bytes: image.bytes });
      }
      files.push({ path: page.file, bytes: Buffer.from(this.render(page.content, images, nav)) });
    }
    return { files, metadata: { schemaVersion: snapshot.schemaVersion, pages: snapshot.pages.map((page) => ({
      pageId: page.pageId, revisionId: page.revisionId, version: page.version, file: page.file,
      mediaRevisionId: page.mediaRevisionId, media: this.references(page.content),
    })) }, revalidate: () => { validate(); } };
  }
}
