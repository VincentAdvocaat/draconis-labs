import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { buildUploadApp } from '../media-upload/app.js';
import { CatalogService } from './service.js';
import { adminHtml, portfolioHtml } from './html.js';
import { catalogPublishSchema } from './contracts.js';

export async function buildCatalogApp(root: string, token: string) {
  const app = await buildUploadApp(root, token, {
    isPublicRead: path => path === '/catalogus' || path === '/catalogus/instance' || /^\/portfolio\/[^/]+\/[a-f0-9-]{36}(?:\/items\/[a-z0-9-]+|\/media\/[a-f0-9-]{36}\/\d+)?$/.test(path),
    allowedBrowserOrigin: () => {
      const address = app.server.address();
      return address && typeof address !== 'string' ? `http://127.0.0.1:${address.port}` : undefined;
    },
  });
  let catalog: CatalogService;
  try { catalog = new CatalogService(root); }
  catch (error) { await app.close(); throw error; }
  const instanceId = randomUUID();
  const version = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/portfolio/') || request.url.startsWith('/catalogus/api/') || request.url === '/catalogus/instance')
      reply.header('Cache-Control', 'no-store');
    return payload;
  });
  app.get('/catalogus', async (_request, reply) => reply.type('text/html; charset=utf-8').send(adminHtml));
  app.get('/catalogus/instance', async () => ({ module: 'catalogus', instanceId }));
  app.get<{ Params: { site: string } }>('/catalogus/api/:site', async request => catalog.list(request.params.site));
  app.get<{ Params: { site: string } }>('/catalogus/api/:site/assets', async request => catalog.assets(request.params.site));
  app.get<{ Params: { site: string }; Querystring: Record<string, string> }>('/catalogus/api/:site/library', async request => catalog.library(request.params.site, request.query));
  app.get<{ Params: { site: string; asset: string } }>('/catalogus/api/:site/library/:asset', async request => catalog.libraryDetail(request.params.site, request.params.asset));
  app.post<{ Params: { site: string } }>('/catalogus/api/:site/items', async request => catalog.save(request.params.site, request.body));
  app.put<{ Params: { site: string; asset: string } }>('/catalogus/api/:site/rights/:asset', async request => catalog.setRights(request.params.site, request.params.asset, request.body));
  app.delete<{ Params: { site: string; id: string } }>('/catalogus/api/:site/items/:id', async request => {
    catalog.archive(request.params.site, request.params.id, version.parse(request.body).expectedVersion);
    return { archived: true };
  });
  app.post<{ Params: { site: string } }>('/catalogus/api/:site/publish', async request => {
    const data = catalogPublishSchema.parse(request.body);
    return catalog.publish(request.params.site, data.expectedVersion, data);
  });
  app.get<{ Params: { site: string; id: string; locale: string }; Querystring: { fallbackLocale?: string } }>('/catalogus/api/:site/items/:id/locales/:locale', async request =>
    catalog.localeVariant(request.params.site, request.params.id, request.params.locale, request.query.fallbackLocale));
  app.put<{ Params: { site: string; id: string; locale: string } }>('/catalogus/api/:site/items/:id/locales/:locale', async request =>
    catalog.saveLocaleVariant(request.params.site, request.params.id, request.params.locale, request.body));
  app.get<{ Params: { site: string } }>('/catalogus/api/:site/snapshots', async request => catalog.listSnapshots(request.params.site));
  app.post<{ Params: { site: string; snapshot: string } }>('/catalogus/api/:site/snapshots/:snapshot/withdraw', async request =>
    catalog.withdraw(request.params.site, request.params.snapshot, request.body));
  app.get<{ Params: { site: string; id: string; fileVersion: string } }>('/catalogus/api/:site/preview/:id/:fileVersion', async (request, reply) => {
    const image = catalog.preview(request.params.site, request.params.id, Number(request.params.fileVersion));
    return reply.header('Cache-Control', 'no-store').type(image.mime).send(image.bytes);
  });
  app.get<{ Params: { site: string; snapshot: string } }>('/portfolio/:site/:snapshot', async (request, reply) =>
    reply.type('text/html; charset=utf-8').send(portfolioHtml(catalog.resolveSnapshot({ websiteId: request.params.site, collectionId: 'portfolio', snapshotId: request.params.snapshot }))));
  app.get<{ Params: { site: string; snapshot: string; slug: string } }>('/portfolio/:site/:snapshot/items/:slug', async (request, reply) => {
    const snapshot = catalog.resolveSnapshot({ websiteId: request.params.site, collectionId: 'portfolio', snapshotId: request.params.snapshot });
    if (!snapshot.items.some(i => i.slug === request.params.slug)) return reply.code(404).send({ message: 'Item not found in snapshot' });
    return reply.type('text/html; charset=utf-8').send(portfolioHtml(snapshot, request.params.slug));
  });
  app.get<{ Params: { site: string; snapshot: string; item: string; variant: string } }>('/portfolio/:site/:snapshot/media/:item/:variant', async (request, reply) => {
    const image = catalog.variant({ websiteId: request.params.site, collectionId: 'portfolio', snapshotId: request.params.snapshot }, request.params.item, Number(request.params.variant));
    return reply.type(image.mime).send(image.bytes);
  });
  app.addHook('onClose', async () => catalog.close());
  return app;
}
