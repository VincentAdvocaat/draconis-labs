import type Database from 'better-sqlite3';
import { LOCAL_WORKSPACE_ID, type PlannerCommand, type PlannerReply, type Task } from '@draconis/shared';
import { z } from 'zod';
import type { Actor } from './auth.js';

type Event = {
  actor: Actor;
  requestId: string;
  workspaceId: string;
  operation: PlannerCommand['type'];
  targetId?: string;
};
export type AuditClient = 'rest' | 'mcp';
type Activity = {
  occurredAt: string;
  actorKind: Actor['kind'];
  actor: string;
  client: AuditClient;
  requestId: string;
  workspaceId: string | null;
  operation: PlannerCommand['type'];
  targetId: string | null;
  status: number;
};

const uuid = z.uuid();
const filters = z.strictObject({
  actor: z.string().min(1).max(100).optional(),
  kind: z.enum(['user', 'agent']).optional(),
  from: z.iso.date().optional(),
  through: z.iso.date().optional(),
  limit: z.number().int().min(1).max(200).default(50),
}).refine(filter => !filter.from || !filter.through || filter.from <= filter.through, 'Ongeldig datumbereik.');

export function createPlannerAudit(db: Database.Database, client: AuditClient = 'rest', clock = Date.now) {
  db.exec([
    'CREATE TABLE IF NOT EXISTS local_planner_activity (',
    '  id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL, actor_kind TEXT NOT NULL,',
    '  actor_name TEXT NOT NULL, client TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE,',
    '  workspace_id TEXT, operation TEXT NOT NULL, target_id TEXT, status INTEGER NOT NULL',
    ');',
    'CREATE INDEX IF NOT EXISTS local_planner_activity_date ON local_planner_activity(occurred_at, id);',
  ].join('\n'));

  const insert = db.prepare([
    'INSERT INTO local_planner_activity',
    '  (occurred_at, actor_kind, actor_name, client, request_id, workspace_id, operation, target_id, status)',
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ].join('\n'));
  const record = (event: Event, status: number, resultId?: string) => {
    const target = uuid.safeParse(resultId ?? event.targetId);
    insert.run(
      new Date(clock()).toISOString(),
      event.actor.kind,
      event.actor.name,
      client,
      event.requestId,
      event.workspaceId === LOCAL_WORKSPACE_ID ? event.workspaceId : null,
      event.operation,
      target.success ? target.data : null,
      status,
    );
  };

  const execute = db.transaction((event: Event, run: () => PlannerReply) => {
    const outcome = run();
    const created = event.operation === 'tasks.create' && outcome.ok;
    record(event, outcome.ok ? created ? 201 : 200 : outcome.error.status,
      created ? (outcome.value as Task).id : undefined);
    return outcome;
  });

  return {
    execute: execute.immediate,
    denied: (event: Event) => record(event, 403),
  };
}

export type PlannerAudit = ReturnType<typeof createPlannerAudit>;

export function parsePlannerActivityFilters(input: unknown) {
  return filters.parse(input);
}

export function listPlannerActivity(db: Database.Database, input: unknown) {
  const filter = parsePlannerActivityFilters(input);
  return db.prepare<Record<string, string | number | null>, Activity>([
    'SELECT occurred_at AS occurredAt, actor_kind AS actorKind, actor_name AS actor,',
    '       client, request_id AS requestId, workspace_id AS workspaceId, operation, target_id AS targetId, status',
    'FROM local_planner_activity',
    'WHERE (@actor IS NULL OR actor_name = @actor) AND (@kind IS NULL OR actor_kind = @kind)',
    '  AND (@from IS NULL OR occurred_at >= @from)',
    "  AND (@through IS NULL OR occurred_at <= @through || 'T23:59:59.999Z')",
    'ORDER BY occurred_at DESC, id DESC LIMIT @limit',
  ].join('\n')).all({
    actor: filter.actor ?? null,
    kind: filter.kind ?? null,
    from: filter.from ?? null,
    through: filter.through ?? null,
    limit: filter.limit,
  });
}
