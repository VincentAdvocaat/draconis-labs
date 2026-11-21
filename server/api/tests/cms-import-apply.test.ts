import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { assertFixtureRoot } from '../src/media-fixture/safety.js';
import { checksum } from '../src/media-fixture/storage.js';
import { applyLegacyImport, openImportedFixture } from '../src/modules/cms/import-apply.js';

const temp = realpathSync(tmpdir());
const roots = new Set<string>();
const cms = (site: string) => '/api/v1/cms/websites/' + site;
const clean = new Set<() => Promise<void>>();
afterEach(async () => {
  for (const close of clean) await close();
  clean.clear();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const target = realpathSync(root);
    if (dirname(target) !== temp || target !== root ||
        !/^draconis-(cms-import-(fixture|target)|media-fixture)-/.test(basename(target))) throw new Error('Unsafe fixture cleanup');
    rmSync(target, { recursive: true });
  }
  roots.clear();
});

async function fixture() {
  const source = mkdtempSync(join(temp, 'draconis-cms-import-fixture-'));
  const target = join(temp, 'draconis-cms-import-target-' + randomUUID());
  roots.add(source);
  roots.add(target);
  const names = ['legacy-alpha', 'legacy-beta'] as const;
  const images = await Promise.all(['#ff0000', '#0000ff'].map(background =>
    sharp({ create: { width: 8, height: 8, channels: 4, background } }).png().toBuffer()));
  const sites = names.map((websiteId, index) => {
    mkdirSync(join(source, websiteId));
    writeFileSync(join(source, websiteId, 'cover.png'), images[index]);
    return {
      websiteId, assets: [{ id: 'shared-photo', filename: 'cover.png', sha256: checksum(images[index]) }],
      pages: [{
        id: 'shared-page', template: 'text-page',
        nl: { slug: 'over', contentValues: { title: { version: 2, value: websiteId + ' & NL' },
          seoTitle: { version: 3, value: 'Zoeken NL' }, seoDescription: { version: 4, value: '' },
          body: { version: 5, value: 'Eerste <regel>\nTweede regel' } } },
        en: { slug: 'about', contentValues: { title: { version: 2, value: websiteId + ' & EN' },
          seoTitle: { version: 7, value: 'Search EN' }, body: { version: 9, value: 'Fixture body' } } },
        cover: { websiteId, assetId: 'shared-photo', decorative: false, altText: { nl: 'Kleur & vorm', en: 'Colour & shape' } },
      }],
    };
  });
  const input = { synthetic: true, schemaVersion: 1, sourceSystem: 'studio-cms-fixture', websites: sites };
  const manifest = join(source, 'legacy.json');
  const writeManifest = () => writeFileSync(manifest, JSON.stringify(input));
  writeManifest();
  return { source, target, manifest, input, images, writeManifest };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

function trackMedia(target: string) {
  const receipt = JSON.parse(readFileSync(join(target, 'import.json'), 'utf8'));
  const media = assertFixtureRoot(receipt.mediaRoot);
  roots.add(media);
  return media;
}
async function open(target: string) {
  const runtime = await openImportedFixture(target);
  const close = async () => { await runtime.app.close(); clean.delete(close); };
  clean.add(close);
  const access = JSON.parse(readFileSync(join(target, 'local-access.json'), 'utf8')) as Record<string, string>;
  const headers = (site: string) => ({ authorization: 'Bearer ' + access[site] });
  return { runtime, close, headers };
}
async function apply(input: Fixture) {
  const report = await applyLegacyImport(input.source, input.target);
  expect(report, JSON.stringify(report.issues)).toMatchObject({ ok: true, status: 'applied' });
  trackMedia(input.target);
  return report.mappings!;
}
const invoke = (input: Fixture) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/cms-import.ts', 'apply',
  '--source', input.source, '--target', input.target], { encoding: 'utf8' });

describe('synthetic CMS import', () => {
  it('imports via CLI, replays the same mapping and preserves source versions and bytes', async () => {
    const input = await fixture();
    const manifest = readFileSync(input.manifest);
    const first = invoke(input);
    expect(first.status, first.stderr || first.stdout).toBe(0);
    const applied = JSON.parse(first.stdout);
    const mediaRoot = trackMedia(input.target);
    const replay = invoke(input);
    expect(replay.status, replay.stderr || replay.stdout).toBe(0);
    expect(JSON.parse(replay.stdout)).toEqual({ ...applied, status: 'unchanged' });
    expect(applied.mappings[0].pages[0].pageId).not.toBe(applied.mappings[1].pages[0].pageId);
    expect(applied.mappings[0].assets[0].targetAssetId).not.toBe(applied.mappings[1].assets[0].targetAssetId);
    expect(readFileSync(input.manifest)).toEqual(manifest);
    for (const [index, site] of applied.mappings.entries()) {
      expect(readFileSync(join(input.source, input.input.websites[index].websiteId, 'cover.png'))).toEqual(input.images[index]);
      expect(readFileSync(join(mediaRoot, 'private', site.mediaWebsiteId, site.assets[0].targetAssetId, 'source'))).toEqual(input.images[index]);
    }
    const provenance = JSON.parse(readFileSync(join(input.target, 'source-values.json'), 'utf8'));
    const values = provenance.websites[0].pages[0].locales;
    expect(values.nl.contentValues.seoDescription).toEqual({ version: 4, value: '' });
    expect(values.en.contentValues).not.toHaveProperty('seoDescription');
  }, 20_000);

  it('renders separate website and locale content and requires explicit rights and publication', async () => {
    const input = await fixture();
    const sites = await apply(input);
    const { runtime, headers } = await open(input.target);
    const { app, documents, uploads } = runtime;
    const alpha = sites[0];
    const beta = sites[1];
    const alphaHeaders = headers(alpha.targetWebsiteId);
    const documentPath = '/documents/' + alpha.pages[0].pageId;
    const missing = await app.inject({ url: cms(beta.targetWebsiteId) + documentPath, headers: headers(beta.targetWebsiteId) });
    expect(missing.statusCode).toBe(404);
    const denied = await app.inject({ url: cms(beta.targetWebsiteId) + '/site-plan', headers: alphaHeaders });
    expect(denied.statusCode).toBe(404);
    const unknownAsset = await app.inject({ url: cms(beta.targetWebsiteId) + '/media/' + alpha.assets[0].targetAssetId + '/rights',
      headers: headers(beta.targetWebsiteId) });
    expect(unknownAsset.statusCode).toBe(404);

    const rendered: Buffer[] = [];
    for (const [index, site] of sites.entries()) {
      const websiteId = site.targetWebsiteId;
      const page = site.pages[0];
      const siteHeaders = headers(websiteId);
      const base = cms(websiteId);
      const pageUrl = base + '/documents/' + page.pageId;
      const route = '/sites/' + websiteId + '/over.html';
      expect((await app.inject(route)).statusCode).toBe(404);
      const nl = await app.inject({ url: pageUrl + '/previews/' + page.nlRevisionId, headers: siteHeaders });
      const en = await app.inject({ url: pageUrl + '/locales/en/previews/' + page.enRevisionId, headers: siteHeaders });
      expect(nl.statusCode).toBe(200);
      expect(en.statusCode).toBe(200);
      const legacy = input.input.websites[index];
      expect(nl.body).toContain('<html lang="nl">');
      expect(nl.body).toContain('<h1>' + legacy.websiteId + ' &amp; NL</h1>');
      expect(nl.body).toContain('<title>Zoeken NL</title>');
      expect(nl.body).toContain('<p>Eerste &lt;regel&gt;<br>Tweede regel</p>');
      expect(nl.body).toContain('alt="Kleur &amp; vorm"');
      expect(en.body).toContain('<html lang="en">');
      expect(en.body).toContain('<h1>' + legacy.websiteId + ' &amp; EN</h1>');
      expect(en.body).toContain('<title>Search EN</title>');
      expect(en.body).toContain('alt="Colour &amp; shape"');
      const asset = site.assets[0].targetAssetId;
      const status = uploads!.status(websiteId, asset);
      expect(status).toMatchObject({ rights: 'unknown', state: 'ready', fileVersion: 1 });
      const preview = Buffer.from(nl.body.match(/data:image\/png;base64,([^"]+)/)![1], 'base64');
      rendered.push(preview);
      expect(checksum(preview)).toBe(status.variants.find(variant => variant.mime === 'image/png')?.checksum);
      expect(await sharp(preview).raw().toBuffer()).toEqual(await sharp(input.images[index]).raw().toBuffer());

      const plan = documents!.plan(websiteId);
      const payload = { revisionId: plan.pages[0].revisionId, expectedActiveVersion: 0,
        expectedShared: { revisionId: plan.shared!.revisionId, version: plan.shared!.version },
        expectedPages: plan.pages.map(({ pageId, revisionId, version }) => ({ pageId, revisionId, version })),
        expectedLocales: plan.localeVariants.map(({ pageId, locale, revisionId, version, structure }) => ({ pageId, locale, revisionId, version, structure })) };
      const publish = () => app.inject({ method: 'POST', url: base + '/releases',
        headers: { ...siteHeaders, 'idempotency-key': randomUUID() }, payload });
      const deniedRelease = await publish();
      expect(deniedRelease.statusCode).toBe(422);
      expect(deniedRelease.json()).toMatchObject({ status: 'failed', errorCode: 'media_not_publishable' });
      expect((await app.inject(route)).statusCode).toBe(404);
      const approval = await app.inject({ method: 'PUT', url: base + '/media/' + asset + '/rights', headers: siteHeaders,
        payload: { expectedVersion: 1, status: 'cleared', owner: 'Synthetic maker', source: 'Generated fixture',
          basis: 'Synthetic fixture only', confirmed: true } });
      expect(approval.statusCode).toBe(200);
      expect((await publish()).statusCode).toBe(200);
      const published = await app.inject(route);
      expect(published.statusCode, published.body).toBe(200);
      expect(published.body).toContain('/sites/' + websiteId + '/en/about.html');
      expect(published.body).toContain('<h1>' + legacy.websiteId + ' &amp; NL</h1>');
      const publishedImage = await app.inject(published.body.match(/<img src="([^"]+)"/)![1]);
      expect(publishedImage.rawPayload).toEqual(preview);
      const translated = await app.inject('/sites/' + websiteId + '/en/about.html');
      expect(translated.body).toContain('alt="Colour &amp; shape"');
      expect(translated.body).toContain('/sites/' + websiteId + '/over.html');
      expect((await app.inject('/sites/' + websiteId + '/obsolete.html')).statusCode).toBe(404);
    }
    expect(rendered[0]).not.toEqual(rendered[1]);
  });

  it('rejects a changed source and target edits without overwriting drafts', async () => {
    const input = await fixture();
    const [site] = await apply(input);
    const original = readFileSync(input.manifest);
    input.input.websites[0].pages[0].nl.contentValues.title.value = 'Updated source';
    input.writeManifest();
    expect(await applyLegacyImport(input.source, input.target)).toMatchObject({ ok: false, issues: [{ code: 'source_changed' }] });
    writeFileSync(input.manifest, original);
    const opened = await open(input.target);
    expect(await applyLegacyImport(input.source, input.target)).toMatchObject({ ok: false, issues: [{ code: 'target_unavailable' }] });
    const page = site.pages[0].pageId;
    const documents = opened.runtime.documents!;
    const before = documents.get(site.targetWebsiteId, page);
    const content = { ...before.content, title: 'Edited target' };
    const saved = documents.save(site.targetWebsiteId, page, { expectedVersion: before.version, content }, 'fixture-editor');
    await opened.close();
    expect(await applyLegacyImport(input.source, input.target)).toMatchObject({ ok: false, issues: [
      { code: 'target_page_changed', path: [site.targetWebsiteId, 'pages', 'shared-page'] },
    ] });
    const reopened = await open(input.target);
    expect(reopened.runtime.documents!.get(site.targetWebsiteId, page)).toMatchObject({ revisionId: saved.revisionId, content });
  });

  it('rolls back both sites when a valid-hash second image fails to decode and can retry the same target', async () => {
    const input = await fixture();
    const file = join(input.source, 'legacy-beta', 'cover.png');
    const broken = input.images[1].subarray(0, 12);
    input.input.websites[1].assets[0].sha256 = checksum(broken);
    writeFileSync(file, broken);
    input.writeManifest();
    const failure = await applyLegacyImport(input.source, input.target);
    expect(failure).toMatchObject({ ok: false, status: 'rejected', issues: [{ code: 'apply_failed' }] });
    expect(existsSync(input.target)).toBe(false);
    expect(readFileSync(file)).toEqual(broken);
    input.input.websites[1].assets[0].sha256 = checksum(input.images[1]);
    writeFileSync(file, input.images[1]);
    input.writeManifest();
    const sites = await apply(input);
    expect(sites.map(site => site.pages.length)).toEqual([1, 1]);
  });
});
