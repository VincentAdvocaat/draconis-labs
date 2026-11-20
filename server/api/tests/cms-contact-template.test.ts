import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {afterEach,describe,it,expect} from 'vitest';
import {buildCmsApp,type CmsAppOptions} from '../src/modules/cms/app.js';
import {contactBundle} from '../src/modules/cms/contact-fixture/bundle.js';
const base='/api/v1/cms/websites/demo-cms';const headers={authorization:'Bearer contact-test'};const cleanup:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
async function start(hooks:CmsAppOptions['hooks']={},enabled=true){
 const root=mkdtempSync(join(tmpdir(),'cms-contact-'));cleanup.push(()=>{if(!resolve(root).startsWith(resolve(tmpdir()))||!root.includes('cms-contact-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});});
 let bundle=structuredClone(contactBundle);const options={runtimeRoot:root,seed:true,enablePages:true,enableSharedNavigation:true,enableContactTemplate:enabled,contactTemplateLoader:()=>bundle,hooks,credentials:[{name:'Fixture',role:'publisher',websiteIds:['demo-cms','demo-other'],tokenHash:createHash('sha256').update('contact-test').digest('hex')}]};
 let running=await buildCmsApp(options);cleanup.push(async()=>{await running.app.close();});
 return {root,get running(){return running;},replaceBundle(next:typeof bundle){bundle=next;},async reopen(contact=true){await running.app.close();running=await buildCmsApp({...options,enableContactTemplate:contact});}};
}
type Test=Awaited<ReturnType<typeof start>>;
async function get(test:Test){const result=await test.running.app.inject({url:base+'/contact-template',headers});expect(result.statusCode).toBe(200);return result.json();}
async function shared(test:Test){return (await test.running.app.inject({url:base+'/shared-navigation',headers})).json();}
async function save(test:Test,record:Awaited<ReturnType<typeof get>>,content=record.content){return test.running.app.inject({method:'PUT',url:base+'/contact-template',headers,payload:{expectedVersion:record.version,content}});}
async function saveShared(test:Test,record:Awaited<ReturnType<typeof shared>>,content=record.content){return test.running.app.inject({method:'PUT',url:base+'/shared-navigation',headers,payload:{expectedVersion:record.version,content}});}
async function preview(test:Test,record=undefined as Awaited<ReturnType<typeof get>>|undefined,sharedRecord=undefined as Awaited<ReturnType<typeof shared>>|undefined,locale:'nl'|'en'='en'){
 record??=await get(test);sharedRecord??=await shared(test);
 const result=await test.running.app.inject({method:'POST',url:base+'/contact-template/previews',headers,payload:{revisionId:record.revisionId,version:record.version,templateHash:record.template.hash,sharedRevisionId:sharedRecord.revisionId,sharedVersion:sharedRecord.version,locale}});
 return result.statusCode===200?test.running.app.inject({url:base+'/contact-template/previews/'+result.json().previewId,headers}):result;
}
async function publish(test:Test,selected=true,change:Record<string,unknown>={}){
 const plan=(await test.running.app.inject({url:base+'/site-plan',headers})).json();const contact=plan.contactTemplate;
 return test.running.app.inject({method:'POST',url:base+'/releases',headers:{...headers,'idempotency-key':randomUUID()},payload:{revisionId:plan.pages[0].revisionId,expectedActiveVersion:plan.activeVersion,expectedPages:plan.pages.map(({pageId,revisionId,version}:{pageId:string;revisionId:string;version:number})=>({pageId,revisionId,version})),expectedShared:{revisionId:plan.shared.revisionId,version:plan.shared.version},...(selected?{expectedContact:{revisionId:contact.revisionId,version:contact.version,templateHash:contact.template.hash,locales:['nl','en']}}:{}),...change}});
}
describe('sanitized immutable contact template',()=>{
 it('covers all 27 bindings in NL/EN and serves only pinned self-contained assets and whitelisted synthetic routes',async()=>{
  const test=await start();const record=await get(test);expect(record.bindings).toHaveLength(27);expect(new Set(record.bindings.map((b:{id:string})=>b.id)).size).toBe(27);expect(record.template.sourceDefaultLocale).toBe('en');
  const content=structuredClone(record.content);for(const key of Object.keys(content.fields))if(!['email','githubUrl','linkedinUrl'].includes(key))content.fields[key]={nl:'NL '+key+' <& $&',en:'EN '+key+' <& $&'};
  expect((await save(test,record,content)).statusCode).toBe(200);const sharedRecord=await shared(test);for(const key of Object.keys(sharedRecord.content.contact))sharedRecord.content.contact[key]={nl:'NL '+key+' <& $&',en:'EN '+key+' <& $&'};expect((await saveShared(test,sharedRecord)).statusCode).toBe(200);
  for(const locale of ['nl','en'] as const){const output=await preview(test,undefined,undefined,locale);expect(output.statusCode).toBe(200);expect(output.body).toContain(locale.toUpperCase()+' githubLabel &lt;&amp; $&');expect(output.body).toContain(locale.toUpperCase()+' primaryNavigationLabel &lt;&amp; $&');expect(output.body).toContain(locale.toUpperCase()+' footerCopyright &lt;&amp; $&');for(const key of Object.keys(content.fields))if(!['email','githubUrl','linkedinUrl'].includes(key))expect(output.body).toContain(locale.toUpperCase()+' '+key+' &lt;&amp; $&');for(const key of Object.keys(sharedRecord.content.contact))expect(output.body).toContain(locale.toUpperCase()+' '+key+' &lt;&amp; $&');expect(output.body).toContain('mailto:hello@example.invalid');expect(output.headers['content-security-policy']).toContain("script-src 'self'");}
  const release=await publish(test);expect(release.statusCode).toBe(200);
  for(const locale of ['','en/']){const html=await test.running.app.inject('/sites/demo-cms/'+locale+'contact-fixture.html');expect(html.statusCode).toBe(200);expect(html.headers['content-security-policy']).toContain("script-src 'self'");expect(html.body).not.toMatch(/static-content|cms-editor|fonts\.|Vincent|<form|<img/);for(const match of html.body.matchAll(/(?:href|src)="([^"]+)"/g)){const path=match[1];if(path.startsWith('/sites/'))expect((await test.running.app.inject(path)).statusCode).toBe(200);else expect(path.startsWith('#')||path.startsWith('mailto:')||path.startsWith('https://example.invalid/')).toBe(true);}}
  const manifest=JSON.parse(readFileSync(join(test.root,'releases','demo-cms',release.json().releaseId,'release.json'),'utf8'));expect(manifest.contact).toMatchObject({templateHash:record.template.hash,sourceDefaultLocale:'en',locales:['nl','en']});expect(manifest.defaultLocale).toBe('nl');
 });
 it('preserves local namespace on older shared writes, enforces CAS and scopes revisions/previews to the website',async()=>{
  const test=await start();const record=await get(test);const changed=structuredClone(record.content);changed.fields.heading.en='New heading';expect((await save(test,record,changed)).statusCode).toBe(200);expect((await save(test,record,record.content)).statusCode).toBe(409);
  const sr=await shared(test);const oldClient=structuredClone(sr.content);delete oldClient.contact;expect((await saveShared(test,sr,oldClient)).statusCode).toBe(200);expect((await shared(test)).content.contact).toEqual(sr.content.contact);expect((await saveShared(test,sr)).statusCode).toBe(409);
  const cross=await test.running.app.inject({method:'POST',url:base.replace('demo-cms','demo-other')+'/contact-template/previews',headers,payload:{revisionId:record.revisionId,version:record.version,templateHash:record.template.hash,sharedRevisionId:sr.revisionId,sharedVersion:sr.version,locale:'en'}});expect(cross.statusCode).toBe(404);
  expect((await test.running.app.inject({url:base+'/contact-template'})).statusCode).toBe(401);
 });
 it('keeps null and empty distinct, requires direct text and rejects unsafe URLs without replacing the active release',async()=>{
  const test=await start();let record=await get(test);const first=await publish(test);expect(first.statusCode).toBe(200);
  for(const value of [null,'']){const changed=structuredClone(record.content);changed.fields.heading.en=value;const result=await save(test,record,changed);expect(result.statusCode).toBe(200);record={...record,...result.json()};expect(record.content.fields.heading.en).toBe(value);expect((await preview(test)).statusCode).toBe(400);expect((await publish(test)).statusCode).toBe(400);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);}
  record={...record,...(await save(test,record,{...record.content,fields:{...record.content.fields,heading:{en:'Restored',nl:'Hersteld'},note:{en:null,nl:'NEVER FALL BACK'}}})).json()};expect((await preview(test)).body).not.toContain('NEVER FALL BACK');
  for(const url of ['javascript:alert(1)','data:text/html,bad','//example.invalid/a','http://example.invalid/a','https://example.invalid.evil/a','https://name:password@example.invalid/a','https://example.invalid:444/a','https://example.invalid/\u0000bad']){const changed=structuredClone(record.content);changed.fields.githubUrl.en=url;const result=await save(test,record,changed);expect(result.statusCode).toBe(200);record={...record,...result.json()};expect((await preview(test)).statusCode).toBe(400);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);}
  const injected=structuredClone(record.content);injected.fields.unknown={en:'bad'};expect((await save(test,record,injected)).statusCode).toBe(400);
 });
 it('rejects stale page/template/shared pins, missing explicit retained selection and output route collisions',async()=>{
  const test=await start();const record=await get(test),sr=await shared(test);expect((await publish(test,true,{expectedContact:{revisionId:record.revisionId,version:record.version,templateHash:'0'.repeat(64),locales:['en']}})).statusCode).toBe(409);
  expect((await publish(test,true,{expectedShared:{revisionId:sr.revisionId,version:sr.version-1}})).statusCode).toBe(409);
  const first=await publish(test);expect(first.statusCode).toBe(200);expect((await publish(test,false)).statusCode).toBe(428);
  const doc=(await test.running.app.inject({method:'POST',url:base+'/documents',headers,payload:{title:'Collision',slug:'contact-fixture'}})).json();doc.content.blocks[0].body='Collision body';expect((await test.running.app.inject({method:'PUT',url:base+'/documents/'+doc.pageId+'/draft',headers,payload:{expectedVersion:doc.version,content:doc.content}})).statusCode).toBe(200);expect((await publish(test)).statusCode).toBe(422);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
 });
 it('pins page/shared/template before async work and keeps old previews and public bytes across restart',async()=>{
  let entered!:()=>void;let release!:()=>void;const ready=new Promise<void>(r=>{entered=r;}),held=new Promise<void>(r=>{release=r;});const test=await start({beforeBuild:async()=>{entered();await held;}});
  const record=await get(test),sr=await shared(test);const savedPreview=await test.running.app.inject({method:'POST',url:base+'/contact-template/previews',headers,payload:{revisionId:record.revisionId,version:record.version,templateHash:record.template.hash,sharedRevisionId:sr.revisionId,sharedVersion:sr.version,locale:'en'}});const previewPath=base+'/contact-template/previews/'+savedPreview.json().previewId;const original=(await test.running.app.inject({url:previewPath,headers})).body;
  const pending=publish(test);await ready;const changed=structuredClone(record.content);changed.fields.heading.en='UNPUBLISHED PAGE';expect((await save(test,record,changed)).statusCode).toBe(200);sr.content.contact.brandName.en='UNPUBLISHED SHARED';expect((await saveShared(test,sr)).statusCode).toBe(200);const newer=structuredClone(contactBundle);newer.css+='/* unpublished template */';test.replaceBundle(newer);expect((await get(test)).template.hash).not.toBe(record.template.hash);release();const result=await pending;expect(result.statusCode).toBe(200);
  const html=(await test.running.app.inject('/sites/demo-cms/en/contact-fixture.html')).body;expect(html).not.toMatch(/UNPUBLISHED/);const cssPath=`/sites/demo-cms/template-assets/${result.json().releaseId}/contact.css`;expect((await test.running.app.inject(cssPath)).body).toBe(contactBundle.css);
  await test.reopen();expect((await test.running.app.inject({url:previewPath,headers})).body).toBe(original);expect((await test.running.app.inject('/sites/demo-cms/en/contact-fixture.html')).body).toBe(html);expect((await test.running.app.inject(cssPath)).body).toBe(contactBundle.css);
 });
 it('rejects unknown template route tokens and unpublished assets and verifies retained asset hashes',async()=>{
  const test=await start();const first=await publish(test);expect(first.statusCode).toBe(200);const cssPath=`/sites/demo-cms/template-assets/${first.json().releaseId}/contact.css`;
  const broken=structuredClone(contactBundle);broken.html+='{{route.__proto__}}';test.replaceBundle(broken);expect((await preview(test)).statusCode).toBe(400);expect((await publish(test)).statusCode).toBe(400);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
  expect((await test.running.app.inject(`/sites/demo-cms/template-assets/${randomUUID()}/contact.js`)).statusCode).toBe(404);
  writeFileSync(join(test.root,'releases','demo-cms',first.json().releaseId,'template-assets',first.json().releaseId,'contact.css'),'corrupt synthetic CSS');expect((await test.running.app.inject(cssPath)).statusCode).toBe(503);
 });
 it('adds only new drafts/tables on upgrade and preserves old shared revisions and active HTML',async()=>{
  const test=await start({},false);const sr=await shared(test);const before=(await publish(test,false)).json();const oldHtml=(await test.running.app.inject('/sites/demo-cms/index.html')).body;await test.reopen(true);expect((await shared(test)).version).toBe(sr.version+1);expect(test.running.documents!.shared!.revision('demo-cms',sr.revisionId,sr.version).content).toEqual(sr.content);expect((await test.running.app.inject('/sites/demo-cms/index.html')).body).toBe(oldHtml);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(before.releaseId);expect(test.running.repository.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  const version=(await shared(test)).version;await test.reopen(true);expect((await shared(test)).version).toBe(version);
 });
});
