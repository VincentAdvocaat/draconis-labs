import type Database from 'better-sqlite3';
import { applyBookings } from './booking-migration.js';

function applyBaseline(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      lane TEXT NOT NULL DEFAULT 'todo',
      planned_date TEXT,
      due_date TEXT,
      due_time TEXT,
      timezone TEXT,
      recurrence TEXT,
      recurrence_parent_id TEXT,
      position REAL NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
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

  `);

  const taskColumns = sqlite.pragma('table_info(tasks)') as Array<{ name: string }>;
  const ensureColumn = (name: string, ddl: string) => {
    if (!taskColumns.some((column) => column.name === name)) {
      sqlite.exec(ddl);
    }
  };
  ensureColumn('version', 'ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1');
  ensureColumn('due_date', 'ALTER TABLE tasks ADD COLUMN due_date TEXT');
  ensureColumn('due_time', 'ALTER TABLE tasks ADD COLUMN due_time TEXT');
  ensureColumn('timezone', 'ALTER TABLE tasks ADD COLUMN timezone TEXT');
  ensureColumn('recurrence', 'ALTER TABLE tasks ADD COLUMN recurrence TEXT');
  ensureColumn('recurrence_parent_id', 'ALTER TABLE tasks ADD COLUMN recurrence_parent_id TEXT');

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);

    CREATE TABLE IF NOT EXISTS user_preferences (
      id TEXT PRIMARY KEY,
      preferences TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

}

export const plannerMigrations = [{ version: 1, apply: applyBaseline }, { version: 2, apply: applyBookings }] as const;
