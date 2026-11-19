import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
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
  const root=mkdtempSync(join(tmpdir(),'cms-en-image-'));cleanup.push(()=>{if(!resolve(root).startsWith(resolve(tmpdir()))||!root.includes('cms-en-image-'))throw new Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});});
  const options={runtimeRoot:root,seed:true,enablePages:true,enableMedia:true,enableUploads:true,enableSharedNavigation:true,mediaRoot:fixture.root,hooks,
    credentials:[{name:'Image publisher',role:'publisher',websiteIds:['demo-cms','demo-other'],tokenHash:createHash('sha256').update('image-publisher').digest('hex')}]};
  let running=await buildCmsApp(options);cleanup.push(async()=>{await running.app.close();});
  return {fixture,root,get running(){return running;},async reopen(){await running.app.close();running=await buildCmsApp(options);}};
}
type Test=Awaited<ReturnType<typeof start>>;
async function approve(test:Test){expect((await test.running.app.inject({method:'PUT',url:base+'/media/photo/rights',headers,payload:{expectedVersion:1,status:'cleared',owner:'Synthetic test maker',source:'Fixed test image',basis:'Fictitious rights for local testing only',confirmed:true}})).statusCode).toBe(200);}
async function create(test:Test,decorative=false,image=true){
  const doc=(await test.running.app.inject({method:'POST',url:base+'/documents',headers,payload:{title:'NL beeldpagina',slug:'nl-image'}})).json();
  const blockId=randomUUID();
  const result=await test.running.app.inject({method:'PUT',url:`${base}/documents/${doc.pageId}/draft`,headers,payload:{expectedVersion:doc.version,content:{...doc.content,
    blocks:[{...doc.content.blocks[0],body:'Nederlandse tekst'},...(image?[{blockId,type:'image',reference:{assetId:'photo',fileVersion:1,usage:`block-${blockId}`,decorative,altText:{nl:decorative?'':'Nederlands rood proefbeeld'}},caption:'Nederlands bijschrift'}]:[])]}}});
  expect(result.statusCode).toBe(200);return result.json();
}
async function get(test:Test,pageId:string){const result=await test.running.app.inject({url:`${base}/documents/${pageId}/locales/en`,headers});expect(result.statusCode).toBe(200);return result.json();}
function translated(draft:Awaited<ReturnType<typeof get>>){return {...draft.content,title:'English image page',slug:'english-image',seoTitle:'English image SEO',blocks:draft.content.blocks.map((block:{type:string})=>block.type==='text'?{...block,heading:'English heading',body:'English text'}:{...block,altText:'English red sample',caption:'English caption'})};}
async function save(test:Test,draft:Awaited<ReturnType<typeof get>>,content=translated(draft),confirmSourceChange=false){return test.running.app.inject({method:'PUT',url:`${base}/documents/${draft.pageId}/locales/en`,headers,payload:{expectedVersion:draft.version,expectedStructure:draft.structure,confirmSourceChange,content}});}
async function publish(test:Test,en=true){const plan=(await test.running.app.inject({url:base+'/site-plan',headers})).json();return test.running.app.inject({method:'POST',url:base+'/releases',headers:{...headers,'idempotency-key':randomUUID()},payload:{revisionId:plan.pages[0].revisionId,expectedActiveVersion:plan.activeVersion,
  expectedShared:{revisionId:plan.shared.revisionId,version:plan.shared.version},expectedPages:plan.pages.map(({pageId,revisionId,version}:{pageId:string;revisionId:string;version:number})=>({pageId,revisionId,version})),
  expectedLocales:en?plan.localeVariants.map(({pageId,locale,revisionId,version,structure}:{pageId:string;locale:string;revisionId:string;version:number;structure:string})=>({pageId,locale,revisionId,version,structure})):[]}});}
async function preview(test:Test,draft:Awaited<ReturnType<typeof get>>){return test.running.app.inject({url:`${base}/documents/${draft.pageId}/locales/en/previews/${draft.revisionId}`,headers});}
const imagePath=(html:string)=>html.match(/<img src="([^"]+)"/)![1];

describe('CMS English per-use image content',()=>{
  it('pins one canonical image with separate EN alt/caption, retains NL and serves distinct immutable language paths',async()=>{
    const test=await start();await approve(test);const doc=await create(test);const draft=await get(test,doc.pageId);
    expect(draft.supported).toBe(true);expect(draft.content.blocks[1]).toMatchObject({blockId:doc.content.blocks[1].blockId,type:'image',altText:null,caption:null});
    expect(draft.content.blocks[1]).not.toHaveProperty('reference');
    const saved=await save(test,draft);expect(saved.statusCode).toBe(200);const en=saved.json();
    const firstPreview=await preview(test,en);expect(firstPreview.statusCode).toBe(200);expect(firstPreview.body).toContain('alt="English red sample"');expect(firstPreview.body).toContain('English caption');expect(firstPreview.body).toContain('data:image/png;base64,');
    expect(test.running.documents!.get('demo-cms',doc.pageId)).toMatchObject({revisionId:doc.revisionId,content:doc.content});
    expect((await publish(test)).statusCode).toBe(200);
    const nl=(await test.running.app.inject('/sites/demo-cms/nl-image.html')).body;const output=(await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body;
    expect(nl).toContain('alt="Nederlands rood proefbeeld"');expect(nl).toContain('Nederlands bijschrift');expect(output).not.toContain('Nederlands bijschrift');
    expect(imagePath(nl)).not.toBe(imagePath(output));
    const nlBytes=(await test.running.app.inject(imagePath(nl))).rawPayload;const enBytes=(await test.running.app.inject(imagePath(output))).rawPayload;expect(enBytes).toEqual(nlBytes);
    expect(()=>test.fixture.store.purge('fixture-alpha','photo',2,true)).toThrow('retained');
    await test.reopen();expect((await preview(test,en)).body).toBe(firstPreview.body);expect((await test.running.app.inject(imagePath(output))).rawPayload).toEqual(enBytes);
  });
  it('requires explicit rebinding after source replacement, preserves translation input and keeps old preview/release binding',async()=>{
    const test=await start();await approve(test);let doc=await create(test);const en=(await save(test,await get(test,doc.pageId))).json();expect((await publish(test)).statusCode).toBe(200);
    const originalHtml=(await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body;const originalBytes=(await test.running.app.inject(imagePath(originalHtml))).rawPayload;
    const changed=structuredClone(doc.content);changed.blocks[1].reference.fileVersion=2;
    const nlSave=await test.running.app.inject({method:'PUT',url:`${base}/documents/${doc.pageId}/draft`,headers,payload:{expectedVersion:doc.version,content:changed}});expect(nlSave.statusCode).toBe(200);doc=nlSave.json();
    const stale=await get(test,doc.pageId);expect(stale.needsUpdate).toBe(true);expect(stale.content).toEqual(en.content);expect(stale.sourceImages[0].fileVersion).toBe(2);
    expect((await save(test,en,en.content)).statusCode).toBe(409);expect((await save(test,stale,stale.content)).statusCode).toBe(409);
    expect((await preview(test,en)).body).toContain('English red sample');
    const retainedRelease=await publish(test,false);expect(retainedRelease.statusCode).toBe(200);
    const retainedHtml=(await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body;expect((await test.running.app.inject(imagePath(retainedHtml))).rawPayload).toEqual(originalBytes);
    const retainedManifest=JSON.parse(readFileSync(join(test.root,'releases','demo-cms',retainedRelease.json().releaseId,'release.json'),'utf8'));
    expect(retainedManifest.pages.find((page:{locale:string;pageId:string})=>page.locale==='nl'&&page.pageId===doc.pageId).media[0].fileVersion).toBe(2);
    expect(retainedManifest.pages.find((page:{locale:string;pageId:string})=>page.locale==='en'&&page.pageId===doc.pageId).media[0].fileVersion).toBe(1);
    const oldPreviewContent=test.running.documents!.locales.previewRevision('demo-cms',doc.pageId,en.revisionId);
    expect(oldPreviewContent.blocks[1]).toMatchObject({type:'image',reference:{fileVersion:1}});
    const rebound=await save(test,stale,stale.content,true);expect(rebound.statusCode).toBe(200);expect(rebound.json().needsUpdate).toBe(false);
    const reboundRelease=await publish(test);expect(reboundRelease.statusCode).toBe(200);const newEn=(await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body;
    const reboundManifest=JSON.parse(readFileSync(join(test.root,'releases','demo-cms',reboundRelease.json().releaseId,'release.json'),'utf8'));
    expect(reboundManifest.pages.find((page:{locale:string;pageId:string})=>page.locale==='en'&&page.pageId===doc.pageId).media[0].fileVersion).toBe(2);
    expect(imagePath(newEn)).not.toBe(imagePath(originalHtml));
    expect((await test.running.app.inject(imagePath(originalHtml))).rawPayload).toEqual(originalBytes);
  });
  it('freezes NL and EN image bindings before an asynchronous build while newer source drafts stay separate',async()=>{
    let entered!:()=>void;let release!:()=>void;
    const ready=new Promise<void>((r)=>{entered=r;});const held=new Promise<void>((r)=>{release=r;});
    const test=await start({beforeBuild:async()=>{entered();await held;}});await approve(test);
    const doc=await create(test);const en=(await save(test,await get(test,doc.pageId))).json();
    const pending=publish(test);await ready;
    const changed=structuredClone(doc.content);changed.blocks[1].reference.fileVersion=2;
    const updated=await test.running.app.inject({method:'PUT',url:`${base}/documents/${doc.pageId}/draft`,headers,payload:{expectedVersion:doc.version,content:changed}});
    expect(updated.statusCode).toBe(200);release();const result=await pending;expect(result.statusCode).toBe(200);
    const manifest=JSON.parse(readFileSync(join(test.root,'releases','demo-cms',result.json().releaseId,'release.json'),'utf8'));
    for(const locale of ['nl','en'])expect(manifest.pages.find((page:{locale:string;pageId:string})=>page.locale===locale&&page.pageId===doc.pageId).media[0].fileVersion).toBe(1);
    expect(await get(test,doc.pageId)).toMatchObject({revisionId:en.revisionId,needsUpdate:true,sourceImages:[{fileVersion:2}]});
    expect((await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body).toContain('English red sample');
  });
  it('preserves nullable captions, rejects missing meaningful alt and enforces explicitly empty decorative alt',async()=>{
    const test=await start();await approve(test);const doc=await create(test);let draft=(await save(test,await get(test,doc.pageId))).json();const first=await publish(test);expect(first.statusCode).toBe(200);
    for(const altText of [null,'','   ']){const content=structuredClone(draft.content);content.blocks[1].altText=altText;content.blocks[1].caption=null;const saved=await save(test,draft,content);expect(saved.statusCode).toBe(200);draft=saved.json();expect(draft.content.blocks[1]).toMatchObject({altText,caption:null});expect((await preview(test,draft)).statusCode).toBe(400);expect((await publish(test)).statusCode).toBe(400);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);}
    const source=structuredClone(doc.content);source.blocks[1].reference.decorative=true;source.blocks[1].reference.altText.nl='';
    expect((await test.running.app.inject({method:'PUT',url:`${base}/documents/${doc.pageId}/draft`,headers,payload:{expectedVersion:doc.version,content:source}})).statusCode).toBe(200);
    draft=await get(test,doc.pageId);let content=structuredClone(draft.content);content.blocks[1].altText=null;
    let saved=await save(test,draft,content,true);expect(saved.statusCode).toBe(200);draft=saved.json();expect((await publish(test)).statusCode).toBe(400);
    content=structuredClone(draft.content);content.blocks[1].altText='';content.blocks[1].caption='';saved=await save(test,draft,content);expect(saved.statusCode).toBe(200);
    expect((await publish(test)).statusCode).toBe(200);expect((await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body).toContain('alt=""');
  });
  it('rejects asset/decorative overrides from EN and blocks activation when rights change during async build',async()=>{
    let block=false;let test!:Test;
    test=await start({beforeActivate:async()=>{if(block)expect((await test.running.app.inject({method:'PUT',url:base+'/media/photo/rights',headers,payload:{expectedVersion:2,status:'blocked',owner:'Synthetic maker',source:'Local test',basis:'Fictitious block during build',confirmed:true}})).statusCode).toBe(200);}});
    await approve(test);const doc=await create(test);const draft=await get(test,doc.pageId);const values=translated(draft);
    for(const extra of [{assetId:'foreign'},{reference:doc.content.blocks[1].reference},{decorative:true}]){const invalid=structuredClone(values);Object.assign(invalid.blocks[1],extra);expect((await save(test,draft,invalid)).statusCode).toBe(400);}
    expect((await save(test,draft)).statusCode).toBe(200);const first=await publish(test);expect(first.statusCode).toBe(200);
    const old=(await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body;block=true;const failed=await publish(test);expect(failed.statusCode).toBe(422);expect(failed.json().errorCode).toBe('media_not_publishable');
    expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);expect((await test.running.app.inject(imagePath(old))).statusCode).toBe(200);
  });
  it('keeps pre-migration text-only EN revisions and active HTML unchanged after additive migration six',async()=>{
    const test=await start();const doc=await create(test,false,false);const en=(await save(test,await get(test,doc.pageId))).json();const first=await publish(test);expect(first.statusCode).toBe(200);
    const old=(await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body;
    test.running.repository.db.exec('ALTER TABLE cms_locale_revisions DROP COLUMN source_binding_json; ALTER TABLE cms_locale_revisions DROP COLUMN media_revision_id; DELETE FROM cms_migrations WHERE version=6');
    await test.reopen();expect((await get(test,doc.pageId))).toMatchObject({revisionId:en.revisionId,version:en.version,needsUpdate:false,content:en.content});
    expect((await test.running.app.inject('/sites/demo-cms/en/english-image.html')).body).toBe(old);expect((await preview(test,en)).statusCode).toBe(200);
    expect(test.running.repository.db.prepare('SELECT count(*) AS n FROM cms_migrations WHERE version=6').get()).toEqual({n:1});
  });
});
