import Fastify from 'fastify';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createPlannerService, executePlannerCommand } from '@draconis/planner-core';
import { initializePlannerSqlite, createSqlitePlannerStorage } from '@draconis/planner-sqlite';
import { createPlannerClient, createPlannerHttpTransport } from '@draconis/shared';
import { createWorkspacePlannerRoutes } from '../src/modules/planner/workspace-routes.js';
import { createPlannerRoutes } from '../src/modules/planner/routes.js';
import { describe, expect, it } from 'vitest';

describe('one local workspace client over HTTP and desktop command transport', () => {
  it('shares task/history/preferences behavior and error codes while retaining compatibility routes', async () => {
    const db = new Database(':memory:'); initializePlannerSqlite(db);
    const service = createPlannerService(createSqlitePlannerStorage(db), { id: randomUUID, now: () => '2026-11-19T10:00:00.000Z' });
    const app = Fastify();
    let actorFailure: Error | undefined;
    const actor = () => { if (actorFailure) throw actorFailure; return { kind: 'user' as const, name: 'local-test' }; };
    await app.register(createWorkspacePlannerRoutes(service, 'local', actor), { prefix: '/api/v1/workspaces/:workspaceId' });
    await app.register(createPlannerRoutes(service, actor), { prefix: '/api/v1/planner' });
    const fetcher: typeof fetch = async (url, init) => {
      const reply = await app.inject({ url: String(url), method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH' | 'DELETE',
        headers: Object.fromEntries(new Headers(init?.headers).entries()), payload: init?.body as string | undefined });
      return new Response(reply.body, { status: reply.statusCode, headers: { 'Content-Type': 'application/json' } });
    };
    const http = createPlannerClient(createPlannerHttpTransport('', fetcher), 'local');
    const ipc = createPlannerClient(async command => executePlannerCommand(service, 'local', actor(), command), 'local');
    try {
      for (const client of [http, ipc]) {
        await expect(client.create({ title: 123 } as never)).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
        await expect(client.create({ title: 'valid', labels: 'single' } as never)).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
        const padded = await client.create({ title: ` ${'x'.repeat(240)} `, labels: [` ${'y'.repeat(40)} `] });
        expect(padded.title).toBe('x'.repeat(240));
        expect(padded.labels).toEqual(['y'.repeat(40)]);
        await client.remove(padded.id);
        await expect(client.preferences.update({ weekStart: '1' } as never)).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
      }
      const task = await http.create({ title: 'Fictieve werkruimtetaak', labels: ['demo'] });
      expect(await ipc.list()).toEqual([task]);
      for (const client of [http, ipc]) {
        await expect(client.update(task.id, { title: 123, version: 1 } as never)).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
        await expect(client.update(task.id, { labels: 'single', version: 1 } as never)).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
      }
      const unversioned = { workspaceId: 'local', type: 'tasks.update', id: task.id, input: { title: 'No version' } };
      expect(executePlannerCommand(service, 'local', actor(), unversioned)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT', status: 400 } });
      const noVersionHttp = await app.inject({ method: 'PATCH', url: `/api/v1/workspaces/local/tasks/${task.id}`, payload: unversioned.input });
      expect(noVersionHttp.statusCode).toBe(400);
      const moved = await ipc.update(task.id, { lane: 'doing', version: 1 });
      expect(await http.list({ lane: 'doing' })).toEqual([moved]);
      for (const client of [http, ipc]) {
        await expect(client.update(task.id, { title: 'Stale', version: 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT', status: 409, task: moved });
        await expect(client.update(randomUUID(), { title: 'Unknown', version: 1 })).rejects.toMatchObject({ code: 'TASK_NOT_FOUND', status: 404 });
        await expect(client.create({ title: '' })).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
      }
      const wrongHttp = createPlannerClient(createPlannerHttpTransport('', fetcher), 'other');
      const wrongIpc = createPlannerClient(async command => executePlannerCommand(service, 'local', actor(), command), 'other');
      for (const client of [wrongHttp, wrongIpc]) {
        await expect(client.list()).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
        await expect(client.create({ title: 'Must not write' })).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
        await expect(client.preferences.update({ locale: 'en' })).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
        await expect(client.history()).rejects.toMatchObject({ code: 'WORKSPACE_NOT_FOUND' });
      }
      expect(await http.list()).toEqual([moved]);
      await ipc.preferences.update({ locale: 'en' });
      expect(await http.preferences.get()).toMatchObject({ locale: 'en' });
      const done = await http.update(task.id, { lane: 'done', version: 2 });
      expect(await ipc.history({ from: '2026-11-19' })).toEqual([done]);
      expect((await app.inject('/api/v1/planner/tasks')).json()).toEqual([done]);
      const legacyConflict = await app.inject({ method: 'PATCH', url: `/api/v1/planner/tasks/${task.id}`, payload: { title: 'Stale', version: 1 } });
      expect(legacyConflict.statusCode).toBe(409);
      expect(legacyConflict.json()).toEqual({ message: 'Deze taak is elders gewijzigd. Vernieuw en probeer opnieuw.', task: done });
      await ipc.remove(task.id);
      expect(await http.list()).toEqual([]);
      expect(await ipc.history()).toEqual([]);
      actorFailure = Object.assign(new Error('invalid key'), { statusCode: 401 });
      await expect(http.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
      actorFailure = new Error('storage unavailable');
      await expect(http.list()).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 500 });
    } finally { await app.close(); db.close(); }
  });
});
