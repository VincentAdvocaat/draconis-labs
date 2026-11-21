import { createServer, type Server, type RequestListener } from 'node:http';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalCatalog, loadManifests } from '../server/catalog.js';
import { catalogPath } from '../src/catalog.js';

const defaultOrigin = 'http://127.0.0.1:5000';
const sample = {
  id: 'sample',
  name: 'Sample app',
  description: 'Example app.',
  version: '0.1.0',
  owner: 'platform-team',
  launchUrl: defaultOrigin + '/app?mode=fixture#top',
  healthUrl: defaultOrigin + '/health',
  permissions: ['sample.read', 'sample.write'],
  environments: [{ name: 'local' as const, baseUrl: defaultOrigin }],
};

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  )));
});

async function startServer(handler: RequestListener) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

describe('local app catalog', () => {
  it('loads the actual web app registrations', async () => {
    expect(await loadManifests()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'planner' }),
      expect.objectContaining({ id: 'cms' }),
    ]));
  });

  it('rejects duplicate manifest IDs when reading entries from disk', async () => {
    const root = await mkdtemp(join(tmpdir(), 'draconis-app-catalog-'));
    try {
      for (const name of ['one', 'two']) {
        await mkdir(join(root, name));
        await writeFile(join(root, name, 'manifest.json'), JSON.stringify(sample));
      }
      await expect(loadManifests(root)).rejects.toThrow('Duplicate application ID: sample');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('returns only local apps with every required permission and never probes hidden apps', async () => {
    const requests: string[] = [];
    const target = await startServer((request, response) => {
      requests.push(request.url ?? '');
      response.writeHead(204).end();
    });

    const list = createLocalCatalog([
      { ...sample, launchUrl: target, healthUrl: target + '/hidden' },
      { ...sample, id: 'public', launchUrl: target, healthUrl: target + '/public', permissions: [] },
      { ...sample, id: 'cloud', launchUrl: target, healthUrl: target + '/cloud', permissions: [], environments: [
        { name: 'production', baseUrl: 'https://example.org/' },
      ] },
    ], { DRACONIS_HOME_PERMISSIONS: 'sample.read' });

    expect(await list()).toEqual([{
      id: 'public', name: sample.name, description: sample.description, owner: sample.owner,
      launchUrl: target + '/', status: 'reachable',
    }]);
    expect(requests).toEqual(['/public']);
  });

  it('preserves the path, query and hash on a launch override and checks the configured health port', async () => {
    const requests: string[] = [];
    const target = await startServer((request, response) => {
      requests.push(request.url ?? '');
      response.writeHead(204).end();
    });

    const list = createLocalCatalog([sample], {
      DRACONIS_HOME_PERMISSIONS: 'sample.read, sample.write',
      DRACONIS_HOME_ORIGINS: JSON.stringify({ sample: { launch: target, health: target } }),
    });
    expect(await list()).toEqual([{
      id: sample.id, name: sample.name, description: sample.description, owner: sample.owner,
      launchUrl: target + '/app?mode=fixture#top', status: 'reachable',
    }]);
    expect(requests).toEqual(['/health']);
  });

  it('reports a redirect or a stalled check as unreachable', async () => {
    const requests: string[] = [];
    const target = await startServer((request, response) => {
      requests.push(request.url ?? '');
      if (request.url === '/redirect') response.writeHead(302, { Location: '/other' }).end();
    });
    const list = createLocalCatalog([
      { ...sample, id: 'redirect', healthUrl: target + '/redirect', permissions: [] },
      { ...sample, id: 'stall', healthUrl: target + '/stall', permissions: [] },
    ], {});

    expect((await list()).map(({ status }) => status)).toEqual(['unreachable', 'unreachable']);
    expect(requests.sort()).toEqual(['/redirect', '/stall']);
  });

  it('rejects overrides for unknown apps and origins outside the local fixture', () => {
    expect(() => createLocalCatalog([sample], {
      DRACONIS_HOME_ORIGINS: '{"missing": {"health": "http://127.0.0.1:4321"}}',
    })).toThrow('Unknown app origin override: missing');
    expect(() => createLocalCatalog([sample], {
      DRACONIS_HOME_ORIGINS: '{"sample": {"health": "https://example.org"}}',
    })).toThrow('Expected a loopback HTTP(S) origin');
  });

  it('serves filtered JSON from the normal local development entry point', async () => {
    const target = await startServer((_request, response) => response.writeHead(204).end());
    vi.stubEnv('DRACONIS_HOME_PERMISSIONS', '');
    vi.stubEnv('DRACONIS_HOME_ORIGINS', JSON.stringify({
      planner: { launch: target, health: target },
      cms: { launch: target, health: target },
    }));
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: fileURLToPath(new URL('../', import.meta.url)),
      server: { port: 0, ws: false },
    });
    try {
      await vite.listen();
      const address = vite.httpServer?.address();
      if (!address || typeof address === 'string') throw new Error('Expected a local Vite port');
      const endpoint = `http://127.0.0.1:${address.port}${catalogPath}`;
      const response = await fetch(endpoint);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ apps: [expect.objectContaining({
        id: 'planner', launchUrl: target + '/', status: 'reachable',
      })] });
      const post = await fetch(endpoint, { method: 'POST' });
      expect(post.status).toBe(405);
      expect(post.headers.get('allow')).toBe('GET');
    } finally {
      await vite.close();
    }
  }, 10_000);
});
