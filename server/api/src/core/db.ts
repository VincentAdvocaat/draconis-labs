import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { apiKeys } from './schema.js';
import { initializePlannerSqlite, tasks, userPreferences } from '@draconis/planner-sqlite';

const defaultPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'planner.db',
);
const databasePath = process.env.DATABASE_PATH ?? defaultPath;
mkdirSync(dirname(databasePath), { recursive: true });

export const sqlite = new Database(databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

initializePlannerSqlite(sqlite);
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite);
export { apiKeys, tasks, userPreferences };
