import { randomUUID } from 'node:crypto';
import type { RecurrenceRule, Task } from '@draconis/shared';
import { addRecurrence } from '@draconis/shared';
import { eq, max } from 'drizzle-orm';
import { db } from '../../core/db.js';
import { tasks, type TaskRow } from './schema.js';

function parseRecurrence(value: string | null): RecurrenceRule | null {
  if (!value) return null;
  return JSON.parse(value) as RecurrenceRule;
}

export function spawnNextRecurrence(completed: TaskRow, now: string) {
  const recurrence = parseRecurrence(completed.recurrence);
  const dueDate = completed.dueDate ?? completed.plannedDate;
  if (!recurrence || !dueDate) return null;

  const nextDueDate = addRecurrence(dueDate, recurrence);
  const [{ value: highestPosition }] = db
    .select({ value: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.lane, 'todo'))
    .all();

  const row: TaskRow = {
    id: randomUUID(),
    title: completed.title,
    description: completed.description,
    lane: 'todo',
    plannedDate: nextDueDate,
    dueDate: nextDueDate,
    dueTime: completed.dueTime,
    timezone: completed.timezone,
    recurrence: completed.recurrence,
    recurrenceParentId: completed.recurrenceParentId ?? completed.id,
    position: (highestPosition ?? 0) + 1000,
    version: 1,
    createdBy: completed.createdBy,
    priority: completed.priority,
    labels: completed.labels,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };

  db.insert(tasks).values(row).run();
  return row;
}

export function toTask(row: TaskRow): Task {
  return {
    ...row,
    lane: row.lane as Task['lane'],
    priority: row.priority as Task['priority'],
    version: row.version,
    labels: JSON.parse(row.labels) as string[],
    recurrence: parseRecurrence(row.recurrence),
  };
}
