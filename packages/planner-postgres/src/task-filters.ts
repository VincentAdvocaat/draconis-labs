import { ISO_DATE_PATTERN, dayBoundsInTimezone, todayInTimezone } from '@draconis/shared';
import type { TaskListQuery } from '@draconis/shared';
import { and, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { tasks } from './schema.js';

export function taskFilters(query: TaskListQuery, now = new Date()) {
  const filters: (SQL | undefined)[] = [];
  const timezone = query.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = todayInTimezone(timezone, now);

  if (query.lane) filters.push(eq(tasks.lane, query.lane));
  if (query.priority) filters.push(eq(tasks.priority, query.priority));
  if (query.plannedDate) filters.push(eq(tasks.plannedDate, query.plannedDate));
  if (query.dueDate) filters.push(eq(tasks.dueDate, query.dueDate));
  if (query.createdBy) filters.push(eq(tasks.createdBy, query.createdBy));
  // Match SQLite LIKE for the existing filters: fold ASCII and keep underscore as a wildcard.
  const asciiUpper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const asciiLower = 'abcdefghijklmnopqrstuvwxyz';
  if (query.label) {
    filters.push(sql`translate(${tasks.labels}::text, ${asciiUpper}, ${asciiLower}) LIKE
      translate(${`%"${query.label.replaceAll('"', '')}"%`}, ${asciiUpper}, ${asciiLower}) ESCAPE ''`);
  }
  if (query.q) {
    filters.push(sql`translate(${tasks.title}, ${asciiUpper}, ${asciiLower}) LIKE
      translate(${`%${query.q.replaceAll('%', '')}%`}, ${asciiUpper}, ${asciiLower}) ESCAPE ''`);
  }
  const active = or(eq(tasks.lane, 'todo'), eq(tasks.lane, 'doing'));
  if (query.overdue) filters.push(and(active, lte(tasks.dueDate, today)));
  if (query.future) filters.push(gt(tasks.plannedDate, today));
  else if (query.date === 'today') {
    const { start, end } = dayBoundsInTimezone(timezone, now);
    filters.push(or(
      and(gte(tasks.completedAt, start), lt(tasks.completedAt, end)),
      and(active, or(lte(tasks.plannedDate, today), isNull(tasks.plannedDate))),
    ));
  } else if (query.date) {
    if (!ISO_DATE_PATTERN.test(query.date)) throw new Error('Ongeldige datum');
    filters.push(eq(tasks.plannedDate, query.date));
  }
  return and(...filters);
}

export function historyFilter(from?: string) {
  return and(eq(tasks.lane, 'done'), isNotNull(tasks.completedAt),
    from ? gte(tasks.completedAt, new Date(`${from}T00:00:00`).toISOString()) : undefined);
}
