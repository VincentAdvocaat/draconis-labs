import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { createPlannerService } from '@draconis/planner-core';
import { createSqlitePlannerStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import type { Lane, Task } from '@draconis/shared';
import { expect, it, vi } from 'vitest';
import { createPlannerRoutes } from '../src/modules/planner/routes.js';
import { createWorkspacePlannerRoutes } from '../src/modules/planner/workspace-routes.js';

const actor = { kind: 'user', name: 'cursor-fixture' } as const;
const workspaceTasks = '/api/v1/workspaces/local/tasks';

async function fixture() {
  const db = new Database(':memory:');
  const app = Fastify();
  initializePlannerSqlite(db);
  const storage = createSqlitePlannerStorage(db);
  let sequence = 0;
  const service = createPlannerService(storage, {
    id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    now: () => '2026-11-19T10:00:00.000Z',
  });
  await app.register(createWorkspacePlannerRoutes(service, 'local', () => actor), { prefix: '/api/v1/workspaces/:workspaceId' });
  await app.register(createPlannerRoutes(service, () => actor), { prefix: '/api/v1/planner' });
  await app.register(createPlannerRoutes(service, () => actor), { prefix: '/api/planner' });
  await app.ready();

  return {
    get: (url: string) => app.inject(url),
    add(title: string, lane: Lane, position: number, options: { label?: string; plannedDate?: string } = {}) {
      const task = service.create({ title, priority: 'high', labels: [options.label ?? 'demo'], plannedDate: options.plannedDate }, actor);
      storage.update(task.id, { lane, position });
      return task.id;
    },
    async close() { await app.close(); db.close(); },
  };
}

interface CursorPage { items: Task[]; pageSize: number; nextCursor: string | null }

async function page(app: Awaited<ReturnType<typeof fixture>>, query: string): Promise<CursorPage> {
  const result = await app.get(`${workspaceTasks}?${query}`);
  expect(result.statusCode).toBe(200);
  expect(result.json()).toMatchObject({ ok: true, value: { items: expect.any(Array), pageSize: expect.any(Number) } });
  return result.json().value;
}

it('continues a filtered workspace list across tied positions and lanes without gaps or duplicates', async () => {
  const app = await fixture();
  try {
    const todo = app.add('Inspectie taak', 'todo', 500);
    const doneFirst = app.add('Inspectie afgewerkt A', 'done', 1000);
    const doing = app.add('Inspectie bezig', 'doing', 900);
    const doneTie = app.add('Inspectie afgewerkt B', 'done', 1000);
    app.add('Inspectie andere label', 'doing', 50, { label: 'ander' });
    app.add('Ander onderwerp', 'done', 120);
    const doneLater = app.add('Inspectie afgewerkt C', 'done', 2000);
    const filters = 'label=demo&q=Inspectie&priority=high';
    const first = await page(app, `pagination=cursor&pageSize=2&${filters}`);
    expect(first).toMatchObject({ pageSize: 2, nextCursor: expect.any(String) });
    expect(first.items.map(item => item.id)).toEqual([doing, doneFirst]);

    const second = await page(app, `cursor=${first.nextCursor}&pageSize=2&priority=high&q=Inspectie&label=demo`);
    expect(second.nextCursor).toEqual(expect.any(String));
    expect(second.items.map(item => item.id)).toEqual([doneTie, doneLater]);

    const last = await page(app, `pagination=cursor&cursor=${second.nextCursor}&pageSize=2&${filters}`);
    expect(last.items.map(item => item.id)).toEqual([todo]);
    expect(last.nextCursor).toBeNull();

    const empty = await page(app, 'pagination=cursor&label=missing');
    expect(empty).toEqual({ items: [], pageSize: 50, nextCursor: null });

    const unpaginated = (await app.get(`${workspaceTasks}?${filters}`)).json();
    expect(unpaginated).toEqual({ ok: true, value: expect.any(Array) });
    const offset = (await app.get(`${workspaceTasks}?page=2&pageSize=2&${filters}`)).json();
    expect(offset).toEqual({ ok: true, value: { page: 2, pageSize: 2, total: 5, items: expect.any(Array) } });
    expect((await app.get(`/api/v1/planner/tasks?${filters}`)).json()).toEqual(unpaginated.value);
    expect((await app.get(`/api/planner/tasks?${filters}`)).json()).toEqual(unpaginated.value);
  } finally {
    await app.close();
  }
});

it('rejects malformed cursors, offset combinations and changed filters in the existing error envelope', async () => {
  const app = await fixture();
  try {
    app.add('Inspectie A', 'todo', 1000);
    app.add('Inspectie B', 'todo', 2000);
    const first = await page(app, 'pagination=cursor&pageSize=1&label=demo');
    const queries = [
      'cursor=', 'cursor=invalid%2Bcharacters', 'cursor=e30', 'pagination=unknown',
      'pagination=cursor&page=1', 'pagination=cursor&pageSize=201',
      'pagination=cursor&date=invalid', 'pagination=cursor&timezone=Unknown%2FZone',
      `cursor=${first.nextCursor}&page=1&label=demo`, `cursor=${first.nextCursor}&label=changed`,
    ];
    for (const query of queries) {
      const response = await app.get(`${workspaceTasks}?${query}`);
      expect(response.statusCode, query).toBe(400);
      expect(response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', status: 400 } });
    }
    const wrongWorkspace = await app.get(`/api/v1/workspaces/other/tasks?cursor=${first.nextCursor}&label=demo`);
    expect(wrongWorkspace.statusCode).toBe(404);
    expect(wrongWorkspace.json()).toMatchObject({ ok: false, error: { code: 'WORKSPACE_NOT_FOUND', status: 404 } });
  } finally {
    await app.close();
  }
});

it('requires a new cursor when a relative date filter crosses local midnight', async () => {
  const app = await fixture();
  try {
    app.add('Inspectie A', 'todo', 1000, { plannedDate: '2026-11-20' });
    const remaining = app.add('Inspectie B', 'todo', 2000, { plannedDate: '2026-11-21' });
    const filters = 'future=true&timezone=Europe%2FAmsterdam';
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T22:59:00.000Z'));
    const first = await page(app, `pagination=cursor&pageSize=1&${filters}`);
    expect(first.nextCursor).toEqual(expect.any(String));

    vi.setSystemTime(new Date('2026-11-19T23:00:00.000Z'));
    const next = await app.get(`${workspaceTasks}?cursor=${first.nextCursor}&${filters}`);
    expect(next.statusCode).toBe(400);
    expect(next.json()).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', status: 400 } });
    const restart = await page(app, `pagination=cursor&${filters}`);
    expect(restart.items.map(item => item.id)).toEqual([remaining]);
    expect(restart.nextCursor).toBeNull();
  } finally {
    vi.useRealTimers();
    await app.close();
  }
});
