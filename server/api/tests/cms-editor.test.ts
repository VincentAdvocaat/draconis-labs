import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface Element {
  type: string | (() => Element);
  props: Record<string, unknown> & { children?: Child | Child[] };
}
type Child = Element | string | number | null | false;
type FetchResult = { status: number; body: unknown } | Error | Promise<{ status: number; body: unknown }>;

// Exercise the actual compiled component's event handlers and fetch flow. The hook adapter
// replaces only React scheduling/DOM rendering; no copy of the publication logic lives here.
function editorHarness() {
  const slots: unknown[] = [];
  let cursor = 0;
  let component!: () => Element;
  let tree!: Element;
  let key = 0;
  const requests: Array<{ path: string; init: { method?: string; body?: string; headers: Record<string, string> } }> = [];
  const results: FetchResult[] = [];
  function useState(initial: unknown) {
    const position = cursor++;
    if (!(position in slots)) slots[position] = initial;
    return [slots[position], (next: unknown) => {
      slots[position] = typeof next === 'function' ? next(slots[position]) : next;
    }];
  }
  function useRef(initial: unknown) {
    const position = cursor++;
    if (!(position in slots)) slots[position] = { current: initial };
    return slots[position];
  }
  const jsx = (type: Element['type'], props: Element['props']) => ({ type, props });
  const i18nExports: Record<string, unknown> = {};
  const i18nSource = readFileSync(new URL('../../../apps/cms/src/i18n.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(i18nSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText,
    {exports: i18nExports});
  const documentExports: Record<string, unknown> = {};
  const documentSource = readFileSync(new URL('../../../apps/cms/src/documents.tsx', import.meta.url), 'utf8');
  const documentCompiled = ts.transpileModule(documentSource, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(documentCompiled, { exports: documentExports, crypto: { randomUUID: () => `new-block-${++key}` },
    require: (name: string) => { if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }; if (name === './i18n') return i18nExports; throw new Error(`Unexpected document import ${name}`); } });
  const englishExports: Record<string, unknown> = {};
  const englishSource = readFileSync(new URL('../../../apps/cms/src/page-locales.tsx', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(englishSource, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText,
    {exports: englishExports, require: (name: string) => {if (name === 'react/jsx-runtime') return {jsx, jsxs: jsx}; if (name === './i18n') return i18nExports; throw new Error(name);}});
  const sharedExports: Record<string, unknown> = {};
  const sharedSource = readFileSync(new URL('../../../apps/cms/src/shared-navigation.tsx', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(sharedSource, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,
    {exports:sharedExports,require:(name:string)=>{if(name==='react/jsx-runtime')return {jsx,jsxs:jsx};if(name==='./i18n')return i18nExports;throw new Error(name);}});
  const source = readFileSync(new URL('../../../apps/cms/src/main.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(compiled, {
    exports: {}, document: { getElementById: () => ({}), documentElement: {lang: 'nl'}, title: '' }, window: { confirm: () => true },
    crypto: { randomUUID: () => `fixture-key-${++key}` },
    fetch: async (path: string, init: typeof requests[number]['init']) => {
      requests.push({ path, init });
      const result = await results.shift();
      if (!result) throw new Error('Unexpected request');
      if (result instanceof Error) throw result;
      return { ok: result.status >= 200 && result.status < 300, status: result.status,
        json: async () => result.body };
    },
    require: (name: string) => {
      if (name === 'react') return { useState, useRef, useEffect: (effect: () => void) => effect() };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-dom/client') return { createRoot: () => ({ render: (element: Element) => { component = element.type as () => Element; } }) };
      if (name === './style.css') return {};
      if (name === './shared-navigation') return sharedExports;
      if (name === './i18n') return i18nExports;
      if (name === './page-locales') return englishExports;
      if (name === './documents') return documentExports;
      throw new Error(`Unexpected component import ${name}`);
    },
  });
  function expand(node: Child | Child[] | undefined): Child | Child[] | undefined {
    if (Array.isArray(node)) return node.map((child) => expand(child) as Child);
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') return expand((node.type as unknown as (props: Element['props']) => Element)(node.props));
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  function render() { cursor = 0; tree = expand(component()) as Element; }
  function nodes(node: Child | Child[] | undefined): Element[] {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props.children)];
  }
  function text(node: Child | Child[] | undefined): string {
    if (Array.isArray(node)) return node.map(text).join('');
    if (!node) return '';
    if (typeof node === 'object') return text(node.props.children);
    return String(node);
  }
  function find(predicate: (node: Element) => boolean): Element {
    const matches = nodes(tree).filter(predicate);
    if (matches.length !== 1) throw new Error(`Expected one element, got ${matches.length}`);
    return matches[0];
  }
  async function action(node: Element, event = 'onClick', argument?: unknown) {
    (node.props[event] as (value: unknown) => void)(argument);
    // Flush the real promise chain, then rerender with the resulting hook state.
    await new Promise<void>((resolve) => setImmediate(resolve));
    render();
  }
  const button = (name: string) => find((node) => node.type === 'button' && text(node.props.children) === name);
  const title = () => {
    const label = find((node) => node.type === 'label' && Array.isArray(node.props.children) && node.props.children[0] === 'Titel');
    return nodes(label).find((node) => node.type === 'input')!;
  };
  render();
  return { results, requests, action, button, title,
    settle: async () => { await new Promise<void>((resolve) => setImmediate(resolve)); render(); },
    field: (label: string, index = 0) => {
      const owner = nodes(tree).filter((node) => node.type === 'label' && Array.isArray(node.props.children) &&
        node.props.children.some((child) => typeof child === 'string' && child.trim() === label))[index];
      if (!owner) throw new Error(`Missing field ${label}/${index}`);
      return nodes(owner).find((node) => ['input', 'select', 'textarea'].includes(String(node.type)))!;
    },
    publicationButton: () => find((node) => node.type === 'button' &&
      ['Lokaal publiceren', 'Publicatie opnieuw controleren'].includes(text(node.props.children))),
    open: () => action(find((node) => node.type === 'form'), 'onSubmit', { preventDefault() {} }),
    status: () => text(find((node) => node.props.role === 'status').props.children),
    error: () => text(find((node) => node.props.role === 'alert').props.children),
  };
}

const pageA = { revisionId: 'revision-A', pageVersion: 1, values: { title: 'Revisie A', intro: '' }, activeReleaseId: null, activeVersion: 0 };
const pageB = { ...pageA, revisionId: 'revision-B', pageVersion: 2, values: { title: 'Revisie B', intro: '' } };

describe('CMS editor recovery and selected revision', () => {
  it('requires an explicit shared pin, preserves it across retry/language changes and sends only its revision/version',async()=>{
    const ui=editorHarness();ui.results.push({status:200,body:{...pageA,pagesEnabled:true,sharedEnabled:true}});await ui.open();
    const shared={revisionId:'shared-one',version:1,content:{schemaVersion:1,fields:{
      'navigation.languageLabel':{values:{nl:'Taal',en:'Language'}},'navigation.locale.nl':{value:'Nederlands',sourceLocale:'nl'},'navigation.locale.en':{value:'English',sourceLocale:'en'}}}};
    ui.results.push({status:200,body:shared});await ui.action(ui.button('Navigatieteksten openen'));
    await ui.action(ui.field('Taalkeuzekop nl'),'onChange',{target:{value:'Eigen gedeelde kop'}});
    const changed={...shared,revisionId:'shared-two',version:2,content:{...shared.content,fields:{...shared.content.fields,'navigation.languageLabel':{values:{nl:'Eigen gedeelde kop',en:'Language'}}}}};
    ui.results.push({status:200,body:changed});await ui.action(ui.button('Navigatieconcept opslaan'));
    expect(JSON.parse(ui.requests.at(-1)!.init.body!)).toMatchObject({expectedVersion:1});
    ui.results.push({status:200,body:{activeVersion:0,activeReleaseId:null,pages:[{pageId:'home',revisionId:pageA.revisionId,version:1,title:'Home',file:'index.html'}],shared:changed}});
    await ui.action(ui.button('Publicatieselectie ophalen'));expect(ui.button('Website lokaal publiceren').props.disabled).toBe(true);
    await ui.action(ui.field('Deze navigatierevisie expliciet mee publiceren'),'onChange',{target:{checked:true}});
    ui.results.push(new Error('network lost'));await ui.action(ui.button('Website lokaal publiceren'));const initial=ui.requests.at(-1)!;
    expect(JSON.parse(initial.init.body!).expectedShared).toEqual({revisionId:'shared-two',version:2});
    await ui.action(ui.field('Bedieningstaal'),'onChange',{target:{value:'en'}});
    expect(ui.field('Explicitly publish this navigation revision').props.checked).toBe(true);
    ui.results.push({status:200,body:{releaseId:'shared-publication',status:'published'}});await ui.action(ui.button('Check website publication again'));
    expect(ui.requests.at(-1)!.init.body).toBe(initial.init.body);expect(ui.requests.at(-1)!.init.headers['Idempotency-Key']).toBe(initial.init.headers['Idempotency-Key']);
  });

  it('preserves local shared text on conflict until explicit adoption of the current shared revision',async()=>{
    const ui=editorHarness();ui.results.push({status:200,body:{...pageA,pagesEnabled:true,sharedEnabled:true}});await ui.open();
    const shared={revisionId:'shared-one',version:1,content:{schemaVersion:1,fields:{
      'navigation.languageLabel':{values:{nl:'Taal',en:'Language'}},'navigation.locale.nl':{value:'Nederlands',sourceLocale:'nl'},'navigation.locale.en':{value:'English',sourceLocale:'en'}}}};
    ui.results.push({status:200,body:shared});await ui.action(ui.button('Navigatieteksten openen'));
    await ui.action(ui.field('Taalkeuzekop en'),'onChange',{target:{value:'My local label'}});
    const latest={...shared,revisionId:'shared-two',version:2,content:{...shared.content,fields:{...shared.content.fields,'navigation.languageLabel':{values:{nl:'Taal',en:'Other editor label'}}}}};
    ui.results.push({status:409,body:{message:'Shared conflict'}},{status:200,body:latest});await ui.action(ui.button('Navigatieconcept opslaan'));
    expect(ui.field('Taalkeuzekop en').props.value).toBe('My local label');
    await ui.action(ui.button('Actuele navigatieversie overnemen'));expect(ui.field('Taalkeuzekop en').props.value).toBe('Other editor label');
  });

  it('switches interface language with dirty Dutch input without fetching or changing the save payload', async () => {
    const ui = editorHarness(); ui.results.push({status: 200, body: pageA}); await ui.open();
    await ui.action(ui.title(), 'onChange', {target: {value: 'Mijn eigen Nederlandse inhoud'}});
    const before = ui.requests.length;
    await ui.action(ui.field('Bedieningstaal'), 'onChange', {target: {value: 'en'}});
    expect(ui.requests).toHaveLength(before);
    expect(ui.field('Title').props.value).toBe('Mijn eigen Nederlandse inhoud');
    ui.results.push({status: 200, body: {...pageB, values: {...pageB.values, title: 'Mijn eigen Nederlandse inhoud'}}});
    await ui.action(ui.button('Save draft'));
    expect(JSON.parse(ui.requests.at(-1)!.init.body!)).toMatchObject({expectedVersion: 1, values: {title: 'Mijn eigen Nederlandse inhoud'}});
    expect(ui.status()).toContain('Draft version 2 saved');
    await ui.action(ui.field('Interface language'), 'onChange', {target: {value: 'nl'}});
    expect(ui.status()).toContain('Conceptversie 2 opgeslagen');
  });
  it('keeps publication choice and idempotency key when retrying after a language switch', async () => {
    const ui = editorHarness(); ui.results.push({status: 200, body: pageA}); await ui.open();
    ui.results.push(new Error('network lost')); await ui.action(ui.button('Lokaal publiceren'));
    const initial = ui.requests.at(-1)!;
    await ui.action(ui.field('Bedieningstaal'), 'onChange', {target: {value: 'en'}});
    ui.results.push({status: 200, body: {releaseId: 'published', status: 'published'}}, {status: 200, body: {...pageA, activeVersion: 1, activeReleaseId: 'published'}});
    await ui.action(ui.button('Check publication again'));
    const retry = ui.requests.filter((item) => item.init.method === 'POST').at(-1)!;
    expect(retry.init.body).toBe(initial.init.body); expect(retry.init.headers['Idempotency-Key']).toBe(initial.init.headers['Idempotency-Key']);
    expect(ui.status()).toContain('Published to the local website');
  });
  it('uses the current language for a response that arrives after the interface language changes', async () => {
    const ui = editorHarness(); let finish!: (value: {status: number; body: unknown}) => void;
    ui.results.push(new Promise((resolve) => {finish = resolve;}));
    const pending = ui.open();
    await ui.action(ui.field('Bedieningstaal'), 'onChange', {target: {value: 'en'}});
    finish({status: 200, body: pageA}); await pending; await ui.settle();
    expect(ui.status()).toBe('Draft version 1 loaded.'); expect(ui.requests).toHaveLength(1);
  });
  it('requires explicit source confirmation even when image translations are unchanged', async () => {
    const ui=editorHarness();ui.results.push({status:200,body:{...pageA,pagesEnabled:true}});await ui.open();
    const content={schemaVersion:1,locale:'nl',title:'NL image',slug:'nl-image',seoTitle:'NL image',seoDescription:'',
      blocks:[{blockId:'image-one',type:'image',reference:{assetId:'photo',fileVersion:2,usage:'block-image-one',decorative:false,altText:{nl:'NL alt'}},caption:'NL caption'}]};
    ui.results.push({status:201,body:{pageId:'page-one',revisionId:'nl-two',version:2,content,published:false}},
      {status:200,body:{activeVersion:0,activeReleaseId:null,pages:[]}});
    await ui.action(ui.button('Nieuwe pagina aanmaken'));
    const english={pageId:'page-one',revisionId:'en-one',version:1,structure:'image-two',savedStructure:'image-one',supported:true,needsUpdate:true,
      sourceBlocks:[{blockId:'image-one',type:'image'}],sourceImages:[{blockId:'image-one',assetId:'photo',fileVersion:2,usage:'block-image-one',decorative:false}],
      content:{...content,locale:'en',title:'English image',blocks:[{blockId:'image-one',type:'image',altText:'Saved English alt',caption:'Saved English caption'}]}};
    ui.results.push({status:200,body:english});await ui.action(ui.button('English bewerken'));
    expect(ui.button('EN-concept opslaan').props.disabled).toBe(true);
    await ui.action(ui.button('EN-structuur en beeldbinding bevestigen'));
    expect(ui.button('EN-concept opslaan').props.disabled).toBe(false);
    ui.results.push({status:200,body:{...english,revisionId:'en-two',version:2,savedStructure:'image-two',needsUpdate:false}});
    await ui.action(ui.button('EN-concept opslaan'));
    expect(JSON.parse(ui.requests.at(-1)!.init.body!)).toEqual({expectedVersion:1,expectedStructure:'image-two',confirmSourceChange:true,content:english.content});
    expect(ui.button('EN-concept opslaan').props.disabled).toBe(true);
  });

  it('preserves unsaved English text after CAS failure until the user explicitly adopts the latest variant', async () => {
    const ui = editorHarness();
    ui.results.push({status: 200, body: {...pageA, pagesEnabled: true}}); await ui.open();
    await ui.action(ui.field('Titel nieuwe pagina'), 'onChange', {target: {value: 'NL page'}});
    await ui.action(ui.field('Slug nieuwe pagina'), 'onChange', {target: {value: 'nl-page'}});
    const content = {schemaVersion: 1, locale: 'nl', title: 'NL page', slug: 'nl-page', seoTitle: 'NL page', seoDescription: '',
      blocks: [{blockId: 'text-one', type: 'text', heading: '', body: 'NL text'}]};
    ui.results.push({status: 201, body: {pageId: 'page-one', revisionId: 'nl-one', version: 1, content, published: false}},
      {status: 200, body: {activeVersion: 0, activeReleaseId: null, pages: []}});
    await ui.action(ui.button('Nieuwe pagina aanmaken'));
    const english = {pageId: 'page-one', revisionId: 'en-one', version: 1, structure: 'structure-one', savedStructure: 'structure-one', supported: true, needsUpdate: false,
      sourceBlocks: [{blockId: 'text-one', type: 'text'}], content: {...content, locale: 'en', title: 'English original'}};
    ui.results.push({status: 200, body: english}); await ui.action(ui.button('English bewerken'));
    await ui.action(ui.field('EN-paginatitel'), 'onChange', {target: {value: 'My unsaved English'}});
    await ui.action(ui.field('Bedieningstaal'), 'onChange', {target: {value: 'en'}});
    expect(ui.field('English page title').props.value).toBe('My unsaved English');
    const latest = {...english, revisionId: 'en-two', version: 2, content: {...english.content, title: 'Other editor English'}};
    ui.results.push({status: 409, body: {message: 'EN version changed'}}, {status: 200, body: latest});
    await ui.action(ui.button('Save English draft'));
    expect(ui.field('English page title').props.value).toBe('My unsaved English');
    await ui.action(ui.field('Interface language'), 'onChange', {target: {value: 'nl'}});
    expect(ui.field('EN-paginatitel').props.value).toBe('My unsaved English');
    expect(JSON.parse(ui.requests.at(-2)!.init.body!)).toMatchObject({expectedVersion: 1, expectedStructure: 'structure-one'});
    await ui.action(ui.button('Actuele EN-versie overnemen'));
    expect(ui.field('EN-paginatitel').props.value).toBe('Other editor English');
  });

  it('does not prepare a site publication containing a newer unseen home revision', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: { ...pageA, pagesEnabled: true } }); await ui.open();
    const plan = { activeReleaseId: null, activeVersion: 0,
      pages: [{ pageId: 'home', revisionId: 'revision-B', version: 2, title: 'Revisie B', file: 'index.html' }] };
    ui.results.push({ status: 200, body: plan }); await ui.action(ui.button('Publicatieselectie ophalen'));
    expect(ui.error()).toContain('Open die pagina opnieuw');
    expect(() => ui.button('Website lokaal publiceren')).toThrow();
    ui.results.push({ status: 200, body: { ...pageB, pagesEnabled: true } }); await ui.open();
    ui.results.push({ status: 200, body: plan }); await ui.action(ui.button('Publicatieselectie ophalen'));
    ui.results.push({ status: 200, body: { releaseId: 'site-one', status: 'published', publicUrl: '/sites/demo-cms/index.html' } });
    await ui.action(ui.button('Website lokaal publiceren'));
    expect(JSON.parse(ui.requests.at(-1)!.init.body!)).toMatchObject({ revisionId: 'revision-B',
      expectedPages: [{ pageId: 'home', revisionId: 'revision-B', version: 2 }] });
  });

  it('retains the exact site selection and key when the publication response is lost', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: { ...pageA, pagesEnabled: true } }); await ui.open();
    ui.results.push({ status: 200, body: { activeVersion: 0, activeReleaseId: null,
      pages: [{ pageId: 'home', revisionId: pageA.revisionId, version: 1, title: 'A', file: 'index.html' }] } });
    await ui.action(ui.button('Publicatieselectie ophalen'));
    ui.results.push(new Error('response lost')); await ui.action(ui.button('Website lokaal publiceren'));
    const first = ui.requests.at(-1)!;
    await ui.action(ui.field('Bedieningstaal'), 'onChange', {target: {value: 'en'}});
    ui.results.push({ status: 200, body: { releaseId: 'retained-site', status: 'published', publicUrl: '/sites/demo-cms/index.html' } });
    await ui.action(ui.button('Check website publication again'));
    expect(ui.requests.at(-1)!.init.body).toBe(first.init.body);
    expect(ui.requests.at(-1)!.init.headers['Idempotency-Key']).toBe(first.init.headers['Idempotency-Key']);
  });

  it('uses the real document editor to add and reorder blocks while keeping their IDs in the save request', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: { ...pageA, pagesEnabled: true } }); await ui.open();
    await ui.action(ui.field('Titel nieuwe pagina'), 'onChange', { target: { value: 'New page' } });
    await ui.action(ui.field('Slug nieuwe pagina'), 'onChange', { target: { value: 'new-page' } });
    const content = { schemaVersion: 1, locale: 'nl', title: 'New page', slug: 'new-page', seoTitle: 'New page', seoDescription: '',
      blocks: [{ blockId: 'original-block', type: 'text', heading: '', body: '' }] };
    ui.results.push({ status: 201, body: { pageId: 'new-page-id', revisionId: 'doc-revision', version: 1, content, published: false } },
      { status: 200, body: { activeVersion: 0, activeReleaseId: null, pages: [] } });
    await ui.action(ui.button('Nieuwe pagina aanmaken'));
    await ui.action(ui.field('Bloktekst'), 'onChange', { target: { value: 'First text' } });
    await ui.action(ui.button('Tekstblok toevoegen'));
    await ui.action(ui.field('Bloktekst', 1), 'onChange', { target: { value: 'Second text' } });
    await ui.action(ui.button('Blok 2 omhoog'));
    expect(ui.field('Bloktekst', 0).props.value).toBe('Second text');
    ui.results.push({ status: 200, body: { pageId: 'new-page-id', revisionId: 'doc-revision-2', version: 2, content, published: false } });
    await ui.action(ui.button('Paginaconcept opslaan'));
    const saved = JSON.parse(ui.requests.at(-1)!.init.body!);
    expect(saved.expectedVersion).toBe(1);
    expect(saved.content.blocks.map((block: { body: string }) => block.body)).toEqual(['Second text', 'First text']);
    expect(saved.content.blocks[1].blockId).toBe('original-block');
    expect(saved.content.blocks[0].blockId).not.toBe('original-block');
  });

  it('blocks explicit conflict adoption while an upload is outstanding, then preserves B and its image on adoption', async () => {
    const ui = editorHarness();
    const withImage = { ...pageA, uploadEnabled: true, values: { ...pageA.values,
      image: { assetId: 'photo', fileVersion: 1, usage: 'hero', decorative: false, altText: { nl: 'A image' } } } };
    const conflict = { ...pageB, uploadEnabled: true, values: { ...pageB.values,
      image: { assetId: 'unlicensed', fileVersion: 1, usage: 'hero', decorative: false, altText: { nl: 'B image' } } } };
    ui.results.push({ status: 200, body: withImage }); await ui.open();
    await ui.action(ui.title(), 'onChange', { target: { value: 'Mijn eigen invoer' } });
    ui.results.push({ status: 409, body: { message: 'Concept gewijzigd' } }, { status: 200, body: conflict });
    await ui.action(ui.button('Concept opslaan'));
    let complete!: (response: { status: number; body: unknown }) => void;
    const late = new Promise<{ status: number; body: unknown }>((resolve) => { complete = resolve; });
    await ui.action(ui.field('PNG-, JPEG- of WebP-bestand'), 'onChange', { target: { files: [{
      name: 'new.png', type: 'image/png', arrayBuffer: async () => new ArrayBuffer(8),
    }] } });
    ui.results.push(late); await ui.action(ui.button('Bestand uploaden'));
    expect(ui.button('Nieuwste versie overnemen').props.disabled).toBe(true);
    // Native disabled controls cannot dispatch this click; the handler guard also protects stale events.
    await ui.action(ui.button('Nieuwste versie overnemen'));
    expect(ui.title().props.value).toBe('Mijn eigen invoer');
    complete({ status: 201, body: { assetId: 'late-upload', fileVersion: 1, state: 'ready', rights: 'unknown', error: null } });
    await ui.settle();
    await ui.action(ui.button('Nieuwste versie overnemen'));
    expect(ui.title().props.value).toBe('Revisie B');
    expect(ui.field('Afbeelding').props.value).toBe('unlicensed:1');
  });

  it('requires fresh confirmation after loading a newer rights version and posts the matching selected asset', async () => {
    const ui = editorHarness();
    const uploadedPage = { ...pageA, uploadEnabled: true, values: { ...pageA.values,
      image: { assetId: 'upload-a', fileVersion: 1, usage: 'hero', decorative: false, altText: { nl: 'Proefbeeld' } } } };
    ui.results.push({ status: 200, body: uploadedPage }); await ui.open();
    ui.results.push({ status: 200, body: { assetId: 'upload-a', rights: 'unknown', metadataVersion: 1 } });
    await ui.action(ui.button('Rechtenstatus ophalen'));
    await ui.action(ui.field('Rechthebbende'), 'onChange', { target: { value: 'Fictieve maker' } });
    await ui.action(ui.field('Bron'), 'onChange', { target: { value: 'Eigen lokale fixture' } });
    await ui.action(ui.field('Onderbouwing van de rechtenbeslissing'), 'onChange', { target: { value: 'Zelf gegenereerd voor lokale tests.' } });
    const confirmation = 'Ik bevestig deze rechtenbeslissing met bovenstaande onderbouwing';
    await ui.action(ui.field(confirmation), 'onChange', { target: { checked: true } });
    ui.results.push({ status: 200, body: { assetId: 'upload-a', rights: 'blocked', metadataVersion: 2 } });
    await ui.action(ui.button('Rechtenstatus ophalen'));
    expect(ui.button('Rechten vrijgeven').props.disabled).toBe(true);
    expect(ui.field('Rechthebbende').props.value).toBe('Fictieve maker');
    await ui.action(ui.field(confirmation), 'onChange', { target: { checked: true } });
    ui.results.push({ status: 200, body: { rights: 'cleared', metadataVersion: 3 } });
    await ui.action(ui.button('Rechten vrijgeven'));
    const choice = ui.requests.at(-1)!;
    expect(choice.path).toContain('/media/upload-a/rights');
    expect(JSON.parse(choice.init.body!)).toMatchObject({ expectedVersion: 2, confirmed: true, status: 'cleared', owner: 'Fictieve maker' });
    expect(JSON.parse(choice.init.body!)).not.toHaveProperty('employee');
    await ui.action(ui.field('Afbeelding'), 'onChange', { target: { value: 'unlicensed:1' } });
    expect(() => ui.button('Rechten vrijgeven')).toThrow();
  });

  it('shows the media dependency failure from preview without blaming the token or changing text', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: pageA }); await ui.open();
    ui.results.push({ status: 503, body: { message: 'Mediaopslag niet beschikbaar. Herstel de mediamap en herstart de proef.' } });
    await ui.action(ui.button('Privépreview openen'));
    expect(ui.error()).toContain('Mediaopslag niet beschikbaar');
    expect(ui.title().props.value).toBe('Revisie A');
  });

  it('keeps the same publication key when retrying the same selected revision after network loss', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: pageA }); await ui.open();
    ui.results.push(new Error('network lost')); await ui.action(ui.button('Lokaal publiceren'));
    expect(ui.error()).toBe('network lost');
    const initial = ui.requests.at(-1)!;
    ui.results.push({ status: 200, body: { releaseId: 'release-A', status: 'published', errorCode: null, publicUrl: '/sites/demo-cms/index.html' } },
      { status: 200, body: { ...pageA, activeReleaseId: 'release-A', activeVersion: 1 } });
    await ui.action(ui.button('Publicatie opnieuw controleren'));
    const retry = ui.requests.filter((request) => request.init.method === 'POST').at(-1)!;
    expect(retry.init.headers['Idempotency-Key']).toBe(initial.init.headers['Idempotency-Key']);
    expect(retry.init.body).toBe(initial.init.body);
    expect(ui.status()).toContain('Actieve versie 1');
  });

  it('publishes visible B with a fresh key after lost A request, draft conflict and explicit adoption', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: pageA }); await ui.open();
    ui.results.push(new Error('network lost')); await ui.action(ui.button('Lokaal publiceren'));
    const oldChoice = ui.requests.at(-1)!;
    await ui.action(ui.title(), 'onChange', { target: { value: 'Mijn onopgeslagen tekst' } });
    ui.results.push({ status: 409, body: { message: 'Concept gewijzigd' } }, { status: 200, body: pageB });
    await ui.action(ui.button('Concept opslaan'));
    expect(ui.title().props.value).toBe('Mijn onopgeslagen tekst');
    await ui.action(ui.button('Nieuwste versie overnemen'));
    expect(ui.title().props.value).toBe('Revisie B');
    ui.results.push({ status: 200, body: { releaseId: 'release-B', status: 'published', errorCode: null, publicUrl: '/sites/demo-cms/index.html' } },
      { status: 200, body: { ...pageB, activeReleaseId: 'release-B', activeVersion: 1 } });
    await ui.action(ui.publicationButton());
    const selected = ui.requests.filter((request) => request.init.method === 'POST').at(-1)!;
    expect(JSON.parse(selected.init.body!)).toEqual({ revisionId: 'revision-B', expectedActiveVersion: 0 });
    expect(selected.init.headers['Idempotency-Key']).not.toBe(oldChoice.init.headers['Idempotency-Key']);
    expect(ui.status()).toContain('Actieve versie 1');
  });
});
