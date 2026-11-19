import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {validateContentField,CONTENT_PUBLICATION_RULES_V1,type LocalizedTextValues} from '@draconis/shared';
import {contactBundle,type ContactBundle} from './contact-fixture/bundle.js';
import {contactContentSchema,contactSaveSchema,contactSelectionSchema,pageBaseline,contactSharedBaseline} from './contact-fields.js';
import type {CmsRepository} from './repository.js';
import type {CmsSharedNavigation,SharedNavigationDto} from './shared-navigation.js';
import {CmsError,encode} from './model.js';
export const bundleHash=(bundle:ContactBundle)=>createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
export const templateCsp="default-src 'none'; style-src 'self'; script-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'";
export const previewCsp=(_bundle:ContactBundle)=>templateCsp;
export const previewSelectionSchema=contactSelectionSchema.omit({locales:true}).extend({sharedRevisionId:z.string().uuid(),sharedVersion:z.number().int().positive(),locale:z.enum(['nl','en'])}).strict();
type Selection=z.infer<typeof contactSelectionSchema>;
export interface ContactRecord {revisionId:string;version:number;content:z.infer<typeof contactContentSchema>}
export interface ContactPin {page:ContactRecord;shared:SharedNavigationDto;templateHash:string;bundle:ContactBundle;locales:Array<'nl'|'en'>}
const routes={home:'contact-fixture-home.html',work:'contact-fixture-work.html',travels:'contact-fixture-travels.html',about:'contact-fixture-about.html',office:'contact-fixture-office.html',contact:'contact-fixture.html',now:'contact-fixture-now.html'} as const;
export const contactRouteFiles=Object.values(routes);
const routeFields={home:'navHome',work:'navWork',travels:'navTravels',about:'navAbout',office:'navOffice',now:'footerNow'} as const;
export class CmsContactTemplate {
 constructor(private repository:CmsRepository,private shared:CmsSharedNavigation,private load:()=>ContactBundle=()=>structuredClone(contactBundle)){
  repository.db.transaction(()=>{
   repository.db.exec(`CREATE TABLE IF NOT EXISTS cms_contact_revisions(id TEXT PRIMARY KEY,website_id TEXT NOT NULL REFERENCES cms_sites(id),version INTEGER NOT NULL,content TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(website_id,version));
    CREATE TABLE IF NOT EXISTS cms_contact_heads(website_id TEXT PRIMARY KEY REFERENCES cms_sites(id),revision_id TEXT NOT NULL REFERENCES cms_contact_revisions(id),version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cms_contact_templates(hash TEXT PRIMARY KEY,bundle TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cms_contact_previews(id TEXT PRIMARY KEY,website_id TEXT NOT NULL REFERENCES cms_sites(id),pin TEXT NOT NULL,locale TEXT NOT NULL CHECK(locale IN ('nl','en')));
    INSERT OR IGNORE INTO cms_migrations VALUES(8);`);
   for(const {id:site} of repository.db.prepare('SELECT id FROM cms_sites').all() as Array<{id:string}>){
    if(!repository.db.prepare('SELECT 1 FROM cms_contact_heads WHERE website_id=?').get(site)){
     const id=randomUUID();repository.db.prepare('INSERT INTO cms_contact_revisions VALUES(?,?,1,?,?,?)').run(id,site,JSON.stringify(pageBaseline()),'migration-8-fictional-fixture',new Date().toISOString());
     repository.db.prepare('INSERT INTO cms_contact_heads VALUES(?,?,1)').run(site,id);
    }
    const sharedRecord=shared.get(site);if(!sharedRecord.content.contact)shared.save(site,{expectedVersion:sharedRecord.version,content:{...sharedRecord.content,contact:contactSharedBaseline()}},'migration-8-fictional-fixture');
   }
   this.currentTemplate();
  }).immediate();
 }
 private currentTemplate(){
  const bundle=this.load();
  if(bundle.id!=='sanitized-contact'||bundle.schemaVersion!==1||bundle.sourceDefaultLocale!=='en'||bundle.bindings.length!==27||new Set(bundle.bindings.map(b=>b.id)).size!==27)throw new CmsError(400,'Ongeldig contacttemplateschema');
  const hash=bundleHash(bundle);this.repository.db.prepare('INSERT OR IGNORE INTO cms_contact_templates VALUES(?,?)').run(hash,JSON.stringify(bundle));return {id:bundle.id,schemaVersion:bundle.schemaVersion,hash,sourceDefaultLocale:bundle.sourceDefaultLocale};
 }
 get(site:string){this.repository.page(site);const row=this.repository.db.prepare('SELECT revision_id,version FROM cms_contact_heads WHERE website_id=?').get(site) as {revision_id:string;version:number};return this.revision(site,row.revision_id,row.version);}
 private revision(site:string,id:string,version:number):ContactRecord{
  const row=this.repository.db.prepare('SELECT content FROM cms_contact_revisions WHERE website_id=? AND id=? AND version=?').get(site,id,version) as {content:string}|undefined;
  if(!row)throw new CmsError(404,'Contactrevisie niet gevonden');return {revisionId:id,version,content:JSON.parse(row.content)};
 }
 plan(site:string){return {...this.get(site),template:this.currentTemplate(),bindings:contactBundle.bindings,routes};}
 save(site:string,input:z.infer<typeof contactSaveSchema>,actor:string){return this.repository.db.transaction(()=>{
  const prior=this.get(site);if(prior.version!==input.expectedVersion)throw new CmsError(409,'Contactversie gewijzigd. Je invoer blijft behouden.');
  const id=randomUUID(),version=prior.version+1;this.repository.db.prepare('INSERT INTO cms_contact_revisions VALUES(?,?,?,?,?,?)').run(id,site,version,JSON.stringify(input.content),actor,new Date().toISOString());
  this.repository.db.prepare('UPDATE cms_contact_heads SET revision_id=?,version=? WHERE website_id=? AND version=?').run(id,version,site,input.expectedVersion);return this.get(site);
 }).immediate();}
 private pin(site:string,record:ContactRecord,shared:SharedNavigationDto,hash:string,locales:Array<'nl'|'en'>):ContactPin{
  const row=this.repository.db.prepare('SELECT bundle FROM cms_contact_templates WHERE hash=?').get(hash) as {bundle:string}|undefined;
  if(!row)throw new CmsError(404,'Templateversie niet gevonden');const bundle=JSON.parse(row.bundle) as ContactBundle;
  const pin={page:record,shared,templateHash:hash,bundle,locales};this.validate(pin);return pin;
 }
 capture(site:string,selected:Selection|undefined,shared:SharedNavigationDto|undefined):ContactPin|undefined{
  if(!selected){const active=this.repository.active(site).activeReleaseId;
   if(active){const row=this.repository.db.prepare('SELECT snapshot FROM cms_site_snapshots WHERE release_id=?').get(active) as {snapshot:string}|undefined;if(row&&JSON.parse(row.snapshot).contact)throw new CmsError(428,'Kies de contactrevisie expliciet om de bestaande templatepublicatie te behouden');}
   return undefined;
  }
  const current=this.get(site);if(current.revisionId!==selected.revisionId||current.version!==selected.version||this.currentTemplate().hash!==selected.templateHash)throw new CmsError(409,'Contactpagina of template gewijzigd. Haal de selectie opnieuw op.');
  if(!shared)throw new CmsError(428,'Gedeelde revisie vereist voor het contacttemplate');
  return this.pin(site,current,shared,selected.templateHash,selected.locales);
 }
 preview(site:string,input:z.infer<typeof previewSelectionSchema>){
  const pin=this.pin(site,this.revision(site,input.revisionId,input.version),this.shared.revision(site,input.sharedRevisionId,input.sharedVersion),input.templateHash,[input.locale]);
  const id=randomUUID();this.repository.db.prepare('INSERT INTO cms_contact_previews VALUES(?,?,?,?)').run(id,site,JSON.stringify(pin),input.locale);return {previewId:id};
 }
 previewHtml(site:string,id:string){this.repository.page(site);const row=this.repository.db.prepare('SELECT pin,locale FROM cms_contact_previews WHERE website_id=? AND id=?').get(site,id) as {pin:string;locale:'nl'|'en'}|undefined;if(!row)throw new CmsError(404,'Contactpreview niet gevonden');const pin=JSON.parse(row.pin) as ContactPin;return {html:this.render(pin,site,row.locale),csp:previewCsp(pin.bundle)};}
 private value(pin:ContactPin,key:string,locale:'nl'|'en'){
  let values:LocalizedTextValues|undefined;
  if(key.startsWith('contact.'))values=pin.page.content.fields[key.slice(8) as keyof ContactRecord['content']['fields']];
  else if(key.startsWith('_shared.'))values=pin.shared.content.contact?.[key.slice(8) as keyof NonNullable<SharedNavigationDto['content']['contact']>];
  else if(key==='navigation.languageLabel')values=pin.shared.content.fields[key].values;
  else if(key==='navigation.locale.en'||key==='navigation.locale.nl'){
   const field=pin.shared.content.fields[key];const result=validateContentField({[field.sourceLocale]:field.value},{defaultLocale:'nl',locale:field.sourceLocale},CONTENT_PUBLICATION_RULES_V1.title);if(!result.valid)throw new CmsError(400,'Taalnaam ontbreekt');return result.value!;
  }
  if(!values)throw new CmsError(400,`Onbekend of ontbrekend templateveld ${key}`);
  const optional=['contact.note','_shared.footerCopyright'].includes(key);const result=validateContentField(values,{defaultLocale:'nl',locale},{required:!optional,allowFallback:false});
  if(!result.valid)throw new CmsError(400,`Directe ${locale}-waarde vereist voor ${key}`);
  const value=result.value??'';
  if(key==='contact.email'&&!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@example\.invalid$/.test(value))throw new CmsError(400,'Gebruik een fictief example.invalid-emailadres');
  if(key==='contact.githubUrl'||key==='contact.linkedinUrl'){
   let url:URL;try{url=new URL(value);}catch{throw new CmsError(400,'Ongeldige fictieve link');}
   if(url.protocol!=='https:'||url.hostname!=='example.invalid'||url.username||url.password||url.port||Array.from(value).some(char=>char.charCodeAt(0)<=32||char.charCodeAt(0)===127))throw new CmsError(400,'Alleen https-links op example.invalid zijn toegestaan');
  }
  return value;
 }
 validate(pin:ContactPin){
  if(bundleHash(pin.bundle)!==pin.templateHash)throw new CmsError(400,'Templatehash komt niet overeen');
  const ids=new Set(pin.bundle.bindings.map(binding=>binding.id));
  for(const id of ids)if(!pin.bundle.html.includes('{{'+id+'}}'))throw new CmsError(400,'Templatebinding ontbreekt in HTML');
  for(const match of pin.bundle.html.matchAll(/\{\{([^{}]+)\}\}/g)){
    const key=match[1];if(ids.has(key)||['locale','style','script','email','language.en','language.nl'].includes(key)||key.startsWith('route.')&&Object.hasOwn(routes,key.slice(6)))continue;
    throw new CmsError(400,'Onbekend template-doel');
  }
  if(/<(?:script|style|iframe|form|img|object|embed)\b|\bon[a-z]+\s*=/i.test(pin.bundle.html)||/@import|url\(/i.test(pin.bundle.css))throw new CmsError(400,'Template bevat niet-toegestane actieve of externe inhoud');
  for(const locale of pin.locales)for(const binding of pin.bundle.bindings)this.value(pin,binding.key,locale);
 }
 private href(site:string,locale:'nl'|'en',route:keyof typeof routes){return `/sites/${site}/${locale==='en'?'en/':''}${routes[route]}`;}
 private render(pin:ContactPin,site:string,locale:'nl'|'en',releaseId?:string){
  this.validate(pin);const bindings=new Map(pin.bundle.bindings.map(b=>[b.id,b]));
  return pin.bundle.html.replace(/\{\{([^{}]+)\}\}/g,(_match,key:string)=>{
   if(key==='locale')return locale;
   if(key==='style')return `<link rel="stylesheet" href="${releaseId?`/sites/${site}/template-assets/${releaseId}`:`/contact-fixture-assets/${pin.templateHash}`}/contact.css">`;
   if(key==='script')return `<script src="${releaseId?`/sites/${site}/template-assets/${releaseId}`:`/contact-fixture-assets/${pin.templateHash}`}/contact.js" defer></script>`;
   if(key==='email')return encode('mailto:'+this.value(pin,'contact.email',locale));
   if(key.startsWith('route.')&&Object.hasOwn(routes,key.slice(6)))return encode(this.href(site,locale,key.slice(6) as keyof typeof routes));
   if(key==='language.nl'||key==='language.en'){const target=key.slice(9) as 'nl'|'en';return encode(pin.locales.includes(target)?this.href(site,target,'contact'):'#main');}
   const binding=bindings.get(key);if(!binding)throw new CmsError(400,'Onbekend template-doel');return encode(this.value(pin,binding.key,locale));
  });
 }
 previewAsset(hash:string,filename:string){
  if(!/^[a-f0-9]{64}$/.test(hash)||!['contact.css','contact.js'].includes(filename))throw new CmsError(404,'Templateasset niet gevonden');
  const row=this.repository.db.prepare('SELECT bundle FROM cms_contact_templates WHERE hash=?').get(hash) as {bundle:string}|undefined;
  if(!row)throw new CmsError(404,'Templateasset niet gevonden');const bundle=JSON.parse(row.bundle) as ContactBundle;
  if(bundleHash(bundle)!==hash)throw new CmsError(503,'Templateasset gewijzigd');return Buffer.from(filename.endsWith('.css')?bundle.css:bundle.js);
 }
 release(pin:ContactPin,site:string,releaseId:string){
  const files:Array<{path:string;bytes:Buffer}>=[];
  for(const locale of pin.locales){
   const prefix=locale==='en'?'en/':'';files.push({path:prefix+routes.contact,bytes:Buffer.from(this.render(pin,site,locale,releaseId))});
   for(const [route,field] of Object.entries(routeFields)){
    const title=this.value(pin,'_shared.'+field,locale);files.push({path:prefix+routes[route as keyof typeof routeFields],bytes:Buffer.from(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${encode(title)}</title></head><body><main><h1>${encode(title)}</h1><a href="${encode(this.href(site,locale,'contact'))}">${encode(this.value(pin,'_shared.navContact',locale))}</a></main></body></html>`)});
   }
  }
  files.push({path:`template-assets/${releaseId}/contact.css`,bytes:Buffer.from(pin.bundle.css)},{path:`template-assets/${releaseId}/contact.js`,bytes:Buffer.from(pin.bundle.js)});return files;
 }
}
