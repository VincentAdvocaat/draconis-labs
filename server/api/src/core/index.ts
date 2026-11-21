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

export async function registerPlatformApi(app: Parameters<typeof registerApiModules>[0], authorize?: AuthorizePlanner, client: AuditClient = 'rest', postgresUrl?: string) {
  if (postgresUrl !== undefined && !authorize) throw new Error('De lokale PostgreSQL-proef vereist autorisatie.');
  const postgres = postgresUrl === undefined ? undefined
    : await (await import('../modules/planner/postgres.js')).registerLocalPostgresPlanner(app, postgresUrl, client);
  await registerOpenApi(app, authorize !== undefined);
  await registerApiModules(app, authorize ? [systemModule, protectedPlannerWorkspaceModule(authorize, client, postgres)] : apiModules);
}

export async function buildApp(authorize?: AuthorizePlanner, client?: AuditClient, postgresUrl?: string) {
  const Fastify = (await import('fastify')).default;
  const app = Fastify({ logger: false, ...(authorize ? { genReqId: () => randomUUID() } : {}) });
  try {
    await registerPlatformApi(app, authorize, client, postgresUrl);
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
