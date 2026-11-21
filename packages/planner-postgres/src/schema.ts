import type { Lane, Task, UserPreferences } from '@draconis/shared';
import { bigint, doublePrecision, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

export const tasks = pgTable('planner_tasks', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  lane: text('lane').$type<Lane>().notNull(),
  plannedDate: text('planned_date'),
  dueDate: text('due_date'),
  dueTime: text('due_time'),
  timezone: text('timezone'),
  recurrence: jsonb('recurrence').$type<Task['recurrence']>(),
  recurrenceParentId: text('recurrence_parent_id'),
  position: doublePrecision('position').notNull(),
  version: bigint('version', { mode: 'number' }).notNull(),
  createdBy: text('created_by').notNull(),
  priority: text('priority').$type<Task['priority']>().notNull(),
  labels: jsonb('labels').$type<Task['labels']>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const preferences = pgTable('planner_preferences', {
  workspaceId: text('workspace_id').notNull(),
  id: text('id').notNull(),
  preferences: jsonb('preferences').$type<UserPreferences>().notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const receipts = pgTable('planner_task_creation_receipts', {
  workspaceId: text('workspace_id').notNull(),
  actor: text('actor').notNull(),
  key: text('key').notNull(),
  hash: text('hash').notNull(),
  result: jsonb('result').$type<Task>().notNull(),
});

export function toTask({ workspaceId: _workspaceId, ...task }: typeof tasks.$inferSelect): Task {
  return task;
}
