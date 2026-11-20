import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCmsApp, type CmsAppOptions } from '../src/modules/cms/app.js';
import { CmsRepository } from '../src/modules/cms/repository.js';
import type { Page } from '../src/modules/cms/model.js';

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const credentials = [
  { name: 'editor', role: 'editor', websiteIds: ['demo-cms'], tokenHash: tokenHash('fixture-editor-token') },
  { name: 'publisher', role: 'publisher', websiteIds: ['demo-cms'], tokenHash: tokenHash('fixture-publisher-token') },
  { name: 'other', role: 'publisher', websiteIds: ['demo-other'], tokenHash: tokenHash('fixture-other-token') },
];
const base = '/api/v1/cms/websites/demo-cms';
const editor = { authorization: 'Bearer fixture-editor-token' };
const publisher = { authorization: 'Bearer fixture-publisher-token' };
const roots: string[] = [];
const apps: Awaited<ReturnType<typeof buildCmsApp>>[] = [];
const runtimeRoot = () => { const root = mkdtempSync(join(tmpdir(), 'cms-test-')); roots.push(root); return root; };
async function start(options: Partial<CmsAppOptions> = {}) {
  const running = await buildCmsApp({ runtimeRoot: runtimeRoot(), credentials, seed: true, ...options });
  apps.push(running);
  return running;
}
async function close(running: Awaited<ReturnType<typeof buildCmsApp>>) {
  await running.app.close(); apps.splice(apps.indexOf(running), 1);
}
afterEach(async () => {
  for (const running of apps.splice(0)) await running.app.close();
  for (const root of roots.splice(0)) {
    // Only temp directories created by this test, verified before recursive cleanup.
    if (!resolve(root).startsWith(resolve(tmpdir())) || !root.includes('cms-test-')) throw new Error('Unsafe cleanup target');
    rmSync(root, { recursive: true, force: true });
  }
});
async function read(running: Awaited<ReturnType<typeof buildCmsApp>>): Promise<Page> {
  const response = await running.app.inject({ url: `${base}/pages/home`, headers: publisher });
  expect(response.statusCode).toBe(200); return response.json();
}
async function save(running: Awaited<ReturnType<typeof buildCmsApp>>, page: Page, title: string) {
  const response = await running.app.inject({ method: 'PUT', url: `${base}/pages/home/draft`, headers: editor,
    payload: { expectedVersion: page.pageVersion, values: { title, intro: 'Fictieve testtekst' } } });
  expect(response.statusCode).toBe(200); return response.json() as Page;
}
async function publish(running: Awaited<ReturnType<typeof buildCmsApp>>, page: Page, key: string) {
  return running.app.inject({ method: 'POST', url: `${base}/releases`, headers: { ...publisher, 'idempotency-key': key },
    payload: { revisionId: page.revisionId, expectedActiveVersion: page.activeVersion } });
}
function barrier() {
  let release!: () => void;
  let entered!: () => void;
  const ready = new Promise<void>((r) => { entered = r; });
  const held = new Promise<void>((r) => { release = r; });
  return { ready, release, wait: async () => { entered(); await held; } };
}

describe('local CMS through its normal application factory', () => {
  it('serves the app and protected module over a loopback listener without exposing runtime files', async () => {
    const ui = runtimeRoot();
    writeFileSync(join(ui, 'index.html'), '<!doctype html><title>CMS fixture UI</title>');
    writeFileSync(join(ui, 'private.txt'), 'never public');
    const running = await start({ uiRoot: ui });
    const address = await running.app.listen({ host: '127.0.0.1', port: 0 });
    expect(running.app.server.address()).toMatchObject({ address: '127.0.0.1' });
    expect(await (await fetch(address)).text()).toContain('CMS fixture UI');
    expect((await fetch(address + base + '/pages/home')).status).toBe(401);
    expect((await fetch(address + base + '/pages/home', { headers: editor })).status).toBe(200);
    expect((await fetch(address + '/private.txt')).status).toBe(404);
    expect((await fetch(address + '/assets/%2e%2e%2fprivate.txt')).status).toBe(404);
  });

  it('protects every management route before validation and isolates sites and objects', async () => {
    const running = await start();
    const page = await read(running);
    for (const [method, route] of [
      ['GET', '/pages/home'], ['PUT', '/pages/home/draft'], ['GET', `/previews/${page.revisionId}`],
      ['POST', '/releases'], ['GET', '/releases/not-an-id'],
    ] as const) {
      expect((await running.app.inject({ method, url: base + route })).statusCode).toBe(401);
      expect((await running.app.inject({ method, url: base + route, headers: { authorization: 'Bearer invalid' } })).statusCode).toBe(401);
    }
    expect((await running.app.inject({ url: base.replace('demo-cms', 'demo-other') + '/pages/home', headers: editor })).statusCode).toBe(404);
    expect((await running.app.inject({ url: base.replace('demo-cms', 'demo-other') + `/previews/${page.revisionId}`,
      headers: { authorization: 'Bearer fixture-other-token' } })).statusCode).toBe(404);
    expect((await running.app.inject({ method: 'POST', url: base + '/releases', headers: editor,
      payload: { revisionId: page.revisionId, expectedActiveVersion: 0 } })).statusCode).toBe(403);
    expect((await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers: editor,
      payload: { values: page.values } })).statusCode).toBe(428);
    expect((await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers: editor,
      payload: { expectedVersion: 1, values: { ...page.values, title: 'x'.repeat(201) } } })).statusCode).toBe(400);
  });

  it('keeps drafts private, encodes preview and output, and reopens persisted draft and active release', async () => {
    const root = runtimeRoot();
    let running = await start({ runtimeRoot: root });
    let page = await read(running);
    expect(page.activeReleaseId).toBeNull(); expect(page.activeVersion).toBe(0);
    expect((await running.app.inject('/sites/demo-cms/index.html')).statusCode).toBe(404);
    page = await save(running, page, '<script>bad()</script> A');
    const preview = await running.app.inject({ url: `${base}/previews/${page.revisionId}`, headers: editor });
    expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.headers['content-security-policy']).toContain("default-src 'none'");
    expect(preview.body).toContain('&lt;script&gt;'); expect(preview.body).not.toContain('<script>');
    const result = await publish(running, page, 'publish-first');
    expect(result.statusCode).toBe(200); expect(result.json().status).toBe('published');
    page = await save(running, page, 'B remains draft');
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).not.toContain('B remains draft');
    await close(running);
    running = await start({ runtimeRoot: root });
    const restored = await read(running);
    expect(restored.values.title).toBe('B remains draft'); expect(restored.activeVersion).toBe(1);
    expect((await publish(running, restored, 'publish-after-reload')).statusCode).toBe(200);
    const html = (await running.app.inject('/sites/demo-cms/index.html')).body;
    expect(html).toContain('B remains draft');
    expect(html).not.toMatch(/Bearer|fixture-.*token|\/api\/|cms-editor|revisionId/);
    expect((await running.app.inject('/sites/demo-other/index.html')).statusCode).toBe(404);
    for (const path of ['/sites/demo-cms/release.json', '/sites/demo-cms/../../cms.db', '/sites/demo-cms/%2e%2e%2findex.html', '/local-access.json']) {
      expect((await running.app.inject(path)).statusCode).toBe(404);
    }
  });

  it('uses one page CAS across independent connections and rolls back losing revisions', async () => {
    const root = runtimeRoot();
    const running = await start({ runtimeRoot: root });
    const page = await read(running);
    const second = new CmsRepository(join(root, 'cms.db'));
    try {
      running.repository.save('demo-cms', page.pageVersion, { title: 'one', intro: '' }, 'editor');
      expect(() => second.save('demo-cms', page.pageVersion, { title: 'two', intro: '' }, 'editor')).toThrow('Concept gewijzigd');
      expect(second.page('demo-cms').values.title).toBe('one');
      expect(second.db.prepare("SELECT count(*) AS n FROM cms_revisions WHERE website_id = 'demo-cms'").get()).toEqual({ n: 2 });
    } finally { second.close(); }
    const stale = await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers: editor,
      payload: { expectedVersion: page.pageVersion, values: { title: 'stale', intro: '' } } });
    expect(stale.statusCode).toBe(409);
  });

  it('pins the chosen revision during concurrent editing and publishes exactly one of two competing releases', async () => {
    const gate = barrier();
    const running = await start({ hooks: { beforeActivate: gate.wait } });
    const selected = await read(running);
    const firstPromise = publish(running, selected, 'publisher-one');
    await gate.ready;
    const changed = await save(running, selected, 'Changed while building');
    const repeated = await publish(running, selected, 'publisher-one');
    expect(repeated.statusCode).toBe(202);
    const secondPromise = publish(running, selected, 'publisher-two');
    gate.release();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    const publicHtml = (await running.app.inject('/sites/demo-cms/index.html')).body;
    expect(publicHtml).toContain('Welkom bij de proeftuin'); expect(publicHtml).not.toContain(changed.values.title);
    expect((await read(running)).values.title).toBe(changed.values.title);
    const same = await publish(running, selected, 'publisher-one');
    expect(same.json().releaseId).toBe(first.json().releaseId);
    const different = await publish(running, changed, 'publisher-one');
    expect(different.statusCode).toBe(409);
  });

  it('retains the previous site on a failure before pointer swap, and reconciles interrupted attempts on restart', async () => {
    const root = runtimeRoot();
    let running = await start({ runtimeRoot: root });
    const page = await read(running);
    expect((await publish(running, page, 'before-failure')).statusCode).toBe(200);
    await close(running);
    running = await start({ runtimeRoot: root, hooks: { beforeActivate: async () => { throw new Error('simulated failure'); } } });
    const newer = await save(running, await read(running), 'Must not become public');
    const failure = await publish(running, newer, 'failure-key');
    expect(failure.statusCode).toBe(422); expect(failure.json().errorCode).toBe('build_failed');
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).not.toContain(newer.values.title);
    const interrupted = running.repository.begin('demo-cms', { revisionId: newer.revisionId, expectedActiveVersion: 1 }, 'interrupted-key', 'publisher');
    await close(running);
    running = await start({ runtimeRoot: root });
    const retry = await publish(running, newer, 'interrupted-key');
    expect(retry.statusCode).toBe(422); expect(retry.json().releaseId).toBe(interrupted.attempt.releaseId);
    expect(retry.json().errorCode).toBe('interrupted'); expect((await read(running)).activeVersion).toBe(1);
  });

  it('does not downgrade activation when its response is lost and refuses damaged published bytes', async () => {
    const root = runtimeRoot();
    const running = await start({ runtimeRoot: root, hooks: { afterActivate: async () => { throw new Error('lost response'); } } });
    const page = await read(running);
    const published = await publish(running, page, 'after-commit');
    expect(published.json().status).toBe('published');
    const id = published.json().releaseId;
    const path = join(root, 'releases', 'demo-cms', id, 'index.html');
    expect(readdirSync(join(root, 'releases', 'demo-cms', id)).sort()).toEqual(['index.html', 'release.json']);
    expect(readFileSync(path, 'utf8')).not.toContain('fixture-publisher-token');
    writeFileSync(path, 'damaged output');
    const damaged = await running.app.inject('/sites/demo-cms/index.html');
    expect(damaged.statusCode).toBe(503); expect(damaged.body).not.toContain('damaged output');
  });

  it('does not let a second application reconcile another live process', async () => {
    const root = runtimeRoot();
    const running = await start({ runtimeRoot: root });
    const selected = await read(running);
    const pending = running.repository.begin('demo-cms', { revisionId: selected.revisionId, expectedActiveVersion: 0 }, 'still-running', 'publisher');
    await expect(buildCmsApp({ runtimeRoot: root, credentials })).rejects.toThrow();
    expect(running.repository.attempt('demo-cms', pending.attempt.releaseId).status).toBe('building');
  });
});
