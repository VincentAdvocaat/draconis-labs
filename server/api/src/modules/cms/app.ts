import Fastify from 'fastify';
import { ZodError } from 'zod';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { cmsModule } from './index.js';
import { CmsRepository } from './repository.js';
import { CmsService, type BuildHooks } from './service.js';
import { CmsMedia } from './media.js';

const credentialSchema = z.array(z.object({
  name: z.string().min(1).max(80),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  websiteIds: z.array(z.enum(['demo-cms', 'demo-other'])).min(1),
  role: z.enum(['editor', 'publisher']),
}).strict()).min(1);

export interface CmsAppOptions {
  runtimeRoot: string;
  credentials: unknown;
  seed?: boolean;
  uiRoot?: string;
  hooks?: BuildHooks;
  enableMedia?: boolean;
  mediaRoot?: string;
}

function lockRuntime(root: string): () => void {
  mkdirSync(root, { recursive: true });
  const lock = join(root, 'runtime.lock');
  try {
    const pid = Number(readFileSync(lock, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Ongeldig runtime-lockbestand; controleer de lokale runtime');
    try { process.kill(pid, 0); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      unlinkSync(lock);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  // A second live process must not mark another process's in-flight builds interrupted.
  writeFileSync(lock, String(process.pid), { flag: 'wx' });
  return () => unlinkSync(lock);
}

export async function buildCmsApp(options: CmsAppOptions) {
  const credentials = credentialSchema.parse(options.credentials);
  if (new Set(credentials.map((c) => c.tokenHash)).size !== credentials.length) throw new Error('Tokenhashes moeten uniek zijn');
  const root = resolve(options.runtimeRoot);
  const unlock = lockRuntime(root);
  let repository: CmsRepository | undefined;
  let media: CmsMedia | undefined;
  const app = Fastify({ logger: false, bodyLimit: 16_384 });
  try {
    if (options.enableMedia) media = new CmsMedia(root, options.mediaRoot);
    repository = new CmsRepository(join(root, 'cms.db'), media);
    repository.reconcile();
    if (options.seed) repository.seed();
    const service = new CmsService(repository, join(root, 'releases'), options.hooks, media);
    app.addHook('onClose', async () => { repository!.close(); media?.close(); unlock(); });
    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Referrer-Policy', 'no-referrer');
      return payload;
    });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ZodError) return reply.code(400).send({ message: 'Ongeldige invoer', issues: error.issues });
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return reply.code(status).send({ message: status >= 500 ? 'Interne serverfout' : (error as Error).message });
    });
    const mod = cmsModule(service, credentials);
    await app.register(mod.register, { prefix: `/api/v1${mod.prefix}` });
    app.get('/sites/:websiteId/index.html', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
      return reply.type('text/html; charset=utf-8').send(await service.publicHtml((request.params as { websiteId: string }).websiteId));
    });
    app.get('/sites/:websiteId/media/hero.png', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return reply.type('image/png').send(await service.publicBytes((request.params as { websiteId: string }).websiteId, 'media/hero.png'));
    });
    if (options.uiRoot) {
      const uiRoot = resolve(options.uiRoot);
      app.get('/', async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
        reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; frame-src 'self' about:; object-src 'none'; base-uri 'none'; form-action 'self'");
        return reply.type('text/html; charset=utf-8').send(await readFile(join(uiRoot, 'index.html')));
      });
      app.get('/assets/:file', async (request, reply) => {
        const file = (request.params as { file: string }).file;
        if (!/^[\w.-]+\.(js|css)$/.test(file)) return reply.code(404).send();
        try { return reply.type(file.endsWith('.js') ? 'text/javascript' : 'text/css').send(await readFile(join(uiRoot, 'assets', file))); }
        catch { return reply.code(404).send(); }
      });
    }
    await app.ready();
    return { app, repository, service, media };
  } catch (error) {
    if (repository) repository.close();
    media?.close();
    unlock();
    throw error;
  }
}
