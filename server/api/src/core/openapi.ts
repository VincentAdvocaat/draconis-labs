import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export async function registerOpenApi(app: FastifyInstance) {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Draconis Labs API',
        description:
          'Versioned REST API for Draconis Labs. Prefer /api/v1 paths; unversioned /api paths are deprecated.',
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3001', description: 'Local development' }],
      tags: [
        { name: 'planner', description: 'Task planning and preferences' },
        { name: 'system', description: 'Platform metadata' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'Named API key (Bearer token). Required for task mutations.',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/v1/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  app.get('/api/v1/openapi.json', async (_request, reply) => {
    return reply.send(app.swagger());
  });
}
