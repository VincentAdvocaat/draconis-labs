import { randomUUID } from 'node:crypto';
import { registerApiModules } from './compose.js';
import { registerOpenApi } from './openapi.js';
import { plannerModule, plannerWorkspaceModule, protectedPlannerWorkspaceModule } from '../modules/planner/index.js';
import { systemModule } from '../modules/system/index.js';
import { bookingModule } from '../modules/bookings/index.js';
import type { ApiModule } from './module.js';
import type { AuthorizePlanner } from './local-identity.js';
import type { AuditClient } from './planner-audit.js';

export const apiModules: ApiModule[] = [plannerModule, systemModule, plannerWorkspaceModule, bookingModule];

export async function registerPlatformApi(app: Parameters<typeof registerApiModules>[0], authorize?: AuthorizePlanner, client: AuditClient = 'rest') {
  await registerOpenApi(app, authorize !== undefined);
  await registerApiModules(app, authorize ? [systemModule, protectedPlannerWorkspaceModule(authorize, client)] : apiModules);
}

export async function buildApp(authorize?: AuthorizePlanner, client?: AuditClient) {
  const Fastify = (await import('fastify')).default;
  const app = Fastify({ logger: false, ...(authorize ? { genReqId: () => randomUUID() } : {}) });
  await registerPlatformApi(app, authorize, client);
  await app.ready();
  return app;
}
