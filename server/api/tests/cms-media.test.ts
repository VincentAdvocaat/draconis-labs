import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCmsApp } from '../src/modules/cms/app.js';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import type { MediaReference } from '../src/media-fixture/contracts.js';
import type { Page } from '../src/modules/cms/model.js';

const base = '/api/v1/cms/websites/demo-cms';
const token = 'cms-media-test-token';
const headers = { authorization: `Bearer ${token}` };
const credentials = [{ name: 'media-test-publisher', tokenHash: createHash('sha256').update(token).digest('hex'), websiteIds: ['demo-cms'], role: 'publisher' }];
const fixtures: ReturnType<typeof createMediaFixture>[] = [];
const roots: string[] = [];
const apps: Awaited<ReturnType<typeof buildCmsApp>>[] = [];
afterEach(async () => {
  for (const running of apps.splice(0)) await running.app.close();
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir())) || !root.includes('cms-media-test-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
async function start(viaPointer = false) {
  const fixture = createMediaFixture(); fixtures.push(fixture);
  const root = mkdtempSync(join(tmpdir(), 'cms-media-test-')); roots.push(root);
  if (viaPointer) writeFileSync(join(root, 'media-root.json'), JSON.stringify({ root: fixture.root }));
  const running = await buildCmsApp({ runtimeRoot: root, credentials, seed: true, enableMedia: true,
    ...(viaPointer ? {} : { mediaRoot: fixture.root }) });
  apps.push(running);
  return { ...running, fixture, root };
}
const image = (overrides: Partial<MediaReference> = {}): MediaReference => ({ assetId: 'photo', fileVersion: 1,
  usage: 'hero', altText: { nl: 'Een fictieve gekleurde pixel' }, decorative: false, ...overrides });
async function page(running: Awaited<ReturnType<typeof start>>): Promise<Page> {
  const response = await running.app.inject({ url: base + '/pages/home', headers });
  expect(response.statusCode).toBe(200); return response.json();
}
async function save(running: Awaited<ReturnType<typeof start>>, selected: Page, ref: MediaReference | null, title = selected.values.title): Promise<Page> {
  const response = await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers,
    payload: { expectedVersion: selected.pageVersion, values: { title, intro: selected.values.intro, image: ref } } });
  expect(response.statusCode).toBe(200); return response.json();
}
async function publish(running: Awaited<ReturnType<typeof start>>, selected: Page, key: string) {
  return running.app.inject({ method: 'POST', url: base + '/releases', headers: { ...headers, 'idempotency-key': key },
    payload: { revisionId: selected.revisionId, expectedActiveVersion: selected.activeVersion } });
}
function imageUrl(html: string): string {
  const source = /<img src="([^"]+)"/.exec(html)?.[1];
  if (!source) throw new Error('Expected image in public HTML');
  return `/sites/demo-cms/${source}`;
}
async function closeApp(app: Awaited<ReturnType<typeof buildCmsApp>>['app']) {
  await app.close(); apps.splice(apps.findIndex((running) => running.app === app), 1);
}

describe('CMS and reviewed M0 media integration', () => {
  it('keeps the old HTML image URL bound to its published release after a new imageless release activates', async () => {
    const running = await start();
    const selected = await save(running, await page(running), image());
    const first = await publish(running, selected, 'immutable-image-one');
    const oldHtml = (await running.app.inject('/sites/demo-cms/index.html')).body;
    const url = imageUrl(oldHtml);
    const oldBytes = (await running.app.inject(url)).rawPayload;
    const next = await save(running, await page(running), null);
    expect((await publish(running, next, 'immutable-image-two')).statusCode).toBe(200);
    const retained = await running.app.inject(url);
    expect(retained.statusCode).toBe(200);
    expect(retained.rawPayload).toEqual(oldBytes);
    expect(url).toContain(first.json().releaseId);
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).not.toContain('<img');
    expect((await running.app.inject(url.replace('demo-cms', 'demo-other'))).statusCode).toBe(404);
    expect((await running.app.inject(url.replace(first.json().releaseId, '00000000-0000-0000-0000-000000000000'))).statusCode).toBe(404);
    const pending = running.repository.begin('demo-cms', { revisionId: next.revisionId, expectedActiveVersion: 2 }, 'not-published-yet', 'test');
    expect((await running.app.inject(url.replace(first.json().releaseId, pending.attempt.releaseId))).statusCode).toBe(404);
  });

  it('reopens the persisted media pointer and keeps published copies available if that root is temporarily absent', async () => {
    const running = await start(true);
    const selected = await save(running, await page(running), image());
    expect((await publish(running, selected, 'pointer-publish-one')).statusCode).toBe(200);
    await save(running, await page(running), image({ fileVersion: 2 }));
    const html = (await running.app.inject('/sites/demo-cms/index.html')).body;
    const url = imageUrl(html);
    const originalBytes = (await running.app.inject(url)).rawPayload;
    await closeApp(running.app);
    let reopened = await buildCmsApp({ runtimeRoot: running.root, credentials, enableMedia: true });
    apps.push(reopened);
    let state = (await reopened.app.inject({ url: base + '/pages/home', headers })).json();
    expect(state.values.image.fileVersion).toBe(2); expect(state.activeVersion).toBe(1);
    expect((await reopened.app.inject({ url: `${base}/previews/${state.revisionId}`, headers })).statusCode).toBe(200);
    await closeApp(reopened.app);
    const missing = running.fixture.root + '-absent';
    writeFileSync(join(running.root, 'media-root.json'), JSON.stringify({ root: missing }));
    reopened = await buildCmsApp({ runtimeRoot: running.root, credentials, enableMedia: true });
    apps.push(reopened);
    expect((await reopened.app.inject('/sites/demo-cms/index.html')).body).toBe(html);
    expect((await reopened.app.inject(url)).rawPayload).toEqual(originalBytes);
    const preview = await reopened.app.inject({ url: `${base}/previews/${state.revisionId}`, headers });
    expect(preview.statusCode).toBe(503); expect(preview.body).toContain('Mediaopslag');
    const refusedSave = await reopened.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers,
      payload: { expectedVersion: state.pageVersion, values: { ...state.values, title: 'Must fail' } } });
    expect(refusedSave.statusCode).toBe(503);
    const refusedPublish = await reopened.app.inject({ method: 'POST', url: base + '/releases',
      headers: { ...headers, 'idempotency-key': 'missing-root-publish' },
      payload: { revisionId: state.revisionId, expectedActiveVersion: state.activeVersion } });
    expect(refusedPublish.statusCode).toBe(422); expect(refusedPublish.json().errorCode).toBe('media_unavailable');
    expect(JSON.parse(readFileSync(join(running.root, 'media-root.json'), 'utf8')).root).toBe(missing);
    await closeApp(reopened.app);
    writeFileSync(join(running.root, 'media-root.json'), JSON.stringify({ root: running.fixture.root }));
    reopened = await buildCmsApp({ runtimeRoot: running.root, credentials, enableMedia: true });
    apps.push(reopened);
    state = (await reopened.app.inject({ url: base + '/pages/home', headers })).json();
    expect((await reopened.app.inject({ url: `${base}/previews/${state.revisionId}`, headers })).statusCode).toBe(200);
  });

  it('renders an authenticated embedded derivative, exports only public bytes and pins version 1 while draft changes to 2', async () => {
    const running = await start();
    let selected = await save(running, await page(running), image());
    const preview = await running.app.inject({ url: `${base}/previews/${selected.revisionId}`, headers });
    expect(preview.statusCode).toBe(200); expect(preview.headers['cache-control']).toBe('no-store');
    expect(preview.body).toContain('data:image/png;base64,'); expect(preview.body).toContain('alt="Een fictieve gekleurde pixel"');
    expect(preview.body).not.toContain(token); expect(preview.body).not.toContain('/private/');
    expect((await running.app.inject(`${base}/previews/${selected.revisionId}`)).statusCode).toBe(401);
    expect((await running.app.inject('/sites/demo-cms/media/hero.png')).statusCode).toBe(404);
    const published = await publish(running, selected, 'media-publish-one');
    expect(published.statusCode).toBe(200);
    const releaseId = published.json().releaseId;
    const output = await running.app.inject('/sites/demo-cms/index.html');
    expect(output.body).toContain(`src="media/${releaseId}/hero.png"`); expect(output.body).not.toContain('data:image');
    const bytes = await running.app.inject(imageUrl(output.body));
    expect(bytes.statusCode).toBe(200); expect(bytes.headers['content-type']).toBe('image/png');
    const manifestText = readFileSync(join(running.root, 'releases', 'demo-cms', releaseId, 'release.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    expect(manifest.media.references[0].fileVersion).toBe(1);
    expect(manifest.files[`media/${releaseId}/hero.png`]).toBe(createHash('sha256').update(bytes.rawPayload).digest('hex'));
    expect(manifestText).not.toContain('private'); expect(manifestText).not.toContain(token);
    selected = await save(running, await page(running), image({ fileVersion: 2 }));
    expect(selected.values.image?.fileVersion).toBe(2);
    expect(JSON.parse(readFileSync(join(running.root, 'releases', 'demo-cms', releaseId, 'release.json'), 'utf8')).media.references[0].fileVersion).toBe(1);
    expect((await running.app.inject(imageUrl(output.body))).rawPayload).toEqual(bytes.rawPayload);
    expect((await running.app.inject('/sites/demo-cms/private/original.png')).statusCode).toBe(404);
  });

  it('requires alt for meaningful images, accepts explicit decorative and safely encodes alt', async () => {
    const running = await start();
    let selected = await save(running, await page(running), image({ altText: { nl: '' } }));
    expect((await running.app.inject({ url: `${base}/previews/${selected.revisionId}`, headers })).statusCode).toBe(409);
    expect((await publish(running, selected, 'missing-alt-key')).statusCode).toBe(422);
    selected = await save(running, selected, image({ decorative: true, altText: { nl: '' } }));
    const decorative = await publish(running, selected, 'decorative-key');
    expect(decorative.statusCode).toBe(200);
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).toContain('alt=""');
    selected = await save(running, await page(running), image({ altText: { nl: '"><script>bad()</script>' } }));
    const preview = await running.app.inject({ url: `${base}/previews/${selected.revisionId}`, headers });
    expect(preview.body).toContain('&quot;&gt;&lt;script&gt;'); expect(preview.body).not.toContain('<script>');
  });

  it.each(['pending', 'unlicensed', 'blocked'])('blocks %s media before active pointer changes', async (assetId) => {
    const running = await start();
    const previous = await page(running);
    expect((await publish(running, previous, 'text-only-release')).statusCode).toBe(200);
    const selected = await save(running, await page(running), image({ assetId }));
    const result = await publish(running, selected, `invalid-${assetId}`);
    expect(result.statusCode).toBe(422); expect(result.json().errorCode).toBe('media_not_publishable');
    expect((await page(running)).activeVersion).toBe(1);
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).not.toContain('<img');
  });

  it('retains old revision and release refs after removal, and permits text edits with an already selected archived image', async () => {
    const running = await start();
    let selected = await save(running, await page(running), image());
    const mediaRevision = running.repository.mediaRevision('demo-cms', selected.revisionId);
    expect((await publish(running, selected, 'retention-release')).statusCode).toBe(200);
    running.media!.store.archive('fixture-alpha', 'photo', 1);
    selected = await save(running, await page(running), image(), 'Text changed after archive');
    expect(running.repository.mediaRevision('demo-cms', selected.revisionId)).toBe(mediaRevision);
    selected = await save(running, selected, null);
    expect(selected.values.image).toBeNull();
    const usages = running.media!.store.usages('fixture-alpha', 'photo') as Array<{ kind: string; fileVersion: number }>;
    expect(usages.some((usage) => usage.kind === 'revision' && usage.fileVersion === 1)).toBe(true);
    expect(usages.some((usage) => usage.kind === 'release' && usage.fileVersion === 1)).toBe(true);
    expect(() => running.media!.store.purge('fixture-alpha', 'photo', 2, true)).toThrow('retained');
    expect((await running.app.inject('/sites/demo-cms/index.html')).body).toContain('<img');
  });

  it('keeps scope server-owned, rejects missing versions and preserves media for older text-only saves', async () => {
    const running = await start();
    const initial = await page(running);
    const missing = await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers,
      payload: { expectedVersion: initial.pageVersion, values: { ...initial.values, image: image({ fileVersion: 99 }) } } });
    expect(missing.statusCode).toBe(404); expect((await page(running)).pageVersion).toBe(initial.pageVersion);
    const crossSite = await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers,
      payload: { expectedVersion: initial.pageVersion, values: { ...initial.values, image: { ...image(), websiteId: 'fixture-beta' } } } });
    expect(crossSite.statusCode).toBe(400);
    const selected = await save(running, initial, image());
    const textOnly = await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers,
      payload: { expectedVersion: selected.pageVersion, values: { title: 'Older client', intro: '' } } });
    expect(textOnly.statusCode).toBe(200); expect(textOnly.json().values.image).toEqual(image());
    expect(running.media!.store.usages('fixture-beta', 'photo')).toEqual([]);
  });
});
