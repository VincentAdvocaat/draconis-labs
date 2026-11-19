import type { Task } from '@draconis/shared';
import type { TaskRow } from './schema.js';

export function toTask(row: TaskRow): Task {
  return { ...row, labels: JSON.parse(row.labels), recurrence: row.recurrence ? JSON.parse(row.recurrence) : null };
}
export function toRow(task: Task): TaskRow;
export function toRow(task: Partial<Task>): Partial<TaskRow>;
export function toRow(task: Partial<Task>): Partial<TaskRow> {
  return { ...task,
    labels: task.labels === undefined ? undefined : JSON.stringify(task.labels),
    recurrence: task.recurrence === undefined ? undefined : task.recurrence === null ? null : JSON.stringify(task.recurrence),
  };
}
