import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { adminHtml } from '../src/catalogus/html.js';

class Element {
  private val = '';
  get value() { return this.val; }
  set value(value: string | number) { this.val = String(value); }
  textContent = '';
  checked = false;
  hidden = false;
  disabled = false;
  files: unknown[] = [];
  children: Element[] = [];
  onclick?: () => Promise<void>;
  onchange?: () => void;
  constructor(text = '', value = '') { this.textContent = text; this.value = value; }
  append(child: Element) { this.children.push(child); if (this.children.length === 1) this.value = child.value; }
  add(child: Element) { this.append(child); }
  replaceChildren(...children: Element[]) { this.children = children; this.value = children[0]?.value ?? ''; }
  focus() {}
}

function browserHarness() {
  const elements = new Map<string, Element>();
  const el = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  el('site').value = 'fixture-alpha';
  el('categoryEnMissing').checked = true;
  const categories = [{ categoryId: 'algemeen', version: 1, archived: false, labels: { nl: 'Algemeen', en: 'General' as string | null } }];
  let stored = { itemId: 'item-1', version: 1, title: 'Oude titel', slug: 'oud', description: 'Oud',
    metadata: { year: 2025 }, media: { assetId: 'photo', fileVersion: 1, altText: { nl: 'Oud alt' }, decorative: false } };
  const assets = [{ assetId: 'photo', fileVersion: 1, metadataVersion: 1, rights: 'cleared', state: 'ready' },
    { assetId: 'photo', fileVersion: 2, metadataVersion: 1, rights: 'cleared', state: 'ready' }];
  const sent: Array<Record<string, unknown>> = [];
  const snapshots = [{ snapshotId: 'snapshot-1', status: 'published', version: 1, checksum: 'fixture-checksum', itemCount: 1 }];
  let english: { title: string | null; slug: string | null; description: string | null; alt: string | null } = {
    title: null, slug: null, description: null, alt: null,
  };
  const response = (json: unknown, ok = true) => ({ ok, json: async () => JSON.parse(JSON.stringify(json)) });
  const context = vm.createContext({ document: { getElementById: el, createElement: () => new Element(), querySelectorAll: () => [...elements.values()] }, Option: Element,
    fetch: async (path: string, options: { method?: string; body?: string } = {}) => {
      if (path.includes('/categories')) {
        if (options.method === 'POST' || options.method === 'PUT') {
          const body = JSON.parse(options.body!) as { expectedVersion: number; labels: { nl: string; en: string | null } };
          sent.push(body);
          const id = path.split('/categories/')[1];
          const old = categories.find(category => category.categoryId === id);
          if (id && old?.version !== body.expectedVersion) return response({ message: 'Category version conflict' }, false);
          if (old) { old.labels = body.labels; old.version++; return response(old); }
          const created = { categoryId: 'new-category', version: 1, archived: false, labels: body.labels };
          categories.push(created); return response(created);
        }
        return response(categories);
      }
      if (path.includes('/locales/en')) {
        if (options.method === 'PUT') {
          const body = JSON.parse(options.body!) as typeof english & { expectedVersion: number };
          sent.push(body);
          if (body.expectedVersion !== stored.version) return response({ message: 'Item version conflict' }, false);
          english = { title: body.title, slug: body.slug, description: body.description, alt: body.alt };
          stored = { ...stored, version: stored.version + 1 };
        }
        const fallback = path.includes('fallbackLocale=nl');
        const diagnostic = (value: string | null, nl: string) => value !== null
          ? { value, sourceLocale: 'en', isFallback: false, missing: false, explicitEmpty: value === '' }
          : fallback ? { value: nl, sourceLocale: 'nl', isFallback: true, missing: false, explicitEmpty: false }
          : { missing: true, isFallback: false, explicitEmpty: false };
        return response({ itemId: stored.itemId, version: stored.version, values: english,
          diagnostics: { title: diagnostic(english.title, stored.title), slug: diagnostic(english.slug, stored.slug),
            description: diagnostic(english.description, stored.description), alt: diagnostic(english.alt, stored.media.altText.nl) } });
      }
      if (path.endsWith('/assets')) return response(assets);
      if (path.endsWith('/snapshots')) return response(snapshots);
      if (path.endsWith('/withdraw')) {
        const body = JSON.parse(options.body!) as { expectedVersion: number; confirmed: boolean };
        sent.push(body);
        if (!body.confirmed || body.expectedVersion !== snapshots[0].version) return response({ message: 'Snapshot conflict' }, false);
        snapshots[0].status = 'withdrawn'; snapshots[0].version++;
        return response(snapshots[0]);
      }
      if (path.includes('/rights/')) return response({ metadataVersion: 2 });
      if (path.startsWith('/websites/')) {
        const uploaded = { assetId: 'new-upload', fileVersion: 1, metadataVersion: 1, rights: 'unknown', state: 'ready' };
        assets.push(uploaded); return response(uploaded);
      }
      if (path.endsWith('/items') && options.method === 'POST') {
        const body = JSON.parse(options.body!) as typeof stored & { expectedVersion: number };
        sent.push(body);
        if (body.expectedVersion !== stored.version) return response({ message: 'Item version conflict' }, false);
        stored = { ...body, version: stored.version + 1 };
        return response(stored);
      }
      return response({ items: [stored], version: stored.version, categories });
    },
  });
  vm.runInContext(adminHtml.match(/<script>([\s\S]*?)<\/script>/)![1], context);
  return { el, sent, context, get stored() { return stored; },
    externalCategoryUpdate() { categories[0].version++; categories[0].labels.nl = 'Actueel algemeen'; },
    externalUpdate() { stored = { ...stored, version: 2, title: 'Nieuwe titel', slug: 'nieuw', description: 'Nieuw',
      metadata: { year: 2026 }, media: { ...stored.media, fileVersion: 2, altText: { nl: 'Nieuw alt' }, decorative: true } }; },
    async selectVersionOne() { await el('load').onclick!(); el('items').value = 'item-1'; el('items').onchange!(); },
  };
}

describe('actual admin script optimistic form binding', () => {
  it('refreshes fields, asset selection and expected version together on explicit reload', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    browser.externalUpdate();
    await browser.el('load').onclick!();
    expect(browser.el('title').value).toBe('Nieuwe titel');
    expect(browser.el('slug').value).toBe('nieuw');
    expect(browser.el('description').value).toBe('Nieuw');
    expect(browser.el('year').value).toBe('2026');
    expect(browser.el('alt').value).toBe('Nieuw alt');
    expect(browser.el('decorative').checked).toBe(true);
    expect(browser.el('asset').value).toBe('1');
    await browser.el('save').onclick!();
    expect(browser.sent[0]).toMatchObject({ expectedVersion: 2, title: 'Nieuwe titel', media: { fileVersion: 2 } });
  });

  it('keeps the form version during rights refresh so a concurrent edit produces 409', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    browser.externalUpdate();
    await browser.el('clearRights').onclick!();
    expect(browser.el('title').value).toBe('Oude titel');
    await browser.el('save').onclick!();
    expect(browser.sent[0]).toMatchObject({ expectedVersion: 1, title: 'Oude titel' });
    expect(browser.el('message').textContent).toContain('Item version conflict');
    expect(browser.stored.title).toBe('Nieuwe titel');
  });

  it('preserves a consciously selected new upload without promoting the form version', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    browser.externalUpdate();
    browser.el('upload').files = [{ name: 'new.png', type: 'image/png' }];
    await browser.el('sendUpload').onclick!();
    expect(browser.el('asset').value).toBe('2');
    expect(browser.el('title').value).toBe('Oude titel');
    await browser.el('save').onclick!();
    expect(browser.sent[0]).toMatchObject({ expectedVersion: 1, media: { assetId: 'new-upload', fileVersion: 1 } });
    expect(browser.el('message').textContent).toContain('Item version conflict');
    expect(browser.stored.title).toBe('Nieuwe titel');
  });

  it('requires visible withdrawal confirmation and reports the resulting state without leaving controls disabled', async () => {
    const browser = browserHarness();
    await browser.el('load').onclick!();
    expect(browser.el('snapshotStatus').textContent).toContain('published');
    expect(browser.el('withdrawConfirmed').checked).toBe(false);
    await browser.el('withdraw').onclick!();
    expect(browser.sent).toEqual([]);
    expect(browser.el('message').textContent).toContain('Bevestig de intrekking');
    expect(browser.el('withdraw').disabled).toBe(false);
    browser.el('withdrawEmployee').value = 'Test medewerker';
    browser.el('withdrawReason').value = 'Expliciete lokale testintrekking';
    browser.el('withdrawConfirmed').checked = true;
    await browser.el('withdraw').onclick!();
    expect(browser.sent[0]).toMatchObject({ expectedVersion: 1, confirmed: true });
    expect(browser.el('snapshotStatus').textContent).toContain('withdrawn');
    expect(browser.el('message').textContent).toContain('geven nu 404');
    expect(browser.el('withdrawConfirmed').checked).toBe(false);
    expect(browser.el('withdraw').disabled).toBe(false);
  });

  it('shows fallback diagnostics without copying NL values into EN inputs', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    browser.el('localePreviewFallback').checked = true;
    await browser.el('loadLocale').onclick!();
    expect(browser.el('localeDiagnostics').textContent).toContain('Fallback uit nl: Oude titel');
    expect(browser.el('enTitle').value).toBe('');
    expect(browser.el('enDescriptionMissing').checked).toBe(true);
    expect(browser.el('title').value).toBe('Oude titel');
  });

  it('keeps the EN form version bound during rights refresh and refuses a stale locale save', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    await browser.el('loadLocale').onclick!();
    browser.el('enTitle').value = 'Manual title';
    browser.el('enSlug').value = 'manual';
    browser.el('enAlt').value = 'Manual alt';
    browser.externalUpdate();
    await browser.el('clearRights').onclick!();
    await browser.el('saveLocale').onclick!();
    expect(browser.sent[0]).toMatchObject({ expectedVersion: 1, title: 'Manual title' });
    expect(browser.el('message').textContent).toContain('Item version conflict');
    expect(browser.stored.title).toBe('Nieuwe titel');
    await browser.el('load').onclick!();
    expect(browser.el('enTitle').value).toBe('');
    await browser.el('saveLocale').onclick!();
    expect(browser.el('message').textContent).toContain('Laad eerst de EN-variant');
  });

  it('saves manually empty EN description distinctly while preserving NL fields', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    await browser.el('loadLocale').onclick!();
    browser.el('enTitle').value = 'Manual title';
    browser.el('enSlug').value = 'manual';
    browser.el('enAlt').value = 'Manual alt';
    browser.el('enDescriptionMissing').checked = false;
    browser.el('enDescription').value = '';
    await browser.el('saveLocale').onclick!();
    expect(browser.sent[0]).toMatchObject({ expectedVersion: 1, description: '' });
    expect(browser.el('enDescriptionMissing').checked).toBe(false);
    expect(browser.el('enTitle').value).toBe('Manual title');
    expect(browser.el('title').value).toBe('Oude titel');
  });

  it('does not discard an unsaved default edit or newly selected image while saving EN', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    await browser.el('loadLocale').onclick!();
    browser.el('enTitle').value = 'EN pending';
    browser.el('title').value = 'NL pending';
    await browser.el('saveLocale').onclick!();
    expect(browser.sent).toEqual([]);
    expect(browser.el('message').textContent).toContain('standaarditem eerst op');
    expect(browser.el('title').value).toBe('NL pending');
    expect(browser.el('enTitle').value).toBe('EN pending');
    browser.el('title').value = 'Oude titel';
    browser.el('upload').files = [{ name: 'new.png', type: 'image/png' }];
    await browser.el('sendUpload').onclick!();
    await browser.el('saveLocale').onclick!();
    expect(browser.sent).toEqual([]);
    expect(browser.el('asset').value).toBe('2');
    expect(browser.el('enTitle').value).toBe('EN pending');
  });

  it('rejects EN loading against a source item changed before the EN request, without promoting its version', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    browser.externalUpdate();
    await browser.el('loadLocale').onclick!();
    expect(browser.el('message').textContent).toContain('standaarditem is intussen gewijzigd');
    expect(browser.el('title').value).toBe('Oude titel');
    expect(browser.el('asset').value).toBe('0');
    browser.el('enTitle').value = 'Based on old source';
    await browser.el('saveLocale').onclick!();
    expect(browser.sent).toEqual([]);
    expect(browser.el('message').textContent).toContain('Laad eerst de EN-variant');
    expect(browser.stored.title).toBe('Nieuwe titel');
    await browser.el('load').onclick!();
    await browser.el('loadLocale').onclick!();
    expect(browser.el('title').value).toBe('Nieuwe titel');
    expect(browser.el('asset').value).toBe('1');
    expect(browser.el('message').textContent).toContain('EN-variant en bronlocale geladen');
  });

  it('invalidates EN reloading after an external image change without erasing pending EN input', async () => {
    const browser = browserHarness();
    await browser.selectVersionOne();
    await browser.el('loadLocale').onclick!();
    browser.el('enTitle').value = 'Unsaved EN input';
    browser.el('enAlt').value = 'Description of the previously visible image';
    browser.externalUpdate();
    await browser.el('loadLocale').onclick!();
    expect(browser.el('enTitle').value).toBe('Unsaved EN input');
    expect(browser.el('enAlt').value).toBe('Description of the previously visible image');
    expect(browser.el('message').textContent).toContain('standaarditem is intussen gewijzigd');
    await browser.el('saveLocale').onclick!();
    expect(browser.sent).toEqual([]);
    expect(browser.el('message').textContent).toContain('Laad eerst de EN-variant');
  });
});

describe('category editor preserves item and category drafts', () => {
  it('recovers the category binding after conflict through explicit reload and cancel', async () => {
    const browser = browserHarness(); await browser.selectVersionOne();
    browser.el('categories').value = 'algemeen'; browser.el('categories').onchange!();
    browser.el('categoryNl').value = 'Pending rename'; browser.externalCategoryUpdate();
    await browser.el('saveCategory').onclick!();
    expect(browser.el('message').textContent).toContain('version conflict');
    await browser.el('load').onclick!(); await browser.el('cancelCategory').onclick!();
    expect(browser.el('categoryNl').value).toBe('Actueel algemeen');
    browser.el('categoryNl').value = 'Recovered rename'; await browser.el('saveCategory').onclick!();
    expect(browser.sent.at(-1)).toMatchObject({ expectedVersion: 2, labels: { nl: 'Recovered rename' } });
    expect(browser.el('message').textContent).not.toContain('version conflict');
  });

  it('preserves a category draft and its stale version during the internal item-save refresh', async () => {
    const browser = browserHarness(); await browser.selectVersionOne();
    browser.el('categories').value = 'algemeen'; browser.el('categories').onchange!();
    browser.el('categoryNl').value = 'Pending rename'; browser.externalCategoryUpdate();
    await browser.el('save').onclick!();
    expect(browser.el('categories').value).toBe('algemeen');
    expect(browser.el('categoryNl').value).toBe('Pending rename');
    await browser.el('saveCategory').onclick!();
    expect(browser.sent.at(-1)).toMatchObject({ expectedVersion: 1 });
    expect(browser.el('message').textContent).toContain('version conflict');
  });

  it.each(['cancel', 'save'])('blocks site changes before resetting drafts and permits switching after %s', async action => {
    const browser = browserHarness(); await browser.selectVersionOne();
    browser.el('categories').value = 'algemeen'; browser.el('categories').onchange!();
    browser.el('categoryNl').value = 'Pending rename'; browser.el('title').value = 'Pending item';
    browser.el('asset').value = '1';
    browser.el('site').value = 'fixture-beta'; browser.el('site').onchange!();
    expect(browser.el('site').value).toBe('fixture-alpha');
    expect(browser.el('categoryNl').value).toBe('Pending rename');
    expect(browser.el('title').value).toBe('Pending item'); expect(browser.el('asset').value).toBe('1');
    expect(browser.el('message').textContent).toContain('eerst op of annuleer');
    expect(browser.el('categoryMessage').textContent).toBe(browser.el('message').textContent);
    await browser.el(action === 'cancel' ? 'cancelCategory' : 'saveCategory').onclick!();
    browser.el('site').value = 'fixture-beta'; browser.el('site').onchange!();
    expect(browser.el('site').value).toBe('fixture-beta'); expect(browser.el('title').value).toBe('');
    expect(browser.el('categoryNl').value).toBe('');
    browser.el('categoryNl').value = 'New pending'; browser.el('site').value = 'fixture-alpha'; browser.el('site').onchange!();
    expect(browser.el('site').value).toBe('fixture-beta');
  });

  it('creates a category without replacing pending NL/EN item values or advancing the visible item version', async () => {
    const browser = browserHarness(); await browser.selectVersionOne(); await browser.el('loadLocale').onclick!();
    browser.el('title').value = 'Unsaved NL'; browser.el('enTitle').value = 'Unsaved EN';
    const asset = browser.el('asset').value;
    browser.el('categoryNl').value = 'Projecten'; browser.el('categoryEn').value = 'Projects'; browser.el('categoryEnMissing').checked = false;
    await browser.el('saveCategory').onclick!();
    expect(browser.el('title').value).toBe('Unsaved NL'); expect(browser.el('enTitle').value).toBe('Unsaved EN');
    expect(browser.el('asset').value).toBe(asset); expect(browser.el('category').value).toBe('algemeen');
    expect(browser.el('message').textContent).toContain('Het open item is behouden');
    await browser.el('save').onclick!();
    expect(browser.sent.at(-1)?.expectedVersion).toBe(1);
    expect(browser.el('categories').value).toBe('new-category');
  });

  it('guards unsaved category navigation and mutations and allows explicit cancel', async () => {
    const browser = browserHarness(); await browser.selectVersionOne();
    browser.el('categories').value = 'algemeen'; browser.el('categories').onchange!();
    browser.el('categoryNl').value = 'Pending rename'; browser.el('categories').value = ''; browser.el('categories').onchange!();
    expect(browser.el('categories').value).toBe('algemeen'); expect(browser.el('categoryNl').value).toBe('Pending rename');
    await browser.el('archiveCategory').onclick!(); expect(browser.sent).toEqual([]);
    expect(browser.el('message').textContent).toContain('eerst op of annuleer');
    await browser.el('cancelCategory').onclick!(); expect(browser.el('categoryNl').value).toBe('Algemeen');
    browser.el('categories').value = ''; browser.el('categories').onchange!(); expect(browser.el('categoryNl').value).toBe('');
  });

  it('keeps category drafts on a verified stale-version rejection', async () => {
    const browser = browserHarness(); await browser.selectVersionOne();
    browser.el('categories').value = 'algemeen'; browser.el('categories').onchange!(); browser.el('categoryNl').value = 'Pending rename';
    browser.externalCategoryUpdate(); await browser.el('saveCategory').onclick!();
    expect(browser.sent[0]).toMatchObject({ expectedVersion: 1 });
    expect(browser.el('categoryNl').value).toBe('Pending rename'); expect(browser.el('message').textContent).toContain('version conflict');
  });
});
