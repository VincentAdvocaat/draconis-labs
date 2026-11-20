import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { adminHtml } from '../src/catalogus/html.js';

function harness() {
  let focused: Element | undefined;
  class Element {
    value = ''; textContent = ''; checked = false; hidden = false; disabled = false; src = '';
    children: Element[] = [];
    files: Array<{ name: string; type: string }> = [];
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
  const pending: Array<{ path: string; options: { headers?: Record<string, string>; body?: unknown }; resolve: (value: unknown, ok?: boolean) => void; fail: () => void }> = [];
  const context = vm.createContext({ URLSearchParams, URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    document: { getElementById: el, createElement: () => new Element(), querySelectorAll: () => [...elements.values()] }, Option: Element,
    fetch: (path: string, options = {}) => new Promise(resolve => pending.push({ path, options, resolve: (value, ok = true) => resolve({ ok, json: async () => value,
      blob: async () => value }), fail: () => resolve({ ok: false, json: async () => ({ message: 'Testfout' }) }) })),
  });
  vm.runInContext(adminHtml.match(/<script>([\s\S]*?)<\/script>/)![1], context);
  const result = (offset = 0, total = 21, assetId = 'photo') => ({ offset, limit: 10, total,
    items: [{ assetId, fileVersion: 2, state: 'ready', rights: 'cleared' }] });
  const detail = { assetId: 'photo', metadataVersion: 2, rights: 'cleared', archived: 0,
    versions: [{ fileVersion: 2, state: 'ready', variants: [{ width: 1, height: 1, mime: 'image/png' }] },
      { fileVersion: 1, state: 'failed', variants: [] }], usages: [{ kind: 'release', owner: 'old-release', fileVersion: 1, slot: 'cover' }] };
  return { el, pending, result, detail, get focused() { return focused; },
    async respond(value: unknown, ok = true) { pending.shift()!.resolve(value, ok); for (let i = 0; i < 10; i++) await Promise.resolve(); },
  };
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

describe('existing asset version upload UI', () => {
  async function open() {
    const h = harness();
    const loaded = h.el('load').onclick!();
    await h.respond({ version: 1, items: [], categories: [] });
    await h.respond([{ assetId: 'photo', fileVersion: 1, metadataVersion: 2, rights: 'cleared', state: 'ready' }]);
    await h.respond([]); await loaded;
    h.el('asset').value = '0'; h.el('title').value = 'Pending NL'; h.el('enTitle').value = 'Pending EN'; h.el('alt').value = 'Pending alt';
    const list = h.el('librarySearch').onclick!(); await h.respond(h.result()); await list;
    const detail = h.el('libraryResults').children[0].children[0].onclick!(); await h.respond(h.detail); await detail;
    return h;
  }
  function detail(h: ReturnType<typeof harness>, state = 'ready', attempts = 1) {
    return { ...h.detail, metadataVersion: state === 'ready' ? 4 : 3, rights: state === 'ready' ? 'unknown' : 'cleared',
      versions: [{ fileVersion: 3, state, variants: state === 'ready' ? h.detail.versions[0].variants : [],
        job: { jobId: 'job-three', state, error: state === 'ready' ? null : 'Transient failure', attempts, maxAttempts: 5 } }, ...h.detail.versions] };
  }
  async function complete(h: Awaited<ReturnType<typeof open>>, ready: boolean, attempts: number) {
    await h.respond({ jobId: 'job-three', assetId: 'photo', fileVersion: 3, message: 'Transient failure' }, ready);
    await h.respond(detail(h, ready ? 'ready' : 'failed', attempts));
    await h.respond({ jobId: 'job-three', assetId: 'photo', fileVersion: 3, state: ready ? 'ready' : 'failed', attempts, maxAttempts: 5 });
    await h.respond([{ assetId: 'photo', fileVersion: 1, metadataVersion: ready ? 4 : 3, rights: ready ? 'unknown' : 'cleared', state: 'ready' },
      { assetId: 'photo', fileVersion: 3, metadataVersion: ready ? 4 : 3, rights: ready ? 'unknown' : 'cleared', state: ready ? 'ready' : 'failed' }]);
  }
  it('requires disclosure confirmation and sends the detail-bound asset CAS while preserving dirty item values', async () => {
    const h = await open(); h.el('versionFile').files = [{ name: 'next.png', type: 'image/png' }];
    await h.el('uploadVersion').onclick!(); expect(h.pending).toHaveLength(0); expect(h.el('versionMessage').textContent).toContain('bevestig');
    h.el('versionConfirm').checked = true; const upload = h.el('uploadVersion').onclick!();
    expect(h.pending[0]).toMatchObject({ path: '/websites/fixture-alpha/media/photo/versions', options: { headers: {
      'x-media-metadata-version': '2', 'x-media-file-version': '2', 'x-media-confirm-invalidation': 'true', 'Content-Type': 'image/png' } } });
    await complete(h, true, 1); await upload;
    expect(h.el('versionMessage').textContent).toContain('Bevestig de rechten opnieuw');
    expect(h.el('title').value).toBe('Pending NL'); expect(h.el('enTitle').value).toBe('Pending EN'); expect(h.el('alt').value).toBe('Pending alt'); expect(h.el('asset').value).toBe('0');
    expect(h.el('versionConfirm').checked).toBe(false); expect(h.el('retryVersion').disabled).toBe(true);
    const preview = h.el('libraryVersions').children[0].children[0].onclick!();
    expect(h.pending[0].path).toBe('/catalogus/api/fixture-alpha/preview/photo/3'); await h.respond('clean derivative'); await preview;
    expect(h.el('libraryPreview').hidden).toBe(false);
  });

  it('keeps the newest failed job after a new upload conflicts without allocating a job', async () => {
    const h = await open();
    const reload = h.el('libraryResults').children[0].children[0].onclick!();
    await h.respond({ ...h.detail, versions: [{ ...h.detail.versions[0], job: { jobId: 'old-job-two', state: 'ready', attempts: 1, maxAttempts: 5 } }, h.detail.versions[1]] }); await reload;
    h.el('versionFile').files = [{ name: 'next.png', type: 'image/png' }]; h.el('versionConfirm').checked = true;
    const upload = h.el('uploadVersion').onclick!();
    await h.respond({ message: 'Asset or latest file version conflict' }, false);
    await h.respond(detail(h, 'failed', 1));
    expect(h.pending[0].path).toContain('/catalogus/api/fixture-alpha/assets');
    await h.respond([]); await upload;
    expect(h.el('retryVersion').disabled).toBe(false);
    const retry = h.el('retryVersion').onclick!();
    expect(h.pending[0].path).toBe('/websites/fixture-alpha/media/job-three/retry');
    await complete(h, true, 2); await retry;
  });

  it('refreshes a failed job and retries the same binding, then disables retry on ready', async () => {
    const h = await open(); h.el('versionFile').files = [{ name: 'next.png', type: 'image/png' }]; h.el('versionConfirm').checked = true;
    const upload = h.el('uploadVersion').onclick!(); await complete(h, false, 1); await upload;
    expect(h.el('retryVersion').disabled).toBe(false); expect(h.el('versionMessage').textContent).toContain('Transient failure');
    const retry = h.el('retryVersion').onclick!(); expect(h.pending[0].path).toBe('/websites/fixture-alpha/media/job-three/retry');
    await complete(h, true, 2); await retry;
    expect(h.el('retryVersion').disabled).toBe(true); expect(h.el('asset').value).toBe('0');
    expect(h.focused).toBe(h.el('uploadVersion'));
  });

  it('clears the previous asset binding while another detail loads and blocks retry after the attempt limit', async () => {
    const h = await open();
    const next = h.el('librarySearch').onclick!(); await h.respond({ ...h.result(), items: [{ assetId: 'photo', fileVersion: 2, state: 'ready', rights: 'cleared' }, { assetId: 'other', fileVersion: 1, state: 'ready', rights: 'unknown' }] }); await next;
    const first = h.el('libraryResults').children[0].children[0].onclick!(); await h.respond(h.detail); await first;
    const second = h.el('libraryResults').children[1].children[0].onclick!();
    expect(h.el('uploadVersion').disabled).toBe(true); await h.el('uploadVersion').onclick!(); expect(h.pending).toHaveLength(1);
    expect(h.el('versionFile').disabled).toBe(true); expect(h.el('versionConfirm').disabled).toBe(true);
    await h.respond({ ...detail(h, 'failed', 5), assetId: 'other' }); await second;
    expect(h.el('retryVersion').disabled).toBe(true); expect(h.el('versionTarget').textContent).toContain('other');
  });
});
