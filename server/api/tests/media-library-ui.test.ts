import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { adminHtml } from '../src/catalogus/html.js';

function harness() {
  let focused: Element | undefined;
  class Element {
    value = ''; textContent = ''; checked = false; hidden = false; disabled = false; src = '';
    children: Element[] = [];
    onclick?: () => Promise<void> | void; onchange?: () => Promise<void> | void; oninput?: () => void;
    constructor(text = '', value = '') { this.textContent = text; this.value = value; }
    append(child: Element) { this.children.push(child); }
    add(child: Element) { this.append(child); }
    replaceChildren(...children: Element[]) { this.children = children; }
    focus() { setFocus(this); }
  }
  function setFocus(element: Element) { focused = element; }
  const elements = new Map<string, Element>();
  const el = (id: string) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id)!; };
  el('site').value = 'fixture-alpha'; el('token').value = 'test-token';
  el('categoryEnMissing').checked = true;
  const pending: Array<{ path: string; resolve: (value: unknown) => void; fail: () => void }> = [];
  const context = vm.createContext({ URLSearchParams, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { getElementById: el, createElement: () => new Element(), querySelectorAll: () => [...elements.values()] }, Option: Element,
    fetch: (path: string) => new Promise(resolve => pending.push({ path, resolve: value => resolve({ ok: true, json: async () => value,
      blob: async () => value }), fail: () => resolve({ ok: false, json: async () => ({ message: 'Testfout' }) }) })),
  });
  vm.runInContext(adminHtml.match(/<script>([\s\S]*?)<\/script>/)![1], context);
  const result = (offset = 0, total = 21, assetId = 'photo') => ({ offset, limit: 10, total,
    items: [{ assetId, fileVersion: 2, state: 'ready', rights: 'cleared' }] });
  const detail = { assetId: 'photo', metadataVersion: 2, rights: 'cleared', archived: 0,
    versions: [{ fileVersion: 2, state: 'ready', variants: [{ width: 1, height: 1, mime: 'image/png' }] },
      { fileVersion: 1, state: 'failed', variants: [] }], usages: [{ kind: 'release', owner: 'old-release', fileVersion: 1, slot: 'cover' }] };
  return { el, pending, result, detail, get focused() { return focused; } };
}

describe('library UI response boundaries and editor preservation', () => {
  it('pages and resets filters without replacing unsaved default/EN fields or the explicit selected version', async () => {
    const h = harness();
    for (const id of ['title', 'slug', 'description', 'alt', 'enTitle', 'enAlt', 'asset']) h.el(id).value = 'unsaved-' + id;
    const first = h.el('librarySearch').onclick!(); h.pending.shift()!.resolve(h.result()); await first;
    expect(h.el('libraryPrevious').disabled).toBe(true); expect(h.el('libraryNext').disabled).toBe(false);
    const next = h.el('libraryNext').onclick!(); expect(h.pending[0].path).toContain('offset=10'); h.pending.shift()!.resolve(h.result(10)); await next;
    const last = h.el('libraryNext').onclick!(); h.pending.shift()!.resolve(h.result(20)); await last;
    expect(h.el('libraryNext').disabled).toBe(true);
    h.el('libraryState').value = 'failed'; const filtered = h.el('libraryState').onchange!();
    expect(h.pending[0].path).toContain('offset=0'); expect(h.pending[0].path).toContain('state=failed');
    h.pending.shift()!.resolve({ offset: 0, total: 0, items: [] }); await filtered;
    expect(h.el('libraryMessage').textContent).toBe('Geen afbeeldingen gevonden.');
    for (const id of ['title', 'slug', 'description', 'alt', 'enTitle', 'enAlt', 'asset']) expect(h.el(id).value).toBe('unsaved-' + id);
  });

  it('discards out-of-order lists, invalidates pending results while typing and clears on site switch', async () => {
    const h = harness();
    const old = h.el('librarySearch').onclick!(); const newer = h.el('librarySearch').onclick!();
    h.pending[1].resolve(h.result(0, 1, 'new')); await newer;
    h.pending[0].resolve(h.result(0, 20, 'old')); await old;
    expect(h.el('libraryResults').children[0].textContent).toContain('new');
    h.pending.splice(0);
    const typing = h.el('librarySearch').onclick!(); h.el('libraryQuery').value = 'changed'; h.el('libraryQuery').oninput!();
    h.pending.shift()!.resolve(h.result()); await typing; expect(h.el('libraryResults').children).toHaveLength(0);
    const site = h.el('librarySearch').onclick!(); h.el('site').value = 'fixture-beta'; h.el('site').onchange!();
    h.pending.shift()!.resolve(h.result()); await site;
    expect(h.el('libraryResults').children).toHaveLength(0); expect(h.el('libraryDetail').hidden).toBe(true);
  });

  it('renders historical usage and versions, restores focus, and rejects stale private preview after close', async () => {
    const h = harness();
    const list = h.el('librarySearch').onclick!(); h.pending.shift()!.resolve(h.result()); await list;
    const opener = h.el('libraryResults').children[0].children[0];
    const details = opener.onclick!(); h.pending.shift()!.resolve(h.detail); await details;
    expect(h.focused).toBe(h.el('libraryDetailTitle'));
    expect(h.el('libraryUsages').children[0].textContent).toContain('old-release');
    expect(h.el('libraryVersions').children).toHaveLength(2);
    expect(h.el('libraryVersions').children[1].children).toHaveLength(0);
    const preview = h.el('libraryVersions').children[0].children[0].onclick!();
    h.el('libraryClose').onclick!(); expect(h.focused).toBe(opener);
    h.pending.shift()!.resolve('private clean bytes'); await preview;
    expect(h.el('libraryPreview').hidden).toBe(true);
    const stale = opener.onclick!(); h.el('libraryClose').onclick!(); h.pending.shift()!.resolve(h.detail); await stale;
    expect(h.el('libraryDetail').hidden).toBe(true); expect(h.el('libraryInfo').textContent).toBe('Details laden...');
  });

  it('shows request errors without enabling stale pagination', async () => {
    const h = harness(); const load = h.el('librarySearch').onclick!(); h.pending.shift()!.fail(); await load;
    expect(h.el('libraryMessage').textContent).toBe('Testfout');
    expect(h.el('libraryNext').disabled).toBe(true);
  });
});
