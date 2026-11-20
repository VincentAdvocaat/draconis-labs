import { randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCmsApp, type CmsAppOptions } from '../src/modules/cms/app.js';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { CmsRepository } from '../src/modules/cms/repository.js';
import { CmsDocuments, type DocumentDto } from '../src/modules/cms/documents.js';

const base = '/api/v1/cms/websites/demo-cms';
const headers = { authorization: 'Bearer docs-publisher' };
const editor = { authorization: 'Bearer docs-editor' };
const beta = { authorization: 'Bearer docs-beta' };
const credentials = [['docs-publisher', 'publisher', 'demo-cms'], ['docs-editor', 'editor', 'demo-cms'], ['docs-beta', 'publisher', 'demo-other']]
  .map(([name, role, site]) => ({ name, role, websiteIds: [site], tokenHash: createHash('sha256').update(name).digest('hex') }));
const fixtures: ReturnType<typeof createMediaFixture>[] = [];
const roots: string[] = [];
const apps: Awaited<ReturnType<typeof buildCmsApp>>[] = [];
afterEach(async () => {
  for (const running of apps.splice(0)) await running.app.close();
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir())) || !root.includes('cms-docs-test-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
async function start(overrides: Partial<CmsAppOptions> = {}) {
  const fixture = createMediaFixture(); fixtures.push(fixture);
  const root = mkdtempSync(join(tmpdir(), 'cms-docs-test-')); roots.push(root);
  const options = { runtimeRoot: root, credentials, seed: true, enableMedia: true, enableUploads: true, enablePages: true, mediaRoot: fixture.root, ...overrides };
  const running = await buildCmsApp(options); apps.push(running);
  return { ...running, fixture, root, options };
}
async function close(app: Awaited<ReturnType<typeof buildCmsApp>>['app']) {
  await app.close(); apps.splice(apps.findIndex((running) => running.app === app), 1);
}
type Running = Awaited<ReturnType<typeof start>>;
async function create(running: Running, slug = 'over-proeftuin') {
  const response = await running.app.inject({ method: 'POST', url: base + '/documents', headers: editor,
    payload: { title: 'Over de proeftuin', slug } });
  expect(response.statusCode).toBe(201); return response.json() as DocumentDto;
}
async function save(running: Running, page: DocumentDto, content = page.content) {
  const response = await running.app.inject({ method: 'PUT', url: `${base}/documents/${page.pageId}/draft`, headers: editor,
    payload: { expectedVersion: page.version, content } });
  expect(response.statusCode).toBe(200); return response.json() as DocumentDto;
}
function text(page: DocumentDto, body = 'Fictieve pagina-inhoud.') {
  return { ...page.content, seoTitle: 'Proeftuin SEO', seoDescription: 'Fictieve beschrijving',
    blocks: [{ blockId: page.content.blocks[0].blockId, type: 'text' as const, heading: 'Een nieuw blok', body }] };
}
function imageBlock(assetId = 'photo', fileVersion = 1) {
  const blockId = randomUUID();
  return { blockId, type: 'image' as const, reference: { assetId, fileVersion, usage: `block-${blockId}`,
    altText: { nl: 'Fictieve rode pixel' }, decorative: false }, caption: 'Alleen proefdata' };
}
async function approve(running: Running, assetId = 'photo') {
  const response = await running.app.inject({ method: 'PUT', url: `${base}/media/${assetId}/rights`, headers,
    payload: { expectedVersion: 1, status: 'cleared', owner: 'Proefmaker', source: 'Lokale fictieve test',
      basis: 'Uitsluitend zelf gegenereerde fictieve proefdata.', confirmed: true } });
  expect(response.statusCode).toBe(200);
}
async function plan(running: Running) {
  const response = await running.app.inject({ url: base + '/site-plan', headers });
  expect(response.statusCode).toBe(200); return response.json();
}
function publish(running: Running, choice: Awaited<ReturnType<typeof plan>>, key: string) {
  return running.app.inject({ method: 'POST', url: base + '/releases', headers: { ...headers, 'idempotency-key': key },
    payload: { revisionId: choice.pages.find((page: { pageId: string }) => page.pageId === 'home').revisionId,
      expectedActiveVersion: choice.activeVersion,
      expectedPages: choice.pages.map(({ pageId, revisionId, version }: { pageId: string; revisionId: string; version: number }) => ({ pageId, revisionId, version })) } });
}

describe('CMS pages, blocks and complete site snapshots', () => {
  it('permits a slug change after a failed first publication without freezing an unpublished route', async () => {
    let fail = true;
    const running = await start({ hooks: { beforeBuild: async () => { if (fail) throw new Error('Simulated build failure'); } } });
    let doc = await create(running, 'unpublished'); doc = await save(running, doc, text(doc));
    expect((await publish(running, await plan(running), 'failed-first-route')).statusCode).toBe(422);
    doc = await save(running, doc, { ...doc.content, slug: 'corrected' });
    fail = false;
    expect((await publish(running, await plan(running), 'corrected-first-route')).statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/corrected.html')).statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/unpublished.html')).statusCode).toBe(404);
  });

  it('preserves the first published URL when a slug rename races a pending first build', async () => {
    let entered!: () => void; let release!: () => void;
    const ready = new Promise<void>((r) => { entered = r; }); const held = new Promise<void>((r) => { release = r; });
    const running = await start({ hooks: { beforeBuild: async () => { entered(); await held; } } });
    let doc = await create(running, 'original'); doc = await save(running, doc, text(doc, 'First published text'));
    const pending = publish(running, await plan(running), 'first-url-build'); await ready;
    try {
      const rename = await running.app.inject({ method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers: editor,
        payload: { expectedVersion: doc.version, content: { ...doc.content, slug: 'renamed' } } });
      expect(rename.statusCode).toBe(409);
      expect((await running.app.inject({ method: 'POST', url: base + '/documents', headers: editor,
        payload: { title: 'Another document', slug: 'original' } })).statusCode).toBe(409);
      doc = await save(running, doc, text(doc, 'Newer text draft during build'));
    } finally { release(); }
    expect((await pending).statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/original.html')).body).toContain('First published text');
    expect((await publish(running, await plan(running), 'second-url-build')).statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/original.html')).body).toContain('Newer text draft during build');
    expect((await running.app.inject('/sites/demo-cms/renamed.html')).statusCode).toBe(404);
  });

  it('publishes a renamed route while preserving the earlier release and its reserved slug', async () => {
    const running = await start();
    const original = await create(running, 'original');
    const page = await save(running, original, text(original, 'Original published text'));
    const other = await create(running, 'already-taken');
    await save(running, other, text(other));
    const first = await publish(running, await plan(running), 'before-route-rename');
    expect(first.statusCode).toBe(200);
    const oldRelease = join(running.root, 'releases', 'demo-cms', first.json().releaseId);
    const oldHtml = readFileSync(join(oldRelease, 'original.html'));
    const oldManifest = readFileSync(join(oldRelease, 'release.json'));
    const tryRename = (slug: string) => running.app.inject({
      method: 'PUT', url: `${base}/documents/${page.pageId}/draft`, headers: editor,
      payload: { expectedVersion: page.version, content: { ...page.content, slug } },
    });
    expect((await tryRename('already-taken')).statusCode).toBe(409);
    expect((await tryRename('en')).statusCode).toBe(400);

    const draft = await save(running, page, { ...text(page, 'Renamed published text'), slug: 'new-route' });
    expect(draft).toMatchObject({ pageId: page.pageId, version: page.version + 1, publishedFile: 'original.html' });
    expect(draft.revisionId).not.toBe(page.revisionId);
    expect((await running.app.inject('/sites/demo-cms/original.html')).rawPayload).toEqual(oldHtml);
    expect((await running.app.inject('/sites/demo-cms/new-route.html')).statusCode).toBe(404);

    const next = await publish(running, await plan(running), 'after-route-rename');
    expect(next.statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/new-route.html')).body).toContain('Renamed published text');
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).toContain('href="/sites/demo-cms/new-route.html"');
    expect((await running.app.inject('/sites/demo-cms/original.html')).statusCode).toBe(404);
    const result = await running.app.inject({ url: `${base}/documents/${page.pageId}`, headers: editor });
    expect(result.json()).toMatchObject({ pageId: page.pageId, revisionId: draft.revisionId, publishedFile: 'new-route.html' });
    expect(readFileSync(join(oldRelease, 'original.html'))).toEqual(oldHtml);
    expect(readFileSync(join(oldRelease, 'release.json'))).toEqual(oldManifest);

    const reused = await running.app.inject({ method: 'POST', url: base + '/documents', headers: editor,
      payload: { title: 'Other document', slug: 'original' } });
    expect(reused.statusCode).toBe(409);
    const restoredDraft = await save(running, draft, { ...draft.content, slug: 'original' });
    expect(restoredDraft.publishedFile).toBe('new-route.html');
  });

  it('activates exactly one of two site publishers against the same active version', async () => {
    let entered = 0; let both!: () => void; let release!: () => void;
    const ready = new Promise<void>((r) => { both = r; }); const held = new Promise<void>((r) => { release = r; });
    const running = await start({ hooks: { beforeActivate: async () => { if (++entered === 2) both(); await held; } } });
    let doc = await create(running); doc = await save(running, doc, text(doc));
    const selected = await plan(running);
    const first = publish(running, selected, 'site-race-one'); const second = publish(running, selected, 'site-race-two');
    await ready; release();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    expect(running.repository.active('demo-cms').activeVersion).toBe(1);
    expect((await running.app.inject('/sites/demo-cms/over-proeftuin.html')).statusCode).toBe(200);
  });

  it('upgrades an existing text/image fixture without changing home, IDs, versions or retained image URLs', async () => {
    const original = await start({ enablePages: false });
    await approve(original);
    const first = (await original.app.inject({ url: base + '/pages/home', headers })).json();
    const home = (await original.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers,
      payload: { expectedVersion: first.pageVersion, values: { title: 'Home blijft behouden', intro: 'Deze tekst mag niet veranderen.',
        image: { assetId: 'photo', fileVersion: 1, usage: 'hero', decorative: true, altText: { nl: '' } } } } })).json();
    const before = await original.app.inject({ method: 'POST', url: base + '/releases', headers: { ...headers, 'idempotency-key': 'legacy-home-publish' },
      payload: { revisionId: home.revisionId, expectedActiveVersion: 0 } });
    expect(before.statusCode).toBe(200);
    const oldImage = `/sites/demo-cms/media/${before.json().releaseId}/hero.png`;
    const bytes = (await original.app.inject(oldImage)).rawPayload;
    await close(original.app);
    let running = await buildCmsApp({ ...original.options, enablePages: true }); apps.push(running);
    const upgraded = (await running.app.inject({ url: base + '/pages/home', headers })).json();
    expect(upgraded.values).toEqual(home.values); expect(upgraded.revisionId).toBe(home.revisionId); expect(upgraded.pageVersion).toBe(home.pageVersion);
    expect(upgraded.activeReleaseId).toBe(before.json().releaseId);
    let doc = await create({ ...original, ...running });
    doc = await save({ ...original, ...running }, doc, text(doc));
    const result = await publish({ ...original, ...running }, await plan({ ...original, ...running }), 'complete-upgraded-site');
    expect(result.statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).toContain('Deze tekst mag niet veranderen.');
    expect((await running.app.inject('/sites/demo-cms/over-proeftuin.html')).body).toContain('Fictieve pagina-inhoud.');
    expect((await running.app.inject(oldImage)).rawPayload).toEqual(bytes);
    await close(running.app);
    running = await buildCmsApp({ ...original.options, enablePages: true }); apps.push(running);
    expect(running.repository.db.prepare('SELECT count(*) AS n FROM cms_home_identity WHERE website_id=?').get('demo-cms')).toEqual({ n: 1 });
    expect(running.repository.db.prepare('SELECT count(*) AS n FROM cms_migrations WHERE version=3').get()).toEqual({ n: 1 });
    expect(running.documents!.get('demo-cms', doc.pageId).revisionId).toBe(doc.revisionId);
    expect((await running.app.inject('/sites/demo-cms/over-proeftuin.html')).statusCode).toBe(200);
  });

  it('creates and reorders typed blocks, safely renders SEO/text, and pins a separately retained image', async () => {
    const running = await start(); await approve(running);
    let doc = await create(running);
    const content = text(doc, '<script>bad()</script>');
    const photo = imageBlock();
    content.blocks.push({ blockId: randomUUID(), type: 'text', heading: 'Tweede kop', body: 'Tweede blokinhoud' });
    const withImage = { ...content, seoDescription: '" onload="bad()', blocks: [photo, content.blocks[1], content.blocks[0]] };
    doc = await save(running, doc, withImage);
    const preview = await running.app.inject({ url: `${base}/documents/${doc.pageId}/previews/${doc.revisionId}`, headers: editor });
    expect(preview.statusCode).toBe(200); expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.body).toContain('data:image/png;base64,'); expect(preview.body).toContain('&lt;script&gt;'); expect(preview.body).not.toContain('<script>');
    expect(preview.body.indexOf('<figure>')).toBeLessThan(preview.body.indexOf('Tweede kop'));
    const result = await publish(running, await plan(running), 'site-with-new-page'); expect(result.statusCode).toBe(200);
    const output = await running.app.inject('/sites/demo-cms/over-proeftuin.html');
    expect(output.body).toContain('<title>Proeftuin SEO</title>'); expect(output.body).toContain('&quot; onload=&quot;bad()');
    expect(output.body).toContain('href="/sites/demo-cms/index.html"'); expect(output.body).not.toContain('data:image');
    const imageUrl = `/sites/demo-cms/media/${result.json().releaseId}/${doc.pageId}.png`;
    expect((await running.app.inject(imageUrl)).statusCode).toBe(200);
    const manifest = JSON.parse(readFileSync(join(running.root, 'releases', 'demo-cms', result.json().releaseId, 'release.json'), 'utf8'));
    expect(manifest.pages.find((page: { pageId: string }) => page.pageId === doc.pageId).media[0].fileVersion).toBe(1);
    const empty = { ...doc.content, blocks: [content.blocks[0]] };
    await save(running, doc, empty);
    expect((await running.app.inject(imageUrl)).statusCode).toBe(200);
    expect(() => running.media!.store.purge('fixture-alpha', 'photo', 2, true)).toThrow('retained');
  });

  it('rejects unsafe/duplicate slugs, unknown blocks, invalid usage and unsupported locales without writing revisions', async () => {
    const running = await start(); const doc = await create(running, ' About ');
    expect(doc.content.slug).toBe('about');
    expect((await running.app.inject({ method: 'POST', url: base + '/documents', headers: editor, payload: { title: 'Duplicate', slug: 'ABOUT' } })).statusCode).toBe(409);
    for (const slug of ['index', 'api', 'con', 'LPT1', '../outside', 'foo.html', 'x%2Fy', '.hidden', 'x:y']) {
      expect((await running.app.inject({ method: 'POST', url: base + '/documents', headers: editor, payload: { title: 'Unsafe', slug } })).statusCode).toBe(400);
    }
    const invalid = [
      { ...doc.content, locale: 'en' },
      { ...doc.content, blocks: [{ blockId: randomUUID(), type: 'html', html: '<script>bad()</script>' }] },
      { ...doc.content, blocks: [doc.content.blocks[0], doc.content.blocks[0]] },
      { ...doc.content, blocks: [{ ...imageBlock(), reference: { ...imageBlock().reference, usage: 'wrong' } }] },
    ];
    for (const content of invalid) expect((await running.app.inject({ method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers: editor,
      payload: { expectedVersion: 1, content } })).statusCode).toBe(400);
    expect(running.documents!.get('demo-cms', doc.pageId).version).toBe(1);
    expect(running.repository.db.prepare('SELECT count(*) AS n FROM cms_document_revisions WHERE page_id=?').get(doc.pageId)).toEqual({ n: 1 });
  });

  it('enforces page CAS across independent connections and rejects a stale complete publication plan', async () => {
    const running = await start(); let doc = await create(running); doc = await save(running, doc, text(doc));
    const selected = await plan(running);
    const otherRepo = new CmsRepository(join(running.root, 'cms.db'), running.media);
    const otherDocs = new CmsDocuments(otherRepo, running.media, running.uploads);
    try {
      const changed = await save(running, doc, text(doc, 'Nieuwste tekst'));
      expect(() => otherDocs.save('demo-cms', doc.pageId, { expectedVersion: doc.version, content: text(doc, 'Verouderd') }, 'test')).toThrow('gewijzigd');
      expect(changed.pageId).toBe(doc.pageId);
    } finally { otherRepo.close(); }
    expect((await publish(running, selected, 'stale-pages-plan')).statusCode).toBe(409);
    const home = running.repository.page('demo-cms');
    expect((await running.app.inject({ method: 'POST', url: base + '/releases', headers: { ...headers, 'idempotency-key': 'missing-full-plan' },
      payload: { revisionId: home.revisionId, expectedActiveVersion: 0 } })).statusCode).toBe(428);
    expect(running.repository.active('demo-cms').activeVersion).toBe(0);
  });

  it('pins every selected page before async build while newer drafts remain separate', async () => {
    let entered!: () => void; let release!: () => void;
    const ready = new Promise<void>((r) => { entered = r; }); const held = new Promise<void>((r) => { release = r; });
    const running = await start({ hooks: { beforeBuild: async () => { entered(); await held; } } });
    let doc = await create(running); doc = await save(running, doc, text(doc, 'Snapshot A'));
    const selected = await plan(running); const pending = publish(running, selected, 'pinned-whole-site'); await ready;
    await save(running, doc, text(doc, 'Newer draft B')); release();
    const result = await pending; expect(result.statusCode).toBe(200);
    const html = (await running.app.inject('/sites/demo-cms/over-proeftuin.html')).body;
    expect(html).toContain('Snapshot A'); expect(html).not.toContain('Newer draft B');
    expect(running.documents!.get('demo-cms', doc.pageId).content.blocks[0]).toMatchObject({ body: 'Newer draft B' });
    const retry = await publish(running, selected, 'pinned-whole-site'); expect(retry.json().releaseId).toBe(result.json().releaseId);
    const changed = await publish(running, await plan(running), 'pinned-whole-site'); expect(changed.statusCode).toBe(409);
  });

  it('preserves the active route on incomplete content or rights revocation during a rename publication', async () => {
    let revoke = false;
    const running = await start({ hooks: { beforeActivate: async () => {
      if (revoke) expect((await running.app.inject({ method: 'PUT', url: base + '/media/photo/rights', headers,
        payload: { expectedVersion: 2, status: 'blocked', owner: 'Proefmaker', source: 'Lokale test', basis: 'Bewust geblokkeerd tijdens de test.', confirmed: true } })).statusCode).toBe(200);
    } } });
    expect((await publish(running, await plan(running), 'initial-home-site')).statusCode).toBe(200);
    let doc = await create(running);
    const incomplete = await publish(running, await plan(running), 'incomplete-new-page');
    expect(incomplete.statusCode).toBe(422); expect(incomplete.json().errorCode).toBe('content_not_publishable');
    expect(running.repository.active('demo-cms').activeVersion).toBe(1);
    await approve(running);
    doc = await save(running, doc, { ...text(doc), blocks: [...text(doc).blocks, imageBlock()] });
    const prior = await publish(running, await plan(running), 'valid-complete-site'); expect(prior.statusCode).toBe(200);
    const rename = await save(running, doc, { ...doc.content, slug: 'anders' });
    expect(rename.publishedFile).toBe('over-proeftuin.html');
    revoke = true;
    const blocked = await publish(running, await plan(running), 'rights-blocked-whole-site');
    expect(blocked.statusCode).toBe(422); expect(blocked.json().errorCode).toBe('media_not_publishable');
    expect(running.repository.active('demo-cms').activeReleaseId).toBe(prior.json().releaseId);
    expect((await running.app.inject('/sites/demo-cms/over-proeftuin.html')).statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/anders.html')).statusCode).toBe(404);
    expect((await running.app.inject(`/sites/demo-cms/media/${prior.json().releaseId}/${doc.pageId}.png`)).statusCode).toBe(200);
    expect((await running.app.inject(`/sites/demo-cms/media/${blocked.json().releaseId}/${doc.pageId}.png`)).statusCode).toBe(404);
  });

  it('keeps page and media scope closed and permits a bounded document larger than the old JSON limit', async () => {
    const running = await start(); let doc = await create(running);
    expect((await running.app.inject({ url: `${base}/documents/${doc.pageId}` })).statusCode).toBe(401);
    expect((await running.app.inject({ url: `${base.replace('demo-cms', 'demo-other')}/documents/${doc.pageId}`, headers: beta })).statusCode).toBe(404);
    const source = await sharp({ create: { width: 8, height: 8, channels: 3, background: 'blue' } }).png().toBuffer();
    const upload = await running.app.inject({ method: 'POST', url: base.replace('demo-cms', 'demo-other') + '/media',
      headers: { ...beta, 'content-type': 'image/png', 'x-media-filename': 'beta.png' }, payload: source });
    const foreignImage = imageBlock(upload.json().assetId);
    expect((await running.app.inject({ method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers: editor,
      payload: { expectedVersion: doc.version, content: { ...text(doc), blocks: [...text(doc).blocks, foreignImage] } } })).statusCode).toBe(404);
    const big = text(doc, 'a'.repeat(10_000)); big.blocks.push({ blockId: randomUUID(), type: 'text', heading: '', body: 'b'.repeat(10_000) });
    doc = await save(running, doc, big); expect(doc.version).toBe(2);
    const selected = await plan(running);
    expect((await running.app.inject({ method: 'POST', url: base + '/releases', headers: { ...editor, 'idempotency-key': 'editor-cannot-publish' },
      payload: { revisionId: selected.pages[0].revisionId, expectedActiveVersion: 0, expectedPages: selected.pages } })).statusCode).toBe(403);
    expect((await running.app.inject('/sites/demo-cms/../release.json')).statusCode).toBe(404);
  });
});
