import { registerApiModules } from './compose.js';
import { registerOpenApi } from './openapi.js';
import { plannerModule } from '../modules/planner/index.js';
import { systemModule } from '../modules/system/index.js';
import type { ApiModule } from './module.js';

export const apiModules: ApiModule[] = [plannerModule, systemModule];

export async function registerPlatformApi(app: Parameters<typeof registerApiModules>[0]) {
  await registerOpenApi(app);
  await registerApiModules(app, apiModules);
}

export async function buildApp() {
  const Fastify = (await import('fastify')).default;
  const app = Fastify({ logger: false });
  await registerPlatformApi(app);
  await app.ready();
  return app;
}
