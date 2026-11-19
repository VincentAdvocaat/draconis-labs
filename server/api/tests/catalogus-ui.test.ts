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
  files: unknown[] = [];
  children: Element[] = [];
  onclick?: () => Promise<void>;
  onchange?: () => void;
  constructor(text = '', value = '') { this.textContent = text; this.value = value; }
  append(child: Element) { this.children.push(child); if (this.children.length === 1) this.value = child.value; }
  add(child: Element) { this.append(child); }
  replaceChildren(...children: Element[]) { this.children = children; this.value = children[0]?.value ?? ''; }
}

function browserHarness() {
  const elements = new Map<string, Element>();
  const el = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  el('site').value = 'fixture-alpha';
  let stored = { itemId: 'item-1', version: 1, title: 'Oude titel', slug: 'oud', description: 'Oud',
    metadata: { year: 2025 }, media: { assetId: 'photo', fileVersion: 1, altText: { nl: 'Oud alt' }, decorative: false } };
  const assets = [{ assetId: 'photo', fileVersion: 1, metadataVersion: 1, rights: 'cleared', state: 'ready' },
    { assetId: 'photo', fileVersion: 2, metadataVersion: 1, rights: 'cleared', state: 'ready' }];
  const sent: Array<Record<string, unknown>> = [];
  const response = (json: unknown, ok = true) => ({ ok, json: async () => JSON.parse(JSON.stringify(json)) });
  const context = vm.createContext({ document: { getElementById: el, createElement: () => new Element() }, Option: Element,
    fetch: async (path: string, options: { method?: string; body?: string } = {}) => {
      if (path.endsWith('/assets')) return response(assets);
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
      return response({ items: [stored], version: stored.version });
    },
  });
  vm.runInContext(adminHtml.match(/<script>([\s\S]*?)<\/script>/)![1], context);
  return { el, sent, context, get stored() { return stored; },
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
    expect(browser.el('message').textContent).toBe('Item version conflict');
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
    expect(browser.el('message').textContent).toBe('Item version conflict');
    expect(browser.stored.title).toBe('Nieuwe titel');
  });
});
