import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {buildCmsApp,type CmsAppOptions} from '../src/modules/cms/app.js';
import {createMediaFixture} from '../src/media-fixture/fixture.js';

const base='/api/v1/cms/websites/demo-cms';const headers={authorization:'Bearer image-publisher'};
const cleanup:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function start(hooks:CmsAppOptions['hooks']={}){
  const fixture=createMediaFixture();cleanup.push(()=>fixture.cleanup());
  const root=mkdtempSync(join(tmpdir(),'cms-home-en-'));cleanup.push(()=>{if(!resolve(root).startsWith(resolve(tmpdir()))||!root.includes('cms-home-en-'))throw new Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});});
  const options={runtimeRoot:root,seed:true,enablePages:true,enableMedia:true,enableUploads:true,enableSharedNavigation:true,mediaRoot:fixture.root,hooks,
    credentials:[{name:'Image publisher',role:'publisher',websiteIds:['demo-cms','demo-other'],tokenHash:createHash('sha256').update('image-publisher').digest('hex')}]};
  let running=await buildCmsApp(options);cleanup.push(async()=>{await running.app.close();});
  return {fixture,root,get running(){return running;},async reopen(){await running.app.close();running=await buildCmsApp(options);}};
}
type Test=Awaited<ReturnType<typeof start>>;
async function approve(test:Test){expect((await test.running.app.inject({method:'PUT',url:base+'/media/photo/rights',headers,payload:{expectedVersion:1,status:'cleared',owner:'Synthetic test maker',source:'Fixed test image',basis:'Fictitious rights for local testing only',confirmed:true}})).statusCode).toBe(200);}
async function home(test:Test,image=false,decorative=false){
  const old=(await test.running.app.inject({url:base+'/pages/home',headers})).json();
  const values={...old.values,title:'NL home',intro:'Nederlandse introductie',image:image?{assetId:'photo',fileVersion:1,usage:'hero',decorative,altText:{nl:decorative?'':'Nederlands homebeeld'}}:null};
  const result=await test.running.app.inject({method:'PUT',url:base+'/pages/home/draft',headers,payload:{expectedVersion:old.pageVersion,values}});expect(result.statusCode).toBe(200);return result.json();
}
async function source(test:Test){return (await test.running.app.inject({url:base+'/documents/home',headers})).json();}
async function get(test:Test,pageId:string){const result=await test.running.app.inject({url:`${base}/documents/${pageId}/locales/en`,headers});expect(result.statusCode).toBe(200);return result.json();}
function translated(draft:Awaited<ReturnType<typeof get>>){return {...draft.content,title:'English image page',slug:'index',seoTitle:'English image SEO',blocks:draft.content.blocks.map((block:{type:string})=>block.type==='text'?{...block,heading:'English heading',body:'English text'}:{...block,altText:'English red sample',caption:'English caption'})};}
async function save(test:Test,draft:Awaited<ReturnType<typeof get>>,content=translated(draft),confirmSourceChange=false){return test.running.app.inject({method:'PUT',url:`${base}/documents/${draft.pageId}/locales/en`,headers,payload:{expectedVersion:draft.version,expectedStructure:draft.structure,confirmSourceChange,content}});}
async function publish(test:Test,en=true){const plan=(await test.running.app.inject({url:base+'/site-plan',headers})).json();return test.running.app.inject({method:'POST',url:base+'/releases',headers:{...headers,'idempotency-key':randomUUID()},payload:{revisionId:plan.pages[0].revisionId,expectedActiveVersion:plan.activeVersion,
  expectedShared:{revisionId:plan.shared.revisionId,version:plan.shared.version},expectedPages:plan.pages.map(({pageId,revisionId,version}:{pageId:string;revisionId:string;version:number})=>({pageId,revisionId,version})),
  expectedLocales:en?plan.localeVariants.map(({pageId,locale,revisionId,version,structure}:{pageId:string;locale:string;revisionId:string;version:number;structure:string})=>({pageId,locale,revisionId,version,structure})):[]}});}
async function preview(test:Test,draft:Awaited<ReturnType<typeof get>>){return test.running.app.inject({url:`${base}/documents/${draft.pageId}/locales/en/previews/${draft.revisionId}`,headers});}
const imagePath=(html:string)=>html.match(/<img src="([^"]+)"/)![1];

describe('CMS English home adapter',()=>{
  for(const withImage of [false,true])it(`adds home EN to an old ${withImage?'image':'text'} fixture without rewriting NL or old published bytes`,async()=>{
    const test=await start();if(withImage)await approve(test);await home(test,withImage);const first=await publish(test,false);expect(first.statusCode).toBe(200);
    const oldHtml=readFileSync(join(test.root,'releases','demo-cms',first.json().releaseId,'index.html'),'utf8');const oldRows=test.running.repository.db.prepare('SELECT * FROM cms_revisions ORDER BY id').all();
    test.running.repository.db.exec('DROP TABLE cms_home_locale_heads;DROP TABLE cms_home_locale_revisions;DROP TABLE cms_home_blocks;DELETE FROM cms_migrations WHERE version=7');
    await test.reopen();const nl=await source(test);expect(nl.pageId).toBe('home');expect(nl.content.blocks[0].blockId).toMatch(/^[a-f0-9-]{36}$/);const ids=nl.content.blocks.map((block:{blockId:string})=>block.blockId);
    expect(test.running.repository.db.prepare("SELECT count(*) AS n FROM cms_documents WHERE id='home'").get()).toEqual({n:0});expect(test.running.repository.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    const en=(await save(test,await get(test,'home'))).json();expect((await preview(test,en)).statusCode).toBe(200);const released=await publish(test);expect(released.statusCode).toBe(200);
    const html=(await test.running.app.inject('/sites/demo-cms/en/index.html')).body;expect(html).toContain('<html lang="en">');expect(html).toContain('English text');expect(html).toContain('/sites/demo-cms/index.html');expect(html).toContain('/sites/demo-cms/en/index.html');
    if(withImage){expect(html).toContain('alt="English red sample"');expect((await test.running.app.inject(imagePath(html))).statusCode).toBe(200);}
    await test.reopen();expect((await source(test)).content.blocks.map((block:{blockId:string})=>block.blockId)).toEqual(ids);expect((await get(test,'home')).revisionId).toBe(en.revisionId);expect((await test.running.app.inject('/sites/demo-cms/en/index.html')).body).toBe(html);
    expect(test.running.repository.db.prepare('SELECT * FROM cms_revisions ORDER BY id').all()).toEqual(oldRows);expect(readFileSync(join(test.root,'releases','demo-cms',first.json().releaseId,'index.html'),'utf8')).toBe(oldHtml);
  });
  it('keeps home identity separate from document IDs and enforces a global EN slug namespace including index',async()=>{
    const test=await start();await home(test);const doc=(await test.running.app.inject({method:'POST',url:base+'/documents',headers,payload:{title:'Document named home',slug:'home'}})).json();expect(doc.pageId).not.toBe('home');
    const initial=await get(test,'home');const values=translated(initial);values.slug='shared-route';const en=(await save(test,initial,values)).json();
    const other=await get(test,doc.pageId);for(const slug of ['shared-route','index']){const invalid=translated(other);invalid.slug=slug;expect([400,409]).toContain((await save(test,other,invalid)).statusCode);}
    values.slug='index';expect((await save(test,en,values)).statusCode).toBe(200);
    const homeWrite=await test.running.app.inject({method:'PUT',url:base+'/documents/home/draft',headers,payload:{expectedVersion:1,content:(await source(test)).content}});expect(homeWrite.statusCode).toBe(400);
    expect((await test.running.app.inject({url:base+'/documents/unknown/locales/en',headers})).statusCode).toBe(404);
  });
  it('keeps exact home image binding, source CAS, retained releases and direct EN alt rules',async()=>{
    const test=await start();await approve(test);let nl=await home(test,true);let en=(await save(test,await get(test,'home'))).json();const first=await publish(test);expect(first.statusCode).toBe(200);const before=await preview(test,en);const publicHtml=(await test.running.app.inject('/sites/demo-cms/en/index.html')).body;const oldBytes=(await test.running.app.inject(imagePath(publicHtml))).rawPayload;
    const values=structuredClone(nl.values);values.image.fileVersion=2;const changed=await test.running.app.inject({method:'PUT',url:base+'/pages/home/draft',headers,payload:{expectedVersion:nl.pageVersion,values}});expect(changed.statusCode).toBe(200);nl=changed.json();
    expect((await save(test,en,en.content)).statusCode).toBe(409);const latest=await get(test,'home');expect(latest.needsUpdate).toBe(true);expect((await save(test,latest,latest.content)).statusCode).toBe(409);expect((await preview(test,en)).body).toBe(before.body);
    en=(await save(test,latest,latest.content,true)).json();const dirty=structuredClone(en.content);dirty.blocks[1].altText=null;en=(await save(test,en,dirty)).json();expect((await publish(test)).statusCode).toBe(400);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
    values.image.decorative=true;values.image.altText.nl='';expect((await test.running.app.inject({method:'PUT',url:base+'/pages/home/draft',headers,payload:{expectedVersion:nl.pageVersion,values}})).statusCode).toBe(200);const decorative=await get(test,'home');dirty.blocks[1].altText='';dirty.blocks[1].caption='';en=(await save(test,decorative,dirty,true)).json();expect((await publish(test)).statusCode).toBe(200);expect((await test.running.app.inject('/sites/demo-cms/en/index.html')).body).toContain('alt=""');expect((await test.running.app.inject(imagePath(publicHtml))).rawPayload).toEqual(oldBytes);expect(()=>test.fixture.store.purge('fixture-alpha','photo',2,true)).toThrow('retained');
  });
  it('freezes home EN before async build and keeps newer EN drafts and home source separate',async()=>{
    let entered!:()=>void;let release!:()=>void;const ready=new Promise<void>((r)=>{entered=r;});const held=new Promise<void>((r)=>{release=r;});const test=await start({beforeBuild:async()=>{entered();await held;}});await approve(test);const nl=await home(test,true);const en=(await save(test,await get(test,'home'))).json();const pending=publish(test);await ready;
    const changed=structuredClone(en.content);changed.blocks[0].body='Unpublished home EN';expect((await save(test,en,changed)).statusCode).toBe(200);const values=structuredClone(nl.values);values.image.fileVersion=2;expect((await test.running.app.inject({method:'PUT',url:base+'/pages/home/draft',headers,payload:{expectedVersion:nl.pageVersion,values}})).statusCode).toBe(200);release();const result=await pending;expect(result.statusCode).toBe(200);const html=(await test.running.app.inject('/sites/demo-cms/en/index.html')).body;expect(html).toContain('English text');expect(html).not.toContain('Unpublished home EN');const manifest=JSON.parse(readFileSync(join(test.root,'releases','demo-cms',result.json().releaseId,'release.json'),'utf8'));expect(manifest.pages.find((page:{locale:string})=>page.locale==='en').media[0].fileVersion).toBe(1);expect((await get(test,'home')).needsUpdate).toBe(true);
  });
  for(const failure of ['rights','hash'])it(`keeps old home release on final ${failure} failure`,async()=>{
    let fail=false;let test!:Test;test=await start({beforeActivate:async()=>{if(!fail)return;if(failure==='rights')await test.running.app.inject({method:'PUT',url:base+'/media/photo/rights',headers,payload:{expectedVersion:2,status:'blocked',owner:'Synthetic maker',source:'Fixture',basis:'Fictitious block',confirmed:true}});else{const manifest=test.fixture.store.resolveRelease('fixture-alpha',{releaseId:randomUUID(),revisionId:test.running.documents!.locales.mediaRevision('demo-cms','home',(await get(test,'home')).revisionId)!,locales:['en']});writeFileSync(join(test.fixture.root,manifest.references[0].variants[0].path),Buffer.from('corrupt fixture bytes'));}}});await approve(test);await home(test,true);await save(test,await get(test,'home'));const first=await publish(test);expect(first.statusCode).toBe(200);fail=true;expect((await publish(test)).statusCode).toBe(422);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
  });
});
