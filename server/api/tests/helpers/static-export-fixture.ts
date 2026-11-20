import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CatalogService } from '../../src/catalogus/service.js';
import type { CatalogSnapshot } from '../../src/catalogus/contracts.js';
import { createRecoveryFixture, openRecoveryFixture } from '../../src/modules/cms/recovery.js';

/** Existing CMS/catalog services only; all API owners are closed before export. */
export async function staticExportFixture(root: string) {
  const fixture = await createRecoveryFixture(root);
  const running = await openRecoveryFixture(root), catalog = new CatalogService(fixture.mediaRoot);
  const base = '/api/v1/cms/websites/demo-cms';
  const token = JSON.parse(readFileSync(join(root, 'local-access.json'), 'utf8')).publisher;
  const headers = { authorization: 'Bearer ' + token };
  async function request(method: 'GET' | 'POST' | 'PUT', path: string, payload?: unknown, key?: string) {
    const result = await running.app.inject({ method, url: base + path, headers: { ...headers, ...(key ? { 'idempotency-key': key } : {}) }, ...(payload ? { payload } : {}) });
    if (result.statusCode !== 200 && result.statusCode !== 201) throw new Error(result.body);
    return result.json();
  }
  async function english(page: string, title: string, slug: string, snapshot?: CatalogSnapshot) {
    const draft = await request('GET', `/documents/${page}/locales/en`);
    await request('PUT', `/documents/${page}/locales/en`, { expectedVersion: draft.version, expectedStructure: draft.structure, confirmSourceChange: draft.needsUpdate,
      content: { ...draft.content, title, slug, seoTitle: title, blocks: draft.content.blocks.map((block: { type: string }) => block.type === 'text'
        ? { ...block, heading: 'English heading', body: 'English static content' }
        : { ...block, selection: { ref: { websiteId: 'fixture-alpha', collectionId: 'portfolio', snapshotId: snapshot!.snapshotId }, checksum: snapshot!.checksum, localeContext: snapshot!.localeContext } }) } });
  }
  async function document(slug: string, snapshot?: CatalogSnapshot, enSnapshot?: CatalogSnapshot) {
    const doc = await request('POST', '/documents', { title: 'Fictief ' + slug, slug });
    await request('PUT', `/documents/${doc.pageId}/draft`, { expectedVersion: doc.version, content: { ...doc.content,
      blocks: [{ ...doc.content.blocks[0], body: 'Nederlandse statische inhoud' }, ...(snapshot ? [{ blockId: randomUUID(), type: 'portfolio',
        ref: { websiteId: 'fixture-alpha', collectionId: 'portfolio', snapshotId: snapshot.snapshotId }, checksum: snapshot.checksum, localeContext: snapshot.localeContext }] : [])] } });
    await english(doc.pageId, 'English ' + slug, slug + '-en', enSnapshot);
  }
  const publish = async () => {
    const plan = await request('GET', '/site-plan');
    return request('POST', '/releases', { revisionId: plan.pages[0].revisionId, expectedActiveVersion: plan.activeVersion,
      expectedPages: plan.pages.map(({ pageId, revisionId, version }: { pageId: string; revisionId: string; version: number }) => ({ pageId, revisionId, version })),
      expectedLocales: plan.localeVariants.map(({ pageId, locale, revisionId, version, structure }: { pageId: string; locale: string; revisionId: string; version: number; structure: string }) => ({ pageId, locale, revisionId, version, structure })),
      expectedShared: { revisionId: plan.shared.revisionId, version: plan.shared.version },
      expectedContact: { revisionId: plan.contactTemplate.revisionId, version: plan.contactTemplate.version, templateHash: plan.contactTemplate.template.hash, locales: ['nl', 'en'] } }, randomUUID());
  };
  try {
    const fullNl = catalog.publish('fixture-alpha', catalog.list('fixture-alpha').version, { locale: 'nl' });
    const fullEn = catalog.publish('fixture-alpha', catalog.list('fixture-alpha').version, { locale: 'en', fallbackLocale: 'nl' });
    catalog.saveCategory('fixture-alpha', undefined, { expectedVersion: 0, labels: { nl: 'Lege categorie', en: 'Empty category' } });
    for (const item of catalog.list('fixture-alpha').items) catalog.archive('fixture-alpha', item.itemId, item.version);
    const emptyNl = catalog.publish('fixture-alpha', catalog.list('fixture-alpha').version, { locale: 'nl' });
    const emptyEn = catalog.publish('fixture-alpha', catalog.list('fixture-alpha').version, { locale: 'en' });
    await english('home', 'English static home', 'index');
    await document('tekst'); await document('projecten', fullNl, fullEn); await document('lege-projecten', emptyNl, emptyEn);
    const old = await publish();
    const home = await request('GET', '/pages/home');
    await request('PUT', '/pages/home/draft', { expectedVersion: home.pageVersion, values: { ...home.values, title: 'New published NL home' } });
    const current = await publish();
    const newer = await request('GET', '/pages/home');
    await request('PUT', '/pages/home/draft', { expectedVersion: newer.pageVersion, values: { ...newer.values, title: 'NOT_EXPORTED_DRAFT' } });
    return { ...fixture, oldReleaseId: old.releaseId as string, releaseId: current.releaseId as string, token };
  } finally { catalog.close(); await running.app.close(); }
}
