import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCmsApp } from '../src/modules/cms/app.js';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { MAX_BYTES } from '../src/media-upload/processor.js';

const base = '/api/v1/cms/websites/demo-cms';
const credentials = ['editor', 'publisher'].map((role) => ({ name: `local-${role}`, role,
  websiteIds: ['demo-cms'], tokenHash: createHash('sha256').update(`upload-test-${role}`).digest('hex') }));
const editor = { authorization: 'Bearer upload-test-editor' };
const publisher = { authorization: 'Bearer upload-test-publisher' };
const fixtures: ReturnType<typeof createMediaFixture>[] = [];
const roots: string[] = [];
const apps: Awaited<ReturnType<typeof buildCmsApp>>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const running of apps.splice(0)) await running.app.close();
  for (const fixture of fixtures.splice(0)) fixture.cleanup();
  for (const root of roots.splice(0)) {
    if (!resolve(root).startsWith(resolve(tmpdir())) || !root.includes('cms-upload-test-')) throw new Error('Unsafe cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});
async function start() {
  const fixture = createMediaFixture(); fixtures.push(fixture);
  const root = mkdtempSync(join(tmpdir(), 'cms-upload-test-')); roots.push(root);
  const options = { runtimeRoot: root, credentials, seed: true, enableMedia: true, enableUploads: true, mediaRoot: fixture.root };
  const running = await buildCmsApp(options); apps.push(running);
  return { ...running, fixture, root, options };
}
async function png() {
  return sharp({ create: { width: 96, height: 64, channels: 4, background: { r: 10, g: 110, b: 160, alpha: 0.8 } } })
    .withExif({ IFD0: { ImageDescription: 'fictieve metadata ' + 'x'.repeat(20_000), Artist: 'Test fixture' } }).png().toBuffer();
}
function upload(running: Awaited<ReturnType<typeof start>>, bytes: Buffer, headers = editor) {
  return running.app.inject({ method: 'POST', url: base + '/media',
    headers: { ...headers, 'content-type': 'image/png', 'x-media-filename': encodeURIComponent('proefbeeld.png') }, payload: bytes });
}
const decision = { expectedVersion: 1, status: 'cleared', owner: 'Fictieve maker', source: 'Lokaal gegenereerde testfixture',
  basis: 'Zelf gegenereerd proefbeeld voor uitsluitend lokale functionele tests.', confirmed: true };

describe('real M1 uploads in the normal scoped CMS entrypoint', () => {
  it.each(['jpeg', 'webp'] as const)('publishes a sanitized JPEG fallback for an actual %s input', async (format) => {
    const running = await start();
    const pipeline = sharp({ create: { width: 48, height: 32, channels: 3, background: { r: 30, g: 90, b: 150 } } });
    const source = await (format === 'jpeg' ? pipeline.jpeg() : pipeline.webp()).toBuffer();
    const uploaded = await running.app.inject({ method: 'POST', url: base + '/media',
      headers: { ...editor, 'content-type': `image/${format}`, 'x-media-filename': `image.${format === 'jpeg' ? 'jpg' : 'webp'}` }, payload: source });
    expect(uploaded.statusCode).toBe(201); const assetId = uploaded.json().assetId;
    expect((await running.app.inject({ method: 'PUT', url: `${base}/media/${assetId}/rights`, headers: publisher, payload: decision })).statusCode).toBe(200);
    const initial = (await running.app.inject({ url: base + '/pages/home', headers: publisher })).json();
    const saved = await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers: editor,
      payload: { expectedVersion: initial.pageVersion, values: { ...initial.values,
        image: { assetId, fileVersion: 1, usage: 'hero', decorative: true, altText: { nl: '' } } } } });
    const page = saved.json();
    const preview = await running.app.inject({ url: `${base}/previews/${page.revisionId}`, headers: editor });
    expect(preview.statusCode).toBe(200); expect(preview.body).toContain('data:image/jpeg;base64,');
    const published = await running.app.inject({ method: 'POST', url: base + '/releases', headers: { ...publisher, 'idempotency-key': `publish-${format}-image` },
      payload: { revisionId: page.revisionId, expectedActiveVersion: 0 } });
    expect(published.statusCode).toBe(200);
    const result = await running.app.inject(`/sites/demo-cms/media/${published.json().releaseId}/hero.jpg`);
    expect(result.statusCode).toBe(200); expect(result.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(result.rawPayload).metadata()).format).toBe('jpeg');
  });

  it('uploads, privately previews unknown media, refuses publication, then explicitly approves and pins sanitized fileVersion 1', async () => {
    const running = await start();
    const source = await png(); expect(source.length).toBeGreaterThan(16_384);
    const result = await upload(running, source);
    expect(result.statusCode).toBe(201);
    const asset = result.json(); expect(asset.state).toBe('ready'); expect(asset.rights).toBe('unknown');
    const initial = (await running.app.inject({ url: base + '/pages/home', headers: publisher })).json();
    expect(initial.uploadEnabled).toBe(true);
    const saved = await running.app.inject({ method: 'PUT', url: base + '/pages/home/draft', headers: editor,
      payload: { expectedVersion: initial.pageVersion, values: { ...initial.values, image: { assetId: asset.assetId,
        fileVersion: 1, usage: 'hero', decorative: false, altText: { nl: 'Een fictief blauw vlak' } } } } });
    expect(saved.statusCode).toBe(200); const page = saved.json(); expect(page.uploadEnabled).toBe(true);
    const preview = await running.app.inject({ url: `${base}/previews/${page.revisionId}`, headers: editor });
    expect(preview.statusCode).toBe(200); expect(preview.body).toContain('data:image/png;base64,');
    expect(preview.body).not.toMatch(/upload-test|\/private\/|Test fixture|fictieve metadata/);
    expect((await running.app.inject(`${base}/previews/${page.revisionId}`)).statusCode).toBe(401);
    const publish = (key: string) => running.app.inject({ method: 'POST', url: base + '/releases',
      headers: { ...publisher, 'idempotency-key': key }, payload: { revisionId: page.revisionId, expectedActiveVersion: 0 } });
    const unknown = await publish('unknown-rights-publish');
    expect(unknown.statusCode).toBe(422); expect(unknown.json().errorCode).toBe('media_not_publishable');
    expect(running.repository.active('demo-cms').activeVersion).toBe(0);
    const rightsUrl = `${base}/media/${asset.assetId}/rights`;
    expect((await running.app.inject({ url: rightsUrl, headers: publisher })).json()).toMatchObject({ metadataVersion: 1, rights: 'unknown' });
    expect((await running.app.inject({ method: 'PUT', url: rightsUrl, headers: editor, payload: decision })).statusCode).toBe(403);
    expect((await running.app.inject({ method: 'PUT', url: rightsUrl, headers: publisher, payload: { ...decision, basis: '' } })).statusCode).toBe(400);
    expect((await running.app.inject({ method: 'PUT', url: rightsUrl, headers: publisher, payload: { ...decision, employee: 'spoofed-name' } })).statusCode).toBe(400);
    const approved = await running.app.inject({ method: 'PUT', url: rightsUrl, headers: publisher, payload: decision });
    expect(approved.statusCode).toBe(200); expect(approved.json()).toEqual({ metadataVersion: 2, rights: 'cleared' });
    expect((await running.app.inject({ method: 'PUT', url: rightsUrl, headers: publisher, payload: { ...decision, status: 'blocked' } })).statusCode).toBe(409);
    expect((await running.app.inject({ url: `${base}/media/${asset.assetId}`, headers: editor })).json().rights).toBe('cleared');
    const published = await publish('explicit-approved-publish');
    expect(published.statusCode).toBe(200);
    const releaseId = published.json().releaseId;
    const manifest = JSON.parse(readFileSync(join(running.root, 'releases', 'demo-cms', releaseId, 'release.json'), 'utf8'));
    expect(manifest.media.references[0]).toMatchObject({ assetId: asset.assetId, fileVersion: 1 });
    const output = await running.app.inject(`/sites/demo-cms/media/${releaseId}/hero.png`);
    expect(output.statusCode).toBe(200);
    const metadata = await sharp(output.rawPayload).metadata();
    expect(metadata.exif).toBeUndefined(); expect(metadata.xmp).toBeUndefined(); expect(metadata.width).toBe(96);
    expect(output.rawPayload.equals(source)).toBe(false);
    const auditDb = new Database(join(running.fixture.root, 'media.sqlite'), { readonly: true });
    try {
      const audit = auditDb.prepare('SELECT decision FROM media_rights_audit WHERE website=? AND asset=?')
        .get('fixture-alpha', asset.assetId) as { decision: string };
      expect(JSON.parse(audit.decision).employee).toBe('local-publisher');
    } finally { auditDb.close(); }
    expect((await running.app.inject(`/media_rights_audit/${asset.assetId}`)).statusCode).toBe(404);
    expect((await running.app.inject(`/sites/demo-cms/private/fixture-alpha/${asset.assetId}/source`)).statusCode).toBe(404);
    expect((await running.app.inject({ url: rightsUrl.replace('demo-cms', 'demo-other'), headers: publisher })).statusCode).toBe(404);
  });

  it('preserves a failed job across reopen, supports explicit retry and accepts a later valid upload', async () => {
    const running = await start();
    const failure = await upload(running, Buffer.from('89504e470d0a1a0a', 'hex'));
    expect(failure.statusCode).toBe(422); expect(failure.json().assetId).toBeTruthy();
    const id = failure.json().assetId;
    await running.app.close(); apps.splice(apps.findIndex((item) => item.app === running.app), 1);
    const reopened = await buildCmsApp(running.options); apps.push(reopened);
    const status = await reopened.app.inject({ url: `${base}/media/${id}`, headers: editor });
    expect(status.statusCode).toBe(200); expect(status.json().state).toBe('failed');
    expect((await reopened.app.inject({ method: 'POST', url: `${base}/media/${id}/retry`, headers: editor })).statusCode).toBe(422);
    const valid = await upload({ ...running, ...reopened }, await png());
    expect(valid.statusCode).toBe(201); expect(valid.json().assetId).not.toBe(id);
  });

  it('checks same-origin browser requests, scope, role and upload admission before decoding', async () => {
    const running = await start();
    const source = await png();
    expect((await running.app.inject({ url: base.replace('demo-cms', 'never-exists') + '/pages/home', headers: editor })).statusCode).toBe(404);
    expect((await upload(running, source, {} as typeof editor)).statusCode).toBe(401);
    expect((await running.app.inject({ method: 'POST', url: base + '/media',
      headers: { ...editor, origin: 'https://foreign.invalid', 'content-type': 'image/png', 'x-media-filename': 'image.png' }, payload: source })).statusCode).toBe(403);
    expect((await running.app.inject({ method: 'POST', url: base.replace('demo-cms', 'demo-other') + '/media',
      headers: { ...editor, 'content-type': 'image/png', 'x-media-filename': 'image.png' }, payload: source })).statusCode).toBe(404);
    const address = await running.app.listen({ host: '127.0.0.1', port: 0 });
    const real = await fetch(address + base + '/media', { method: 'POST',
      headers: { ...editor, origin: address, 'sec-fetch-site': 'same-origin', 'content-type': 'image/png', 'x-media-filename': 'image.png' }, body: source });
    expect(real.status).toBe(201);
    let entered!: () => void; let release!: () => void;
    const ready = new Promise<void>((r) => { entered = r; });
    const held = new Promise<void>((r) => { release = r; });
    const original = running.uploads!.service.upload.bind(running.uploads!.service);
    vi.spyOn(running.uploads!.service, 'upload').mockImplementation(async (...args) => { entered(); await held; return original(...args); });
    const first = upload(running, source); await ready;
    try { expect((await upload(running, Buffer.alloc(MAX_BYTES + 1))).statusCode).toBe(429); }
    finally { release(); }
    expect((await first).statusCode).toBe(201);
    expect((await upload(running, Buffer.alloc(MAX_BYTES + 1))).statusCode).toBe(413);
  });
});
