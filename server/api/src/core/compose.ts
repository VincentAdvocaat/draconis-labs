import type { FastifyInstance } from 'fastify';
import { addLegacyDeprecationHeaders } from './deprecation.js';
import type { ApiModule } from './module.js';

export async function registerApiModules(
  app: FastifyInstance,
  modules: ApiModule[],
): Promise<void> {
  await app.register(
    async (v1) => {
      for (const mod of modules) {
        await v1.register(mod.register, { prefix: mod.prefix });
      }
    },
    { prefix: '/api/v1' },
  );

  await app.register(
    async (legacy) => {
      legacy.addHook('onSend', addLegacyDeprecationHeaders);
      for (const mod of modules) {
        await legacy.register(mod.register, { prefix: mod.prefix });
      }
    },
    { prefix: '/api' },
  );
}
