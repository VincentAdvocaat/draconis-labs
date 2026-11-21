import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dryRunLegacyImport } from '../src/modules/cms/import-dry-run.js';

const temp = realpathSync(tmpdir());
const prefix = 'draconis-cms-import-fixture-';
const roots: string[] = [];
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const locales = () => ({
  nl: { slug: 'over', contentValues: { title: { version: 2, value: 'Over' }, seoTitle: { version: 1, value: 'Over de proef' },
    body: { version: 3, value: 'Fictieve tekst' }, seoDescription: { version: 2, value: '' } } },
  en: { slug: 'about', contentValues: { title: { version: 1, value: 'About' }, seoTitle: { version: 1, value: 'About the fixture' },
    body: { version: 2, value: 'Synthetic text' } } },
});
function website(websiteId: 'legacy-alpha' | 'legacy-beta', bytes: Buffer) {
  return {
    websiteId,
    assets: [{ id: 'photo', filename: 'cover.png', sha256: digest(bytes) }],
    pages: [{ id: 'about-page', template: 'text-page', ...locales(),
      cover: { websiteId, assetId: 'photo', decorative: false, altText: { nl: 'Een proefbeeld', en: 'A fixture image' } } }],
  };
}
function fixture() {
  const root = mkdtempSync(join(temp, prefix));
  roots.push(root);
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1xkAAAAASUVORK5CYII=', 'base64');
  const input = { synthetic: true, schemaVersion: 1, sourceSystem: 'studio-cms-fixture',
    websites: [website('legacy-alpha', bytes), website('legacy-beta', bytes)] };
  for (const site of input.websites) {
    mkdirSync(join(root, site.websiteId));
    writeFileSync(join(root, site.websiteId, 'cover.png'), bytes);
  }
  function writeManifest(value: unknown) { writeFileSync(join(root, 'legacy.json'), JSON.stringify(value)); }
  writeManifest(input);
  return { root, input, bytes, writeManifest };
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    const resolved = realpathSync(root);
    if (dirname(resolved) !== temp || !resolved.slice(temp.length + 1).startsWith(prefix)) throw new Error('Unsafe fixture cleanup');
    rmSync(resolved, { recursive: true });
  }
});
const run = (root: string) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/cms-import-dry-run.ts', '--source', root], { encoding: 'utf8' });

describe('synthetic CMS legacy import dry-run', () => {
  it('reports stable, website-scoped IDs, routes, field versions and file bytes without writing', () => {
    const { root, bytes } = fixture();
    const manifest = readFileSync(join(root, 'legacy.json'));
    const first = run(root);
    expect(first.status, first.stderr).toBe(0);
    const report = dryRunLegacyImport(root);
    expect(JSON.parse(first.stdout)).toEqual(report);
    expect(report).toMatchObject({ ok: true, issues: [], sourceSha256: digest(manifest) });
    const [alpha, beta] = report.websites;
    expect(alpha).toMatchObject({ sourceWebsiteId: 'legacy-alpha', targetWebsiteId: 'demo-cms',
      assets: [{ assetId: 'photo', fileVersion: 1, filename: 'cover.png', sha256: digest(bytes), rights: 'unknown' }],
      pages: [{ sourcePageId: 'about-page', locales: { nl: { route: '/sites/demo-cms/over.html' },
        en: { route: '/sites/demo-cms/en/about.html' } }, cover: { assetId: 'photo', fileVersion: 1, decorative: false } }] });
    expect(beta.pages[0].locales.nl?.route).toBe('/sites/demo-other/over.html');
    expect(alpha.pages[0].pageId).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(alpha.pages[0].pageId).not.toBe(beta.pages[0].pageId);
    expect(alpha.pages[0].locales.nl?.contentValues.seoDescription).toEqual({ version: 2, value: '' });
    expect(alpha.pages[0].locales.en?.contentValues).not.toHaveProperty('seoDescription');
    expect(run(root).stdout).toBe(first.stdout);
    expect(readdirSync(root).sort()).toEqual(['legacy-alpha', 'legacy-beta', 'legacy.json']);
    expect(readFileSync(join(root, 'legacy.json'))).toEqual(manifest);
    for (const site of ['legacy-alpha', 'legacy-beta']) {
      expect(readdirSync(join(root, site))).toEqual(['cover.png']);
      expect(readFileSync(join(root, site, 'cover.png'))).toEqual(bytes);
    }
  }, 15_000);

  it('reports collisions, invalid references and incorrect file hashes with no partial plan', () => {
    const { root, input, writeManifest } = fixture();
    const [alpha, beta] = input.websites;
    alpha.assets.push({ ...alpha.assets[0] });
    alpha.pages[0].cover.websiteId = 'legacy-beta';
    alpha.pages.push({ ...alpha.pages[0], nl: { ...alpha.pages[0].nl, slug: 'OVER' } });
    beta.pages[0].cover.assetId = 'unmapped';
    beta.pages[0].cover.altText.en = '';
    writeManifest(input);
    writeFileSync(join(root, 'legacy-alpha', 'cover.png'), 'modified file contents');
    rmSync(join(root, 'legacy-beta', 'cover.png'));
    const result = run(root);
    const report = JSON.parse(result.stdout);
    expect(result.status, result.stderr).toBe(1);
    expect(report).toMatchObject({ ok: false, websites: [] });
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'asset_hash_mismatch', path: ['websites', 0, 'assets', 0] }),
      expect.objectContaining({ code: 'duplicate_asset_id', path: ['websites', 0, 'assets', 1] }),
      expect.objectContaining({ code: 'duplicate_asset_file', path: ['websites', 0, 'assets', 1] }),
      expect.objectContaining({ code: 'unreadable_asset', path: ['websites', 1, 'assets', 0] }),
      expect.objectContaining({ code: 'duplicate_route', path: ['websites', 0, 'pages', 1, 'nl', 'slug'] }),
      expect.objectContaining({ code: 'duplicate_page_id' }),
      expect.objectContaining({ code: 'cross_website_cover' }),
      expect.objectContaining({ code: 'unknown_cover' }),
      expect.objectContaining({ code: 'invalid_cover_alt' }),
    ]));
  });

  it('changes the source fingerprint without changing the page ID when the source route changes', () => {
    const { root, input, writeManifest } = fixture();
    const first = dryRunLegacyImport(root);
    input.websites[0].pages[0].nl.slug = 'een-nieuwe-route';
    writeManifest(input);
    const updated = dryRunLegacyImport(root);
    expect(updated.sourceSha256).not.toBe(first.sourceSha256);
    expect(updated.websites[0].pages[0].pageId).toBe(first.websites[0].pages[0].pageId);
    expect(updated.websites[0].pages[0].locales.nl?.route).toBe('/sites/demo-cms/een-nieuwe-route.html');
  });

  it('preserves explicitly blank decorative alt on a Dutch-only page', () => {
    const { root, input, writeManifest } = fixture();
    const [alpha, beta] = input.websites;
    const { en: _english, ...page } = alpha.pages[0];
    writeManifest({ ...input, websites: [{ ...alpha, pages: [
      { ...page, cover: { ...page.cover, decorative: true, altText: { nl: '' } } },
    ] }, beta] });
    const dryRun = dryRunLegacyImport(root);
    expect(dryRun.ok).toBe(true);
    expect(dryRun.websites[0].pages[0].cover).toMatchObject({ decorative: true, altText: { nl: '' } });
    expect(dryRun.websites[0].pages[0].locales).not.toHaveProperty('en');
  });

  it('rejects unsupported schemas, unknown fields, unsafe files, duplicate sites and invalid source input', () => {
    const { root, input, writeManifest } = fixture();
    const shape = structuredClone(input);
    const page = shape.websites[0].pages[0];
    page.template = 'unsupported-template';
    shape.websites[0].assets[0].filename = '../cover.png';
    Object.assign(page.nl.contentValues, { unknownField: { value: 'unmapped', version: 1 } });
    writeManifest(shape);
    expect(dryRunLegacyImport(root)).toMatchObject({ ok: false, websites: [], issues: [
      { code: 'invalid_manifest', path: ['websites', 0, 'pages', 0, 'template'] },
      { code: 'invalid_manifest', path: ['websites', 0, 'pages', 0, 'nl', 'contentValues'] },
      { code: 'invalid_manifest', path: ['websites', 0, 'assets', 0, 'filename'] },
    ] });
    writeManifest({ ...input, websites: [input.websites[0], input.websites[0]] });
    expect(dryRunLegacyImport(root)).toMatchObject({ ok: false, websites: [], issues: [{ code: 'duplicate_website' }] });
    writeManifest({ ...input, synthetic: false });
    expect(dryRunLegacyImport(root)).toMatchObject({ ok: false, websites: [], issues: [{ code: 'invalid_manifest', path: ['synthetic'] }] });
    writeFileSync(join(root, 'legacy.json'), '{ malformed');
    expect(dryRunLegacyImport(root)).toMatchObject({ ok: false, websites: [], issues: [{ code: 'invalid_json' }] });
    expect(dryRunLegacyImport(join(root, 'legacy-alpha'))).toMatchObject({ ok: false, websites: [], issues: [{ code: 'invalid_source' }] });
  });
});
