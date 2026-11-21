import {portfolioSelectionSchema,portfolioLabelsSchema,defaultPortfolioLabels} from './portfolio-schema.js';
import type {CmsPortfolio} from './portfolio.js';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { validateContentField, CONTENT_PUBLICATION_RULES_V1 } from '@draconis/shared';
import { documentSlugSchema } from './slugs.js';
import { CmsError } from './model.js';
import type { CmsRepository } from './repository.js';
import type { CmsMedia } from './media.js';
import type { MediaReference } from '../../media-fixture/contracts.js';
import type { DocumentDto, SiteSnapshot } from './documents.js';

const optionalText = (max: number) => z.string().max(max).nullable();
export const englishContentSchema = z.object({ schemaVersion: z.literal(1), locale: z.literal('en'),
  title: optionalText(200), slug: z.union([z.literal(''),z.literal('index'), documentSlugSchema]).nullable(), seoTitle: optionalText(200), seoDescription: optionalText(1000),
  blocks: z.array(z.discriminatedUnion('type',[
    z.object({blockId:z.string().uuid(),type:z.literal('text'),heading:optionalText(200),body:optionalText(10_000)}).strict(),
    z.object({blockId:z.string().uuid(),type:z.literal('image'),altText:optionalText(2000),caption:optionalText(1000)}).strict(),
    z.object({blockId:z.string().uuid(),type:z.literal('portfolio'),selection:portfolioSelectionSchema.nullable(),labels:portfolioLabelsSchema}).strict(),
  ])).min(1).max(16),
}).strict().refine((content) => Buffer.byteLength(JSON.stringify(content)) <= 100_000, 'Pagina maximaal 100 KB');
export const localeSaveSchema = z.object({ expectedVersion: z.number().int().nonnegative(),
  confirmSourceChange:z.boolean().optional(), expectedStructure: z.string().regex(/^[a-f0-9]{64}$/), content: englishContentSchema }).strict();
export type EnglishContent = z.infer<typeof englishContentSchema>;
interface ImageBinding {blockId:string;assetId:string;fileVersion:number;usage:string;decorative:boolean}
interface Row { revision_id: string; version: number; content: string; structure: string; source_binding_json:string|null;media_revision_id:string|null }
export class CmsPageLocales {
  constructor(private repository: CmsRepository, private source: (site: string, page: string) => DocumentDto, private media?:CmsMedia,private portfolio?:CmsPortfolio) {
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
    repository.db.transaction(()=>{
      const columns=repository.db.pragma('table_info(cms_locale_revisions)') as Array<{name:string}>;
      if(!columns.some((column)=>column.name==='source_binding_json'))repository.db.exec('ALTER TABLE cms_locale_revisions ADD COLUMN source_binding_json TEXT');
      if(!columns.some((column)=>column.name==='media_revision_id'))repository.db.exec('ALTER TABLE cms_locale_revisions ADD COLUMN media_revision_id TEXT');
      repository.db.prepare('INSERT OR IGNORE INTO cms_migrations VALUES(6)').run();
    }).immediate();
    repository.db.transaction(()=>repository.db.exec(`
      CREATE TABLE IF NOT EXISTS cms_home_locale_revisions(id TEXT PRIMARY KEY,website_id TEXT NOT NULL REFERENCES cms_home_identity(website_id),
        page_id TEXT NOT NULL CHECK(page_id='home'),locale TEXT NOT NULL CHECK(locale='en'),content TEXT NOT NULL,structure TEXT NOT NULL,
        actor_id TEXT NOT NULL,created_at TEXT NOT NULL,source_binding_json TEXT,media_revision_id TEXT);
      CREATE TABLE IF NOT EXISTS cms_home_locale_heads(website_id TEXT NOT NULL REFERENCES cms_home_identity(website_id),page_id TEXT NOT NULL CHECK(page_id='home'),
        locale TEXT NOT NULL CHECK(locale='en'),slug TEXT COLLATE NOCASE,revision_id TEXT NOT NULL REFERENCES cms_home_locale_revisions(id),version INTEGER NOT NULL,
        PRIMARY KEY(website_id,page_id,locale),UNIQUE(website_id,locale,slug),
        CHECK(slug IS NULL OR (slug COLLATE BINARY=lower(trim(slug)) AND length(slug)>0 AND slug NOT GLOB '*[^a-z0-9-]*')));
      INSERT OR IGNORE INTO cms_migrations VALUES(7);
    `)).immediate();
  }
  // Table names are chosen only from this fixed identity switch, never request text.
  private tables(page:string){return page==='home'?{heads:'cms_home_locale_heads',revisions:'cms_home_locale_revisions'}:{heads:'cms_locale_heads',revisions:'cms_locale_revisions'};}
  private bindings(doc:DocumentDto):ImageBinding[]{
    return doc.content.blocks.flatMap((block)=>block.type==='image'?[{blockId:block.blockId,assetId:block.reference.assetId,fileVersion:block.reference.fileVersion,
      usage:block.reference.usage,decorative:block.reference.decorative}]:[]);
  }
  private structure(doc: DocumentDto) {
    return createHash('sha256').update(JSON.stringify(doc.content.blocks.map((block) => ({blockId:block.blockId,type:block.type,...(block.type==='image'?{image:{assetId:block.reference.assetId,fileVersion:block.reference.fileVersion,usage:block.reference.usage,decorative:block.reference.decorative}}:{})})))).digest('hex');
  }
  get(site: string, page: string) {
    const source = this.source(site, page); const structure = this.structure(source);
    const row = this.repository.db.prepare(`SELECT h.revision_id,h.version,r.content,r.structure,r.source_binding_json,r.media_revision_id FROM ${this.tables(page).heads} h
      JOIN ${this.tables(page).revisions} r ON r.id=h.revision_id WHERE h.website_id=? AND h.page_id=? AND h.locale='en'`).get(site, page) as Row | undefined;
    const content: EnglishContent = row ? JSON.parse(row.content) : { schemaVersion: 1, locale: 'en', title: null, slug: null,
      seoTitle: null, seoDescription: null, blocks: source.content.blocks.flatMap<EnglishContent['blocks'][number]>((block) => block.type==='text'?[{blockId:block.blockId,type:'text',heading:null,body:null}]:block.type==='image'?[{blockId:block.blockId,type:'image',altText:null,caption:null}]:block.type==='portfolio'?[{blockId:block.blockId,type:'portfolio',selection:null,labels:block.labels ?? defaultPortfolioLabels()}]:[]) };
    return { pageId: page, locale: 'en' as const, defaultLocale: 'nl' as const, revisionId: row?.revision_id ?? null,
      version: row?.version ?? 0, structure, savedStructure: row?.structure ?? structure,
      needsUpdate: !!row && row.structure !== structure, supported: true,
      sourceImages:this.bindings(source), sourceBlocks: source.content.blocks.map(({ blockId, type }) => ({ blockId, type })), content };
  }
  save(site: string, page: string, input: z.infer<typeof localeSaveSchema>, actor: string) {
    return this.repository.db.transaction(() => {
      if (this.source(site, page).archived) throw new CmsError(409, 'Herstel de pagina voordat je het taalconcept wijzigt');
      const current = this.get(site, page);
      if (current.version !== input.expectedVersion || current.structure !== input.expectedStructure)
        throw new CmsError(409, 'Taalversie of NL-blokstructuur gewijzigd. Jouw invoer blijft bewaard; laad de actuele structuur.');
      if(current.needsUpdate&&!input.confirmSourceChange)throw new CmsError(409,'Bevestig eerst de bijgewerkte NL-structuur en beeldbinding; je EN-invoer blijft behouden.');
      if (JSON.stringify(input.content.blocks.map(({ blockId, type }) => ({ blockId, type }))) !== JSON.stringify(current.sourceBlocks))
        throw new CmsError(409, 'EN-blokken moeten exact bij de actuele NL-structuur horen');
      const slug = input.content.slug || null;
      if(page!=='home'&&slug==='index')throw new CmsError(400,'Index is gereserveerd voor home');
      const snapshots = this.repository.db.prepare(`SELECT s.snapshot FROM cms_site_snapshots s JOIN cms_attempts a ON a.id=s.release_id
        WHERE a.website_id=? AND a.status IN ('building','published')`).all(site) as Array<{ snapshot: string }>;
      for (const row of snapshots) {
        const locked = (JSON.parse(row.snapshot) as SiteSnapshot).pages.find((item) => item.pageId === page && item.content.locale === 'en');
        if (locked && locked.content.slug !== slug) throw new CmsError(409, 'Gepubliceerde EN-slug staat vast; redirects vallen buiten deze stap');
      }
      if (slug && this.repository.db.prepare(`SELECT page_id FROM (SELECT website_id,page_id,locale,slug FROM cms_locale_heads UNION ALL SELECT website_id,page_id,locale,slug FROM cms_home_locale_heads) WHERE website_id=? AND locale='en' AND slug=? AND page_id<>?`).get(site, slug, page))
        throw new CmsError(409, 'Deze EN-slug bestaat al binnen de website');
      const id = randomUUID();
      for(const block of input.content.blocks)if(block.type==='portfolio'&&block.selection){
        if(block.selection.localeContext.locale!=='en')throw new CmsError(400,'Kies expliciet een EN-catalogussnapshot');
        if(!this.portfolio)throw new CmsError(503,'Catalogus niet beschikbaar');
        this.portfolio.pin(site,page,id,{blockId:block.blockId,type:'portfolio',...block.selection,labels:block.labels});
      }
      const bindings=current.sourceImages;
      const refs=this.references(input.content,bindings);
      const previous=this.repository.db.prepare(`SELECT content,source_binding_json,media_revision_id FROM ${this.tables(page).revisions} WHERE website_id=? AND id=?`)
        .get(site,current.revisionId) as {content:string;source_binding_json:string|null;media_revision_id:string|null}|undefined;
      let mediaRevision:string|null=null;
      if(refs.length){
        if(!this.media)throw new CmsError(503,'Mediaopslag niet beschikbaar');
        if(previous?.media_revision_id&&JSON.stringify(refs)===JSON.stringify(this.references(JSON.parse(previous.content),JSON.parse(previous.source_binding_json??'[]'))))mediaRevision=previous.media_revision_id;
        else{this.media.store.saveReferences(this.media.websiteScope(site),{module:'cms',ownerId:page,revisionId:id,expectedVersion:0,references:refs});mediaRevision=id;}
      }
      this.repository.db.prepare(`INSERT INTO ${this.tables(page).revisions}(id,website_id,page_id,locale,content,structure,actor_id,created_at,source_binding_json,media_revision_id) VALUES(?,?,?,'en',?,?,?,?,?,?)`)
        .run(id,site,page,JSON.stringify(input.content),current.structure,actor,new Date().toISOString(),JSON.stringify(bindings),mediaRevision);
      this.repository.db.prepare(`INSERT INTO ${this.tables(page).heads} VALUES(?,?,'en',?,?,1)
        ON CONFLICT(website_id,page_id,locale) DO UPDATE SET slug=excluded.slug,revision_id=excluded.revision_id,version=version+1`)
        .run(site, page, slug, id);
      return this.get(site, page);
    }).immediate();
  }
  complete(site: string, page: string, revisionId?: string) {
    const current = this.get(site, page);
    if (!current.supported || current.needsUpdate) throw new CmsError(409, 'EN moet worden bijgewerkt naar de actuele tekstblokstructuur');
    if (revisionId && revisionId !== current.revisionId) throw new CmsError(409, 'EN-revisie gewijzigd');
    return this.previewRevision(site,page,current.revisionId!);
  }
  previewRevision(site: string, page: string, revisionId: string) {
    this.source(site, page);
    const row = this.repository.db.prepare(`SELECT content,source_binding_json FROM ${this.tables(page).revisions} WHERE website_id=? AND page_id=? AND id=? AND locale='en'`)
      .get(site, page, revisionId) as {content: string;source_binding_json:string|null} | undefined;
    if (!row) throw new CmsError(404, 'EN-revisie niet gevonden');
    return this.completeContent(englishContentSchema.parse(JSON.parse(row.content)),JSON.parse(row.source_binding_json??'[]'));
  }
  mediaRevision(site:string,page:string,revisionId:string):string|null{
    const row=this.repository.db.prepare(`SELECT media_revision_id FROM ${this.tables(page).revisions} WHERE website_id=? AND page_id=? AND id=?`).get(site,page,revisionId) as {media_revision_id:string|null}|undefined;
    if(!row)throw new CmsError(404,'EN-revisie niet gevonden');return row.media_revision_id;
  }
  private references(content:EnglishContent,bindings:ImageBinding[]):MediaReference[]{
    return content.blocks.flatMap((block)=>{
      if(block.type!=='image')return[];
      const source=bindings.find((item)=>item.blockId===block.blockId);
      if(!source)throw new CmsError(409,'Onveranderlijke beeldbinding ontbreekt');
      return[{assetId:source.assetId,fileVersion:source.fileVersion,usage:source.usage,decorative:source.decorative,altText:{en:block.altText??''}}];
    });
  }
  private completeContent(content: EnglishContent,bindings:ImageBinding[]) {
    const context = { defaultLocale: 'nl' as const, locale: 'en' as const };
    for (const value of [content.title, content.slug, content.seoTitle, ...content.blocks.flatMap((block) => block.type==='text'?[block.body]:[])]) {
      if (!validateContentField({ en: value }, context, CONTENT_PUBLICATION_RULES_V1.title).valid)
        throw new CmsError(400, 'Vul EN-titel, slug, SEO-titel en elk tekstblok rechtstreeks in. Geen NL-fallback.');
    }
    return { ...content, title: content.title!, slug: content.slug!, seoTitle: content.seoTitle!, seoDescription: content.seoDescription ?? '',
      blocks: content.blocks.map((block) => {
        if(block.type==='text')return {...block,heading:block.heading??'',body:block.body!};
        if(block.type==='portfolio'){
          if(!block.selection||block.selection.localeContext.locale!=='en')throw new CmsError(400,'Kies expliciet een EN-catalogussnapshot');
          for(const values of [block.labels.heading,block.labels.empty])if(!validateContentField(values,context,CONTENT_PUBLICATION_RULES_V1.title).valid)
            throw new CmsError(400,'Vul portfolio-kop en lege-staattekst rechtstreeks in EN in');
          return {blockId:block.blockId,type:'portfolio' as const,...block.selection,labels:block.labels};
        }
        const reference=this.references(content,bindings).find((item)=>item.usage===bindings.find((binding)=>binding.blockId===block.blockId)?.usage)!;
        if(reference.decorative ? block.altText!=='' : !validateContentField({en:block.altText},context,CONTENT_PUBLICATION_RULES_V1.alt).valid)
          throw new CmsError(400,'Vul betekenisvolle EN-alt rechtstreeks in; decoratief gebruik vereist expliciet lege alt.');
        return {blockId:block.blockId,type:'image' as const,reference,caption:block.caption??''};
      }) };
  }
  plan(site: string, selectedIds: ReadonlySet<string>) {
    return (this.repository.db.prepare(`SELECT page_id FROM (SELECT website_id,page_id,locale FROM cms_locale_heads UNION ALL SELECT website_id,page_id,locale FROM cms_home_locale_heads) WHERE website_id=? AND locale='en'`).all(site) as Array<{ page_id: string }>).
      filter(({ page_id }) => selectedIds.has(page_id)).map(({ page_id }) => { const draft = this.get(site, page_id); return { pageId: page_id, locale: 'en' as const,
        revisionId: draft.revisionId!, version: draft.version, structure: draft.structure, title: draft.content.title,
        slug: draft.content.slug, needsUpdate: draft.needsUpdate, supported: draft.supported }; });
  }
}
