import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { LocalUploadService } from './service.js';
import { MAX_BYTES, UploadError } from './processor.js';

export async function buildUploadApp(root: string, token: string) {
  if (token.length < 32) throw new Error('Explicit fixture bearer token of at least 32 characters required');
  const service = new LocalUploadService(root);
  await service.recover();
  const app = Fastify({ bodyLimit: MAX_BYTES, requestTimeout: 30_000, connectionTimeout: 10_000, logger: false });
  let activeUpload = false;
  const admitted = new Set<string>();
  app.addHook('onRequest', async (request, reply) => {
    // This CLI-only probe accepts no browser origins or ambient cookie authentication.
    if (request.headers.origin !== undefined ||
      (request.headers['sec-fetch-site'] !== undefined && request.headers['sec-fetch-site'] !== 'none'))
      return reply.code(403).send({ message: 'Browser-origin requests are not allowed in this probe' });
    const supplied = Buffer.from(request.headers.authorization ?? '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      return reply.code(401).send({ message: 'Fixture bearer token required' });
    const website = (request.params as { website?: string }).website;
    if (website) service.authorizeWebsite(website);
  });
  app.addContentTypeParser(/^image\/(jpeg|png|webp)$/, { parseAs: 'buffer', bodyLimit: MAX_BYTES }, (_request, bytes, done) => done(null, bytes));
  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof UploadError ? error.statusCode : (error as { statusCode?: number }).statusCode ?? 500;
    reply.code(status >= 400 && status <= 599 ? status : 500).send({ message: status >= 500 ? 'Local upload failed' : (error as Error).message });
  });
  app.post<{ Params: { website: string } }>('/websites/:website/media', {
    bodyLimit: MAX_BYTES,
    onRequest: async (_request, reply) => {
      if (activeUpload) return reply.code(429).send({ message: 'One local upload at a time; retry after completion' });
      activeUpload = true;
      admitted.add(_request.id);
    },
    onResponse: async (request) => { if (admitted.delete(request.id)) activeUpload = false; },
    onError: async (request) => { if (admitted.delete(request.id)) activeUpload = false; },
  }, async (request, reply) => {
    if (!Buffer.isBuffer(request.body)) throw new UploadError(415, 'Send a raw JPEG, PNG or WebP body');
    const filename = request.headers['x-media-filename'];
    if (typeof filename !== 'string') throw new UploadError(400, 'x-media-filename is required');
    const result = await service.upload(request.params.website, request.body, filename, request.headers['content-type'] ?? '');
    return reply.code(201).send(result);
  });
  app.get<{ Params: { website: string; id: string } }>('/websites/:website/media/:id', async request =>
    service.status(request.params.website, request.params.id));
  app.addHook('onRequestAbort', async request => { if (admitted.delete(request.id)) activeUpload = false; });
  app.addHook('onTimeout', async request => { if (admitted.delete(request.id)) activeUpload = false; });
  app.addHook('onClose', async () => { service.close(); });
  return app;
}
