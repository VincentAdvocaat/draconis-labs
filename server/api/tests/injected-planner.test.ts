import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { createPlannerRoutes } from '../src/modules/planner/routes.js';
import { createPlannerService, TaskConflictError } from '@draconis/planner-core';
import { createSqlitePlannerStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { describe, expect, it, vi } from 'vitest';

describe('injected Planner service with real SQLite', () => {
  it('keeps two compositions isolated while preserving ordering, versions, recurrence and preferences', async () => {
    const first = new Database(':memory:'), second = new Database(':memory:');
    initializePlannerSqlite(first); initializePlannerSqlite(second);
    let sequence = 0;
    const environment = {
      now: () => '2026-11-19T10:00:00.000Z',
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    };
    const a = createPlannerService(createSqlitePlannerStorage(first), environment);
    const b = createPlannerService(createSqlitePlannerStorage(second), environment);
    const http = Fastify();
    await http.register(createPlannerRoutes(a, () => ({ kind: 'user', name: 'injected-user' })), { prefix: '/a' });
    await http.register(createPlannerRoutes(b, () => ({ kind: 'user', name: 'injected-user' })), { prefix: '/b' });
    try {
      const initial = a.create({ title: 'Fictieve inspectie', labels: ['demo'] }, { name: 'demo-agent' });
      const recurring = a.create({
        title: 'Herhaalinspectie', plannedDate: '2026-11-19', dueDate: '2026-11-20',
        dueTime: '09:15', timezone: 'Europe/Amsterdam', recurrence: { frequency: 'weekly', interval: 2 },
      }, { name: 'user' });
      a.update(recurring.id, { position: initial.position + 0.5, version: 1 });
      expect(a.list({ lane: 'todo' })).toMatchObject([{ id: initial.id, position: 1000 }, { id: recurring.id, position: 2000 }]);
      expect(() => a.update(recurring.id, { title: 'Verouderd', version: 1 })).toThrow(TaskConflictError);
      a.update(recurring.id, { lane: 'doing', version: 2 });
      a.update(recurring.id, { lane: 'done', version: 3 });
      a.update(recurring.id, { lane: 'done' });
      expect(a.history({})).toMatchObject([{ id: recurring.id, version: 5 }]);
      expect(a.list({ lane: 'todo' })).toMatchObject([
        { id: initial.id },
        { recurrenceParentId: recurring.id, dueDate: '2026-12-04', dueTime: '09:15', timezone: 'Europe/Amsterdam', version: 1 },
      ]);
      const before = b.getPreferences();
      a.updatePreferences({ locale: before.locale === 'nl' ? 'en' : 'nl' });
      expect(b.getPreferences()).toEqual(before);
      expect(b.list({})).toEqual([]);
      expect((await http.inject('/b/tasks')).json()).toEqual([]);
      expect((await http.inject('/a/tasks')).json()).toEqual(a.list({}));
      expect(b.history({})).toEqual([]);
      expect(() => b.update(initial.id, { title: 'Vreemde database' })).toThrow('Taak niet gevonden');
    } finally { await http.close(); first.close(); second.close(); }
  });

  it.each([
    ['spring', '2026-03-29', '2026-03-30', '2026-03-28T22:59:59.999Z', '2026-03-28T23:00:00.000Z', '2026-03-29T21:59:59.999Z', '2026-03-29T22:00:00.000Z'],
    ['autumn', '2026-10-25', '2026-10-26', '2026-10-24T21:59:59.999Z', '2026-10-24T22:00:00.000Z', '2026-10-25T22:59:59.999Z', '2026-10-25T23:00:00.000Z'],
  ])('returns only completions within the selected local day at the %s DST change', async (_season, today, tomorrow, beforeStart, start, beforeEnd, end) => {
    const db = new Database(':memory:');
    const http = Fastify();
    let completedAt = beforeStart;
    const actor = { kind: 'user', name: 'injected-user' } as const;
    try {
      initializePlannerSqlite(db);
      const service = createPlannerService(createSqlitePlannerStorage(db), { id: randomUUID, now: () => completedAt });
      await http.register(createPlannerRoutes(service, () => actor), { prefix: '/api/v1/planner' });

      for (const [title, timestamp] of Object.entries({ yesterday: beforeStart, first: start, last: beforeEnd, tomorrow: end })) {
        const task = service.create({ title }, actor);
        completedAt = timestamp;
        service.update(task.id, { lane: 'done', version: task.version });
      }
      service.create({ title: 'active', plannedDate: today }, actor);
      service.create({ title: 'scheduled', plannedDate: tomorrow }, actor);

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${today}T12:00:00.000Z`));
      const result = await http.inject('/api/v1/planner/tasks?date=today&timezone=Europe%2FAmsterdam');
      expect(result.statusCode).toBe(200);
      expect(result.json().map(({ title }: { title: string }) => title).sort()).toEqual(['active', 'first', 'last']);
    } finally {
      vi.useRealTimers();
      await http.close();
      db.close();
    }
  });

  it('creates one monthly successor in February when completing a task due January 31', async () => {
    const db = new Database(':memory:');
    const http = Fastify();
    try {
      initializePlannerSqlite(db);
      const service = createPlannerService(createSqlitePlannerStorage(db), { id: randomUUID, now: () => '2028-01-31T09:30:00.000Z' });
      await http.register(createPlannerRoutes(service, () => ({ kind: 'user', name: 'injected-user' })), { prefix: '/api/v1/planner' });
      const created = await http.inject({
        method: 'POST', url: '/api/v1/planner/tasks',
        payload: { title: 'Monthly inspection', dueDate: '2028-01-31', dueTime: '10:00', timezone: 'Europe/Amsterdam', recurrence: { frequency: 'monthly' } },
      });
      expect(created.statusCode).toBe(201);
      const task = created.json();
      const completed = await http.inject({
        method: 'PATCH', url: `/api/v1/planner/tasks/${task.id}`, payload: { lane: 'done', version: task.version },
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({ id: task.id, dueDate: '2028-01-31', lane: 'done' });
      const listed = await http.inject('/api/v1/planner/tasks?lane=todo');
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toMatchObject([{
        recurrenceParentId: task.id, dueDate: '2028-02-29', plannedDate: '2028-02-29', dueTime: '10:00', timezone: 'Europe/Amsterdam',
      }]);
    } finally {
      await http.close();
      db.close();
    }
  });
});
