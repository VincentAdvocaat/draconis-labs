import { z } from 'zod';

export const applicationManifestSchema = z.object({
  id: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  version: z.string().trim().min(1).max(32),
  owner: z.string().trim().min(1).max(120),
  launchUrl: z.string().url(),
  iconUrl: z.string().url().optional(),
  permissions: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  environments: z
    .array(
      z.object({
        name: z.enum(['local', 'dev', 'test', 'staging', 'production']),
        baseUrl: z.string().url(),
      }),
    )
    .min(1),
});

export type ApplicationManifest = z.infer<typeof applicationManifestSchema>;
