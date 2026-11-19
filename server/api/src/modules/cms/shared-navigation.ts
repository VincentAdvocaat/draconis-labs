import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {localizedTextValuesSchema, validateContentField, CONTENT_PUBLICATION_RULES_V1} from '@draconis/shared';
import {CmsError, encode} from './model.js';
import type {CmsRepository} from './repository.js';

export const sharedNavigationSchema = z.object({schemaVersion: z.literal(1), fields: z.object({
  'navigation.languageLabel': z.object({values: localizedTextValuesSchema}).strict(),
  'navigation.locale.nl': z.object({value: z.string().max(200).nullable(), sourceLocale: z.literal('nl')}).strict(),
  'navigation.locale.en': z.object({value: z.string().max(200).nullable(), sourceLocale: z.literal('en')}).strict(),
}).strict()}).strict().refine((content) => Object.values(content.fields['navigation.languageLabel'].values)
  .every((value) => value == null || value.length <= 200), 'Navigatietekst maximaal 200 tekens');
export const sharedSaveSchema = z.object({expectedVersion: z.number().int().positive(), content: sharedNavigationSchema}).strict();
export interface SharedSelection {revisionId: string; version: number}
export interface SharedNavigationDto extends SharedSelection {content: z.infer<typeof sharedNavigationSchema>}
export const navigationBaseline = (): SharedNavigationDto['content'] => ({schemaVersion: 1, fields: {
  'navigation.languageLabel': {values: {nl: 'Taal', en: 'Language'}},
  'navigation.locale.nl': {value: 'Nederlands', sourceLocale: 'nl'},
  'navigation.locale.en': {value: 'English', sourceLocale: 'en'},
}});

export class CmsSharedNavigation {
  constructor(private repository: CmsRepository) {
    repository.db.transaction(() => {
      repository.db.exec(`CREATE TABLE IF NOT EXISTS cms_shared_revisions(id TEXT PRIMARY KEY,website_id TEXT NOT NULL REFERENCES cms_sites(id),
        version INTEGER NOT NULL,content TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(website_id,version));
        CREATE TABLE IF NOT EXISTS cms_shared_heads(website_id TEXT PRIMARY KEY REFERENCES cms_sites(id),
          revision_id TEXT NOT NULL REFERENCES cms_shared_revisions(id),version INTEGER NOT NULL);
        INSERT OR IGNORE INTO cms_migrations VALUES(5);`);
      for (const site of repository.db.prepare('SELECT id FROM cms_sites').all() as Array<{id: string}>) {
        if (repository.db.prepare('SELECT 1 FROM cms_shared_heads WHERE website_id=?').get(site.id)) continue;
        const id = randomUUID();
        repository.db.prepare('INSERT INTO cms_shared_revisions VALUES(?,?,1,?,?,?)')
          .run(id,site.id,JSON.stringify(navigationBaseline()),'migration-5-compatibility',new Date().toISOString());
        repository.db.prepare('INSERT INTO cms_shared_heads VALUES(?,?,1)').run(site.id,id);
      }
    }).immediate();
  }
  get(site: string): SharedNavigationDto {
    this.repository.page(site);
    const row = this.repository.db.prepare('SELECT revision_id,version FROM cms_shared_heads WHERE website_id=?').get(site) as {revision_id: string; version: number} | undefined;
    if (!row) throw new CmsError(404,'Navigatietekst niet gevonden');
    return this.revision(site,row.revision_id,row.version);
  }
  revision(site: string, id: string, version: number): SharedNavigationDto {
    const row = this.repository.db.prepare('SELECT content FROM cms_shared_revisions WHERE website_id=? AND id=? AND version=?')
      .get(site,id,version) as {content: string} | undefined;
    if (!row) throw new CmsError(404,'Navigatierevisie niet gevonden');
    return {revisionId: id,version,content: JSON.parse(row.content)};
  }
  save(site: string, input: z.infer<typeof sharedSaveSchema>, actor: string) {
    return this.repository.db.transaction(() => {
      const current = this.get(site);
      if (current.version !== input.expectedVersion) throw new CmsError(409,'Navigatietekst gewijzigd. Jouw invoer blijft behouden.');
      const id = randomUUID(); const version = current.version+1;
      this.repository.db.prepare('INSERT INTO cms_shared_revisions VALUES(?,?,?,?,?,?)').run(id,site,version,JSON.stringify(input.content),actor,new Date().toISOString());
      const updated = this.repository.db.prepare('UPDATE cms_shared_heads SET revision_id=?,version=? WHERE website_id=? AND version=?')
        .run(id,version,site,input.expectedVersion);
      if (!updated.changes) throw new CmsError(409,'Navigatietekst gewijzigd');
      return this.get(site);
    }).immediate();
  }
  capture(site: string, selected?: SharedSelection) {
    if (!selected) throw new CmsError(428,'Kies expliciet de navigatierevisie voor deze release');
    const current = this.get(site);
    if (current.revisionId !== selected.revisionId || current.version !== selected.version) throw new CmsError(409,'De gekozen navigatierevisie is gewijzigd');
    return current;
  }
}

export function navigationText(content: SharedNavigationDto['content'], locale: 'nl'|'en') {
  const context = {defaultLocale: 'nl' as const,locale};
  const heading = validateContentField(content.fields['navigation.languageLabel'].values,context,CONTENT_PUBLICATION_RULES_V1.title);
  const names = (['nl','en'] as const).map((target) => {
    const field = content.fields[`navigation.locale.${target}`];
    const validated = validateContentField({[field.sourceLocale]:field.value},{defaultLocale:'nl',locale:field.sourceLocale},CONTENT_PUBLICATION_RULES_V1.title);
    return {target,sourceLocale:field.sourceLocale,value:validated.value,valid:validated.valid};
  });
  if (!heading.valid || names.some((name) => !name.valid)) throw new CmsError(400,'Vul navigatiekop en taalnamen rechtstreeks in. Geen fallback.');
  return {heading:heading.value!,names};
}
export function languageNavigation(content: SharedNavigationDto['content'], locale: 'nl'|'en', links: Array<{locale:'nl'|'en';href:string}>) {
  const text = navigationText(content,locale);
  return `<nav aria-label="${encode(text.heading)}">` + links.map((link) => {
    const name = text.names.find((name) => name.target === link.locale)!;
    return `<a lang="${name.sourceLocale}" hreflang="${link.locale}" href="${encode(link.href)}">${encode(name.value!)}</a>`;
  }).join(' ') + '</nav>';
}
