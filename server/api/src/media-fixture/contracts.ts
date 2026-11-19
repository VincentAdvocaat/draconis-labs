import { z } from 'zod';

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const mediaReferenceSchema = z.object({
  assetId: id,
  fileVersion: z.number().int().positive(),
  usage: id,
  altText: z.record(z.string().min(2).max(20), z.string().max(2000)),
  decorative: z.boolean(),
}).strict();
export const saveReferencesSchema = z.object({
  module: id,
  ownerId: id,
  revisionId: id,
  expectedVersion: z.number().int().nonnegative(),
  references: z.array(mediaReferenceSchema).max(100),
}).strict();
export const resolveReleaseSchema = z.object({
  releaseId: id,
  revisionId: id,
  locales: z.array(z.string().min(2).max(20)).min(1).max(20),
}).strict();
export type MediaReference = z.infer<typeof mediaReferenceSchema>;
export type SaveReferences = z.infer<typeof saveReferencesSchema>;
export type ResolveRelease = z.infer<typeof resolveReleaseSchema>;
export type AssetState = 'ready' | 'processing' | 'failed';
export type Rights = 'cleared' | 'unknown' | 'blocked';

export interface PublicVariant {
  path: string;
  mime: 'image/png';
  bytes: number;
  width: number;
  height: number;
  checksum: string;
}
export interface ReleaseManifest {
  schemaVersion: 1;
  websiteId: string;
  releaseId: string;
  revisionId: string;
  locales: string[];
  references: Array<MediaReference & { variants: PublicVariant[] }>;
}

export class MediaContractError extends Error {
  constructor(public readonly statusCode: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = 'MediaContractError';
  }
}
