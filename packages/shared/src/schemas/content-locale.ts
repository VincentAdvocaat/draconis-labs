import { z } from 'zod';

// Editorial content locales. These do not select a user's UI language.
export const CONTENT_LOCALES = ['nl', 'en'] as const;
export const contentLocaleSchema = z.enum(CONTENT_LOCALES);
export type ContentLocale = z.infer<typeof contentLocaleSchema>;

export const contentLocaleContextSchema = z.object({
  defaultLocale: contentLocaleSchema,
  locale: contentLocaleSchema,
  fallbackLocale: contentLocaleSchema.optional(),
}).strict().superRefine((context, check) => {
  if (context.fallbackLocale === context.locale)
    check.addIssue({ code: 'custom', path: ['fallbackLocale'], message: 'Fallback must differ from the chosen locale' });
});
export type ContentLocaleContext = z.infer<typeof contentLocaleContextSchema>;

export const localizedTextValuesSchema = z.partialRecord(contentLocaleSchema, z.string().nullish());
export type LocalizedTextValues = z.infer<typeof localizedTextValuesSchema>;
export const contentFieldRuleSchema = z.object({ required: z.boolean(), allowFallback: z.boolean() }).strict();
export type ContentFieldRule = z.infer<typeof contentFieldRuleSchema>;

/** Agreed CMS/catalog policy v1, not a universal requirement for all text schemas. */
export const CONTENT_PUBLICATION_RULES_V1 = Object.freeze({
  title: Object.freeze({ required: true, allowFallback: false }),
  slug: Object.freeze({ required: true, allowFallback: false }),
  alt: Object.freeze({ required: true, allowFallback: false }),
  description: Object.freeze({ required: false, allowFallback: true }),
});

export interface ResolvedContentField {
  value: string | undefined;
  sourceLocale: ContentLocale | undefined;
  isFallback: boolean;
  missing: boolean;
  explicitEmpty: boolean;
}

/** Resolution is diagnostic only. It never materializes or stores a translation. */
export function resolveContentField(
  valuesInput: LocalizedTextValues,
  contextInput: ContentLocaleContext,
  options: { allowFallback: boolean },
): ResolvedContentField {
  const values = localizedTextValuesSchema.parse(valuesInput);
  const context = contentLocaleContextSchema.parse(contextInput);
  const direct = values[context.locale];
  if (typeof direct === 'string') return {
    value: direct, sourceLocale: context.locale, isFallback: false, missing: false, explicitEmpty: direct.length === 0,
  };
  if (options.allowFallback && context.fallbackLocale) {
    const fallback = values[context.fallbackLocale];
    if (typeof fallback === 'string') return {
      value: fallback, sourceLocale: context.fallbackLocale, isFallback: true, missing: false, explicitEmpty: fallback.length === 0,
    };
  }
  return { value: undefined, sourceLocale: undefined, isFallback: false, missing: true, explicitEmpty: false };
}

/** Validate with the publication field's schema rule, never a preview's looser display rule. */
export function validateContentField(
  values: LocalizedTextValues,
  context: ContentLocaleContext,
  ruleInput: ContentFieldRule,
): ResolvedContentField & { valid: boolean; issues: Array<'required' | 'required_direct'> } {
  const rule = contentFieldRuleSchema.parse(ruleInput);
  const resolved = resolveContentField(values, context, rule);
  const issues: Array<'required' | 'required_direct'> = [];
  if (rule.required && (!resolved.value || !resolved.value.trim()))
    issues.push(rule.allowFallback ? 'required' : 'required_direct');
  return { ...resolved, valid: issues.length === 0, issues };
}
