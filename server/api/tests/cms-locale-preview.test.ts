import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildCmsApp, type CmsAppOptions } from '../src/modules/cms/app.js';

const temp = realpathSync(tmpdir());
const clean: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of clean.splice(0).reverse()) await close(); });
const website = 'demo-cms';
const other = 'demo-other';
const base = '/api/v1/cms/websites/' + website;
const second = '/api/v1/cms/websites/' + other;
const headers = (site: string) => ({ authorization: 'Bearer locale-preview-' + site });
const fixtures = [website, other].map(site => ({
  name: site, role: 'publisher', websiteIds: [site],
  tokenHash: createHash('sha256').update(headers(site).authorization.slice(7)).digest('hex'),
}));
async function start(localePreviews: CmsAppOptions['localePreviews']) {
  const root = mkdtempSync(join(temp, 'cms-locale-preview-test-'));
  clean.push(async () => {
    const target = realpathSync(root);
    if (target !== root || dirname(target) !== temp || !target.slice(temp.length + 1).startsWith('cms-locale-preview-test-'))
      throw new Error('Unsafe fixture cleanup');
    rmSync(target, { recursive: true });
  });
  const runtime = await buildCmsApp({ runtimeRoot: root, seed: true, enablePages: true, credentials: fixtures, localePreviews });
  clean.push(() => runtime.app.close());
  return runtime;
}

describe('configured private German locale preview', () => {
  it('displays fallback provenance and retains intentional empty fields on an explicitly enabled website', async () => {
    const { app, documents } = await start({ [website]: { locale: 'de', fallbackLocale: 'nl' } });
    const auth = headers(website);
    const pageInfo = await app.inject({ url: base + '/pages/home', headers: auth });
    expect(pageInfo.json().localePreview).toEqual({ locale: 'de', fallbackLocale: 'nl' });
    expect((await app.inject({ url: second + '/pages/home', headers: headers(other) })).json().localePreview).toBeNull();
    const created = documents!.create(website, { title: 'Voorbeeld & proef', slug: 'voorbeeld' }, 'fixture');
    const saved = documents!.save(website, created.pageId, { expectedVersion: created.version, content: {
      ...created.content, seoDescription: 'Nederlandse beschrijving',
      blocks: [{ ...created.content.blocks[0], type: 'text', heading: 'Nederlandse kop', body: 'Nederlandse <tekst>' }],
    } }, 'fixture');
    const blockId = saved.content.blocks[0].blockId;
    const url = base + '/documents/' + saved.pageId + '/locale-previews/de';
    const payload = { expectedVersion: saved.version, seoDescription: '', blocks: [] };
    const preview = await app.inject({ method: 'POST', url, headers: auth, payload });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({
      sourceVersion: saved.version, defaultLocale: 'nl', locale: 'de', fallbackLocale: 'nl', directReady: false, defaultReady: true,
      fields: {
        title: { value: 'Voorbeeld & proef', fallback: true, sourceLocale: 'nl', ready: false, missing: true },
        slug: { value: null, sourceLocale: null, ready: false },
        seoDescription: { value: '', sourceLocale: 'de', explicitEmpty: true, fallback: false, missing: false },
      },
      blocks: [{ blockId, body: { value: 'Nederlandse <tekst>', fallback: true, ready: false } }],
    });
    const html = preview.json().html;
    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<h1 lang="nl">Voorbeeld &amp; proef</h1>');
    expect(html).toContain('<p lang="nl">Nederlandse &lt;tekst&gt;</p>');
    expect(html).toContain('<meta name="description" content="">');
    const direct = await app.inject({ method: 'POST', url, headers: auth, payload: { ...payload,
      title: 'Beispiel', slug: 'beispiel', seoTitle: 'Beispiel SEO',
      blocks: [{ blockId, heading: '', body: 'Deutscher Text.' }],
    } });
    expect(direct.json()).toMatchObject({ directReady: true, defaultReady: true, blocks: [{ heading: { explicitEmpty: true } }] });
    expect(direct.json().html).toContain('<p>Deutscher Text.</p>');
    expect(direct.json().html).not.toContain('Nederlandse');
    expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url, headers: headers(other), payload })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: url.replace(base, second), headers: headers(other), payload })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url, headers: auth, payload: { ...payload, expectedVersion: created.version } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url, headers: auth, payload: { ...payload, blocks: [{ blockId: randomUUID() }] } })).statusCode).toBe(400);
    expect(documents!.get(website, saved.pageId)).toEqual(saved);
    expect(documents!.plan(website).localeVariants).toEqual([]);
    expect((await app.inject('/sites/demo-cms/de/beispiel.html')).statusCode).toBe(404);
  }, 15_000);

  it('leaves missing fields unresolved without a configured fallback and reports an incomplete Dutch source', async () => {
    const { app, documents } = await start({ [website]: { locale: 'de' } });
    const draft = documents!.create(website, { title: 'Alleen een titel', slug: 'titel' }, 'fixture');
    const url = base + '/documents/' + draft.pageId + '/locale-previews/de';
    const result = await app.inject({ method: 'POST', url, headers: headers(website),
      payload: { expectedVersion: draft.version, title: 'Ein Titel', blocks: [] } });
    expect(result.statusCode, result.body).toBe(200);
    expect(result.json()).toMatchObject({ fallbackLocale: null, directReady: false, defaultReady: false,
      fields: { seoTitle: { value: null, fallback: false, missing: true, sourceLocale: null } },
      blocks: [{ body: { fallback: false, missing: true, sourceIncomplete: true } }],
    });
    expect(result.json().html).not.toContain('Alleen een titel');
    const home = await app.inject({ method: 'POST', url: base + '/documents/home/locale-previews/de',
      headers: headers(website), payload: { expectedVersion: 1, blocks: [] } });
    expect(home.statusCode).toBe(409);
  });
});
