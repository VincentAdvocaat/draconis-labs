import type Database from 'better-sqlite3';
import { plannerMigrations } from './migrations.js';

export function initializePlannerSqlite(sqlite: Database.Database) {
  sqlite.transaction(() => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS planner_schema_migrations (
      version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
    )`);
    const applied = sqlite.prepare('SELECT version FROM planner_schema_migrations ORDER BY version').all() as { version: number }[];
    if (applied.some(row => !plannerMigrations.some(migration => migration.version === row.version))) {
      throw new Error('Planner database bevat een onbekende migratieversie');
    }
    for (const migration of plannerMigrations) {
      if (applied.some(row => row.version === migration.version)) continue;
      migration.apply(sqlite);
      sqlite.prepare('INSERT INTO planner_schema_migrations VALUES (?, ?)').run(migration.version, new Date().toISOString());
    }
  }).immediate();
}
