import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
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
  const options = { runtimeRoot: root, seed: true, enableMedia: true, enableUploads: true, enablePages: true, enablePortfolio: true,
    mediaRoot: fixture.root, hooks, credentials: [{ name: 'Test', role: 'publisher', websiteIds: ['demo-cms'],
      tokenHash: createHash('sha256').update('portfolio-test').digest('hex') }] };
  let running = await buildCmsApp(options);
  cleanup.push(async () => { await running.app.close(); });
  return { fixture, get running() { return running; }, async reopen() { await running.app.close(); running = await buildCmsApp(options); } };
}
async function publish(running: Awaited<ReturnType<typeof buildCmsApp>>, key = randomUUID()) {
  const plan = (await running.app.inject({ url: base + '/site-plan', headers })).json();
  return running.app.inject({ method: 'POST', url: base + '/releases', headers: { ...headers, 'idempotency-key': key },
    payload: { revisionId: plan.pages[0].revisionId, expectedActiveVersion: plan.activeVersion,
      expectedPages: plan.pages.map(({ pageId, revisionId, version }: { pageId: string; revisionId: string; version: number }) => ({ pageId, revisionId, version })) } });
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
describe('CMS portfolio integration', () => {
  it('rejects cross-site refs, wrong checksums and locale contexts without advancing the draft', async () => {
    const test = await start(); const doc = await document(test, 'nl');
    const selected = doc.content.blocks[1];
    for (const change of [
      { ref: { ...selected.ref, websiteId: 'fixture-beta' } },
      { checksum: '0'.repeat(64) },
      { localeContext: { locale: 'en', fallbackLocale: 'nl' } },
    ]) {
      const result = await test.running.app.inject({ method: 'PUT', url: `${base}/documents/${doc.pageId}/draft`, headers,
        payload: { expectedVersion: doc.version, content: { ...doc.content, blocks: [doc.content.blocks[0], { ...selected, ...change }] } } });
      expect([400, 404, 409]).toContain(result.statusCode);
      expect(test.running.documents!.get('demo-cms', doc.pageId).version).toBe(doc.version);
    }
    const published = await publish(test.running); expect(published.statusCode).toBe(200);
    expect((await test.running.app.inject('/sites/demo-cms/portfolio-page.html')).body).toContain('Rood proefbeeld');
  });

  it('reconciles a committed CMS release after the media activation transaction rolls back', async () => {
    const test = await start(); await document(test);
    const consumer = test.running.documents!.portfolio!.consumer;
    const finalize = consumer.finalize.bind(consumer);
    consumer.finalize = (website, ids, callback) => finalize(website, ids, (pins) => {
      callback(pins);
      throw new Error('Simulated gap after durable CMS commit');
    });
    const result = await publish(test.running); expect(result.statusCode).toBe(200);
    const pins = () => test.fixture.consumer.listPins(test.fixture.website, { module: 'cms', attemptId: result.json().releaseId });
    expect(pins()[0].state).toBe('prepared');
    await test.reopen();
    expect(pins()[0].state).toBe('activated');
    expect((await test.running.app.inject('/sites/demo-cms/portfolio-page.html')).body).toContain('Red sample');
  });

  it('pins selected locale/checksum, previews clean bytes, publishes and retains content on reopen', async () => {
    const test = await start(); const doc = await document(test);
    const selections = await test.running.app.inject({ url: base + '/portfolio-snapshots', headers });
    expect(selections.json()).toHaveLength(2);
    const preview = await test.running.app.inject({ url: `${base}/documents/${doc.pageId}/previews/${doc.revisionId}`, headers });
    expect(preview.statusCode).toBe(200); expect(preview.body).toContain('Red sample'); expect(preview.body).toContain('data:image/png;base64,');
    const result = await publish(test.running); expect(result.statusCode).toBe(200);
    const html = await test.running.app.inject('/sites/demo-cms/portfolio-page.html');
    expect(html.body).toContain('lang="en"'); expect(html.body).toContain('Red sample'); expect(html.body).not.toContain('data:image');
    const image = html.body.match(/src="([^"]+)"/)![1];
    expect((await test.running.app.inject('/sites/demo-cms/' + image)).statusCode).toBe(200);
    const pins = test.fixture.consumer.listPins(test.fixture.website, { module: 'cms', attemptId: result.json().releaseId });
    expect(pins).toHaveLength(1); expect(pins[0].state).toBe('activated');
    await test.reopen();
    expect((await test.running.app.inject('/sites/demo-cms/portfolio-page.html')).body).toBe(html.body);
    expect(test.running.documents!.get('demo-cms', doc.pageId).revisionId).toBe(doc.revisionId);
  });
  for (const action of ['withdraw', 'block'] as const) it(`keeps previous site active after ${action} during async build`, async () => {
    let interfere = false;
    const test = await start({ beforeActivate: async () => {
      if (!interfere) return;
      if (action === 'withdraw') test.fixture.catalog.withdraw(test.fixture.website, test.fixture.en.snapshotId,
        { expectedVersion: 1, employee: 'Test fixture', reason: 'Synthetic withdrawal during build', confirmed: true });
      else test.fixture.catalog.setRights(test.fixture.website, 'photo', { expectedVersion: 2, status: 'blocked', owner: 'Test fixture',
        source: 'Synthetic test', basis: 'Synthetic rights block during build', employee: 'Test fixture', confirmed: true });
    } });
    await document(test); const first = await publish(test.running); expect(first.statusCode).toBe(200);
    interfere = true; const failed = await publish(test.running); expect(failed.statusCode).toBe(422);
    expect(test.running.repository.active('demo-cms').activeReleaseId).toBe(first.json().releaseId);
    expect(test.fixture.consumer.listPins(test.fixture.website, { module: 'cms', attemptId: failed.json().releaseId })[0].state).toBe('prepared');
    expect((await test.running.app.inject('/sites/demo-cms/portfolio-page.html')).body).toContain('Red sample');
  });
});
