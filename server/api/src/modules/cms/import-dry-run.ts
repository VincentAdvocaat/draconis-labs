import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { documentSlugSchema } from './slugs.js';

const sourceSystem = 'studio-cms-fixture';
const targets = { 'legacy-alpha': 'demo-cms', 'legacy-beta': 'demo-other' } as const;
const websiteId = z.enum(['legacy-alpha', 'legacy-beta']);
const sourceId = z.string().max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const assetFile = z.string().max(100).regex(/^[a-z0-9][a-z0-9_-]*\.(?:png|jpe?g|webp)$/)
  .refine(name => !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\./.test(name), 'Reserved filename');
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentValue = (limit: number) => z.object({ version: z.number().int().positive(), value: z.string().max(limit) }).strict();
const titleValue = contentValue(200).refine(({ value }) => value.trim().length > 0, 'Expected nonempty title');
const localizedPage = z.object({
  slug: documentSlugSchema,
  contentValues: z.object({ title: titleValue, seoTitle: titleValue, seoDescription: contentValue(1000).optional(), body: contentValue(10_000) }).strict(),
}).strict();
const pageSchema = z.object({
  id: sourceId, template: z.literal('text-page'), nl: localizedPage, en: localizedPage.optional(),
  cover: z.object({
    websiteId, assetId: sourceId, decorative: z.boolean(),
    altText: z.object({ nl: z.string().max(2000), en: z.string().max(2000).optional() }).strict(),
  }).strict().optional(),
}).strict();
const siteSchema = z.object({
  websiteId, pages: z.array(pageSchema).max(32),
  assets: z.array(z.object({ id: sourceId, filename: assetFile, sha256 }).strict()).max(32),
}).strict();
const manifestSchema = z.object({
  synthetic: z.literal(true), schemaVersion: z.literal(1), sourceSystem: z.literal(sourceSystem), websites: z.tuple([siteSchema, siteSchema]),
}).strict();

type IssueCode = 'invalid_source' | 'invalid_json' | 'invalid_manifest' | 'duplicate_website' | 'duplicate_asset_id'
  | 'duplicate_asset_file' | 'unreadable_asset' | 'asset_hash_mismatch' | 'duplicate_page_id'
  | 'duplicate_route' | 'cross_website_cover' | 'unknown_cover' | 'invalid_cover_alt';
interface Issue { code: IssueCode; path: Array<string | number>; message: string }
type Website = z.infer<typeof siteSchema>;
type LocalizedPage = z.infer<typeof localizedPage>;
type Page = z.infer<typeof pageSchema>;
interface WebsitePlan {
  sourceWebsiteId: Website['websiteId'];
  targetWebsiteId: (typeof targets)[Website['websiteId']];
  assets: Array<{ assetId: string; fileVersion: 1; filename: string; sha256: string; rights: 'unknown' }>;
  pages: Array<{
    sourcePageId: string; pageId: string; locales: Partial<Record<'nl' | 'en', { route: string; contentValues: LocalizedPage['contentValues'] }>>;
    cover?: { assetId: string; fileVersion: 1; decorative: boolean; altText: NonNullable<Page['cover']>['altText'] };
  }>;
}

function fileBytes(path: string, maxBytes: number) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error('Expected a regular file within the fixture size limit');
  return readFileSync(path);
}

function digest(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pageId(site: Website['websiteId'], id: string) {
  const bytes = createHash('sha256').update(JSON.stringify([sourceSystem, site, 'page', id])).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [bytes.subarray(0, 4), bytes.subarray(4, 6), bytes.subarray(6, 8), bytes.subarray(8, 10), bytes.subarray(10, 16)]
    .map(part => part.toString('hex')).join('-');
}

function planWebsite(root: string, site: Website, index: number, issues: Issue[]): WebsitePlan {
  const plan: WebsitePlan = { sourceWebsiteId: site.websiteId, targetWebsiteId: targets[site.websiteId], pages: [], assets: [] };
  const path = ['websites', index];
  const assetIds = new Set<string>();
  const filenames = new Set<string>();
  const assetRoot = join(root, site.websiteId);
  for (const [i, asset] of site.assets.entries()) {
    const assetPath = [...path, 'assets', i];
    if (assetIds.has(asset.id)) issues.push({ code: 'duplicate_asset_id', path: assetPath, message: 'Asset ID occurs more than once on this website' });
    if (filenames.has(asset.filename)) issues.push({ code: 'duplicate_asset_file', path: assetPath, message: 'File is mapped to more than one asset on this website' });
    assetIds.add(asset.id);
    filenames.add(asset.filename);
    let actual: string;
    try {
      if (!lstatSync(assetRoot).isDirectory()) throw new Error('Expected a regular website media directory');
      actual = digest(fileBytes(join(assetRoot, asset.filename), 10 * 1024 * 1024));
    } catch {
      issues.push({ code: 'unreadable_asset', path: assetPath, message: 'Missing or unreadable fixture media file' });
      continue;
    }
    if (actual !== asset.sha256) {
      issues.push({ code: 'asset_hash_mismatch', path: assetPath, message: 'File bytes differ from the manifest SHA-256' });
      continue;
    }
    plan.assets.push({ assetId: asset.id, fileVersion: 1, filename: asset.filename, sha256: actual, rights: 'unknown' });
  }

  const pageIds = new Set<string>();
  const routes = new Set<string>();
  for (const [i, page] of site.pages.entries()) {
    const pagePath = [...path, 'pages', i];
    if (pageIds.has(page.id)) issues.push({ code: 'duplicate_page_id', path: pagePath, message: 'Page ID occurs more than once on this website' });
    pageIds.add(page.id);
    const locales: WebsitePlan['pages'][number]['locales'] = {};
    for (const locale of ['nl', 'en'] as const) {
      const input = page[locale];
      if (!input) continue;
      const route = `/sites/${plan.targetWebsiteId}/${locale === 'en' ? 'en/' : ''}${input.slug}.html`;
      if (routes.has(route)) issues.push({ code: 'duplicate_route', path: [...pagePath, locale, 'slug'], message: 'Normalized route occurs more than once on this website' });
      routes.add(route);
      locales[locale] = { route, contentValues: input.contentValues };
    }
    const proposedPage: WebsitePlan['pages'][number] = { sourcePageId: page.id, pageId: pageId(site.websiteId, page.id), locales };
    const cover = page.cover;
    if (cover) {
      const coverPath = [...pagePath, 'cover'];
      if (cover.websiteId !== site.websiteId) issues.push({ code: 'cross_website_cover', path: coverPath, message: 'Cover belongs to a different source website' });
      else if (!assetIds.has(cover.assetId)) issues.push({ code: 'unknown_cover', path: coverPath, message: 'Cover asset is absent from this website' });
      const alt = page.en ? [cover.altText.nl, cover.altText.en] : [cover.altText.nl];
      if ((page.en === undefined && cover.altText.en !== undefined) ||
          (cover.decorative ? alt.some(value => value !== '') : alt.some(value => !value?.trim()))) {
        issues.push({ code: 'invalid_cover_alt', path: [...coverPath, 'altText'], message: 'Cover alt must match each page locale and its decorative status' });
      }
      proposedPage.cover = { assetId: cover.assetId, fileVersion: 1, decorative: cover.decorative, altText: cover.altText };
    }
    plan.pages.push(proposedPage);
  }
  return plan;
}

export function dryRunLegacyImport(sourceRoot: string) {
  function report(sourceSha256: string | null, issues: Issue[], websites: WebsitePlan[] = []) {
    return { schemaVersion: 1, sourceSystem, sourceSha256, ok: issues.length === 0, issues, websites: issues.length ? [] : websites };
  }
  const root = resolve(sourceRoot);
  let bytes: Buffer;
  try {
    if (dirname(root) !== realpathSync(tmpdir()) || !basename(root).startsWith('draconis-cms-import-fixture-') ||
        !lstatSync(root).isDirectory() || realpathSync(root) !== root) throw new Error('Expected real temporary fixture directory');
    bytes = fileBytes(join(root, 'legacy.json'), 256 * 1024);
  } catch {
    return report(null, [{ code: 'invalid_source', path: [], message: 'Use a temporary draconis-cms-import-fixture directory with a regular legacy.json file' }]);
  }
  const fingerprint = digest(bytes);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return report(fingerprint, [{ code: 'invalid_json', path: [], message: 'Invalid UTF-8 JSON manifest' }]);
  }
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) return report(fingerprint, parsed.error.issues.map(issue =>
    ({ code: 'invalid_manifest', path: issue.path.map(key => typeof key === 'symbol' ? key.toString() : key), message: issue.message })));
  const websites = parsed.data.websites;
  if (websites[0].websiteId === websites[1].websiteId)
    return report(fingerprint, [{ code: 'duplicate_website', path: ['websites', 1, 'websiteId'], message: 'Use one entry for each synthetic website' }]);
  const issues: Issue[] = [];
  return report(fingerprint, issues, websites.map((site, index) => planWebsite(root, site, index, issues)));
}
