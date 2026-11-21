import { z } from 'zod';
import type { DocumentContent, DocumentDto } from './documents.js';
import { CmsError } from './model.js';
import { documentSlugSchema } from './slugs.js';

const website = z.enum(['demo-cms', 'demo-other']);
const previewConfig = z.object({ locale: z.literal('de'), fallbackLocale: z.literal('nl').optional() }).strict();
export const localePreviewConfigSchema = z.partialRecord(website, previewConfig);
export type LocalePreviewConfig = z.infer<typeof previewConfig>;
export type LocalePreviewConfigs = z.infer<typeof localePreviewConfigSchema>;

const text = (limit: number) => z.string().max(limit).nullish();
export const localePreviewInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: text(200), slug: z.union([documentSlugSchema, z.literal('')]).nullish(),
  seoTitle: text(200), seoDescription: text(1000),
  blocks: z.array(z.object({ blockId: z.uuid(), heading: text(200), body: text(10_000) }).strict()).max(16),
}).strict();
type PreviewInput = z.infer<typeof localePreviewInputSchema>;

function field(value: string | null | undefined, source: string, fallback: boolean, required: boolean) {
  const direct = value !== null && value !== undefined;
  const fallbackValue = !direct && fallback ? source : undefined;
  const sourceLocale = direct ? 'de' : fallbackValue === undefined ? null : 'nl';
  return {
    value: direct ? value : fallbackValue ?? null,
    sourceLocale, fallback: sourceLocale === 'nl',
    explicitEmpty: direct && value === '',
    missing: !direct,
    ready: !required || direct && value.trim().length > 0,
    sourceIncomplete: required && source.trim().length === 0,
  };
}

export function createLocalePreview(source: DocumentDto, config: LocalePreviewConfig, input: PreviewInput) {
  if (source.version !== input.expectedVersion) throw new CmsError(409, 'Open de nieuwste paginaversie voor de taalpreview');
  if (source.pageId === 'home' || source.content.blocks.some(block => block.type !== 'text'))
    throw new CmsError(409, 'De Duitse proef ondersteunt gewone pagina’s met tekstblokken');
  const defaultBlocks = source.content.blocks.filter(block => block.type === 'text');
  const translations = new Map(input.blocks.map(block => [block.blockId, block]));
  if (translations.size !== input.blocks.length || input.blocks.some(block => !defaultBlocks.some(item => item.blockId === block.blockId)))
    throw new CmsError(400, 'Kies unieke tekstblokken uit deze opgeslagen pagina');
  const allowFallback = config.fallbackLocale === 'nl';
  const fields = {
    title: field(input.title, source.content.title, allowFallback, true),
    slug: field(input.slug, source.content.slug, false, true),
    seoTitle: field(input.seoTitle, source.content.seoTitle, allowFallback, true),
    seoDescription: field(input.seoDescription, source.content.seoDescription, allowFallback, false),
  };
  const blocks = defaultBlocks.map(block => {
    const translation = translations.get(block.blockId);
    return { blockId: block.blockId, heading: field(translation?.heading, block.heading, allowFallback, false),
      body: field(translation?.body, block.body, allowFallback, true) };
  });
  const directReady = Object.values(fields).every(item => item.ready) && blocks.every(item => item.body.ready);
  const defaultReady = !Object.values(fields).some(item => item.sourceIncomplete) &&
    !blocks.some(item => item.body.sourceIncomplete);
  const content: Omit<DocumentContent, 'locale'> & { locale: 'de' } = {
    schemaVersion: 1, locale: 'de', title: fields.title.value ?? '', slug: fields.slug.value ?? '',
    seoTitle: fields.seoTitle.value ?? '', seoDescription: fields.seoDescription.value ?? '',
    blocks: blocks.map(block => ({ blockId: block.blockId, type: 'text', heading: block.heading.value ?? '', body: block.body.value ?? '' })),
  };
  // The normal page preview can render incomplete input. The JSON reports which values
  // were borrowed and keeps those values separate from the submitted translation.
  return { content, diagnostics: { pageId: source.pageId, sourceVersion: source.version, defaultLocale: 'nl' as const,
    locale: config.locale, fallbackLocale: config.fallbackLocale ?? null, directReady, defaultReady, fields, blocks } };
}
