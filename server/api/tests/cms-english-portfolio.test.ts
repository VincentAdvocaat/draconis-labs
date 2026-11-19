import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCatalogConsumerFixture } from '../src/catalogus/consumer-fixture.js';
import { buildCmsApp, type CmsAppOptions } from '../src/modules/cms/app.js';

const base = '/api/v1/cms/websites/demo-cms';
const headers = { authorization: 'Bearer portfolio-test' };
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
async function start(hooks: CmsAppOptions['hooks'] = {}) {
  const fixture = createCatalogConsumerFixture(); cleanup.push(() => fixture.cleanup());
  const root = mkdtempSync(join(tmpdir(), 'cms-portfolio-test-')); cleanup.push(() => {
    if (!resolve(root).startsWith(resolve(tmpdir())) || !root.includes('cms-portfolio-test-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  });
  const options = { enableSharedNavigation:true, runtimeRoot: root, seed: true, enableMedia: true, enableUploads: true, enablePages: true, enablePortfolio: true,
    mediaRoot: fixture.root, hooks, credentials: [{ name: 'Test', role: 'publisher', websiteIds: ['demo-cms'],
      tokenHash: createHash('sha256').update('portfolio-test').digest('hex') }] };
  let running = await buildCmsApp(options);
  cleanup.push(async () => { await running.app.close(); });
  return { fixture, root, get running() { return running; }, async reopen() { await running.app.close(); running = await buildCmsApp(options); } };
}
async function publish(test:Awaited<ReturnType<typeof start>>,en=true){
  const running=test.running;const plan=(await running.app.inject({url:base+'/site-plan',headers})).json();
  return running.app.inject({method:'POST',url:base+'/releases',headers:{...headers,'idempotency-key':randomUUID()},payload:{revisionId:plan.pages[0].revisionId,expectedActiveVersion:plan.activeVersion,
    expectedShared:{revisionId:plan.shared.revisionId,version:plan.shared.version},expectedPages:plan.pages.map(({pageId,revisionId,version}:{pageId:string;revisionId:string;version:number})=>({pageId,revisionId,version})),
    expectedLocales:en?plan.localeVariants.map(({pageId,locale,revisionId,version,structure}:{pageId:string;locale:string;revisionId:string;version:number;structure:string})=>({pageId,locale,revisionId,version,structure})):[]}});
}
async function document(test: Awaited<ReturnType<typeof start>>, locale: 'nl' | 'en' = 'en') {
  const { running, fixture } = test;
  const snapshot = locale === 'en' ? fixture.en : fixture.nl;
  const created = (await running.app.inject({ method: 'POST', url: base + '/documents', headers, payload: { title: 'Portfolio page', slug: 'portfolio-page' } })).json();
  const content = { ...created.content, blocks: [{ ...created.content.blocks[0], body: 'CMS page text' },
    { blockId: randomUUID(), type: 'portfolio', ref: { websiteId: fixture.website, collectionId: 'portfolio', snapshotId: snapshot.snapshotId },
      checksum: snapshot.checksum, localeContext: snapshot.localeContext }] };
  const saved = await running.app.inject({ method: 'PUT', url: `${base}/documents/${created.pageId}/draft`, headers,
    payload: { expectedVersion: created.version, content } });
  expect(saved.statusCode).toBe(200); return saved.json();
}
type Test=Awaited<ReturnType<typeof start>>;
async function get(test:Test,pageId:string){return (await test.running.app.inject({url:`${base}/documents/${pageId}/locales/en`,headers})).json();}
function content(test:Test,draft:Awaited<ReturnType<typeof get>>){const selection=test.fixture.request(test.fixture.en);return {...draft.content,title:'English portfolio page',slug:'english-portfolio',seoTitle:'English portfolio SEO',blocks:draft.content.blocks.map((block:{type:string})=>block.type==='text'?{...block,heading:'English heading',body:'English CMS text'}:{...block,selection:{ref:selection.ref,checksum:selection.checksum,localeContext:selection.localeContext},labels:{heading:{nl:'NL kop',en:'English work'},empty:{nl:'NL leeg',en:'English empty state'}}})};}
async function save(test:Test,draft:Awaited<ReturnType<typeof get>>,values=content(test,draft),confirmSourceChange=draft.needsUpdate){return test.running.app.inject({method:'PUT',url:`${base}/documents/${draft.pageId}/locales/en`,headers,payload:{expectedVersion:draft.version,expectedStructure:draft.structure,confirmSourceChange,content:values}});}
async function preview(test:Test,draft:Awaited<ReturnType<typeof get>>){return test.running.app.inject({url:`${base}/documents/${draft.pageId}/locales/en/previews/${draft.revisionId}`,headers});}
const img=(html:string)=>html.match(/<img src="([^"]+)"/)![1];
describe('CMS English portfolio page',()=>{
  it('requires an explicit EN selection, preserves NL and pins preview, context and distinct reachable release bytes across restart',async()=>{
    const test=await start();const doc=await document(test,'nl');const draft=await get(test,doc.pageId);expect(draft.content.blocks[1]).toMatchObject({blockId:doc.content.blocks[1].blockId,type:'portfolio',selection:null});
    const saved=await save(test,draft);expect(saved.statusCode).toBe(200);const en=saved.json();const privateHtml=await preview(test,en);expect(privateHtml.statusCode).toBe(200);expect(privateHtml.body).toContain('Red sample');expect(privateHtml.body).toContain('English work');expect(privateHtml.body).toContain('data:image/png;base64,');
    expect(test.running.documents!.get('demo-cms',doc.pageId).revisionId).toBe(doc.revisionId);
    const result=await publish(test);expect(result.statusCode).toBe(200);const html=(await test.running.app.inject('/sites/demo-cms/en/english-portfolio.html')).body;
    expect(html).toContain('<html lang="en">');expect(html).toContain('alt="A red square"');expect(html).toContain('<p lang="nl">Nederlandse beschrijving</p>');expect(img(html)).toMatch(/^\/sites\/demo-cms\/media\//);
    const served=await test.running.app.inject(img(html));expect(served.statusCode).toBe(200);expect(createHash('sha256').update(served.rawPayload).digest('hex')).toBe(test.fixture.en.items[0].resolvedMedia.variants[0].checksum);
    const nl=(await test.running.app.inject('/sites/demo-cms/portfolio-page.html')).body;expect(nl).toContain('Rood proefbeeld');expect(img(nl)).not.toBe(img(html).replace('/sites/demo-cms/',''));
    const pins=test.fixture.consumer.listPins(test.fixture.website,{module:'cms',attemptId:result.json().releaseId});expect(pins).toHaveLength(2);expect(pins.every((pin)=>pin.state==='activated')).toBe(true);expect(pins.find((pin)=>pin.owner.revisionId===en.revisionId)?.localeContext).toEqual(test.fixture.en.localeContext);
    const manifest=JSON.parse(readFileSync(join(test.root,'releases','demo-cms',result.json().releaseId,'release.json'),'utf8'));expect(manifest.pages.find((page:{locale:string})=>page.locale==='en').portfolio[0].localeContext).toEqual(test.fixture.en.localeContext);
    await test.reopen();expect((await preview(test,en)).body).toBe(privateHtml.body);expect((await test.running.app.inject(img(html))).rawPayload).toEqual(served.rawPayload);
    expect(()=>test.fixture.media.purge(test.fixture.website,'photo',2,true)).toThrow('retained');
  });
  it('rejects wrong website/checksum/context and NL snapshots without changing EN revision',async()=>{
    const test=await start();const doc=await document(test,'nl');const draft=await get(test,doc.pageId);const values=content(test,draft);const selection=values.blocks[1].selection;
    for(const change of [{ref:{...selection.ref,websiteId:'fixture-beta'}},{checksum:'0'.repeat(64)},{localeContext:{...selection.localeContext,defaultLocale:'en'}},{localeContext:{...selection.localeContext,fallbackLocale:undefined}},{...test.fixture.request(test.fixture.nl),owner:undefined}]){
      const invalid=structuredClone(values);invalid.blocks[1].selection={...selection,...change};delete invalid.blocks[1].selection.owner;
      const response=await save(test,draft,invalid);expect([400,404,409]).toContain(response.statusCode);expect((await get(test,doc.pageId)).version).toBe(0);
    }
  });
  it('preserves null/empty labels and the active release until direct EN labels and selection are complete',async()=>{
    const test=await start();const doc=await document(test,'nl');let draft=(await save(test,await get(test,doc.pageId))).json();const first=await publish(test);expect(first.statusCode).toBe(200);
    for(const value of [null,'']){const changed=structuredClone(draft.content);changed.blocks[1].labels.empty.en=value;let result=await save(test,draft,changed);expect(result.statusCode).toBe(200);draft=result.json();expect(draft.content.blocks[1].labels.empty.en).toBe(value);expect((await preview(test,draft)).statusCode).toBe(400);expect((await publish(test)).statusCode).toBe(400);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);}
    const changed=content(test,draft);changed.blocks[1].selection=null;draft=(await save(test,draft,changed)).json();expect((await publish(test)).statusCode).toBe(400);
  });
  it('renders an explicit empty EN snapshot and keeps old preview/release when newer drafts are not selected',async()=>{
    const test=await start();const doc=await document(test,'nl');const en=(await save(test,await get(test,doc.pageId))).json();expect((await publish(test)).statusCode).toBe(200);const original=await preview(test,en);
    test.fixture.catalog.archive(test.fixture.website,test.fixture.item.itemId,2);const empty=test.fixture.catalog.publish(test.fixture.website,3,{locale:'en',fallbackLocale:'nl'});const values=structuredClone(en.content);values.blocks[1].selection={ref:{websiteId:test.fixture.website,collectionId:'portfolio',snapshotId:empty.snapshotId},checksum:empty.checksum,localeContext:empty.localeContext};values.blocks[1].labels.empty.en='A new empty selection';
    const draft=(await save(test,en,values)).json();expect((await preview(test,draft)).body).toContain('A new empty selection');expect((await preview(test,en)).body).toBe(original.body);
    expect((await publish(test,false)).statusCode).toBe(200);expect((await test.running.app.inject('/sites/demo-cms/en/english-portfolio.html')).body).toContain('Red sample');
    expect((await publish(test)).statusCode).toBe(200);const html=(await test.running.app.inject('/sites/demo-cms/en/english-portfolio.html')).body;expect(html).toContain('A new empty selection');expect(html).not.toContain('<img');
  });
  it('freezes selected EN snapshot before async build and keeps a newer EN draft separate',async()=>{
    let entered!:()=>void;let release!:()=>void;const ready=new Promise<void>((r)=>{entered=r;});const held=new Promise<void>((r)=>{release=r;});
    const test=await start({beforeBuild:async()=>{entered();await held;}});const doc=await document(test,'nl');const en=(await save(test,await get(test,doc.pageId))).json();const pending=publish(test);await ready;
    test.fixture.catalog.archive(test.fixture.website,test.fixture.item.itemId,2);const newer=test.fixture.catalog.publish(test.fixture.website,3,{locale:'en',fallbackLocale:'nl'});const changed=structuredClone(en.content);changed.blocks[1].selection={ref:{websiteId:test.fixture.website,collectionId:'portfolio',snapshotId:newer.snapshotId},checksum:newer.checksum,localeContext:newer.localeContext};changed.blocks[1].labels.heading.en='New draft heading';expect((await save(test,en,changed)).statusCode).toBe(200);release();expect((await pending).statusCode).toBe(200);const html=(await test.running.app.inject('/sites/demo-cms/en/english-portfolio.html')).body;expect(html).toContain('English work');expect(html).not.toContain('New draft heading');
  });
  it('rejects changed catalog image hashes at the final gate and preserves prior public bytes',async()=>{
    let corrupt=false;let test!:Test;test=await start({beforeActivate:async()=>{if(corrupt)writeFileSync(join(test.fixture.root,test.fixture.en.items[0].resolvedMedia.variants[0].path),Buffer.from('corrupted synthetic image'));}});
    const doc=await document(test,'nl');await save(test,await get(test,doc.pageId));const first=await publish(test);expect(first.statusCode).toBe(200);const html=(await test.running.app.inject('/sites/demo-cms/en/english-portfolio.html')).body;const oldBytes=(await test.running.app.inject(img(html))).rawPayload;corrupt=true;
    expect((await publish(test)).statusCode).toBe(422);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);expect((await test.running.app.inject(img(html))).rawPayload).toEqual(oldBytes);
  });
  it('keeps previous active release when portfolio rights are blocked during build',async()=>{
    let block=false;let test!:Test;test=await start({beforeActivate:async()=>{if(block)test.fixture.catalog.setRights(test.fixture.website,'photo',{expectedVersion:2,status:'blocked',owner:'Synthetic maker',source:'Local fixture',basis:'Fictitious build-time block',employee:'Test',confirmed:true});}});
    const doc=await document(test,'nl');await save(test,await get(test,doc.pageId));const first=await publish(test);expect(first.statusCode).toBe(200);block=true;const failed=await publish(test);expect(failed.statusCode).toBe(422);expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
  });
});
