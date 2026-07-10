import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  lane: text('lane', { enum: ['todo', 'doing', 'done'] }).notNull(),
  plannedDate: text('planned_date'),
  dueDate: text('due_date'),
  dueTime: text('due_time'),
  timezone: text('timezone'),
  recurrence: text('recurrence'),
  recurrenceParentId: text('recurrence_parent_id'),
  position: real('position').notNull(),
  version: integer('version').notNull().default(1),
  createdBy: text('created_by').notNull(),
  priority: text('priority', {
    enum: ['low', 'normal', 'high', 'urgent'],
  }).notNull(),
  labels: text('labels').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  preferences: text('preferences').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type TaskRow = typeof tasks.$inferSelect;
