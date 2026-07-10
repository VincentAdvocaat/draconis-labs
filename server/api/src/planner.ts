import { randomUUID } from 'node:crypto';
import type { CreateTaskInput, Lane, UpdateTaskInput } from '@draconis/shared';
import { todayInTimezone } from '@draconis/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  max,
  or,
} from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { identifyActor } from './auth.js';
import { db, tasks } from './db.js';
import { rebalanceLaneIfNeeded } from './ordering.js';
import { spawnNextRecurrence, toTask } from './task-mapper.js';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
const laneSchema = z.enum(['todo', 'doing', 'done']);
const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(30).optional(),
}).nullable();

const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(10_000).optional(),
  plannedDate: z.string().regex(datePattern).nullable().optional(),
  dueDate: z.string().regex(datePattern).nullable().optional(),
  dueTime: z.string().regex(timePattern).nullable().optional(),
  timezone: z.string().min(1).max(80).nullable().optional(),
  recurrence: recurrenceSchema.optional(),
  priority: prioritySchema.optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

const updateSchema = createSchema
  .partial()
  .extend({
    description: z.string().max(10_000).nullable().optional(),
    lane: laneSchema.optional(),
    position: z.number().finite().optional(),
    version: z.number().int().positive().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Geen wijzigingen opgegeven');

const querySchema = z.object({
  date: z.string().optional(),
  lane: laneSchema.optional(),
  future: z.enum(['true', 'false']).optional(),
  plannedDate: z.string().regex(datePattern).optional(),
  dueDate: z.string().regex(datePattern).optional(),
  priority: prioritySchema.optional(),
  label: z.string().trim().min(1).max(40).optional(),
  createdBy: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  timezone: z.string().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

const historyQuerySchema = z.object({
  from: z.string().regex(datePattern).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

type TaskRow = typeof tasks.$inferSelect;

function buildTaskFilters(query: z.infer<typeof querySchema>) {
  const filters = [];
  const timezone = query.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInTimezone(timezone);

  if (query.lane) filters.push(eq(tasks.lane, query.lane));
  if (query.priority) filters.push(eq(tasks.priority, query.priority));
  if (query.plannedDate) filters.push(eq(tasks.plannedDate, query.plannedDate));
  if (query.dueDate) filters.push(eq(tasks.dueDate, query.dueDate));
  if (query.createdBy) filters.push(eq(tasks.createdBy, query.createdBy));
  if (query.label) filters.push(like(tasks.labels, `%"${query.label.replaceAll('"', '')}"%`));
  if (query.q) filters.push(like(tasks.title, `%${query.q.replaceAll('%', '')}%`));
  if (query.overdue === 'true') {
    filters.push(
      and(
        or(eq(tasks.lane, 'todo'), eq(tasks.lane, 'doing')),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, today),
      ),
    );
  }
  if (query.future === 'true') {
    filters.push(gt(tasks.plannedDate, today));
  } else if (query.date === 'today') {
    const todayStart = localDayStart();
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

  return filters.length ? and(...filters) : undefined;
}

function localDayStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function serializeRecurrence(value: CreateTaskInput['recurrence'] | UpdateTaskInput['recurrence']) {
  return value === undefined ? undefined : value ? JSON.stringify(value) : null;
}

export async function registerPlannerRoutes(app: FastifyInstance) {
  app.get('/api/planner/tasks', async (request) => {
    const query = querySchema.parse(request.query);
    const where = buildTaskFilters(query);
    const order = [asc(tasks.lane), asc(tasks.position)];

    if (query.page) {
      const pageSize = query.pageSize ?? 50;
      const [{ value: total }] = db.select({ value: count() }).from(tasks).where(where).all();
      const rows = db
        .select()
        .from(tasks)
        .where(where)
        .orderBy(...order)
        .limit(pageSize)
        .offset((query.page - 1) * pageSize)
        .all();
      return {
        items: rows.map(toTask),
        total: total ?? 0,
        page: query.page,
        pageSize,
      };
    }

    const rows = db.select().from(tasks).where(where).orderBy(...order).all();
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
      plannedDate: input.plannedDate ?? input.dueDate ?? null,
      dueDate: input.dueDate ?? input.plannedDate ?? null,
      dueTime: input.dueTime ?? null,
      timezone: input.timezone ?? null,
      recurrence: serializeRecurrence(input.recurrence) ?? null,
      recurrenceParentId: null,
      position: (highestPosition ?? 0) + 1000,
      version: 1,
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

    if (input.version !== undefined && input.version !== existing.version) {
      return reply.code(409).send({
        message: 'Deze taak is elders gewijzigd. Vernieuw en probeer opnieuw.',
        task: toTask(existing),
      });
    }

    const now = new Date().toISOString();
    const movingToDone = input.lane === 'done' && existing.lane !== 'done';
    const completedAt =
      movingToDone
        ? now
        : input.lane && input.lane !== 'done'
          ? null
          : existing.completedAt;

    const { version: _version, recurrence, ...changes } = input;
    const values = {
      ...changes,
      labels: input.labels ? JSON.stringify(input.labels) : undefined,
      recurrence: serializeRecurrence(recurrence),
      updatedAt: now,
      completedAt,
      version: existing.version + 1,
    };
    db.update(tasks).set(values).where(eq(tasks.id, id)).run();

    const targetLane = (input.lane ?? existing.lane) as Lane;
    if (input.position !== undefined || input.lane !== undefined) {
      rebalanceLaneIfNeeded(targetLane, now);
    }

    if (movingToDone) {
      const completed = db.select().from(tasks).where(eq(tasks.id, id)).get()!;
      spawnNextRecurrence(completed, now);
    }

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
    const where = and(...historyFilters);

    if (query.page) {
      const pageSize = query.pageSize ?? 50;
      const [{ value: total }] = db.select({ value: count() }).from(tasks).where(where).all();
      const rows = db
        .select()
        .from(tasks)
        .where(where)
        .orderBy(desc(tasks.completedAt))
        .limit(pageSize)
        .offset((query.page - 1) * pageSize)
        .all();
      return {
        items: rows.map(toTask),
        total: total ?? 0,
        page: query.page,
        pageSize,
      };
    }

    const rows = db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(desc(tasks.completedAt))
      .all();
    return rows.map(toTask);
  });
}
