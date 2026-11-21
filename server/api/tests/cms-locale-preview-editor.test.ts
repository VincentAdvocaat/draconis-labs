import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expect, it } from 'vitest';

type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };

// Each mount owns its hook slots, including setters retained by an outstanding request.
function mountEditor() {
  const slots: unknown[] = [];
  let cursor = 0;
  let deliver: ((result: unknown) => void) | undefined;
  const exports: Record<string, (props: unknown) => Node> = {};
  const source = readFileSync(new URL('../../../apps/cms/src/locale-preview.tsx', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const jsx = (type: string, props: Node['props']) => ({ type, props });
  runInNewContext(compiled, { exports, require: (name: string) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === './i18n') return { createCmsTranslator: () => ({ copy: {} }) };
    if (name === 'react') return { useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (next: unknown) => { slots[index] = next; }];
    } };
    throw new Error(name);
  } });
  function render() {
    cursor = 0;
    return exports.ConfiguredLocalePreview({
      document: { version: 1, content: { blocks: [] } }, uiLocale: 'nl', disabled: false, fallback: false,
      onPreview: (_input: unknown, onResult: typeof deliver) => { deliver = onResult; },
    });
  }
  function nodes(value: unknown): Node[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    const node = value as Node;
    return [node, ...nodes(node.props.children)];
  }
  return {
    nodes: () => nodes(render()),
    preview: () => {
      const buttons = nodes(render()).filter(node => node.type === 'button');
      (buttons.at(-1)!.props.onClick as () => void)();
      return deliver!;
    },
  };
}

it('resets German input and diagnostics together after remount and ignores a previous mount response', () => {
  const first = mountEditor();
  const input = first.nodes().find(node => node.type === 'input')!;
  (input.props.onChange as (event: unknown) => void)({ target: { value: 'Deutscher Titel' } });
  const deliver = first.preview();
  const result = { html: '<p>Deutscher Titel</p>', directReady: true, defaultReady: true, fields: {}, blocks: [] };
  deliver(result);
  expect(first.nodes().find(node => node.type === 'iframe')?.props.srcDoc).toBe(result.html);

  // NL to EN to NL, document A to B to A, and a token change all remount the editor.
  const returned = mountEditor();
  deliver(result);
  expect(returned.nodes().find(node => node.type === 'input')?.props.value).toBe('');
  expect(returned.nodes().some(node => node.type === 'iframe' || node.props.role === 'status')).toBe(false);
  returned.preview()(result);
  expect(returned.nodes().some(node => node.type === 'iframe')).toBe(true);
  const changed = returned.nodes().find(node => node.type === 'input')!;
  (changed.props.onChange as (event: unknown) => void)({ target: { value: 'Nieuw' } });
  expect(returned.nodes().some(node => node.type === 'iframe' || node.props.role === 'status')).toBe(false);
});
