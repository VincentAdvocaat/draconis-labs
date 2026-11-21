import { useState } from 'react';
import type { DocumentDto } from './documents';
import { createCmsTranslator, type UiLocale } from './i18n';

const fields = [
  { name: 'title', label: 'title', max: 200 },
  { name: 'slug', label: 'slug', max: 80 },
  { name: 'seoTitle', label: 'seoTitle', max: 200 },
  { name: 'seoDescription', label: 'seoDescription', max: 1000 },
] as const;
type Field = typeof fields[number]['name'];
interface Diagnostic {
  missing: boolean;
  explicitEmpty: boolean;
  fallback: boolean;
  ready: boolean;
  sourceIncomplete: boolean;
}
export interface LocalePreviewResult {
  html: string;
  directReady: boolean;
  defaultReady: boolean;
  fields: Record<Field, Diagnostic>;
  blocks: Array<{ blockId: string; heading: Diagnostic; body: Diagnostic }>;
}
export interface LocalePreviewInput {
  expectedVersion: number;
  title?: string;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  blocks: Array<{ blockId: string; heading?: string; body?: string }>;
}

export function ConfiguredLocalePreview({ document, result, uiLocale, disabled, fallback, onChange, onPreview }: {
  document: DocumentDto;
  result: LocalePreviewResult | null;
  uiLocale: UiLocale;
  disabled: boolean;
  fallback: boolean;
  onChange: () => void;
  onPreview: (input: LocalePreviewInput) => void;
}) {
  const { copy: t } = createCmsTranslator(uiLocale);
  const [values, setValues] = useState<Partial<Record<Field, string>>>({});
  const [blocks, setBlocks] = useState<LocalePreviewInput['blocks']>(document.content.blocks.map(({ blockId }) => ({ blockId })));
  const diagnostic = (value?: Diagnostic) => value && <span>
    {value.fallback ? t.localePreviewFallbackUsed : value.missing ? t.localePreviewMissing :
      value.explicitEmpty ? t.localePreviewEmpty : t.localePreviewDirect}
    {!value.ready ? ' · ' + t.localePreviewRequired : ''}
    {value.sourceIncomplete ? ' · ' + t.localePreviewIncompleteSource : ''}
  </span>;
  const updateBlock = (blockId: string, field: 'heading' | 'body', value?: string) => {
    setBlocks(current => current.map(block => block.blockId === blockId ? { ...block, [field]: value } : block));
    onChange();
  };

  return <details>
    <summary>{t.localePreviewGerman}</summary>
    <p>{fallback ? t.localePreviewFallbackOn : t.localePreviewFallbackOff} {t.localePreviewTemporary}</p>
    <fieldset disabled={disabled}>
      <legend>{t.localePreviewGermanFields}</legend>
      {fields.map(field => <div key={field.name}>
        <label>{t[field.label]}<input lang="de" value={values[field.name] ?? ''}
          maxLength={field.max} onChange={event => { setValues({ ...values, [field.name]: event.target.value }); onChange(); }} /></label>
        <button disabled={values[field.name] === undefined}
          onClick={() => { setValues({ ...values, [field.name]: undefined }); onChange(); }}>{t.localePreviewClear}</button>
        {diagnostic(result?.fields[field.name])}
      </div>)}
      {blocks.map((block, index) => {
        const data = result?.blocks.find(entry => entry.blockId === block.blockId);
        return <fieldset key={block.blockId}>
          <legend>{t.text} {index + 1}</legend>
          <label>{t.heading}<input lang="de" value={block.heading ?? ''} maxLength={200}
            onChange={event => updateBlock(block.blockId, 'heading', event.target.value)} /></label>
          <button disabled={block.heading === undefined} onClick={() => updateBlock(block.blockId, 'heading')}>{t.localePreviewClear}</button>
          {diagnostic(data?.heading)}
          <label>{t.body}<textarea lang="de" value={block.body ?? ''} maxLength={10_000}
            onChange={event => updateBlock(block.blockId, 'body', event.target.value)} /></label>
          <button disabled={block.body === undefined} onClick={() => updateBlock(block.blockId, 'body')}>{t.localePreviewClear}</button>
          {diagnostic(data?.body)}
        </fieldset>;
      })}
      <button onClick={() => onPreview({ expectedVersion: document.version, ...values, blocks })}>{t.localePreviewCheck}</button>
    </fieldset>
    {result && <>
      <p role="status">{result.directReady ? t.localePreviewReady : t.localePreviewNotReady} {!result.defaultReady && t.localePreviewIncompleteSource}</p>
      <iframe title={t.localePreviewGerman} sandbox="" srcDoc={result.html} />
    </>}
  </details>;
}
