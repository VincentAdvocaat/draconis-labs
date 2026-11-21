import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { LOCAL_WORKSPACE_ID } from '@draconis/shared';
import {
  createPlannerPostgresWorkspace, createPostgresPlannerAudit, migratePlannerPostgres,
} from '@draconis/planner-postgres';

function localConnection(value: string) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || !url.username || !url.password || url.search || url.hash
      || !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname)) throw new Error();
    return {
      host: url.hostname === '[::1]' ? '::1' : url.hostname,
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      ssl: false,
    };
  } catch {
    throw new Error('DRACONIS_PLANNER_POSTGRES_URL vereist een PostgreSQL-URL naar 127.0.0.1 of [::1], met expliciete inloggegevens en database.');
  }
}

export function openLocalPostgresPool(value: string, allowExitOnIdle = false) {
  return new Pool({ ...localConnection(value), connectionTimeoutMillis: 5000, allowExitOnIdle });
}

export async function registerLocalPostgresPlanner(app: FastifyInstance, value: string, client: 'rest' | 'mcp') {
  const pool = openLocalPostgresPool(value, client === 'mcp');
  pool.on('error', () => app.log.warn('Een inactieve PostgreSQL-verbinding is gesloten.'));
  app.addHook('onClose', async () => { await pool.end(); });
  await migratePlannerPostgres(pool);
  await createPlannerPostgresWorkspace(pool, LOCAL_WORKSPACE_ID);
  return createPostgresPlannerAudit(pool, LOCAL_WORKSPACE_ID, {
    id: randomUUID, now: () => new Date().toISOString(),
  }, client);
}
