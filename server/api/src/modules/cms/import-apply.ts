import Database from 'better-sqlite3';
import { randomBytes, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { z } from 'zod';
import { createMediaFixture } from '../../media-fixture/fixture.js';
import { assertFixtureRoot } from '../../media-fixture/safety.js';
import { checksum } from '../../media-fixture/storage.js';
import { buildCmsApp, lockRuntime } from './app.js';
import { documentContentSchema, type CmsDocuments } from './documents.js';
import { dryRunLegacyImport, readLegacyAsset, type WebsitePlan } from './import-dry-run.js';
import { localeSaveSchema } from './page-locales.js';

type Runtime = Awaited<ReturnType<typeof buildCmsApp>>;
const targetPrefix = 'draconis-cms-import-target-';
const actor = 'synthetic-legacy-import';
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const receiptSchema = z.object({
  version: z.literal(1), sourceSha256: hash, mediaRoot: z.string(), owner: z.uuid(),
  websites: z.array(z.object({
    targetWebsiteId: z.enum(['demo-cms', 'demo-other']),
    mediaWebsiteId: z.enum(['fixture-alpha', 'fixture-beta']),
    pages: z.array(z.object({
      sourcePageId: z.string(), pageId: z.uuid(), nlRevisionId: z.uuid(), enRevisionId: z.uuid().nullable(),
    })),
    assets: z.array(z.object({ assetId: z.string(), targetAssetId: z.uuid(), sha256: hash })),
  })),
});
type Receipt = z.infer<typeof receiptSchema>;
const mimeTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

function checkedTarget(target: string) {
  const path = resolve(target);
  if (dirname(path) !== realpathSync(tmpdir()) || !basename(path).startsWith(targetPrefix))
    throw new Error('Use a direct temporary draconis-cms-import-target directory');
  return path;
}

function regular(path: string) {
  if (!lstatSync(path).isFile()) throw new Error('Expected a regular fixture file');
  return readFileSync(path);
}

function readReceipt(root: string) {
  if (!lstatSync(root).isDirectory() || realpathSync(root) !== root) throw new Error('Unsafe import target');
  const receipt = receiptSchema.parse(JSON.parse(regular(join(root, 'import.json')).toString()));
  if (!lstatSync(join(root, 'cms.db')).isFile()) throw new Error('Expected a regular CMS database');
  if (assertFixtureRoot(receipt.mediaRoot) !== receipt.mediaRoot ||
      regular(join(receipt.mediaRoot, '.cms-import-owner')).toString() !== receipt.owner)
    throw new Error('Import media ownership mismatch');
  return receipt;
}

function createPage(documents: CmsDocuments, site: WebsitePlan, page: WebsitePlan['pages'][number],
  assetIds: Map<string, string>) {
  const { nl, en } = page.locales;
  const fields = nl.contentValues;
  const textId = randomUUID();
  const imageId = randomUUID();
  const cover = page.cover;
  const nlDraft = documents.createDraft(site.targetWebsiteId, page.pageId, documentContentSchema.parse({
    schemaVersion: 1, locale: 'nl', title: fields.title.value, slug: basename(nl.route, '.html'),
    seoTitle: fields.seoTitle.value, seoDescription: fields.seoDescription?.value ?? '',
    blocks: [
      { type: 'text', blockId: textId, heading: '', body: fields.body.value },
      ...(cover ? [{ type: 'image', blockId: imageId, caption: '',
        reference: { assetId: assetIds.get(cover.assetId), fileVersion: cover.fileVersion, usage: 'block-' + imageId,
          decorative: cover.decorative, altText: { nl: cover.altText.nl } } }] : []),
    ],
  }), actor);
  let enRevisionId = null;
  if (en) {
    const current = documents.locales.get(site.targetWebsiteId, page.pageId);
    enRevisionId = documents.locales.save(site.targetWebsiteId, page.pageId, localeSaveSchema.parse({
      expectedVersion: current.version, expectedStructure: current.structure,
      content: {
        schemaVersion: 1, locale: 'en', title: en.contentValues.title.value, slug: basename(en.route, '.html'),
        seoTitle: en.contentValues.seoTitle.value, seoDescription: en.contentValues.seoDescription?.value ?? null,
        blocks: [
          { type: 'text', blockId: textId, heading: '', body: en.contentValues.body.value },
          ...(cover ? [{ type: 'image', blockId: imageId, caption: '', altText: cover.altText.en }] : []),
        ],
      },
    }), actor).revisionId;
  }
  return { sourcePageId: page.sourcePageId, pageId: page.pageId, nlRevisionId: nlDraft.revisionId, enRevisionId };
}

function verifyReplay(root: string, receipt: Receipt) {
  const unlock = lockRuntime(root);
  try {
    const cms = new Database(join(root, 'cms.db'), { readonly: true, fileMustExist: true });
    try {
      const media = new Database(join(receipt.mediaRoot, 'media.sqlite'), { readonly: true, fileMustExist: true });
      try {
        const nlHead = cms.prepare('SELECT revision_id FROM cms_documents WHERE website_id=? AND id=?');
        const enHead = cms.prepare("SELECT revision_id FROM cms_locale_heads WHERE website_id=? AND page_id=? AND locale='en'");
        const originalAsset = media.prepare(`SELECT f.variants FROM assets a JOIN files f ON f.website=a.website AND f.asset=a.id
          JOIN upload_jobs j ON j.website=a.website AND j.asset=a.id AND j.file_version=f.version
          WHERE a.website=? AND a.id=? AND a.metadata_version=1 AND a.archived=0 AND a.rights='unknown'
          AND f.version=1 AND f.state='ready' AND j.state='ready' AND j.source_checksum=?`);
        const revision = (row: unknown) => (row as { revision_id: string } | undefined)?.revision_id ?? null;
        const issues = [];
        for (const site of receipt.websites) {
          for (const page of site.pages) {
            if (revision(nlHead.get(site.targetWebsiteId, page.pageId)) !== page.nlRevisionId ||
                revision(enHead.get(site.targetWebsiteId, page.pageId)) !== page.enRevisionId)
              issues.push({ code: 'target_page_changed', path: [site.targetWebsiteId, 'pages', page.sourcePageId], message: 'Imported draft changed or is missing' });
          }
          for (const asset of site.assets) {
            const row = originalAsset.get(site.mediaWebsiteId, asset.targetAssetId, asset.sha256) as { variants: string } | undefined;
            if (!row || !assetFilesMatch(receipt.mediaRoot, site.mediaWebsiteId, asset.targetAssetId, asset.sha256, row.variants))
              issues.push({ code: 'target_asset_changed', path: [site.targetWebsiteId, 'assets', asset.assetId], message: 'Imported media files or metadata changed' });
          }
        }
        return issues;
      } finally { media.close(); }
    } finally { cms.close(); }
  } finally { unlock(); }
}

function assetFilesMatch(root: string, site: string, id: string, sourceHash: string, variantsJson: string) {
  const variantSchema = z.array(z.object({ path: z.string(), checksum: hash })).min(1);
  try {
    const files = [{ path: `private/${site}/${id}/source`, checksum: sourceHash }, ...variantSchema.parse(JSON.parse(variantsJson))];
    return files.every((file, index) => {
      const prefix = `public/${site}/${id}/1/`;
      if (index > 0 && (!file.path.startsWith(prefix) || !/^[0-9]+\.(png|jpg|webp)$/.test(file.path.slice(prefix.length))))
        return false;
      const local = join(root, file.path);
      return realpathSync(local) === local && checksum(regular(local)) === file.checksum;
    });
  } catch { return false; }
}

function runtimeOptions(root: string, mediaRoot: string, credentials: unknown) {
  return { runtimeRoot: root, mediaRoot, credentials, enablePages: true, enableMedia: true, enableUploads: true, enableSharedNavigation: true };
}

export function openImportedFixture(target: string) {
  const root = checkedTarget(target);
  const receipt = readReceipt(root);
  const credentials: unknown = JSON.parse(regular(join(root, 'credentials.json')).toString());
  return buildCmsApp(runtimeOptions(root, receipt.mediaRoot, credentials));
}

async function applyWebsite(running: Runtime, sourceRoot: string, site: WebsitePlan) {
  const assetIds = new Map<string, string>();
  const assets: Receipt['websites'][number]['assets'] = [];
  for (const asset of site.assets) {
    const bytes = readLegacyAsset(sourceRoot, site.sourceWebsiteId, asset.filename);
    if (checksum(bytes) !== asset.sha256) throw new Error(`Source asset changed during import: ${site.sourceWebsiteId}/${asset.filename}`);
    const upload = await running.uploads!.upload(site.targetWebsiteId, bytes, asset.filename, mimeTypes[extname(asset.filename)]);
    if (upload.state !== 'ready') throw new Error(`Imported asset did not become ready: ${site.sourceWebsiteId}/${asset.filename}`);
    assetIds.set(asset.assetId, upload.assetId);
    assets.push({ assetId: asset.assetId, targetAssetId: upload.assetId, sha256: asset.sha256 });
  }
  const pages = site.pages.map(page => createPage(running.documents!, site, page, assetIds));
  return { targetWebsiteId: site.targetWebsiteId, mediaWebsiteId: running.media!.websiteScope(site.targetWebsiteId) as Receipt['websites'][number]['mediaWebsiteId'],
    assets, pages };
}

export async function applyLegacyImport(sourceRoot: string, target: string) {
  const plan = dryRunLegacyImport(sourceRoot);
  if (!plan.ok) return { ...plan, status: 'rejected' };
  const root = checkedTarget(target);
  const rejected = (code: string, message: string) =>
    ({ ...plan, ok: false, status: 'rejected', issues: [{ code, path: [], message }] });
  try { mkdirSync(root, { mode: 0o700 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    try {
      const receipt = readReceipt(root);
      if (receipt.sourceSha256 !== plan.sourceSha256)
        return rejected('source_changed', 'This target belongs to a different source fingerprint');
      const issues = verifyReplay(root, receipt);
      if (issues.length) return { ...plan, ok: false, status: 'rejected', issues };
      return { ...plan, status: 'unchanged', mappings: receipt.websites };
    } catch (error) {
      return rejected('target_unavailable', error instanceof Error ? error.message : String(error));
    }
  }

  let fixture: ReturnType<typeof createMediaFixture> | undefined;
  try {
    fixture = createMediaFixture({ seed: false });
    const owner = randomUUID();
    writeFileSync(join(fixture.root, '.cms-import-owner'), owner, { flag: 'wx' });
    fixture.close();
    const access = Object.fromEntries(plan.websites.map(site => [site.targetWebsiteId, randomBytes(32).toString('hex')]));
    const credentials = Object.entries(access).map(([websiteId, token]) => ({
      name: 'import-' + websiteId, role: 'publisher', websiteIds: [websiteId], tokenHash: checksum(Buffer.from(token)),
    }));
    const websites: Receipt['websites'] = [];
    const runtime = await buildCmsApp({ ...runtimeOptions(root, fixture.root, credentials), seed: true });
    try {
      for (const site of plan.websites) websites.push(await applyWebsite(runtime, sourceRoot, site));
    } finally { await runtime.app.close(); }

    writeFileSync(join(root, 'local-access.json'), JSON.stringify(access), { flag: 'wx', mode: 0o600 });
    writeFileSync(join(root, 'credentials.json'), JSON.stringify(credentials), { flag: 'wx' });
    writeFileSync(join(root, 'source-values.json'), JSON.stringify(plan), { flag: 'wx' });
    const receipt = receiptSchema.parse({
      version: 1, sourceSha256: plan.sourceSha256, mediaRoot: fixture.root, owner, websites,
    });
    const pending = join(root, 'import.pending');
    writeFileSync(pending, JSON.stringify(receipt), { flag: 'wx', flush: true });
    renameSync(pending, join(root, 'import.json'));
    return { ...plan, status: 'applied', mappings: websites };
  } catch (error) {
    if (!lstatSync(root).isDirectory() || realpathSync(root) !== root) throw new Error('Import target changed during cleanup');
    try { fixture?.cleanup(); }
    finally { rmSync(root, { recursive: true }); }
    return rejected('apply_failed', error instanceof Error ? error.message : String(error));
  }
}
