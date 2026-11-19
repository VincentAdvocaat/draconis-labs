import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ApiModule } from '../../core/module.js';
import { CmsError, draftSchema, releaseSchema } from './model.js';
import { CmsService } from './service.js';

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
      });
      app.get('/websites/:websiteId/pages/home', async (request) => service.repository.page(parameters(request).websiteId));
      app.put('/websites/:websiteId/pages/home/draft', async (request) => {
        const actor = authorize(request);
        if (typeof request.body === 'object' && request.body !== null && !('expectedVersion' in request.body)) {
          throw new CmsError(428, 'Verwachte conceptversie vereist');
        }
        const input = draftSchema.parse(request.body);
        return service.repository.save(parameters(request).websiteId, input.expectedVersion, input.values, actor.name);
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
