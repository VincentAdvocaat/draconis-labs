import type { PaginatedTasks, Task } from '@draconis/shared';
import {
  ISO_DATE_PATTERN,
  dayBoundsInTimezone,
  todayInTimezone,
} from '@draconis/shared';
import type { TaskListQuery as PlannerListQuery, UserPreferences } from '@draconis/shared';
import { DEFAULT_PREFERENCES } from '@draconis/shared';
import type { PlannerStorage } from '@draconis/planner-core';
import type Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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
  lt,
  lte,
  max,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { tasks, userPreferences } from './schema.js';
import { toTask, toRow } from './mapper.js';

function buildTaskFilters(query: PlannerListQuery, now = new Date()) {
  const filters: SQL[] = [];
  const timezone = query.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInTimezone(timezone, now);

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
    const { start, end } = dayBoundsInTimezone(timezone, now);
    filters.push(
      or(
        and(
          or(isNotNull(tasks.completedAt), eq(tasks.lane, 'done')),
          gte(tasks.completedAt, start),
          lt(tasks.completedAt, end),
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

export function createSqlitePlannerStorage(sqlite: Database.Database, busyTimeoutMs = 5000): PlannerStorage {
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 5000) throw new Error('Invalid SQLite busy timeout');
  sqlite.pragma(`busy_timeout = ${busyTimeoutMs}`);
  const db = drizzle(sqlite);
  return {
    transaction<T>(operation: () => T): T {
      try { return sqlite.transaction(operation).immediate(); }
      catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' && error.code.startsWith('SQLITE_BUSY')) {
          throw Object.assign(new Error('Planner is tijdelijk bezet. Probeer opnieuw.'), { statusCode: 503 });
        }
        throw error;
      }
    },
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

    listByCursor({ filters, after, limit, now }) {
      const boundary = after && sql`(${tasks.lane}, ${tasks.position}, ${tasks.id}) > (${after.lane}, ${after.position}, ${after.id})`;
      return db.select().from(tasks)
        .where(and(buildTaskFilters(filters, now), boundary))
        .orderBy(asc(tasks.lane), asc(tasks.position), asc(tasks.id))
        .limit(limit)
        .all()
        .map(toTask);
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

    find(id: string): Task | undefined {
      const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
      return row ? toTask(row) : undefined;
    },

    maxTodoPosition(): number {
      const [{ value }] = db
        .select({ value: max(tasks.position) })
        .from(tasks)
        .where(eq(tasks.lane, 'todo'))
        .all();
      return value ?? 0;
    },

    insert(task: Task) {
      db.insert(tasks).values(toRow(task)).run();
    },

    update(id: string, values: Partial<Task>) {
      db.update(tasks).set(toRow(values)).where(eq(tasks.id, id)).run();
    },

    remove(id: string) {
      return db.delete(tasks).where(eq(tasks.id, id)).run().changes > 0;
    },
    lane(lane) {
      return db.select().from(tasks).where(eq(tasks.lane, lane)).orderBy(asc(tasks.position)).all().map(toTask);
    },
    loadPreferences() {
      const row = db.select().from(userPreferences).where(eq(userPreferences.id, 'default')).get();
      return row ? { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences) as UserPreferences } : DEFAULT_PREFERENCES;
    },
    savePreferences(value, now) {
      db.insert(userPreferences).values({ id: 'default', preferences: JSON.stringify(value), updatedAt: now })
        .onConflictDoUpdate({ target: userPreferences.id, set: { preferences: JSON.stringify(value), updatedAt: now } }).run();
      return value;
    },
  };
}
