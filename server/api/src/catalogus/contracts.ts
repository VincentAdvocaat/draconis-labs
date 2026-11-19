import { z } from 'zod';
import { mediaReferenceSchema, type ReleaseManifest } from '../media-fixture/contracts.js';

export const itemInputSchema = z.object({
  itemId: z.string().uuid().optional(),
  expectedVersion: z.number().int().nonnegative(),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  categoryId: z.literal('algemeen'),
  metadata: z.object({ year: z.number().int().min(1900).max(2200).optional() }).strict(),
  media: mediaReferenceSchema,
}).strict();
export type ItemInput = z.infer<typeof itemInputSchema>;
export interface CatalogItem extends Omit<ItemInput, 'expectedVersion'> {
  itemId: string;
  revisionId: string;
  version: number;
}
export interface CatalogSnapshot {
  schemaVersion: 1;
  websiteId: string;
  collectionId: 'portfolio';
  snapshotId: string;
  checksum: string;
  items: Array<CatalogItem & { resolvedMedia: ReleaseManifest['references'][number] }>;
}
export interface CatalogRef { websiteId: string; collectionId: 'portfolio'; snapshotId: string }
