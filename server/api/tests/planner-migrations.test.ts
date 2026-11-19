import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { initializePlannerSqlite } from '@draconis/planner-sqlite';
import { describe, expect, it } from 'vitest';

describe('numbered Planner SQLite migrations', () => {
  it('rolls back DDL and its version marker together and can retry the same old schema', () => {
    const db = new Database(':memory:');
    db.exec(readFileSync(new URL('./fixtures/legacy.sql', import.meta.url), 'utf8'));
    db.exec('CREATE TABLE idx_tasks_due_date (value TEXT)');
    const schema = db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all();
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    const preferences = db.prepare('SELECT * FROM user_preferences').all();
    try {
      expect(() => initializePlannerSqlite(db)).toThrow();
      expect(db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all()).toEqual(schema);
      expect(db.prepare('SELECT * FROM tasks ORDER BY id').all()).toEqual(tasks);
      expect(db.prepare('SELECT * FROM user_preferences').all()).toEqual(preferences);
      db.exec('DROP TABLE idx_tasks_due_date');
      initializePlannerSqlite(db);
      const versions = db.prepare('SELECT * FROM planner_schema_migrations').all();
      expect(versions).toMatchObject([{ version: 1 }, { version: 2 }, { version: 3 }]);
      initializePlannerSqlite(db);
      expect(db.prepare('SELECT * FROM planner_schema_migrations').all()).toEqual(versions);
      for (const [index, row] of tasks.entries()) {
        expect(db.prepare('SELECT * FROM tasks ORDER BY id').all()[index]).toMatchObject(row as object);
      }
    } finally { db.close(); }
  });

  it('refuses an unknown future migration without touching task data or history', () => {
    const db = new Database(':memory:');
    db.exec(readFileSync(new URL('./fixtures/legacy.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('./fixtures/current.sql', import.meta.url), 'utf8'));
    initializePlannerSqlite(db);
    db.prepare('INSERT INTO planner_schema_migrations VALUES (?, ?)').run(99, '2026-11-20T00:00:00.000Z');
    const tasks = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    const versions = db.prepare('SELECT * FROM planner_schema_migrations').all();
    try {
      expect(() => initializePlannerSqlite(db)).toThrow('onbekende migratieversie');
      expect(db.prepare('SELECT * FROM tasks ORDER BY id').all()).toEqual(tasks);
      expect(db.prepare('SELECT * FROM planner_schema_migrations').all()).toEqual(versions);
    } finally { db.close(); }
  });
});
