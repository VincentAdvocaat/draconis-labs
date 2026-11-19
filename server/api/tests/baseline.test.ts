import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it, vi } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe.each(['legacy', 'current'])('%s SQLite baseline', (fixture) => {
  it('preserves stored fields and exercises v1 and compatibility task flows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-baseline-'));
    const path = join(dir, 'fixture.db');
    const source = new Database(path);
    source.exec(readFileSync(new URL('./fixtures/legacy.sql', import.meta.url), 'utf8'));
    if (fixture === 'current') {
      source.exec(readFileSync(new URL('./fixtures/current.sql', import.meta.url), 'utf8'));
    }
    const before = source.prepare('SELECT * FROM tasks ORDER BY id').all() as Record<string, unknown>[];
    const preferencesBefore = source.prepare('SELECT * FROM user_preferences').all();
    source.close();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T10:00:00.000Z'));
    const previousPath = process.env.DATABASE_PATH;
    process.env.DATABASE_PATH = path;
    vi.resetModules();
    const { buildApp } = await import('../src/core/index.js');
    const { sqlite } = await import('../src/core/db.js');
    const app = await buildApp();
    try {
      // Opening an old DB may add columns, but every original cell must survive.
      const after = sqlite.prepare('SELECT * FROM tasks ORDER BY id').all();
      for (let index = 0; index < before.length; index++) {
        expect(after[index]).toMatchObject(before[index]);
      }
      expect(sqlite.prepare('SELECT * FROM user_preferences').all()).toEqual(preferencesBefore);
      const { initializePlannerSqlite } = await import('@draconis/planner-sqlite');
      const versions = sqlite.prepare('SELECT * FROM planner_schema_migrations').all();
      expect(versions).toMatchObject([{ version: 1 }, { version: 2 }, { version: 3 }]);
      initializePlannerSqlite(sqlite);
      expect(sqlite.prepare('SELECT * FROM planner_schema_migrations').all()).toEqual(versions);
      const get = (url: string) => app.inject({ method: 'GET', url });
      const list = (await get('/api/v1/planner/tasks')).json();
      expect(list.map((task: { id: string }) => task.id)).toEqual([id(3), id(2), id(1)]);
      expect(list[2]).toEqual({
        id: id(1), title: 'Fictieve inspectie', description: 'Behoud deze tekst',
        lane: 'todo', plannedDate: '2026-11-19', position: 2000,
        createdBy: 'demo-agent', priority: 'high', labels: ['demo', 'onderhoud'],
        createdAt: '2026-11-18T10:00:00.000Z', updatedAt: '2026-11-18T10:00:00.000Z',
        completedAt: null, version: fixture === 'current' ? 7 : 1,
        dueDate: fixture === 'current' ? '2026-11-20' : null,
        dueTime: fixture === 'current' ? '09:15' : null,
        timezone: fixture === 'current' ? 'Europe/Amsterdam' : null,
        recurrence: fixture === 'current' ? { frequency: 'weekly', interval: 2 } : null,
        recurrenceParentId: null,
      });
      expect((await get('/api/v1/planner/tasks?date=today&timezone=Europe/Amsterdam')).json()).toEqual([list[1], list[2]]);
      const legacy = await get('/api/planner/tasks');
      expect(legacy.json()).toEqual(list);
      expect(legacy.headers.deprecation).toBe('true');
      expect(legacy.headers.sunset).toBe('2026-12-31');
      expect(legacy.headers.link).toContain('/api/v1');
      expect((await get('/api/v1/planner/tasks?page=1&pageSize=2')).json()).toEqual({
        items: list.slice(0, 2), total: 3, page: 1, pageSize: 2,
      });
      expect((await get('/api/v1/planner/tasks?date=2026-11-19')).json()).toEqual([list[2]]);
      expect((await get('/api/v1/planner/tasks?lane=todo&label=demo&priority=high')).json()).toEqual([list[2]]);
      expect((await get('/api/v1/planner/history?from=2026-11-18')).json()).toEqual([list[0]]);
      expect((await get('/api/v1/planner/preferences')).json()).toMatchObject({
        locale: 'nl', timezone: 'Europe/Amsterdam', defaultView: 'scheduled',
      });
      const prefs = await app.inject({ method: 'PATCH', url: '/api/v1/planner/preferences', payload: { locale: 'en' } });
      expect(prefs.json().locale).toBe('en');
      expect((await get('/api/v1/planner/preferences')).json().locale).toBe('en');
      const moved = await app.inject({ method: 'PATCH', url: `/api/v1/planner/tasks/${id(1)}`, payload: { lane: 'doing', position: 1500, version: list[2].version } });
      expect(moved.statusCode).toBe(200);
      expect(moved.json()).toMatchObject({ lane: 'doing', position: 1500, version: list[2].version + 1 });
      const conflict = await app.inject({ method: 'PATCH', url: `/api/v1/planner/tasks/${id(1)}`, payload: { title: 'Verouderd', version: list[2].version } });
      expect(conflict.statusCode).toBe(409);
      const complete = await app.inject({ method: 'PATCH', url: `/api/v1/planner/tasks/${id(1)}`, payload: { lane: 'done' } });
      expect(complete.statusCode).toBe(200);
      const repeated = await app.inject({ method: 'PATCH', url: `/api/v1/planner/tasks/${id(1)}`, payload: { lane: 'done' } });
      expect(repeated.statusCode).toBe(200);
      const children = (await get('/api/v1/planner/tasks?lane=todo')).json();
      expect(children).toHaveLength(fixture === 'current' ? 2 : 1);
      if (fixture === 'current') {
        expect(children[1]).toMatchObject({ recurrenceParentId: id(1), plannedDate: '2026-12-04', dueDate: '2026-12-04', dueTime: '09:15', labels: ['demo', 'onderhoud'] });
      }
      const created = await app.inject({ method: 'POST', url: '/api/v1/planner/tasks', payload: { title: 'Nieuwe fictieve taak', plannedDate: '2026-11-21' } });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ plannedDate: '2026-11-21', dueDate: '2026-11-21', version: 1 });
      const removed = await app.inject({ method: 'DELETE', url: `/api/v1/planner/tasks/${created.json().id}` });
      expect(removed.statusCode).toBe(204);
      // Reopen the same file independently: writes did not remain in memory.
      const reopened = new Database(path, { readonly: true });
      expect(reopened.prepare('SELECT lane FROM tasks WHERE id=?').get(id(1))).toEqual({ lane: 'done' });
      expect(reopened.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: fixture === 'current' ? 4 : 3 });
      reopened.close();
    } finally {
      vi.useRealTimers();
      await app.close();
      sqlite.close();
      if (previousPath === undefined) delete process.env.DATABASE_PATH;
      else process.env.DATABASE_PATH = previousPath;
      rmSync(dir, { recursive: true, force: true });
    }
  }, 15000);
});
