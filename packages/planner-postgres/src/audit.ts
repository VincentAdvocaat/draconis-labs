import { createAsyncPlannerService, type AsyncPlannerService, type PlannerEnvironment } from '@draconis/planner-core';
import { uuidParamSchema, type PlannerCommand, type PlannerReply, type Task } from '@draconis/shared';
import type { Pool, PoolClient } from 'pg';
import { createPostgresPlannerStorage } from './storage.js';
import { transaction } from './transaction.js';

type Event = {
  actor: { kind: 'user' | 'agent'; name: string };
  requestId: string;
  workspaceId: string;
  operation: PlannerCommand['type'];
  targetId?: string;
};

export function createPostgresPlannerAudit(
  pool: Pool, workspaceId: string, environment: PlannerEnvironment, clientKind: 'rest' | 'mcp',
) {
  const service = (connection?: PoolClient) =>
    createAsyncPlannerService(createPostgresPlannerStorage(pool, workspaceId, connection), environment);

  function record(client: PoolClient, event: Event, status: number, resultId?: string) {
    const target = uuidParamSchema.safeParse({ id: resultId ?? event.targetId });
    return client.query(`
      INSERT INTO local_planner_activity
        (occurred_at, actor_kind, actor_name, client, request_id, workspace_id, operation, target_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      environment.now(), event.actor.kind, event.actor.name, clientKind, event.requestId,
      event.workspaceId === workspaceId ? workspaceId : null, event.operation,
      target.success ? target.data.id : null, status,
    ]);
  }

  return {
    service: service(),
    denied: (event: Event) => transaction(pool, async client => { await record(client, event, 403); }),
    execute(event: Event, run: (scoped: AsyncPlannerService) => PlannerReply | Promise<PlannerReply>) {
      return transaction(pool, async client => {
        await client.query('SAVEPOINT planner_command');
        const outcome = await run(service(client));
        if (!outcome.ok) await client.query('ROLLBACK TO SAVEPOINT planner_command');
        const created = event.operation === 'tasks.create' && outcome.ok;
        await record(client, event, outcome.ok ? created ? 201 : 200 : outcome.error.status,
          created ? (outcome.value as Task).id : undefined);
        return outcome;
      });
    },
  };
}

export type PostgresPlannerAudit = ReturnType<typeof createPostgresPlannerAudit>;

export async function listPostgresPlannerActivity(pool: Pool, filter: {
  actor?: string; kind?: 'user' | 'agent'; from?: string; through?: string; limit: number;
}) {
  const { rows } = await pool.query(`
    SELECT occurred_at AS "occurredAt", actor_kind AS "actorKind", actor_name AS actor,
           client, request_id AS "requestId", workspace_id AS "workspaceId", operation,
           target_id AS "targetId", status
    FROM local_planner_activity
    WHERE ($1::text IS NULL OR actor_name = $1)
      AND ($2::text IS NULL OR actor_kind = $2)
      AND ($3::text IS NULL OR occurred_at >= $3)
      AND ($4::text IS NULL OR occurred_at <= $4 || 'T23:59:59.999Z')
    ORDER BY occurred_at DESC, id DESC LIMIT $5
  `, [filter.actor ?? null, filter.kind ?? null, filter.from ?? null, filter.through ?? null, filter.limit]);
  return rows;
}
