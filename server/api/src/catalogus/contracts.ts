import { z } from 'zod';
import { contentLocaleSchema, type ContentLocaleContext, type ContentLocale, type ResolvedContentField } from '@draconis/shared';
import { mediaReferenceSchema, type ReleaseManifest } from '../media-fixture/contracts.js';

export const itemInputSchema = z.object({
  itemId: z.string().uuid().optional(),
  expectedVersion: z.number().int().nonnegative(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  categoryId: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/),
  metadata: z.object({ year: z.number().int().min(1900).max(2200).optional() }).strict(),
  publicPhotoCredit: z.string().trim().max(200).nullable().optional(),
  media: mediaReferenceSchema,
}).strict();
export const galleryPhotoSchema = mediaReferenceSchema.extend({
  usage: z.string().regex(/^gallery-[a-f0-9-]{36}$/),
  altText: z.object({ nl: z.string().max(2000).optional(), en: z.string().max(2000).optional() }).strict(),
  publicPhotoCredit: z.string().trim().max(200).optional(),
});
export const galleryInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  gallery: z.array(galleryPhotoSchema).max(4),
  coverUsage: galleryPhotoSchema.shape.usage.optional(),
}).strict();
export type GalleryPhoto = z.infer<typeof galleryPhotoSchema>;
export type ItemInput = z.infer<typeof itemInputSchema>;
export interface CatalogItem extends Omit<ItemInput, 'expectedVersion' | 'publicPhotoCredit'> {
  itemId: string;
  revisionId: string;
  version: number;
  publicPhotoCredit?: string;
  gallery?: GalleryPhoto[];
}
export interface CatalogSnapshot {
  schemaVersion: 1 | 2 | 3 | 4;
  websiteId: string;
  collectionId: 'portfolio';
  snapshotId: string;
  checksum: string;
  localeContext?: ContentLocaleContext;
  categories?: Array<{ categoryId: string; name: string; sourceLocale: ContentLocale; isFallback: boolean }>;
  items: Array<CatalogItem & { resolvedGallery?: ReleaseManifest['references']; resolvedMedia: ReleaseManifest['references'][number];
    localeValues?: Partial<Record<ContentLocale, CatalogLocaleFields>>;
    fieldSources?: Record<keyof CatalogLocaleFields, ResolvedContentField> }>;
}
export function catalogMedia(item: CatalogItem) {
  return [item.media, ...(item.gallery ?? []).map(({ publicPhotoCredit: _credit, ...reference }) => reference)];
}
export interface CatalogLocaleFields { title: string | null; slug: string | null; description: string | null; alt: string | null }
export const localeVariantInputSchema = z.object({
  expectedVersion: z.number().int().positive(),
  title: z.string().max(200).nullish(),
  slug: z.union([z.literal(''), itemInputSchema.shape.slug]).nullish(),
  description: z.string().max(5000).nullish(),
  alt: z.string().max(2000).nullish(),
}).strict();
export const catalogPublishSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  locale: contentLocaleSchema.optional(), fallbackLocale: contentLocaleSchema.optional(),
}).strict();
export interface CatalogRef { websiteId: string; collectionId: 'portfolio'; snapshotId: string }
export const withdrawalSchema = z.object({
  expectedVersion: z.number().int().positive(),
  employee: z.string().trim().min(2).max(200),
  reason: z.string().trim().min(5).max(2000),
  confirmed: z.literal(true),
}).strict();
