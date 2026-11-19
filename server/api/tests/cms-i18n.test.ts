import { readFileSync } from 'node:fs';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';
import {apiErrorMessage, cmsMessages, formatUiMessage, message} from '../../../apps/cms/src/i18n.js';

describe('CMS typed interface copy', () => {
  it('covers the same fixed keys and parameters in Dutch and English', () => {
    expect(Object.keys(cmsMessages.en).sort()).toEqual(Object.keys(cmsMessages.nl).sort());
    for (const key of Object.keys(cmsMessages.nl) as Array<keyof typeof cmsMessages.nl>) {
      const parameters = (value: string) => [...value.matchAll(/\{([A-Za-z]+)\}/g)].map((item) => item[1]).sort();
      expect(cmsMessages.en[key].trim(), key).not.toBe('');
      expect(parameters(cmsMessages.en[key]), key).toEqual(parameters(cmsMessages.nl[key]));
    }
  });
  it('formats stored commands in the current language with literal parameter values', () => {
    const status = message('loadedDraft', {version: 2});
    expect(formatUiMessage('nl', status)).toBe('Conceptversie 2 geladen.');
    expect(formatUiMessage('en', status)).toBe('Draft version 2 loaded.');
    expect(formatUiMessage('en', message('missingField', {label: '$& {version} <script>'}))).toBe('$& {version} <script> is missing');
    expect(formatUiMessage('nl', message('rightsLoaded', {rights: 'cleared'}))).toContain('vrijgegeven');
    expect(formatUiMessage('en', message('rightsLoaded', {rights: 'cleared'}))).toContain('cleared');
  });
  it('maps known API codes and preserves bounded unknown error text without interpreting it', () => {
    expect(formatUiMessage('en', apiErrorMessage(422, {errorCode: 'media_unavailable', message: 'Dutch server message'}))).toContain('Media storage unavailable');
    const unknown = '<img src=x onerror=alert(1)> concrete server error';
    expect(formatUiMessage('en', apiErrorMessage(409, {message: unknown}))).toBe(unknown);
    expect(formatUiMessage('en', apiErrorMessage(500, {message: 'x'.repeat(1000)}))).toHaveLength(500);
    expect(formatUiMessage('en', apiErrorMessage(503, {message: {unexpected: true}}))).toBe('Request failed (503)');
    expect(formatUiMessage('en', apiErrorMessage(500, null))).toBe('Request failed (500)');
  });
  it('leaves only language endonyms and route/version notation as literal JSX copy', () => {
    const allowed = new Set(['Nederlands', 'English', '· v', '· en/', '.html']);
    for (const name of ['main', 'documents', 'page-locales', 'shared-navigation']) {
      const source = readFileSync(new URL(`../../../apps/cms/src/${name}.tsx`, import.meta.url), 'utf8');
      const file = ts.createSourceFile(name + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text)) expect(allowed.has(node.text.trim()), `${name}: ${node.text.trim()}`).toBe(true);
        if (ts.isJsxAttribute(node) && node.name.getText(file) === 'title') expect(node.initializer && ts.isJsxExpression(node.initializer)).toBe(true);
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  });
});
