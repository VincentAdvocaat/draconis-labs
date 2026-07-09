import { randomUUID } from 'node:crypto';
import type { CreateTaskInput, Lane, Priority, Task, UpdateTaskInput } from '@draconis/shared';
import { and, asc, desc, eq, gt, gte, isNotNull, isNull, lte, max, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { identifyActor } from './auth.js';
import { db, tasks } from './db.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const laneSchema = z.enum(['todo', 'doing', 'done']);
const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(10_000).optional(),
  plannedDate: z.string().regex(datePattern).nullable().optional(),
  priority: prioritySchema.optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

const updateSchema = createSchema
  .partial()
  .extend({
    description: z.string().max(10_000).nullable().optional(),
    lane: laneSchema.optional(),
    position: z.number().finite().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Geen wijzigingen opgegeven');

const querySchema = z.object({
  date: z.string().optional(),
  lane: laneSchema.optional(),
  future: z.enum(['true', 'false']).optional(),
});

const historyQuerySchema = z.object({
  from: z.string().regex(datePattern).optional(),
});

type TaskRow = typeof tasks.$inferSelect;

function toTask(row: TaskRow): Task {
  return {
    ...row,
    lane: row.lane as Lane,
    priority: row.priority as Priority,
    labels: JSON.parse(row.labels) as string[],
  };
}

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localDayStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function registerPlannerRoutes(app: FastifyInstance) {
  app.get('/api/planner/tasks', async (request) => {
    const query = querySchema.parse(request.query);
    const filters = [];
    const today = localDate();
    const todayStart = localDayStart();

    if (query.lane) filters.push(eq(tasks.lane, query.lane));
    if (query.future === 'true') {
      filters.push(gt(tasks.plannedDate, today));
    } else if (query.date === 'today') {
      filters.push(
        or(
          and(
            or(isNotNull(tasks.completedAt), eq(tasks.lane, 'done')),
            gte(tasks.completedAt, todayStart),
          ),
          and(
            or(eq(tasks.lane, 'todo'), eq(tasks.lane, 'doing')),
            or(lte(tasks.plannedDate, today), isNull(tasks.plannedDate)),
          ),
        ),
      );
    } else if (query.date) {
      if (!datePattern.test(query.date)) throw new Error('Ongeldige datum');
      filters.push(eq(tasks.plannedDate, query.date));
    }

    const rows = db
      .select()
      .from(tasks)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(tasks.lane), asc(tasks.position))
      .all();
    return rows.map(toTask);
  });

  app.post('/api/planner/tasks', async (request, reply) => {
    const input = createSchema.parse(request.body) as CreateTaskInput;
    const actor = identifyActor(request);
    const now = new Date().toISOString();
    const [{ value: highestPosition }] = db
      .select({ value: max(tasks.position) })
      .from(tasks)
      .where(eq(tasks.lane, 'todo'))
      .all();

    const row: TaskRow = {
      id: randomUUID(),
      title: input.title,
      description: input.description ?? null,
      lane: 'todo',
      plannedDate: input.plannedDate ?? null,
      position: (highestPosition ?? 0) + 1000,
      createdBy: actor.name,
      priority: input.priority ?? 'normal',
      labels: JSON.stringify(input.labels ?? []),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    db.insert(tasks).values(row).run();
    return reply.code(201).send(toTask(row));
  });

  app.patch('/api/planner/tasks/:id', async (request, reply) => {
    identifyActor(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const input = updateSchema.parse(request.body) as UpdateTaskInput;
    const existing = db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) return reply.code(404).send({ message: 'Taak niet gevonden' });

    const now = new Date().toISOString();
    const completedAt =
      input.lane === 'done' && existing.lane !== 'done'
        ? now
        : input.lane && input.lane !== 'done'
          ? null
          : existing.completedAt;

    const values = {
      ...input,
      labels: input.labels ? JSON.stringify(input.labels) : undefined,
      updatedAt: now,
      completedAt,
    };
    db.update(tasks).set(values).where(eq(tasks.id, id)).run();
    const updated = db.select().from(tasks).where(eq(tasks.id, id)).get();
    return toTask(updated!);
  });

  app.delete('/api/planner/tasks/:id', async (request, reply) => {
    identifyActor(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = db.delete(tasks).where(eq(tasks.id, id)).run();
    if (!result.changes) return reply.code(404).send({ message: 'Taak niet gevonden' });
    return reply.code(204).send();
  });

  app.get('/api/planner/history', async (request) => {
    const query = historyQuerySchema.parse(request.query);
    const historyFilters = [
      eq(tasks.lane, 'done'),
      isNotNull(tasks.completedAt),
    ];
    if (query.from) {
      historyFilters.push(
        gte(tasks.completedAt, new Date(`${query.from}T00:00:00`).toISOString()),
      );
    }
    const rows = db
      .select()
      .from(tasks)
      .where(and(...historyFilters))
      .orderBy(desc(tasks.completedAt))
      .all();
    return rows.map(toTask);
  });
}
