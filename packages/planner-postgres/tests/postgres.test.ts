import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAsyncPlannerService, createPlannerService, TaskConflictError, TaskCreationConflictError } from '@draconis/planner-core';
import { createPlannerSnapshotTools, initializePlannerSqlite, createSqlitePlannerStorage } from '@draconis/planner-sqlite';
import type { Task, TaskListQuery } from '@draconis/shared';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPlannerPostgresWorkspace, createPostgresPlannerStorage, importPlannerPostgresSnapshot, migratePlannerPostgres } from '../src/index.js';

const connectionString = process.env.PLANNER_POSTGRES_TEST_URL;
if (!connectionString || new URL(connectionString).pathname !== '/draconis_planner_test') {
  throw new Error('Set PLANNER_POSTGRES_TEST_URL to a dedicated draconis_planner_test database.');
}
const schema = `planner_test_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString });
const connect = (label: string) => new Pool({
  connectionString, options: `-c search_path=${schema}`, application_name: `${schema}_${label}`, max: 1,
});
const pools = [connect('a'), connect('b')];
const environment = { id: randomUUID, now: () => '2026-11-21T12:00:00.000Z' };
const actor = { name: 'Fictieve planner' };
const recurring = { title: 'Fictief terugkerend onderhoud', dueDate: '2026-11-20', recurrence: { frequency: 'weekly' as const, interval: 2 } };
const directory = mkdtempSync(join(tmpdir(), 'draconis-planner-pg-test-'));
const snapshotTools = createPlannerSnapshotTools(Database);
let ownsSchema = false;

beforeAll(async () => {
  await admin.query(`CREATE SCHEMA ${schema}`);
  ownsSchema = true;
  await expect(Promise.all(pools.map(migratePlannerPostgres))).resolves.toEqual([[1, 2], [1, 2]]);
});
afterAll(async () => {
  try {
    await Promise.all(pools.map(pool => pool.end()));
    if (ownsSchema) await admin.query(`DROP SCHEMA ${schema} CASCADE`);
  } finally {
    await admin.end();
    rmSync(directory, { recursive: true, force: true });
  }
});

function service(pool: Pool, workspace: string) {
  return createAsyncPlannerService(createPostgresPlannerStorage(pool, workspace), environment);
}

async function whileBothWait(workspace: string, operations: (() => Promise<unknown>)[]) {
  const lock = await admin.connect();
  try {
    await lock.query('BEGIN');
    await lock.query(`SELECT id FROM ${schema}.planner_workspaces WHERE id = $1 FOR UPDATE`, [workspace]);
    const settled = Promise.allSettled(operations.map(operation => operation()));
    try {
      const expires = Date.now() + 5000;
      for (;;) {
        const { rowCount } = await lock.query(`
          SELECT 1 FROM pg_stat_activity WHERE application_name IN ($1, $2)
            AND wait_event_type = 'Lock'
        `, pools.map(pool => pool.options.application_name));
        if (rowCount === 2) break;
        if (Date.now() >= expires) throw new Error('Expected two PostgreSQL sessions waiting on the workspace row');
        await delay(25);
        // Each statement should inspect current activity while the row lock stays held.
        await lock.query('SELECT pg_stat_clear_snapshot()');
      }
    } finally {
      await lock.query('ROLLBACK');
      await settled;
    }
    return await settled;
  } finally {
    lock.release();
  }
}

it('upgrades a version-one schema without changing its existing tasks', async () => {
  const workspace = 'migration';
  await createPlannerPostgresWorkspace(pools[0], workspace);
  const planner = service(pools[0], workspace);
  const task = await planner.create(recurring, actor);
  await pools[0].query('DROP TABLE planner_snapshot_imports; DELETE FROM planner_schema_migrations WHERE version = 2');
  // A conflicting table causes migration 2 to fail without registering it.
  await pools[0].query('CREATE TABLE planner_snapshot_imports (id integer)');
  await expect(migratePlannerPostgres(pools[0])).rejects.toMatchObject({ code: '42P07' });
  await expect(pools[0].query('SELECT version FROM planner_schema_migrations ORDER BY version'))
    .resolves.toMatchObject({ rows: [{ version: 1 }] });
  await pools[0].query('DROP TABLE planner_snapshot_imports');
  await expect(migratePlannerPostgres(pools[0])).resolves.toEqual([1, 2]);
  expect(await planner.list({})).toEqual([task]);
});

it('locks both writers before version checks and ordinal allocation', async () => {
  const workspace = 'version-race';
  await createPlannerPostgresWorkspace(pools[0], workspace);
  const [first, second] = pools.map(pool => service(pool, workspace));
  const done = await first.create({ title: 'Eerder afgerond' }, actor);
  await first.update(done.id, { lane: 'done', position: 1000 });
  const task = await first.create(recurring, actor);
  const results = await whileBothWait(workspace, [first, second].map(planner =>
    () => planner.update(task.id, { lane: 'done', position: 1000, version: 1 })));
  const successes = results.filter(result => result.status === 'fulfilled');
  expect(successes).toHaveLength(1);
  const failure = results.find(result => result.status === 'rejected');
  expect(failure?.reason).toBeInstanceOf(TaskConflictError);
  expect(failure?.reason).toMatchObject({ statusCode: 409, task: successes[0].value });
  let rows = await first.list({}) as Task[];
  expect(rows.filter(row => row.recurrenceParentId === task.id)).toMatchObject([
    { lane: 'todo', dueDate: '2026-12-04', version: 1 },
  ]);
  expect(rows.filter(row => row.lane === 'done').map(row => row.position)).toEqual([1000, 2000]);

  const compatibility = await first.create({ ...recurring, title: 'Compatibiliteit' }, actor);
  const updates = await whileBothWait(workspace, [first, second].map(planner => () => planner.update(compatibility.id, { lane: 'done' })));
  expect(updates.map(result => result.status)).toEqual(['fulfilled', 'fulfilled']);
  rows = await first.list({}) as Task[];
  expect(rows.filter(row => row.recurrenceParentId === compatibility.id)).toHaveLength(1);
});

it('rolls back the completing task, lane order and inserted successor when an insert trigger fails', async () => {
  const workspace = 'rollback';
  await createPlannerPostgresWorkspace(pools[0], workspace);
  const planner = service(pools[0], workspace);
  const task = await planner.create(recurring, actor);
  const existing = await planner.create({ title: 'Op dezelfde positie' }, actor);
  await planner.update(existing.id, { lane: 'done', position: 1000 });
  const before = await planner.list({});
  await pools[0].query(`
    CREATE FUNCTION fail_successor() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.recurrence_parent_id IS NOT NULL THEN RAISE EXCEPTION 'fixture successor failure'; END IF;
        RETURN NEW;
      END
    $$;
    CREATE TRIGGER fail_successor AFTER INSERT ON planner_tasks FOR EACH ROW EXECUTE FUNCTION fail_successor();
  `);
  try {
    await expect(planner.update(task.id, { lane: 'done', position: 1000, version: 1 })).rejects.toMatchObject({ cause: { message: 'fixture successor failure' } });
    expect(await planner.list({})).toEqual(before);
  } finally {
    await pools[0].query('DROP TRIGGER fail_successor ON planner_tasks; DROP FUNCTION fail_successor()');
  }
  await expect(planner.update(task.id, { lane: 'done', version: 1 })).resolves.toMatchObject({ lane: 'done', version: 2 });
});

it('replays duplicate commands and keeps tasks, receipts and preferences workspace-scoped', async () => {
  const workspace = 'receipts';
  const other = 'other';
  await createPlannerPostgresWorkspace(pools[0], workspace);
  await createPlannerPostgresWorkspace(pools[0], other);
  const [first, second] = pools.map(pool => service(pool, workspace));
  const foreign = service(pools[0], other);
  const receiptKey = { workspaceId: workspace, actor: actor.name, key: 'request' };
  const outcomes = await whileBothWait(workspace, [first, second].map(planner => () => planner.create(recurring, actor, receiptKey)));
  expect(outcomes[0]).toEqual(outcomes[1]);
  expect(outcomes[0].status).toBe('fulfilled');
  expect(await first.list({})).toHaveLength(1);
  await expect(first.create({ title: 'Andere inhoud' }, actor, receiptKey)).rejects.toBeInstanceOf(TaskCreationConflictError);
  await expect(foreign.create(recurring, actor, receiptKey)).rejects.toThrow('andere werkruimte');
  expect(await foreign.list({})).toEqual([]);
  const otherTask = await foreign.create(recurring, actor, { ...receiptKey, workspaceId: other });
  await expect(first.update(otherTask.id, { title: 'Andere werkruimte' })).rejects.toMatchObject({ statusCode: 404 });
  await expect(first.remove(otherTask.id)).rejects.toMatchObject({ statusCode: 404 });
  await first.updatePreferences({ locale: 'en' });
  expect(await first.getPreferences()).toMatchObject({ locale: 'en' });
  expect(await foreign.getPreferences()).toMatchObject({ locale: 'nl' });
  await expect(service(pools[0], 'missing').list({})).rejects.toMatchObject({ statusCode: 404 });
});

it.each(['legacy', 'current'])('dry-runs and imports the %s SQLite snapshot without changing the source', async fixture => {
  const file = join(directory, `${fixture}.sqlite`);
  const db = new Database(file);
  let created: Task | undefined;
  const input = { title: 'Fictieve idempotente importtaak' };
  const key = { workspaceId: 'local', actor: actor.name, key: 'imported-command' };
  try {
    db.exec(readFileSync(new URL('../../../server/api/tests/fixtures/legacy.sql', import.meta.url), 'utf8'));
    if (fixture === 'current') {
      db.exec(readFileSync(new URL('../../../server/api/tests/fixtures/current.sql', import.meta.url), 'utf8'));
      initializePlannerSqlite(db);
      created = createPlannerService(createSqlitePlannerStorage(db), environment).create(input, actor, key);
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.pragma('journal_mode = DELETE');
    }
  } finally {
    db.close();
  }
  const bytes = readFileSync(file);
  const source = snapshotTools.dryRun(file);
  await createPlannerPostgresWorkspace(pools[0], fixture);
  const planner = service(pools[0], fixture);
  const options = { workspaceId: fixture, snapshotPath: file, sourceId: fixture, expectedSha256: source.sha256, dryRun: true };
  await expect(importPlannerPostgresSnapshot(pools[0], { ...options, expectedSha256: '0'.repeat(64) })).rejects.toMatchObject({ code: 'SOURCE_HASH_MISMATCH' });
  await expect(importPlannerPostgresSnapshot(pools[0], options)).resolves.toMatchObject({
    taskIds: source.taskIds, recurrenceLinks: source.recurrenceLinks, dryRun: true, insertedTasks: 0,
  });
  expect(await planner.list({})).toEqual([]);
  const results = await Promise.all(pools.map(pool => importPlannerPostgresSnapshot(pool, { ...options, dryRun: false })));
  expect(results.map(result => result.insertedTasks).sort((a, b) => a - b)).toEqual([0, source.taskCount]);
  expect(results.find(result => !result.alreadyImported)?.insertedPreferences).toBe(source.preferenceCount);
  const sqlite = new Database(':memory:');
  try {
    initializePlannerSqlite(sqlite);
    const { tasks, preferences } = snapshotTools.readTaskSnapshot(file, source.sha256);
    for (const [table, rows] of Object.entries({ tasks, user_preferences: preferences })) {
      for (const row of rows) {
        const columns = Object.keys(row);
        sqlite.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row));
      }
    }
    const previous = createPlannerService(createSqlitePlannerStorage(sqlite), environment);
    const sort = (rows: Task[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    expect(sort(await planner.list({}) as Task[])).toEqual(sort(previous.list({}) as Task[]));
    expect(await planner.getPreferences()).toEqual(previous.getPreferences());
    const comparisonQueries: TaskListQuery[] = [
      { label: 'ops' }, { q: 'FICTIEVE' }, { lane: 'todo', page: 1, pageSize: 2 }, { priority: 'high' },
    ];
    for (const query of comparisonQueries) expect(await planner.list(query)).toEqual(previous.list(query));
    expect(await planner.history({ page: 1, pageSize: 2 })).toEqual(previous.history({ page: 1, pageSize: 2 }));
    const cursor = { filters: { date: 'today', timezone: 'Europe/Amsterdam' }, limit: 1, now: new Date(environment.now()) };
    const [head] = await planner.listByCursor(cursor);
    expect([head].filter(Boolean)).toEqual(previous.listByCursor(cursor));
    if (head) expect(await planner.listByCursor({ ...cursor, after: head })).toEqual(previous.listByCursor({ ...cursor, after: head }));
  } finally {
    sqlite.close();
  }
  if (created) expect(await planner.create(input, actor, { ...key, workspaceId: fixture })).toEqual(created);
  const firstTask = (await planner.list({}) as Task[])[0];
  const updated = await planner.update(firstTask.id, { title: 'Lokale wijziging na import', version: firstTask.version });
  await expect(importPlannerPostgresSnapshot(pools[0], { ...options, dryRun: false })).resolves.toMatchObject({ alreadyImported: true, insertedTasks: 0 });
  await expect(importPlannerPostgresSnapshot(pools[0], { ...options, sourceId: 'another', dryRun: false })).rejects.toMatchObject({ code: 'TARGET_NOT_EMPTY' });
  expect(await planner.list({ q: updated.title })).toEqual([updated]);
  expect(readFileSync(file)).toEqual(bytes);
});
