import Fastify, { type FastifyRequest } from 'fastify';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlannerService } from '@draconis/planner-core';
import { createSqlitePlannerStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlannerRoutes } from '../src/modules/planner/routes.js';
import { createWorkspacePlannerRoutes } from '../src/modules/planner/workspace-routes.js';

const workspaceTasks = '/api/v1/workspaces/local/tasks';
const legacyTasks = '/api/v1/planner/tasks';

function testActor(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (authorization === 'Bearer same-as-user') return { kind: 'agent' as const, name: 'user' };
  if (authorization === 'Bearer other-agent') return { kind: 'agent' as const, name: 'other-agent' };
  return { kind: 'user' as const, name: 'user' };
}

function openPlanner(path: string) {
  const db = new Database(path);
  initializePlannerSqlite(db);
  const service = createPlannerService(createSqlitePlannerStorage(db, 25), {
    id: randomUUID,
    now: () => '2026-11-20T10:00:00.000Z',
  });
  const app = Fastify();
  app.register(createWorkspacePlannerRoutes(service, 'local', testActor), { prefix: '/api/v1/workspaces/:workspaceId' });
  app.register(createPlannerRoutes(service, testActor), { prefix: '/api/v1/planner' });
  return { app, db };
}

describe('workspace task creation idempotency', () => {
  let directory: string;
  let path: string;
  const connections: ReturnType<typeof openPlanner>[] = [];

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'planner-task-receipts-'));
    path = join(directory, 'planner.sqlite');
  });

  async function closeAll() {
    for (const { app, db } of connections.splice(0)) {
      await app.close();
      db.close();
    }
  }

  afterEach(async () => {
    await closeAll();
    rmSync(directory, { recursive: true, force: true });
  });

  function open() {
    const connection = openPlanner(path);
    connections.push(connection);
    return connection;
  }

  it('returns the original 201 across independent connections, task edits and reopen', async () => {
    const first = open();
    const second = open();
    const headers = { authorization: 'Bearer other-agent', 'idempotency-key': 'logical-create-1' };
    const [created, replayed] = await Promise.all([
      first.app.inject({ method: 'POST', url: workspaceTasks, headers, payload: { title: ' Fictieve taak ', labels: [' pilot '] } }),
      second.app.inject({ method: 'POST', url: workspaceTasks, headers, payload: { labels: ['pilot'], title: 'Fictieve taak' } }),
    ]);
    expect([created.statusCode, replayed.statusCode]).toEqual([201, 201]);
    const original = created.json();
    expect(replayed.json()).toEqual(original);
    expect(original).toMatchObject({ ok: true, value: { version: 1, createdBy: 'other-agent' } });
    expect(first.db.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 1 });

    const edited = await first.app.inject({ method: 'PATCH', url: `${workspaceTasks}/${original.value.id}`, headers, payload: { lane: 'doing', version: 1 } });
    expect(edited.json()).toMatchObject({ ok: true, value: { lane: 'doing', version: 2 } });
    await closeAll();
    const restarted = open();
    const afterRestart = await restarted.app.inject({ method: 'POST', url: workspaceTasks, headers, payload: { title: 'Fictieve taak', labels: ['pilot'] } });
    expect(afterRestart.statusCode).toBe(201);
    expect(afterRestart.json()).toEqual(original);
    const conflict = await restarted.app.inject({ method: 'POST', url: workspaceTasks, headers, payload: { title: 'Andere taak', labels: ['pilot'] } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_CONFLICT', status: 409 } });
    expect(restarted.db.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 1 });
  });

  it('binds keys to actor kind and name while keeping unkeyed and legacy creates compatible', async () => {
    const { app, db } = open();
    const key = 'shared-key';
    const payload = { title: 'Fictieve taak' };
    const wrong = await app.inject({ method: 'POST', url: '/api/v1/workspaces/other/tasks', headers: { 'idempotency-key': key }, payload });
    expect(wrong.statusCode).toBe(404);
    const headersByActor = [
      { 'idempotency-key': key },
      { 'idempotency-key': key, authorization: 'Bearer same-as-user' },
      { 'idempotency-key': key, authorization: 'Bearer other-agent' },
    ];
    const ids = new Set();
    for (const headers of headersByActor) {
      const created = await app.inject({ method: 'POST', url: workspaceTasks, headers, payload });
      const replayed = await app.inject({ method: 'POST', url: workspaceTasks, headers, payload });
      expect([created.statusCode, replayed.statusCode]).toEqual([201, 201]);
      expect(replayed.json()).toEqual(created.json());
      ids.add(created.json().value.id);
    }
    expect(ids.size).toBe(3);

    for (const url of [workspaceTasks, legacyTasks]) {
      const headers = url === legacyTasks ? {'idempotency-key': key} : {};
      const first = await app.inject({ method: 'POST', url, headers, payload });
      const second = await app.inject({ method: 'POST', url, headers, payload });
      expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
      expect(first.json()).not.toEqual(second.json());
    }
    expect(db.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 7 });
    expect(db.prepare("SELECT count(*) AS n FROM planner_command_receipts WHERE operation = 'tasks.create'").get()).toEqual({ n: 3 });
  });

  it('rolls back the task on receipt failure and allows the same key to retry', async () => {
    const { app, db } = open();
    const headers = { 'idempotency-key': 'retry-key' };
    const payload = { title: 'Herhaalbare fictieve taak' };
    const malformed = await app.inject({ method: 'POST', url: workspaceTasks, headers: { 'idempotency-key': 'one,two' }, payload });
    expect(malformed.statusCode).toBe(400);
    const invalidInput = await app.inject({ method: 'POST', url: workspaceTasks, headers, payload: { title: '' } });
    expect(invalidInput.statusCode).toBe(400);
    db.exec(`CREATE TRIGGER fail_receipt BEFORE INSERT ON planner_command_receipts
      WHEN NEW.operation = 'tasks.create' BEGIN SELECT RAISE(ABORT, 'receipt failure'); END`);
    const failed = await app.inject({ method: 'POST', url: workspaceTasks, headers, payload });
    expect(failed.statusCode).toBe(500);
    expect(db.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT count(*) AS n FROM planner_command_receipts').get()).toEqual({ n: 0 });
    db.exec('DROP TRIGGER fail_receipt');
    const retry = await app.inject({ method: 'POST', url: workspaceTasks, headers, payload });
    expect(retry.statusCode).toBe(201);
    expect(db.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT count(*) AS n FROM planner_command_receipts').get()).toEqual({ n: 1 });
  });
});
