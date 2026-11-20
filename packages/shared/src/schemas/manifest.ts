import { z } from 'zod';

const applicationUrlSchema = z.string().refine((value) => {
  if (!/^https?:\/\/[^/]/i.test(value) || /[\\\s]/.test(value)) return false;
  try {
    const url = new URL(value);
    return !url.username && !url.password;
  } catch {
    return false;
  }
}, 'Expected an absolute HTTP or HTTPS URL without credentials');

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
  launchUrl: applicationUrlSchema,
  iconUrl: applicationUrlSchema.optional(),
  healthUrl: applicationUrlSchema,
  permissions: z.array(z.string().trim().min(1).max(80)).max(32).default([]),
  environments: z
    .array(
      z.object({
        name: z.enum(['local', 'dev', 'test', 'staging', 'production']),
        baseUrl: applicationUrlSchema,
      }),
    )
    .min(1)
    .superRefine((environments, context) => {
      const names = new Set<string>();
      for (const [index, { name }] of environments.entries()) {
        if (names.has(name)) {
          context.addIssue({ code: 'custom', path: [index, 'name'], message: `Duplicate environment name: ${name}` });
        }
        names.add(name);
      }
    }),
});

export const applicationManifestsSchema = z.array(applicationManifestSchema).superRefine((manifests, context) => {
  const ids = new Set<string>();
  for (const [index, { id }] of manifests.entries()) {
    if (ids.has(id)) {
      context.addIssue({ code: 'custom', path: [index, 'id'], message: `Duplicate application ID: ${id}` });
    }
    ids.add(id);
  }
});

export type ApplicationManifest = z.infer<typeof applicationManifestSchema>;
