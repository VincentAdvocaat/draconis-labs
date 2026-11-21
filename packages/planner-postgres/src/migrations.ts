import type { Pool } from 'pg';
import { transaction } from './transaction.js';

const migrations = [
  { version: 1, sql: `
    CREATE TABLE planner_workspaces (id text COLLATE "C" PRIMARY KEY);
    CREATE TABLE planner_tasks (
      workspace_id text COLLATE "C" NOT NULL REFERENCES planner_workspaces(id),
      id text COLLATE "C" NOT NULL,
      title text NOT NULL,
      description text,
      lane text COLLATE "C" NOT NULL CHECK (lane IN ('todo', 'doing', 'done')),
      planned_date text,
      due_date text,
      due_time text,
      timezone text,
      recurrence jsonb,
      recurrence_parent_id text,
      position double precision NOT NULL,
      version bigint NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
      created_by text NOT NULL,
      priority text NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      labels jsonb NOT NULL CHECK (jsonb_typeof(labels) = 'array'),
      created_at text NOT NULL,
      updated_at text NOT NULL,
      completed_at text,
      PRIMARY KEY (workspace_id, id)
    );
    CREATE INDEX planner_tasks_board ON planner_tasks (workspace_id, lane, position, id);
    CREATE INDEX planner_tasks_history ON planner_tasks (workspace_id, completed_at DESC) WHERE lane = 'done';
    CREATE TABLE planner_preferences (
      workspace_id text COLLATE "C" NOT NULL REFERENCES planner_workspaces(id),
      id text COLLATE "C" NOT NULL,
      preferences jsonb NOT NULL,
      updated_at text NOT NULL,
      PRIMARY KEY (workspace_id, id)
    );
    CREATE TABLE planner_task_creation_receipts (
      workspace_id text COLLATE "C" NOT NULL REFERENCES planner_workspaces(id),
      actor text COLLATE "C" NOT NULL,
      key text COLLATE "C" NOT NULL,
      hash text NOT NULL,
      result jsonb NOT NULL,
      PRIMARY KEY (workspace_id, actor, key)
    );
  ` },
  { version: 2, sql: `
    CREATE TABLE planner_snapshot_imports (
      workspace_id text COLLATE "C" NOT NULL REFERENCES planner_workspaces(id),
      source_id text COLLATE "C" NOT NULL,
      source_sha256 text NOT NULL,
      import_version integer NOT NULL,
      completed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (workspace_id, source_id, source_sha256, import_version)
    );
  ` },
  { version: 3, sql: `
    CREATE TABLE planner_booking_state (
      workspace_id text COLLATE "C" PRIMARY KEY REFERENCES planner_workspaces(id),
      state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object')
    );
  ` },
];

export async function migratePlannerPostgres(pool: Pool) {
  return transaction(pool, async client => {
    // Transaction-scoped lock also protects creation of the migration table.
    await client.query('SELECT pg_advisory_xact_lock(163843230, 1)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS planner_schema_migrations (
        version integer PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ version: number }>('SELECT version FROM planner_schema_migrations ORDER BY version');
    if (rows.some(({ version }, index) => migrations[index]?.version !== version)) {
      throw new Error('Onbekende of onvolledige PostgreSQL-migratiehistorie.');
    }
    for (const { version, sql } of migrations.slice(rows.length)) {
      await client.query(sql);
      await client.query('INSERT INTO planner_schema_migrations (version) VALUES ($1)', [version]);
    }
    return migrations.map(({ version }) => version);
  });
}

export async function createPlannerPostgresWorkspace(pool: Pool, id: string) {
  if (!id.trim() || id !== id.trim() || id.length > 120) throw new Error('Ongeldige werkruimte-ID.');
  await pool.query('INSERT INTO planner_workspaces (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
}
