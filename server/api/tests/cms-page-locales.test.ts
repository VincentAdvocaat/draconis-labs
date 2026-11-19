import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCmsApp, type CmsAppOptions } from '../src/modules/cms/app.js';
import { CmsRepository } from '../src/modules/cms/repository.js';
import { CmsDocuments } from '../src/modules/cms/documents.js';
import { localeSaveSchema } from '../src/modules/cms/page-locales.js';

const base = '/api/v1/cms/websites/demo-cms';
const headers = {authorization: 'Bearer locale-test'};
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {for (const cleanup of cleanups.splice(0).reverse()) await cleanup();});
async function start(hooks: CmsAppOptions['hooks'] = {}) {
  const root = mkdtempSync(join(tmpdir(), 'cms-page-locales-'));
  cleanups.push(() => {if (!resolve(root).startsWith(resolve(tmpdir())) || !root.includes('cms-page-locales-')) throw new Error('Unsafe cleanup'); rmSync(root, {recursive: true, force: true});});
  const options = {runtimeRoot: root, seed: true, enablePages: true, hooks,
    credentials: [{name: 'Test', role: 'publisher', websiteIds: ['demo-cms','demo-other'], tokenHash: createHash('sha256').update('locale-test').digest('hex')}]};
  let running = await buildCmsApp(options);
  cleanups.push(async () => {await running.app.close();});
  return {root, get running() {return running;}, async reopen() {await running.app.close(); running = await buildCmsApp(options);}};
}
type Test = Awaited<ReturnType<typeof start>>;
async function create(test: Test, slug = 'proefpagina') {
  let result = await test.running.app.inject({method: 'POST', url: base + '/documents', headers, payload: {title: 'Nederlandse pagina', slug}});
  expect(result.statusCode).toBe(201); const doc = result.json(); doc.content.blocks[0].body = 'Nederlandse tekst';
  result = await test.running.app.inject({method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers, payload: {expectedVersion: doc.version, content: doc.content}});
  expect(result.statusCode).toBe(200); return result.json();
}
async function get(test: Test, pageId: string) {
  const result = await test.running.app.inject({url: `${base}/documents/${pageId}/locales/en`, headers});
  expect(result.statusCode).toBe(200); return result.json();
}
function content(draft: Awaited<ReturnType<typeof get>>, slug = 'sample-page') {
  return {...draft.content, title: 'English page', slug, seoTitle: 'English SEO', seoDescription: 'English description',
    blocks: draft.content.blocks.map((block: {blockId: string; type: string}) => ({...block, heading: 'English heading', body: 'English text'}))};
}
async function save(test: Test, draft: Awaited<ReturnType<typeof get>>, changed = content(draft)) {
  return test.running.app.inject({method: 'PUT', url: `${base}/documents/${draft.pageId}/locales/en`, headers,
    payload: {expectedVersion: draft.version, expectedStructure: draft.structure, content: changed}});
}
async function publish(test: Test, selected: string[] = []) {
  const plan = (await test.running.app.inject({url: base + '/site-plan', headers})).json();
  const payload = {revisionId: plan.pages[0].revisionId, expectedActiveVersion: plan.activeVersion,
    expectedPages: plan.pages.map(({pageId, revisionId, version}: {pageId: string; revisionId: string; version: number}) => ({pageId, revisionId, version})),
    expectedLocales: plan.localeVariants.filter((item: {pageId: string}) => selected.includes(item.pageId)).map(({pageId, locale, revisionId, version, structure}: {pageId: string; locale: string; revisionId: string; version: number; structure: string}) => ({pageId, locale, revisionId, version, structure}))};
  return test.running.app.inject({method: 'POST', url: base + '/releases', headers: {...headers, 'idempotency-key': randomUUID()}, payload});
}
describe('CMS manual page locales', () => {
  it('upgrades and edits a previously published NL en.html without changing its legacy slug', async () => {
    const test = await start();
    // The reviewed pre-CMS22 create schema accepted this exact NL slug.
    let doc = test.running.documents!.create('demo-cms', {title: 'Legacy en page', slug: 'en'}, 'Legacy fixture');
    doc = test.running.documents!.save('demo-cms', doc.pageId, {expectedVersion: doc.version,
      content: {...doc.content, blocks: [{...doc.content.blocks[0], type: 'text', heading: '', body: 'Legacy original text'}]}}, 'Legacy fixture');
    expect((await publish(test)).statusCode).toBe(200);
    const legacyRevision = doc.revisionId;
    // Represent the old on-disk schema with no locale state; existing NL data/release stay intact.
    test.running.repository.db.exec(`DROP TABLE cms_locale_heads; DROP TABLE cms_locale_revisions; DROP TABLE cms_locale_config;
      DELETE FROM cms_migrations WHERE version=4`);
    await test.reopen();
    expect(test.running.documents!.get('demo-cms', doc.pageId).revisionId).toBe(legacyRevision);
    expect((await test.running.app.inject('/sites/demo-cms/en.html')).body).toContain('Legacy original text');
    const result = await test.running.app.inject({method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers,
      payload: {expectedVersion: doc.version, content: {...doc.content, blocks: [{...doc.content.blocks[0], body: 'Updated legacy text'}]}}});
    expect(result.statusCode).toBe(200);
    expect((await publish(test)).statusCode).toBe(200);
    expect((await test.running.app.inject('/sites/demo-cms/en.html')).body).toContain('Updated legacy text');
    expect((await test.running.app.inject({method: 'POST', url: base + '/documents', headers, payload: {title: 'New en page', slug: 'en'}})).statusCode).toBe(400);
    const other = await create(test, 'other-page');
    expect((await test.running.app.inject({method: 'PUT', url: `${base}/documents/${other.pageId}/draft`, headers,
      payload: {expectedVersion: other.version, content: {...other.content, slug: 'en'}}})).statusCode).toBe(400);
  });

  it('keeps stable page/block identities, defaults to NL, explicitly publishes EN SEO/lang/navigation and reopens unchanged', async () => {
    const test = await start(); const doc = await create(test); const originalRevision = doc.revisionId;
    let draft = await get(test, doc.pageId);
    expect(draft.defaultLocale).toBe('nl'); expect(draft.content.title).toBeNull(); expect(draft.content.blocks[0].blockId).toBe(doc.content.blocks[0].blockId);
    const saved = await save(test, draft); expect(saved.statusCode).toBe(200); draft = saved.json();
    expect(test.running.documents!.get('demo-cms', doc.pageId).revisionId).toBe(originalRevision);
    expect((await publish(test)).statusCode).toBe(200);
    expect((await test.running.app.inject('/sites/demo-cms/en/sample-page.html')).statusCode).toBe(404);
    const preview = await test.running.app.inject({url: `${base}/documents/${doc.pageId}/locales/en/previews/${draft.revisionId}`, headers});
    expect(preview.body).toContain('<html lang="en">'); expect(preview.headers['cache-control']).toBe('no-store');
    expect((await publish(test, [doc.pageId])).statusCode).toBe(200);
    const en = await test.running.app.inject('/sites/demo-cms/en/sample-page.html');
    expect(en.body).toContain('<title>English SEO</title>'); expect(en.body).toContain('content="English description"');
    expect(en.body).toContain('aria-label="Language"'); expect(en.body).toContain('>English</a>'); expect(en.body).toContain('>Nederlands</a>');
    expect(en.body).not.toContain('Welkom bij de proeftuin');
    expect((await test.running.app.inject('/sites/demo-cms/proefpagina.html')).body).toContain('English</a>');
    await test.reopen(); expect((await test.running.app.inject('/sites/demo-cms/en/sample-page.html')).body).toBe(en.body);
    expect(test.running.repository.db.prepare('SELECT count(*) AS n FROM cms_migrations WHERE version=4').get()).toEqual({n: 1});
    expect((await get(test, doc.pageId)).revisionId).toBe(draft.revisionId);
  });

  it('preserves null/empty drafts, rejects incomplete chosen EN without fallback and retains previous EN when publishing NL only', async () => {
    const test = await start(); const doc = await create(test); let draft = (await save(test, await get(test, doc.pageId))).json();
    const first = await publish(test, [doc.pageId]); expect(first.statusCode).toBe(200);
    for (const title of [null, '', '   ']) {
      const saved = await save(test, draft, {...draft.content, title}); expect(saved.statusCode).toBe(200); draft = saved.json(); expect(draft.content.title).toBe(title);
      expect((await publish(test, [doc.pageId])).statusCode).toBe(400);
      expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
    }
    expect((await publish(test)).statusCode).toBe(200);
    expect((await test.running.app.inject('/sites/demo-cms/en/sample-page.html')).body).toContain('English page');
  });

  it('normalizes slugs, enforces storage uniqueness across independent writers and isolates locale/site namespaces', async () => {
    const test = await start(); const a = await create(test, 'a'); const b = await create(test, 'b');
    const enA = await get(test, a.pageId); const enB = await get(test, b.pageId);
    const repo = new CmsRepository(join(test.root, 'cms.db')); const docs = new CmsDocuments(repo);
    try {
      const results = await Promise.allSettled([
        save(test, enA, content(enA, ' SAME ')),
        Promise.resolve().then(() => docs.locales.save('demo-cms', b.pageId, localeSaveSchema.parse({expectedVersion: 0, expectedStructure: enB.structure, content: content(enB, 'same')}), 'Other writer')),
      ]);
      const successes = results.filter((item) => item.status === 'fulfilled' && (!('statusCode' in item.value) || item.value.statusCode === 200));
      expect(successes).toHaveLength(1);
      expect(test.running.repository.db.prepare("SELECT count(*) AS n FROM cms_locale_heads WHERE website_id='demo-cms' AND slug='same'").get()).toEqual({n: 1});
      expect(() => repo.db.prepare("UPDATE cms_locale_heads SET slug='UPPER' WHERE website_id='demo-cms'").run()).toThrow();
      const winner = repo.db.prepare("SELECT page_id FROM cms_locale_heads WHERE website_id='demo-cms'").get() as {page_id: string};
      expect(() => repo.db.prepare("INSERT INTO cms_locale_heads SELECT website_id,?,locale,slug,revision_id,version FROM cms_locale_heads WHERE website_id='demo-cms' LIMIT 1")
        .run(winner.page_id === a.pageId ? b.pageId : a.pageId)).toThrow('UNIQUE');
    } finally {repo.close();}
    const foreign = await test.running.app.inject({url: `${base.replace('demo-cms','demo-other')}/documents/${a.pageId}/locales/en`, headers}); expect(foreign.statusCode).toBe(404);
    for (const slug of ['en','index','con','LPT1','../escape','en/slug','x.html','x%2fy']) {
      expect((await save(test, await get(test, a.pageId), content(enA, slug))).statusCode).toBe(400);
    }
    expect((await test.running.app.inject('/sites/demo-cms/en/../sample-page.html')).statusCode).toBe(404);
  });

  it('reports structural staleness, preserves old translations, requires explicit alignment and rejects stale saves/selection', async () => {
    const test = await start(); const doc = await create(test); const draft = (await save(test, await get(test, doc.pageId))).json();
    expect((await publish(test, [doc.pageId])).statusCode).toBe(200);
    const changed = {...doc.content, blocks: [...doc.content.blocks, {blockId: randomUUID(), type: 'text', heading: '', body: 'Nieuw NL-blok'}]};
    expect((await test.running.app.inject({method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers, payload: {expectedVersion: doc.version, content: changed}})).statusCode).toBe(200);
    const latest = await get(test, doc.pageId); expect(latest.needsUpdate).toBe(true); expect(latest.content.blocks).toEqual(draft.content.blocks);
    const oldPreview = await test.running.app.inject({url: `${base}/documents/${doc.pageId}/locales/en/previews/${draft.revisionId}`, headers});
    expect(oldPreview.statusCode).toBe(200); expect(oldPreview.body).toContain('English text');
    expect((await save(test, draft)).statusCode).toBe(409); expect((await publish(test, [doc.pageId])).statusCode).toBe(409);
    expect((await publish(test)).statusCode).toBe(200); // NL remains publishable; old EN retained.
    const aligned = {...latest.content, blocks: latest.sourceBlocks.map(({blockId}: {blockId: string}) => latest.content.blocks.find((block: {blockId: string}) => block.blockId === blockId)
      ?? {blockId, type: 'text', heading: null, body: 'Manually added English text'})};
    const saved = await save(test, latest, aligned); expect(saved.statusCode).toBe(200); expect(saved.json().needsUpdate).toBe(false);
    expect((await publish(test, [doc.pageId])).statusCode).toBe(200);
    expect((await test.running.app.inject('/sites/demo-cms/en/sample-page.html')).body).toContain('Manually added English text');
  });

  it('pins selected EN before async build while allowing a newer EN draft and freezes the pending EN slug', async () => {
    let enter!: () => void; let release!: () => void;
    const ready = new Promise<void>((r) => {enter = r;}); const held = new Promise<void>((r) => {release = r;});
    const test = await start({beforeBuild: async () => {enter(); await held;}}); const doc = await create(test);
    const draft = (await save(test, await get(test, doc.pageId))).json(); const pending = publish(test, [doc.pageId]); await ready;
    try {
      expect((await save(test, draft, {...draft.content, slug: 'renamed'})).statusCode).toBe(409);
      expect((await save(test, draft, {...draft.content, title: 'Newer EN draft'})).statusCode).toBe(200);
    } finally {release();}
    expect((await pending).statusCode).toBe(200);
    const en = (await test.running.app.inject('/sites/demo-cms/en/sample-page.html')).body;
    expect(en).toContain('English page'); expect(en).not.toContain('Newer EN draft');
  });
});
