import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

interface Element {
  type: string | (() => Element);
  props: Record<string, unknown> & { children?: Child | Child[] };
}
type Child = Element | string | number | null | false;
type FetchResult = { status: number; body: unknown } | Error;

// Exercise the actual compiled component's event handlers and fetch flow. The hook adapter
// replaces only React scheduling/DOM rendering; no copy of the publication logic lives here.
function editorHarness() {
  const slots: unknown[] = [];
  let cursor = 0;
  let component!: () => Element;
  let tree!: Element;
  let key = 0;
  const requests: Array<{ path: string; init: { method?: string; body?: string; headers: Record<string, string> } }> = [];
  const results: FetchResult[] = [];
  function useState(initial: unknown) {
    const position = cursor++;
    if (!(position in slots)) slots[position] = initial;
    return [slots[position], (next: unknown) => {
      slots[position] = typeof next === 'function' ? next(slots[position]) : next;
    }];
  }
  function useRef(initial: unknown) {
    const position = cursor++;
    if (!(position in slots)) slots[position] = { current: initial };
    return slots[position];
  }
  const jsx = (type: Element['type'], props: Element['props']) => ({ type, props });
  const source = readFileSync(new URL('../../../apps/cms/src/main.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  runInNewContext(compiled, {
    exports: {}, document: { getElementById: () => ({}) }, window: { confirm: () => true },
    crypto: { randomUUID: () => `fixture-key-${++key}` },
    fetch: async (path: string, init: typeof requests[number]['init']) => {
      requests.push({ path, init });
      const result = results.shift();
      if (!result) throw new Error('Unexpected request');
      if (result instanceof Error) throw result;
      return { ok: result.status >= 200 && result.status < 300, status: result.status,
        json: async () => result.body };
    },
    require: (name: string) => {
      if (name === 'react') return { useState, useRef };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-dom/client') return { createRoot: () => ({ render: (element: Element) => { component = element.type as () => Element; } }) };
      if (name === './style.css') return {};
      throw new Error(`Unexpected component import ${name}`);
    },
  });
  function render() { cursor = 0; tree = component(); }
  function nodes(node: Child | Child[] | undefined): Element[] {
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (!node || typeof node !== 'object') return [];
    return [node, ...nodes(node.props.children)];
  }
  function text(node: Child | Child[] | undefined): string {
    if (Array.isArray(node)) return node.map(text).join('');
    if (!node) return '';
    if (typeof node === 'object') return text(node.props.children);
    return String(node);
  }
  function find(predicate: (node: Element) => boolean): Element {
    const matches = nodes(tree).filter(predicate);
    if (matches.length !== 1) throw new Error(`Expected one element, got ${matches.length}`);
    return matches[0];
  }
  async function action(node: Element, event = 'onClick', argument?: unknown) {
    (node.props[event] as (value: unknown) => void)(argument);
    // Flush the real promise chain, then rerender with the resulting hook state.
    await new Promise<void>((resolve) => setImmediate(resolve));
    render();
  }
  const button = (name: string) => find((node) => node.type === 'button' && text(node.props.children) === name);
  const title = () => {
    const label = find((node) => node.type === 'label' && Array.isArray(node.props.children) && node.props.children[0] === 'Titel');
    return nodes(label).find((node) => node.type === 'input')!;
  };
  render();
  return { results, requests, action, button, title,
    field: (label: string) => {
      const owner = find((node) => node.type === 'label' && Array.isArray(node.props.children) &&
        node.props.children.some((child) => typeof child === 'string' && child.trim() === label));
      return nodes(owner).find((node) => ['input', 'select', 'textarea'].includes(String(node.type)))!;
    },
    publicationButton: () => find((node) => node.type === 'button' &&
      ['Lokaal publiceren', 'Publicatie opnieuw controleren'].includes(text(node.props.children))),
    open: () => action(find((node) => node.type === 'form'), 'onSubmit', { preventDefault() {} }),
    status: () => text(find((node) => node.props.role === 'status').props.children),
    error: () => text(find((node) => node.props.role === 'alert').props.children),
  };
}

const pageA = { revisionId: 'revision-A', pageVersion: 1, values: { title: 'Revisie A', intro: '' }, activeReleaseId: null, activeVersion: 0 };
const pageB = { ...pageA, revisionId: 'revision-B', pageVersion: 2, values: { title: 'Revisie B', intro: '' } };

describe('CMS editor recovery and selected revision', () => {
  it('requires fresh confirmation after loading a newer rights version and posts the matching selected asset', async () => {
    const ui = editorHarness();
    const uploadedPage = { ...pageA, uploadEnabled: true, values: { ...pageA.values,
      image: { assetId: 'upload-a', fileVersion: 1, usage: 'hero', decorative: false, altText: { nl: 'Proefbeeld' } } } };
    ui.results.push({ status: 200, body: uploadedPage }); await ui.open();
    ui.results.push({ status: 200, body: { assetId: 'upload-a', rights: 'unknown', metadataVersion: 1 } });
    await ui.action(ui.button('Rechtenstatus ophalen'));
    await ui.action(ui.field('Rechthebbende'), 'onChange', { target: { value: 'Fictieve maker' } });
    await ui.action(ui.field('Bron'), 'onChange', { target: { value: 'Eigen lokale fixture' } });
    await ui.action(ui.field('Onderbouwing van de rechtenbeslissing'), 'onChange', { target: { value: 'Zelf gegenereerd voor lokale tests.' } });
    const confirmation = 'Ik bevestig deze rechtenbeslissing met bovenstaande onderbouwing';
    await ui.action(ui.field(confirmation), 'onChange', { target: { checked: true } });
    ui.results.push({ status: 200, body: { assetId: 'upload-a', rights: 'blocked', metadataVersion: 2 } });
    await ui.action(ui.button('Rechtenstatus ophalen'));
    expect(ui.button('Rechten vrijgeven').props.disabled).toBe(true);
    expect(ui.field('Rechthebbende').props.value).toBe('Fictieve maker');
    await ui.action(ui.field(confirmation), 'onChange', { target: { checked: true } });
    ui.results.push({ status: 200, body: { rights: 'cleared', metadataVersion: 3 } });
    await ui.action(ui.button('Rechten vrijgeven'));
    const choice = ui.requests.at(-1)!;
    expect(choice.path).toContain('/media/upload-a/rights');
    expect(JSON.parse(choice.init.body!)).toMatchObject({ expectedVersion: 2, confirmed: true, status: 'cleared', owner: 'Fictieve maker' });
    expect(JSON.parse(choice.init.body!)).not.toHaveProperty('employee');
    await ui.action(ui.field('Afbeelding'), 'onChange', { target: { value: 'unlicensed:1' } });
    expect(() => ui.button('Rechten vrijgeven')).toThrow();
  });

  it('shows the media dependency failure from preview without blaming the token or changing text', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: pageA }); await ui.open();
    ui.results.push({ status: 503, body: { message: 'Mediaopslag niet beschikbaar. Herstel de mediamap en herstart de proef.' } });
    await ui.action(ui.button('Privépreview openen'));
    expect(ui.error()).toContain('Mediaopslag niet beschikbaar');
    expect(ui.title().props.value).toBe('Revisie A');
  });

  it('keeps the same publication key when retrying the same selected revision after network loss', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: pageA }); await ui.open();
    ui.results.push(new Error('network lost')); await ui.action(ui.button('Lokaal publiceren'));
    expect(ui.error()).toBe('network lost');
    const initial = ui.requests.at(-1)!;
    ui.results.push({ status: 200, body: { releaseId: 'release-A', status: 'published', errorCode: null, publicUrl: '/sites/demo-cms/index.html' } },
      { status: 200, body: { ...pageA, activeReleaseId: 'release-A', activeVersion: 1 } });
    await ui.action(ui.button('Publicatie opnieuw controleren'));
    const retry = ui.requests.filter((request) => request.init.method === 'POST').at(-1)!;
    expect(retry.init.headers['Idempotency-Key']).toBe(initial.init.headers['Idempotency-Key']);
    expect(retry.init.body).toBe(initial.init.body);
    expect(ui.status()).toContain('Actieve versie 1');
  });

  it('publishes visible B with a fresh key after lost A request, draft conflict and explicit adoption', async () => {
    const ui = editorHarness();
    ui.results.push({ status: 200, body: pageA }); await ui.open();
    ui.results.push(new Error('network lost')); await ui.action(ui.button('Lokaal publiceren'));
    const oldChoice = ui.requests.at(-1)!;
    await ui.action(ui.title(), 'onChange', { target: { value: 'Mijn onopgeslagen tekst' } });
    ui.results.push({ status: 409, body: { message: 'Concept gewijzigd' } }, { status: 200, body: pageB });
    await ui.action(ui.button('Concept opslaan'));
    expect(ui.title().props.value).toBe('Mijn onopgeslagen tekst');
    await ui.action(ui.button('Nieuwste versie overnemen'));
    expect(ui.title().props.value).toBe('Revisie B');
    ui.results.push({ status: 200, body: { releaseId: 'release-B', status: 'published', errorCode: null, publicUrl: '/sites/demo-cms/index.html' } },
      { status: 200, body: { ...pageB, activeReleaseId: 'release-B', activeVersion: 1 } });
    await ui.action(ui.publicationButton());
    const selected = ui.requests.filter((request) => request.init.method === 'POST').at(-1)!;
    expect(JSON.parse(selected.init.body!)).toEqual({ revisionId: 'revision-B', expectedActiveVersion: 0 });
    expect(selected.init.headers['Idempotency-Key']).not.toBe(oldChoice.init.headers['Idempotency-Key']);
    expect(ui.status()).toContain('Actieve versie 1');
  });
});
