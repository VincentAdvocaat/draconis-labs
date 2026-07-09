import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const defaultPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'planner.db',
);
const databasePath = process.env.DATABASE_PATH ?? defaultPath;
mkdirSync(dirname(databasePath), { recursive: true });

export const sqlite = new Database(databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    lane TEXT NOT NULL DEFAULT 'todo',
    planned_date TEXT,
    position REAL NOT NULL,
    created_by TEXT NOT NULL DEFAULT 'user',
    priority TEXT NOT NULL DEFAULT 'normal',
    labels TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_lane_position
    ON tasks(lane, position);
  CREATE INDEX IF NOT EXISTS idx_tasks_planned_date
    ON tasks(planned_date);

  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
`);

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  lane: text('lane', { enum: ['todo', 'doing', 'done'] }).notNull(),
  plannedDate: text('planned_date'),
  position: real('position').notNull(),
  createdBy: text('created_by').notNull(),
  priority: text('priority', {
    enum: ['low', 'normal', 'high', 'urgent'],
  }).notNull(),
  labels: text('labels').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  completedAt: text('completed_at'),
});

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  keyHash: text('key_hash').notNull().unique(),
  createdAt: text('created_at').notNull(),
});

export const db = drizzle(sqlite);
