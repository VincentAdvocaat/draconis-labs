import type { CreateTaskInput, PaginatedTasks, Task, UpdateTaskInput } from '@draconis/shared';
import {
  ISO_DATE_PATTERN,
  todayInTimezone,
} from '@draconis/shared';
import type { PlannerListQuery } from './query.js';
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
  type SQL,
} from 'drizzle-orm';
import { db } from '../../core/db.js';
import { tasks, type TaskRow } from './schema.js';
import { toTask } from './task-mapper.js';

function localDayStart(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

function buildTaskFilters(query: PlannerListQuery) {
  const filters: SQL[] = [];
  const timezone = query.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInTimezone(timezone);

  if (query.lane) filters.push(eq(tasks.lane, query.lane));
  if (query.priority) filters.push(eq(tasks.priority, query.priority));
  if (query.plannedDate) filters.push(eq(tasks.plannedDate, query.plannedDate));
  if (query.dueDate) filters.push(eq(tasks.dueDate, query.dueDate));
  if (query.createdBy) filters.push(eq(tasks.createdBy, query.createdBy));
  if (query.label) filters.push(like(tasks.labels, `%"${query.label.replaceAll('"', '')}"%`));
  if (query.q) filters.push(like(tasks.title, `%${query.q.replaceAll('%', '')}%`));
  if (query.overdue) {
    filters.push(
      and(
        or(eq(tasks.lane, 'todo'), eq(tasks.lane, 'doing')),
        isNotNull(tasks.dueDate),
        lte(tasks.dueDate, today),
      )!,
    );
  }
  if (query.future) {
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
      )!,
    );
  } else if (query.date) {
    if (!ISO_DATE_PATTERN.test(query.date)) throw new Error('Ongeldige datum');
    filters.push(eq(tasks.plannedDate, query.date));
  }

  return filters.length ? and(...filters) : undefined;
}

export const plannerRepository = {
  list(query: PlannerListQuery): Task[] | PaginatedTasks {
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
  },

  history(query: { from?: string; page?: number; pageSize?: number }): Task[] | PaginatedTasks {
    const historyFilters = [eq(tasks.lane, 'done'), isNotNull(tasks.completedAt)];
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
  },

  findById(id: string): TaskRow | undefined {
    return db.select().from(tasks).where(eq(tasks.id, id)).get();
  },

  maxTodoPosition(): number {
    const [{ value }] = db
      .select({ value: max(tasks.position) })
      .from(tasks)
      .where(eq(tasks.lane, 'todo'))
      .all();
    return value ?? 0;
  },

  insert(row: TaskRow) {
    db.insert(tasks).values(row).run();
  },

  update(id: string, values: Partial<TaskRow>) {
    db.update(tasks).set(values).where(eq(tasks.id, id)).run();
  },

  delete(id: string) {
    return db.delete(tasks).where(eq(tasks.id, id)).run();
  },
};

export function serializeRecurrence(
  value: CreateTaskInput['recurrence'] | UpdateTaskInput['recurrence'],
) {
  return value === undefined ? undefined : value ? JSON.stringify(value) : null;
}

export type { TaskRow };
