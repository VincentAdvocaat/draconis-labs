import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { createPlannerService } from '@draconis/planner-core';
import { createSqlitePlannerStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { expect, it } from 'vitest';
import { createPlannerRoutes } from '../src/modules/planner/routes.js';

it('filters the full Planner result before counting and splitting it into pages', async () => {
  const sqlite = new Database(':memory:');
  const http = Fastify();
  try {
    initializePlannerSqlite(sqlite);
    let sequence = 0;
    const planner = createPlannerService(createSqlitePlannerStorage(sqlite), {
      now: () => '2026-11-19T10:00:00.000Z',
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
    await http.register(createPlannerRoutes(planner, () => ({ kind: 'user', name: 'planner-user' })));
    const actor = { name: 'planner-user' };
    const add = (title: string) => planner.create({ title, priority: 'high', labels: ['demo'] }, actor);
    const first = add('Inspectie Z');
    const wrongLane = add('Inspectie onderweg');
    planner.update(wrongLane.id, { lane: 'doing' });
    const second = add('Inspectie A');
    planner.create({ title: 'Inspectie gewoon', priority: 'normal', labels: ['demo'] }, actor);
    const third = add('Inspectie Q');
    planner.create({ title: 'Inspectie oud', priority: 'high', labels: ['demo-oud'] }, actor);
    const fourth = add('Inspectie C');
    add('Opdracht zonder zoekwoord');
    const fifth = add('Inspectie B');

    const query = '/tasks?lane=todo&priority=high&label=demo&q=Inspectie';
    const unpaginated = await http.inject(query);
    expect(unpaginated.statusCode).toBe(200);
    expect(unpaginated.json()).toEqual([first, second, third, fourth, fifth]);

    for (const [page, items] of [[1, [first, second]], [2, [third, fourth]], [3, [fifth]], [4, []]] as const) {
      const response = await http.inject(`${query}&page=${page}&pageSize=2`);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ page, pageSize: 2, total: 5, items });
    }
    const noMatches = await http.inject('/tasks?lane=done&priority=high&label=demo&q=Inspectie&page=1&pageSize=2');
    expect(noMatches.statusCode).toBe(200);
    expect(noMatches.json()).toEqual({ page: 1, pageSize: 2, total: 0, items: [] });
  } finally {
    await http.close();
    sqlite.close();
  }
});
