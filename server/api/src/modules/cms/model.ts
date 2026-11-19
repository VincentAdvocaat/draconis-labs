import { z } from 'zod';
import { mediaReferenceSchema } from '../../media-fixture/contracts.js';

export const valuesSchema = z.object({
  title: z.string().max(200),
  intro: z.string().max(4000),
  image: mediaReferenceSchema.extend({ usage: z.literal('hero') }).nullable().optional(),
}).strict();
export const draftSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  values: valuesSchema,
}).strict();
export const releaseSchema = z.object({
  revisionId: z.string().uuid(),
  expectedActiveVersion: z.number().int().nonnegative(),
}).strict();
export type Values = z.infer<typeof valuesSchema>;
export type ReleaseInput = z.infer<typeof releaseSchema>;
export type AttemptStatus = 'building' | 'published' | 'failed' | 'conflict';
export interface Page {
  revisionId: string;
  pageVersion: number;
  values: Values;
  activeReleaseId: string | null;
  activeVersion: number;
}
export interface Attempt {
  releaseId: string;
  websiteId: string;
  revisionId: string;
  expectedActiveVersion: number;
  status: AttemptStatus;
  errorCode: string | null;
  publicUrl: string | null;
}
export class CmsError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export function encode(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]!);
}

export function render(values: Values, image?: { src: string; alt: string }): string {
  return '<!doctype html><html lang="nl"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${encode(values.title)}</title></head><body>` +
    `<main><h1>${encode(values.title)}</h1><p>${encode(values.intro)}</p>` +
    (image ? `<img src="${encode(image.src)}" alt="${encode(image.alt)}" width="160" height="160">` : '') +
    '</main></body></html>';
}
