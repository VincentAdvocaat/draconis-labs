import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { createPlannerRoutes } from '../src/modules/planner/routes.js';
import { createPlannerService, TaskConflictError } from '@draconis/planner-core';
import { createSqlitePlannerStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { describe, expect, it } from 'vitest';

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
});
