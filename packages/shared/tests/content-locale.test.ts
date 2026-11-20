import { describe, expect, it } from 'vitest';
import {
  CONTENT_PUBLICATION_RULES_V1, contentLocaleContextSchema, localizedTextValuesSchema,
  resolveContentField, validateContentField, type ContentLocaleContext,
} from '../src/index.js';

const en: ContentLocaleContext = { defaultLocale: 'nl', locale: 'en' };
const explicitFallback: ContentLocaleContext = { ...en, fallbackLocale: 'nl' };

describe('shared editorial content locale contract', () => {
  it('requires an explicit default and chosen locale, without inferring either', () => {
    expect(contentLocaleContextSchema.safeParse({ locale: 'en' }).success).toBe(false);
    expect(contentLocaleContextSchema.safeParse({ defaultLocale: 'nl' }).success).toBe(false);
    expect(contentLocaleContextSchema.safeParse({ ...en, locale: 'fr' }).success).toBe(false);
    expect(contentLocaleContextSchema.safeParse({ ...en, fallbackLocale: 'en' }).success).toBe(false);
  });

  it('does not infer fallback from defaultLocale alone', () => {
    const resolved = resolveContentField({ nl: 'Nederlands' }, en, { allowFallback: true });
    expect(resolved).toMatchObject({ missing: true, sourceLocale: undefined, isFallback: false });
  });

  it('requires both explicit fallback selection and a schema rule that permits it', () => {
    expect(resolveContentField({ nl: 'Nederlands' }, explicitFallback, { allowFallback: true }))
      .toMatchObject({ value: 'Nederlands', sourceLocale: 'nl', isFallback: true, missing: false });
    expect(resolveContentField({ nl: 'Nederlands' }, explicitFallback, { allowFallback: false }).missing).toBe(true);
  });

  it('prefers a direct value and never trims or overwrites it', () => {
    const values = Object.freeze({ nl: 'NL', en: '  EN  ' });
    const context = Object.freeze(explicitFallback);
    expect(resolveContentField(values, context, { allowFallback: true }))
      .toEqual({ value: '  EN  ', sourceLocale: 'en', isFallback: false, missing: false, explicitEmpty: false });
    expect(values.en).toBe('  EN  ');
  });

  it('keeps deliberate empty text distinct from missing/null without falling back', () => {
    expect(resolveContentField({ nl: 'NL', en: '' }, explicitFallback, { allowFallback: true }))
      .toEqual({ value: '', sourceLocale: 'en', isFallback: false, missing: false, explicitEmpty: true });
    for (const values of [{ nl: 'NL' }, { nl: 'NL', en: null }, { nl: 'NL', en: undefined }])
      expect(resolveContentField(values, explicitFallback, { allowFallback: true }))
        .toMatchObject({ value: 'NL', sourceLocale: 'nl', isFallback: true });
  });

  it('reports missing when the explicitly selected fallback is also unset', () => {
    expect(resolveContentField({ nl: null, en: null }, explicitFallback, { allowFallback: true }))
      .toMatchObject({ value: undefined, sourceLocale: undefined, isFallback: false, missing: true });
  });

  it.each(['title', 'slug', 'alt'] as const)('requires a direct nonempty %s under the agreed publication policy v1', field => {
    const rule = CONTENT_PUBLICATION_RULES_V1[field];
    for (const value of [undefined, null, '', '   ']) {
      const result = validateContentField({ nl: 'Een bestaande waarde', ...(value === undefined ? {} : { en: value }) }, explicitFallback, rule);
      expect(result.valid).toBe(false);
      expect(result.isFallback).toBe(false);
      expect(result.issues).toEqual(['required_direct']);
    }
    expect(validateContentField({ en: 'Directe waarde' }, en, rule).valid).toBe(true);
  });

  it('allows optional description to be missing, deliberately empty or explicitly resolved through fallback', () => {
    const rule = CONTENT_PUBLICATION_RULES_V1.description;
    expect(validateContentField({}, en, rule)).toMatchObject({ valid: true, missing: true });
    expect(validateContentField({ nl: 'NL', en: '' }, explicitFallback, rule))
      .toMatchObject({ valid: true, value: '', isFallback: false, explicitEmpty: true });
    expect(validateContentField({ nl: 'NL' }, explicitFallback, rule))
      .toMatchObject({ valid: true, value: 'NL', sourceLocale: 'nl', isFallback: true });
  });

  it('permits marked private diagnostics without making a required publication field valid', () => {
    const values = { nl: 'Privévoorbeeld uit NL' };
    expect(resolveContentField(values, explicitFallback, { allowFallback: true })).toMatchObject({ isFallback: true, sourceLocale: 'nl' });
    expect(validateContentField(values, explicitFallback, CONTENT_PUBLICATION_RULES_V1.title).valid).toBe(false);
  });

  it('keeps rules schema-driven rather than universally forbidding required fallback', () => {
    expect(validateContentField({ nl: 'Andere expliciete veldpolicy' }, explicitFallback, { required: true, allowFallback: true }))
      .toMatchObject({ valid: true, isFallback: true, sourceLocale: 'nl' });
  });

  it('rejects unsupported locale keys and non-text content without conversion', () => {
    expect(localizedTextValuesSchema.safeParse({ fr: 'Texte' }).success).toBe(false);
    expect(localizedTextValuesSchema.safeParse({ nl: 2026 }).success).toBe(false);
  });
});
