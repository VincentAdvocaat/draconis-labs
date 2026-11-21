import react from '@vitejs/plugin-react';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { createLocalCatalog, loadManifests } from './server/catalog.js';
import { bundleBudget } from './server/bundle-budget.js';
import { catalogPath } from './src/catalog.js';

const loopback = { host: '127.0.0.1', port: 5182, strictPort: true, cors: false } as const;

function localCatalog(): Plugin {
  async function register(middlewares: Connect.Server, host: string | boolean | undefined) {
    if (host !== loopback.host) throw new Error('The local app catalog requires host 127.0.0.1.');
    const listApps = createLocalCatalog(await loadManifests(), process.env);
    middlewares.use(async (request, response, next) => {
      if (request.url?.split('?')[0] !== catalogPath) return next();

      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(request.headers.host ?? '')) {
        response.statusCode = 403;
        response.end(JSON.stringify({ error: 'Loopback host required' }));
        return;
      }
      if (request.method !== 'GET') {
        response.statusCode = 405;
        response.setHeader('Allow', 'GET');
        response.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }
      try {
        response.end(JSON.stringify({ apps: await listApps() }));
      } catch (error) {
        next(error);
      }
    });
  }

  return {
    name: 'draconis-local-catalog',
    configureServer: (server) => register(server.middlewares, server.config.server.host),
    configurePreviewServer: (server) => register(server.middlewares, server.config.preview.host),
  };
}

export default defineConfig({
  plugins: [react(), localCatalog(), bundleBudget()],
  server: loopback,
  preview: loopback,
});
