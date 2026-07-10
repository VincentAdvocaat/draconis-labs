import type { ApiModule } from '../../core/module.js';
import type { FastifyInstance } from 'fastify';

async function register{{ModuleName}}Routes(app: FastifyInstance) {
  app.get('/health', {
    schema: { tags: ['{{moduleName}}'], summary: '{{ModuleName}} module health' },
  }, async () => ({ module: '{{moduleName}}', status: 'ok' }));
}

export const {{moduleName}}Module: ApiModule = {
  name: '{{moduleName}}',
  prefix: '/{{moduleName}}',
  description: '{{ModuleName}} module',
  register: register{{ModuleName}}Routes,
};
