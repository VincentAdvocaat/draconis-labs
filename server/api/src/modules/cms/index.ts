import {contactSaveSchema} from './contact-fields.js';
import {previewSelectionSchema} from './contact-template.js';
import {z} from 'zod';
import {sharedSaveSchema} from './shared-navigation.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ApiModule } from '../../core/module.js';
import { CmsError, draftSchema, releaseSchema } from './model.js';
import { CmsService } from './service.js';
import { MAX_BYTES } from '../../media-upload/processor.js';
import { rightsInputSchema } from '../../media-upload/rights.js';
import { localeSaveSchema } from './page-locales.js';
import { createDocumentSchema, documentLifecycleSchema, saveDocumentSchema } from './documents.js';

export interface LocalCredential {
  name: string;
  tokenHash: string;
  websiteIds: string[];
  role: 'editor' | 'publisher';
}
const parameters = (request: FastifyRequest) => request.params as { websiteId: string; revisionId?: string; releaseId?: string };

export function cmsModule(service: CmsService, credentials: LocalCredential[]): ApiModule {
  function authorize(request: FastifyRequest, publish = false): LocalCredential {
    const token = request.headers.authorization;
    if (!token?.startsWith('Bearer ') || token.length > 512) throw new CmsError(401, 'Geldig lokaal token vereist');
    const hash = createHash('sha256').update(token.slice(7)).digest();
    const actor = credentials.find((credential) => {
      const expected = Buffer.from(credential.tokenHash, 'hex');
      return expected.length === hash.length && timingSafeEqual(hash, expected);
    });
    if (!actor) throw new CmsError(401, 'Geldig lokaal token vereist');
    if (!actor.websiteIds.includes(parameters(request).websiteId)) throw new CmsError(404, 'Website niet gevonden');
    if (publish && actor.role !== 'publisher') throw new CmsError(403, 'Publicatierecht vereist');
    return actor;
  }

  return {
    name: 'cms', prefix: '/cms', description: 'Isolated local CMS fixture',
    register: async (app: FastifyInstance) => {
      // Authentication must run before validation/lookup, including malformed requests.
      app.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        authorize(request);
        const origin = request.headers.origin;
        if (origin !== undefined) {
          let url: URL;
          try { url = new URL(origin); } catch { throw new CmsError(403, 'Browser-origin niet toegestaan'); }
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' ||
              url.port !== String(request.raw.socket.localPort)) throw new CmsError(403, 'Browser-origin niet toegestaan');
        }
        if (request.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(String(request.headers['sec-fetch-site']))) {
          throw new CmsError(403, 'Browser-origin niet toegestaan');
        }
      });
      app.get('/websites/:websiteId/pages/home', async (request) => ({
        ...service.repository.page(parameters(request).websiteId), uploadEnabled: service.uploadEnabled, pagesEnabled: !!service.documents, sharedEnabled: !!service.documents?.shared, contactEnabled:!!service.documents?.contact,
      }));
      if (service.documents) {
        const documents = service.documents;
        if(documents.contact){
          const contact=documents.contact;
          app.get('/websites/:websiteId/contact-template',async(request)=>contact.plan(parameters(request).websiteId));
          app.put('/websites/:websiteId/contact-template',{bodyLimit:128_000},async(request)=>contact.save(parameters(request).websiteId,contactSaveSchema.parse(request.body),authorize(request).name));
          app.post('/websites/:websiteId/contact-template/previews',async(request)=>contact.preview(parameters(request).websiteId,previewSelectionSchema.parse(request.body)));
          app.get('/websites/:websiteId/contact-template/previews/:previewId',async(request,reply)=>{
            const result=contact.previewHtml(parameters(request).websiteId,(request.params as {previewId:string}).previewId);
            return reply.header('Content-Security-Policy',result.csp).type('text/html; charset=utf-8').send(result.html);
          });
        }
        if (documents.shared) {
          const shared = documents.shared;
          app.get('/websites/:websiteId/shared-navigation', async (request) => shared.get(parameters(request).websiteId));
          app.put('/websites/:websiteId/shared-navigation', {bodyLimit:128_000}, async (request) => {
            const actor = authorize(request);
            if (typeof request.body === 'object' && request.body !== null && !('expectedVersion' in request.body)) throw new CmsError(428,'Verwachte navigatieversie vereist');
            return shared.save(parameters(request).websiteId,sharedSaveSchema.parse(request.body),actor.name);
          });
          app.post('/websites/:websiteId/shared-navigation/previews', async (request,reply) => {
            const input = z.object({pageId:z.union([z.literal('home'),z.string().uuid()]),revisionId:z.string().uuid(),locale:z.enum(['nl','en']),
              sharedRevisionId:z.string().uuid(),sharedVersion:z.number().int().positive()}).strict().parse(request.body);
            reply.header('Content-Security-Policy', "default-src 'none'; img-src data:; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
            return reply.type('text/html; charset=utf-8').send(documents.previewShared(parameters(request).websiteId,input));
          });
        }
        app.get('/websites/:websiteId/portfolio-snapshots', async (request) => {
          if (!documents.portfolio) throw new CmsError(503, 'Catalogus niet beschikbaar');
          return documents.portfolio.selections(parameters(request).websiteId);
        });
        app.get('/websites/:websiteId/documents/:pageId/locales/en', async (request) => {
          const {websiteId, pageId} = request.params as {websiteId: string; pageId: string};
          return documents.locales.get(websiteId, pageId);
        });
        app.put('/websites/:websiteId/documents/:pageId/locales/en', {bodyLimit: 128_000}, async (request) => {
          const actor = authorize(request); const {websiteId, pageId} = request.params as {websiteId: string; pageId: string};
          return documents.locales.save(websiteId, pageId, localeSaveSchema.parse(request.body), actor.name);
        });
        app.get('/websites/:websiteId/documents/:pageId/locales/en/previews/:revisionId', async (request, reply) => {
          const {websiteId, pageId, revisionId} = request.params as {websiteId: string; pageId: string; revisionId: string};
          reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
          return reply.type('text/html; charset=utf-8').send(documents.previewEnglish(websiteId, pageId, revisionId));
        });
        app.get('/websites/:websiteId/site-plan', async (request) => documents.plan(parameters(request).websiteId));
        app.post('/websites/:websiteId/documents', async (request, reply) => {
          const actor = authorize(request);
          return reply.code(201).send(documents.create(parameters(request).websiteId, createDocumentSchema.parse(request.body), actor.name));
        });
        app.get('/websites/:websiteId/documents/:pageId', async (request) => {
          const { websiteId, pageId } = request.params as { websiteId: string; pageId: string };
          return documents.get(websiteId, pageId);
        });
        app.put('/websites/:websiteId/documents/:pageId/draft', { bodyLimit: 128_000 }, async (request) => {
          const actor = authorize(request);
          if (typeof request.body === 'object' && request.body !== null && !('expectedVersion' in request.body)) throw new CmsError(428, 'Verwachte paginaversie vereist');
          const { websiteId, pageId } = request.params as { websiteId: string; pageId: string };
          return documents.save(websiteId, pageId, saveDocumentSchema.parse(request.body), actor.name);
        });
        app.put('/websites/:websiteId/documents/:pageId/archive', async (request) => {
          const { websiteId, pageId } = request.params as { websiteId: string; pageId: string };
          return documents.setArchived(websiteId, pageId, documentLifecycleSchema.parse(request.body));
        });
        app.get('/websites/:websiteId/documents/:pageId/previews/:revisionId', async (request, reply) => {
          const { websiteId, pageId, revisionId } = request.params as { websiteId: string; pageId: string; revisionId: string };
          reply.header('Content-Security-Policy', "default-src 'none'; img-src data:; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
          return reply.type('text/html; charset=utf-8').send(documents.preview(websiteId, pageId, revisionId));
        });
      }
      if (service.uploadEnabled) {
        const admitted = new Set<string>();
        const release = (request: FastifyRequest) => { admitted.delete(request.id); };
        const uploads = () => {
          if (!service.uploads) throw new CmsError(503, 'Mediaopslag niet beschikbaar. Herstel de mediamap en herstart de proef.');
          return service.uploads;
        };
        app.addContentTypeParser(/^image\/(jpeg|png|webp)$/, { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (_request, bytes, done) => done(null, bytes));
        app.addHook('onRequestAbort', async (request) => release(request));
        app.addHook('onTimeout', async (request) => release(request));
        app.post('/websites/:websiteId/media', {
          bodyLimit: MAX_BYTES,
          onRequest: async (request) => {
            uploads();
            if (admitted.size) throw new CmsError(429, 'Eén upload tegelijk. Probeer opnieuw na afronding.');
            admitted.add(request.id);
          },
          onResponse: async (request) => release(request), onError: async (request) => release(request),
        }, async (request, reply) => {
          if (!Buffer.isBuffer(request.body)) throw new CmsError(415, 'Stuur een PNG-, JPEG- of WebP-bestand');
          const header = request.headers['x-media-filename'];
          if (typeof header !== 'string') throw new CmsError(400, 'Bestandsnaam ontbreekt');
          let filename: string;
          try { filename = decodeURIComponent(header); } catch { throw new CmsError(400, 'Ongeldige bestandsnaam'); }
          return reply.code(201).send(await uploads().upload(parameters(request).websiteId, request.body, filename, request.headers['content-type'] ?? ''));
        });
        app.get('/websites/:websiteId/media/:assetId', async (request) => {
          const { websiteId, assetId } = request.params as { websiteId: string; assetId: string };
          return uploads().status(websiteId, assetId);
        });
        app.post('/websites/:websiteId/media/:assetId/retry', { bodyLimit: 1024 }, async (request) => {
          const { websiteId, assetId } = request.params as { websiteId: string; assetId: string };
          return uploads().retry(websiteId, assetId);
        });
        app.get('/websites/:websiteId/media/:assetId/rights', async (request) => {
          const { websiteId, assetId } = request.params as { websiteId: string; assetId: string };
          return uploads().metadata(websiteId, assetId);
        });
        app.put('/websites/:websiteId/media/:assetId/rights', async (request) => {
          const actor = authorize(request, true);
          const { websiteId, assetId } = request.params as { websiteId: string; assetId: string };
          const decision = rightsInputSchema.omit({ employee: true }).parse(request.body);
          return uploads().setRights(websiteId, assetId, { ...decision, employee: actor.name });
        });
      }
      app.put('/websites/:websiteId/pages/home/draft', async (request) => {
        const actor = authorize(request);
        if (typeof request.body === 'object' && request.body !== null && !('expectedVersion' in request.body)) {
          throw new CmsError(428, 'Verwachte conceptversie vereist');
        }
        const input = draftSchema.parse(request.body);
        return { ...service.repository.save(parameters(request).websiteId, input.expectedVersion, input.values, actor.name),
          uploadEnabled: service.uploadEnabled, pagesEnabled: !!service.documents, sharedEnabled: !!service.documents?.shared };
      });
      app.get('/websites/:websiteId/previews/:revisionId', async (request, reply) => {
        const { websiteId, revisionId } = parameters(request);
        reply.header('Content-Security-Policy', "default-src 'none'; img-src data:; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");
        return reply.type('text/html; charset=utf-8').send(service.preview(websiteId, revisionId!));
      });
      app.post('/websites/:websiteId/releases', async (request, reply) => {
        const actor = authorize(request, true);
        const input = releaseSchema.parse(request.body);
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{8,100}$/.test(key)) throw new CmsError(400, 'Geldige publicatiesleutel vereist');
        const attempt = await service.publish(parameters(request).websiteId, input, key, actor.name);
        return reply.code(attempt.status === 'conflict' ? 409 : attempt.status === 'failed' ? 422 : attempt.status === 'building' ? 202 : 200).send(attempt);
      });
      app.get('/websites/:websiteId/releases/:releaseId', async (request) => {
        const { websiteId, releaseId } = parameters(request);
        return service.repository.attempt(websiteId, releaseId!);
      });
    },
  };
}
