import {CmsContactTemplate,templateCsp,contactRouteFiles} from './contact-template.js';
import type {ContactBundle} from './contact-fixture/bundle.js';
import {CmsSharedNavigation} from './shared-navigation.js';
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
import { CmsError } from './model.js';
import { CmsUploads } from './upload.js';
import { UploadError } from '../../media-upload/processor.js';
import { CmsPortfolio } from './portfolio.js';
import { CmsDocuments } from './documents.js';

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
  enableUploads?: boolean;
  enablePages?: boolean;
  enablePortfolio?: boolean;
  enableSharedNavigation?: boolean;
  enableContactTemplate?:boolean;
  contactTemplateLoader?:()=>ContactBundle;
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
  let mediaUnavailable = false;
  let uploads: CmsUploads | undefined;
  let portfolio: CmsPortfolio | undefined;
  const app = Fastify({ logger: false, bodyLimit: 16_384, requestTimeout: 30_000, connectionTimeout: 10_000 });
  try {
    if (options.enableMedia) {
      try { media = new CmsMedia(root, options.mediaRoot); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        // Keep the existing pointer untouched. Public release copies have no media-store dependency.
        mediaUnavailable = true;
      }
    }
    repository = new CmsRepository(join(root, 'cms.db'), media, mediaUnavailable);
    if (options.enableUploads && media) { uploads = new CmsUploads(media); await uploads.recover(); }
    repository.reconcile();
    if (options.seed) repository.seed();
    if (options.enablePortfolio && media) portfolio = new CmsPortfolio(media, repository);
    const shared = options.enableSharedNavigation ? new CmsSharedNavigation(repository) : undefined;
    if(options.enableContactTemplate&&(!options.enablePages||!shared))throw new Error('Contacttemplate vereist paginas en gedeelde tekst');
    const contact=options.enableContactTemplate?new CmsContactTemplate(repository,shared!,options.contactTemplateLoader):undefined;
    const documents = options.enablePages ? new CmsDocuments(repository, media, uploads, portfolio, shared,contact) : undefined;
    const service = new CmsService(repository, join(root, 'releases'), options.hooks, media, mediaUnavailable, uploads, options.enableUploads, documents);
    app.addHook('onClose', async () => { portfolio?.close(); repository!.close(); uploads?.close(); media?.close(); unlock(); });
    app.addHook('onSend', async (_request, reply, payload) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Referrer-Policy', 'no-referrer');
      return payload;
    });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ZodError) return reply.code(400).send({ message: 'Ongeldige invoer', issues: error.issues });
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      return reply.code(status).send({ message: error instanceof CmsError ? error.message
        : status >= 500 ? 'Interne serverfout' : (error as Error).message,
        ...(error instanceof UploadError && error.assetId ? { assetId: error.assetId, fileVersion: 1 } : {}) });
    });
    const mod = cmsModule(service, credentials);
    await app.register(mod.register, { prefix: `/api/v1${mod.prefix}` });
    app.get('/sites/:websiteId/en/:filename', async (request, reply) => {
      const {websiteId, filename} = request.params as {websiteId: string; filename: string};
      reply.header('Cache-Control', 'no-store');
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
      if(contact&&contactRouteFiles.includes(filename as typeof contactRouteFiles[number]))reply.header('Content-Security-Policy',templateCsp);
      return reply.type('text/html; charset=utf-8').send(await service.publicHtml(websiteId, `en/${filename}`));
    });
    app.get('/sites/:websiteId/:filename', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      reply.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
      const { websiteId, filename } = request.params as { websiteId: string; filename: string };
      if(contact&&contactRouteFiles.includes(filename as typeof contactRouteFiles[number]))reply.header('Content-Security-Policy',templateCsp);
      return reply.type('text/html; charset=utf-8').send(await service.publicHtml(websiteId, filename));
    });
    if(contact)app.get('/contact-fixture-assets/:hash/:filename',async(request,reply)=>{
      const {hash,filename}=request.params as {hash:string;filename:string};
      return reply.type(filename.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8').send(contact.previewAsset(hash,filename));
    });
    app.get('/sites/:websiteId/template-assets/:releaseId/:filename',async(request,reply)=>{
      const {websiteId,releaseId,filename}=request.params as {websiteId:string;releaseId:string;filename:string};
      return reply.type(filename.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8').send(await service.publicTemplateAsset(websiteId,releaseId,filename));
    });
    app.get('/sites/:websiteId/media/:releaseId/:filename', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const { websiteId, releaseId, filename } = request.params as { websiteId: string; releaseId: string; filename: string };
      const bytes = await service.publicImage(websiteId, releaseId, filename);
      const mime = filename.endsWith('.png') ? 'image/png' : filename.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
      return reply.type(mime).send(bytes);
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
    return { app, repository, service, media, uploads, documents };
  } catch (error) {
    portfolio?.close();
    if (repository) repository.close();
    uploads?.close();
    media?.close();
    unlock();
    throw error;
  }
}
