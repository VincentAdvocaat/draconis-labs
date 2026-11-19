import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {afterEach,describe,expect,it} from 'vitest';
import {buildCmsApp,type CmsAppOptions} from '../src/modules/cms/app.js';
import {CmsRepository} from '../src/modules/cms/repository.js';
import {CmsSharedNavigation,sharedSaveSchema} from '../src/modules/cms/shared-navigation.js';

const base='/api/v1/cms/websites/demo-cms';
const headers={authorization:'Bearer shared-publisher'};
const editor={authorization:'Bearer shared-editor'};
const cleanup:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function start(enabled=true,hooks:CmsAppOptions['hooks']={}){
  const root=mkdtempSync(join(tmpdir(),'cms-shared-test-'));
  cleanup.push(()=>{if(!resolve(root).startsWith(resolve(tmpdir()))||!root.includes('cms-shared-test-'))throw new Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true});});
  const options={runtimeRoot:root,seed:true,enablePages:true,enableSharedNavigation:enabled,hooks,
    credentials:[['shared-publisher','publisher'],['shared-editor','editor']].map(([name,role])=>({name,role,websiteIds:['demo-cms','demo-other'],tokenHash:createHash('sha256').update(name).digest('hex')}))};
  let running=await buildCmsApp(options);cleanup.push(async()=>{await running.app.close();});
  return {root,get running(){return running;},async reopen(shared=true){await running.app.close();running=await buildCmsApp({...options,enableSharedNavigation:shared});}};
}
type Test=Awaited<ReturnType<typeof start>>;
async function create(test:Test){
  const doc=(await test.running.app.inject({method:'POST',url:base+'/documents',headers:editor,payload:{title:'NL text page',slug:'nl-page'}})).json();
  const result=await test.running.app.inject({method:'PUT',url:`${base}/documents/${doc.pageId}/draft`,headers:editor,payload:{expectedVersion:doc.version,
    content:{...doc.content,blocks:[{...doc.content.blocks[0],body:'NL source text'}]}}});expect(result.statusCode).toBe(200);return result.json();
}
async function english(test:Test,pageId:string){
  const draft=(await test.running.app.inject({url:`${base}/documents/${pageId}/locales/en`,headers})).json();
  const result=await test.running.app.inject({method:'PUT',url:`${base}/documents/${pageId}/locales/en`,headers:editor,payload:{expectedVersion:draft.version,expectedStructure:draft.structure,
    content:{...draft.content,title:'English page',slug:'english-page',seoTitle:'English SEO',blocks:draft.content.blocks.map((block:object)=>({...block,heading:null,body:'English source text'}))}}});
  expect(result.statusCode).toBe(200);return result.json();
}
async function shared(test:Test){const response=await test.running.app.inject({url:base+'/shared-navigation',headers});expect(response.statusCode).toBe(200);return response.json();}
async function save(test:Test,draft:Awaited<ReturnType<typeof shared>>,content=draft.content){return test.running.app.inject({method:'PUT',url:base+'/shared-navigation',headers:editor,payload:{expectedVersion:draft.version,content}});}
async function plan(test:Test,includeEnglish=false){
  const selected=(await test.running.app.inject({url:base+'/site-plan',headers})).json();
  return {revisionId:selected.pages[0].revisionId,expectedActiveVersion:selected.activeVersion,
    expectedPages:selected.pages.map(({pageId,revisionId,version}:{pageId:string;revisionId:string;version:number})=>({pageId,revisionId,version})),
    expectedLocales:includeEnglish?selected.localeVariants.map(({pageId,locale,revisionId,version,structure}:{pageId:string;locale:string;revisionId:string;version:number;structure:string})=>({pageId,locale,revisionId,version,structure})):[],
    ...(selected.shared?{expectedShared:{revisionId:selected.shared.revisionId,version:selected.shared.version}}:{})};
}
function publish(test:Test,payload:Awaited<ReturnType<typeof plan>>,key=randomUUID()){return test.running.app.inject({method:'POST',url:base+'/releases',headers:{...headers,'idempotency-key':key},payload});}

describe('CMS shared public navigation text',()=>{
  it('adds a compatibility draft without activating or rewriting earlier releases and reopens idempotently',async()=>{
    const test=await start(false);const doc=await create(test);
    const first=await publish(test,await plan(test));expect(first.statusCode).toBe(200);
    const oldHtml=(await test.running.app.inject('/sites/demo-cms/nl-page.html')).body;
    const oldFile=readFileSync(join(test.root,'releases','demo-cms',first.json().releaseId,'nl-page.html'));
    await test.reopen();const draft=await shared(test);
    expect(draft.version).toBe(1);expect(draft.content.fields['navigation.languageLabel'].values).toEqual({nl:'Taal',en:'Language'});
    expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
    expect((await test.running.app.inject('/sites/demo-cms/nl-page.html')).body).toBe(oldHtml);
    expect(readFileSync(join(test.root,'releases','demo-cms',first.json().releaseId,'nl-page.html'))).toEqual(oldFile);
    expect(test.running.documents!.get('demo-cms',doc.pageId).revisionId).toBe(doc.revisionId);
    const home=(await test.running.app.inject({url:base+'/pages/home',headers})).json();expect(home.sharedEnabled).toBe(true);
    const homeSaved=await test.running.app.inject({method:'PUT',url:base+'/pages/home/draft',headers,payload:{expectedVersion:home.pageVersion,values:home.values}});
    expect(homeSaved.statusCode).toBe(200);expect(homeSaved.json().sharedEnabled).toBe(true);
    await test.reopen();expect((await shared(test)).revisionId).toBe(draft.revisionId);
    expect(test.running.repository.db.prepare('SELECT count(*) AS n FROM cms_migrations WHERE version=5').get()).toEqual({n:1});
  });
  it('edits fixed labels, previews exact revisions and explicitly pins EN and NL text with safe literal encoding',async()=>{
    const test=await start();const doc=await create(test);const en=await english(test,doc.pageId);
    let draft=await shared(test);draft.content.fields['navigation.languageLabel'].values.en='Choose <language> "safely"';
    draft.content.fields['navigation.locale.en'].value='English <edited>';
    const result=await save(test,draft);expect(result.statusCode).toBe(200);draft=result.json();
    const preview=await test.running.app.inject({method:'POST',url:base+'/shared-navigation/previews',headers,payload:{pageId:doc.pageId,revisionId:en.revisionId,locale:'en',sharedRevisionId:draft.revisionId,sharedVersion:draft.version}});
    expect(preview.statusCode).toBe(200);expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.body).toContain('aria-label="Choose &lt;language&gt; &quot;safely&quot;"');expect(preview.body).toContain('English &lt;edited&gt;');expect(preview.body).not.toContain('<edited>');
    const selected=await plan(test,true);const published=await publish(test,selected);expect(published.statusCode).toBe(200);
    const output=(await test.running.app.inject('/sites/demo-cms/en/english-page.html')).body;
    expect(output).toContain('Choose &lt;language&gt;');expect(output).toContain('lang="en" hreflang="en"');
    expect((await test.running.app.inject('/sites/demo-cms/nl-page.html')).body).toContain('aria-label="Taal"');
    const manifest=JSON.parse(readFileSync(join(test.root,'releases','demo-cms',published.json().releaseId,'release.json'),'utf8'));
    expect(manifest.sharedRevisionId).toBe(draft.revisionId);expect(manifest.sharedVersion).toBe(draft.version);
    const changed=structuredClone(draft.content);changed.fields['navigation.languageLabel'].values.en='New draft only';expect((await save(test,draft,changed)).statusCode).toBe(200);
    expect((await test.running.app.inject('/sites/demo-cms/en/english-page.html')).body).toBe(output);
    const oldPreview=await test.running.app.inject({method:'POST',url:base+'/shared-navigation/previews',headers,payload:{pageId:doc.pageId,revisionId:en.revisionId,locale:'en',sharedRevisionId:draft.revisionId,sharedVersion:draft.version}});
    expect(oldPreview.body).toContain('Choose &lt;language&gt;');await test.reopen();expect((await test.running.app.inject('/sites/demo-cms/en/english-page.html')).body).toBe(output);
  });
  it('requires the explicit current shared pin and refuses incomplete EN while preserving active publication',async()=>{
    const test=await start();const doc=await create(test);await english(test,doc.pageId);
    const initial=await publish(test,await plan(test,true));expect(initial.statusCode).toBe(200);
    const stale=await plan(test,true);let draft=await shared(test);draft.content.fields['navigation.languageLabel'].values.en=null;
    const saved=await save(test,draft);expect(saved.statusCode).toBe(200);draft=saved.json();expect(draft.content.fields['navigation.languageLabel'].values.en).toBeNull();
    expect((await publish(test,stale)).statusCode).toBe(409);
    const missing=await plan(test,true);delete missing.expectedShared;expect((await publish(test,missing)).statusCode).toBe(428);
    expect((await publish(test,await plan(test,true))).statusCode).toBe(422);
    expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(initial.json().releaseId);
  });
  it('enforces independent writer CAS, strict field IDs, source locales, roles and site separation',async()=>{
    const test=await start();const draft=await shared(test);const repo=new CmsRepository(join(test.root,'cms.db'));const other=new CmsSharedNavigation(repo);
    try{
      expect((await save(test,draft)).statusCode).toBe(200);
      expect(()=>other.save('demo-cms',sharedSaveSchema.parse({expectedVersion:draft.version,content:draft.content}),'other')).toThrow('gewijzigd');
    }finally{repo.close();}
    const current=await shared(test);
    for(const content of [{...current.content,unknown:'x'},{...current.content,fields:{...current.content.fields,'navigation.executable':'x'}},
      {...current.content,fields:{...current.content.fields,'navigation.locale.en':{value:'English',sourceLocale:'fr'}}}])expect((await save(test,current,content)).statusCode).toBe(400);
    expect((await test.running.app.inject({url:base+'/shared-navigation'})).statusCode).toBe(401);
    expect((await test.running.app.inject({method:'PUT',url:base+'/shared-navigation',headers:editor,payload:{content:current.content}})).statusCode).toBe(428);
    const foreign=await test.running.app.inject({method:'POST',url:base.replace('demo-cms','demo-other')+'/shared-navigation/previews',headers,
      payload:{pageId:randomUUID(),revisionId:randomUUID(),locale:'nl',sharedRevisionId:current.revisionId,sharedVersion:current.version}});expect(foreign.statusCode).toBe(404);
    const choice=await plan(test);expect((await test.running.app.inject({method:'POST',url:base+'/releases',headers:{...editor,'idempotency-key':randomUUID()},payload:choice})).statusCode).toBe(403);
  });
  it('freezes shared text before awaits and preserves newer drafts while retrying the same release',async()=>{
    let entered!:()=>void;let release!:()=>void;const ready=new Promise<void>((r)=>{entered=r;});const held=new Promise<void>((r)=>{release=r;});
    const test=await start(true,{beforeBuild:async()=>{entered();await held;}});await create(test);
    const draft=await shared(test);const choice=await plan(test);const key=randomUUID();const pending=publish(test,choice,key);await ready;
    try{const changed=structuredClone(draft.content);changed.fields['navigation.languageLabel'].values.nl='Newer shared concept';expect((await save(test,draft,changed)).statusCode).toBe(200);}finally{release();}
    const published=await pending;expect(published.statusCode).toBe(200);
    expect((await test.running.app.inject('/sites/demo-cms/nl-page.html')).body).toContain('aria-label="Taal"');
    expect((await shared(test)).content.fields['navigation.languageLabel'].values.nl).toBe('Newer shared concept');
    expect((await publish(test,choice,key)).json().releaseId).toBe(published.json().releaseId);
  });
});
