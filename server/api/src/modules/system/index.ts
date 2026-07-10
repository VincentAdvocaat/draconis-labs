import type { FastifyInstance } from 'fastify';
import type { ApiModule } from '../../core/module.js';
import { moduleCatalog } from '../../core/registry.js';

async function registerSystemRoutes(app: FastifyInstance) {
  app.get(
    '/info',
    {
      schema: {
        tags: ['system'],
        summary: 'API version and module catalog',
        response: {
          200: {
            type: 'object',
            properties: {
              apiVersion: { type: 'string' },
              service: { type: 'string' },
              modules: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    prefix: { type: 'string' },
                    description: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async () => ({
      apiVersion: 'v1',
      service: 'draconis-api',
      modules: moduleCatalog(),
    }),
  );
}

export const systemModule: ApiModule = {
  name: 'system',
  prefix: '/system',
  description: 'Platform metadata and discovery',
  register: registerSystemRoutes,
};
