import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { applicationManifestsSchema, type ApplicationManifest } from '@draconis/shared/manifest';
import { z } from 'zod';
import type { CatalogApp } from '../src/catalog.js';

function isLoopbackUrl(url: URL) {
  return (url.protocol === 'http:' || url.protocol === 'https:')
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    && !url.username && !url.password;
}

const originSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return isLoopbackUrl(url) && (value === url.origin || value === url.origin + '/');
  } catch {
    return false;
  }
}, 'Expected a loopback HTTP(S) origin, without path, query or fragment');

const originsSchema = z.record(z.string(), z.strictObject({
  launch: originSchema.optional(),
  health: originSchema.optional(),
}));

function withOrigin(value: string, origin?: string) {
  const url = new URL(value);
  if (origin) {
    const target = new URL(origin);
    url.protocol = target.protocol;
    url.hostname = target.hostname;
    url.port = target.port;
  }
  return url;
}

export async function loadManifests(appsDirectory = fileURLToPath(new URL('../../', import.meta.url))) {
  const directories = await readdir(appsDirectory, { withFileTypes: true });
  const registrations: unknown[] = [];
  for (const directory of directories.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(appsDirectory, directory.name, 'manifest.json');
    try {
      registrations.push(JSON.parse(await readFile(file, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Could not read app registration ${file}`, { cause: error });
      }
    }
  }
  return applicationManifestsSchema.parse(registrations);
}

export function createLocalCatalog(
  manifests: ApplicationManifest[],
  env: { DRACONIS_HOME_PERMISSIONS?: string; DRACONIS_HOME_ORIGINS?: string },
) {
  const permissions = new Set(env.DRACONIS_HOME_PERMISSIONS?.split(',').map((value) => value.trim()));
  const origins = originsSchema.parse(JSON.parse(env.DRACONIS_HOME_ORIGINS ?? '{}'));
  for (const id of Object.keys(origins)) {
    if (!manifests.some((manifest) => manifest.id === id)) throw new Error(`Unknown app origin override: ${id}`);
  }

  const visible = manifests.flatMap(({ id, name, description, owner, launchUrl, healthUrl, environments, permissions: required }) => {
    const local = environments.find((environment) => environment.name === 'local');
    if (!local || !isLoopbackUrl(new URL(local.baseUrl)) || !required.every((permission) => permissions.has(permission))) {
      return [];
    }

    const launch = withOrigin(launchUrl, origins[id]?.launch);
    const health = withOrigin(healthUrl, origins[id]?.health);
    if (!isLoopbackUrl(launch) || !isLoopbackUrl(health)) return [];

    return [{ id, name, description, owner, launchUrl: launch.href, health }];
  });

  return async (): Promise<CatalogApp[]> => Promise.all(visible.map(async ({ health, ...app }) => ({
    ...app,
    status: await checkHealth(health),
  })));
}

async function checkHealth(url: URL): Promise<CatalogApp['status']> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(750), redirect: 'manual' });
    await response.body?.cancel();
    return response.ok ? 'reachable' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}
