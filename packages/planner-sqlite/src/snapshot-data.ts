import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { plannerMigrations } from './migrations.js';
import { createTaskSchema, updatePreferencesSchema, uuidParamSchema } from '@draconis/shared';

export const IMPORT_VERSION = 1;
export const taskColumns = ['id', 'title', 'description', 'lane', 'planned_date', 'due_date', 'due_time', 'timezone', 'recurrence', 'recurrence_parent_id', 'position', 'version', 'created_by', 'priority', 'labels', 'created_at', 'updated_at', 'completed_at'] as const;
export const preferenceColumns = ['id', 'preferences', 'updated_at'] as const;
export type SnapshotRow = Record<string, string | number | null>;
export interface ImportConflict { kind: string; id: string; sourceVersion?: string | number | null; targetVersion?: string | number | null }
export class PlannerSnapshotError extends Error {
  readonly code: string;
  readonly conflicts: ImportConflict[];
  constructor(code: string, message: string, conflicts: ImportConflict[] = []) { super(message); this.code = code; this.conflicts = conflicts; }
}
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
  return value;
}
export const dataHash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

export function readPlannerData(db: Database.Database) {
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name").all() as { name: string }[]).map(row => row.name);
  if (!tables.includes('tasks')) throw new PlannerSnapshotError('INVALID_SOURCE', 'De snapshot bevat geen Planner-taken.');
  const columns = (db.pragma('table_info(tasks)') as { name: string }[]).map(column => column.name);
  if (columns.some(column => !taskColumns.includes(column as typeof taskColumns[number]))) throw new PlannerSnapshotError('UNSUPPORTED_SCHEMA', 'De snapshot bevat onbekende taakkolommen.');
  const originalColumns = taskColumns.filter(column => !['due_date', 'due_time', 'timezone', 'recurrence', 'recurrence_parent_id', 'version'].includes(column));
  if (originalColumns.some(column => !columns.includes(column))) throw new PlannerSnapshotError('UNSUPPORTED_SCHEMA', 'Het oude taakschema wordt niet herkend.');
  const migrations = tables.includes('planner_schema_migrations')
    ? db.prepare('SELECT version FROM planner_schema_migrations ORDER BY version').all() as { version: number }[] : [];
  if (migrations.some(row => !plannerMigrations.some(migration => Number(migration.version) === row.version))) throw new PlannerSnapshotError('UNSUPPORTED_SCHEMA', 'De snapshot bevat een onbekende Planner-migratie.');
  if (migrations.length && taskColumns.some(column => !columns.includes(column))) throw new PlannerSnapshotError('INVALID_SOURCE', 'Migratiehistorie en taakschema komen niet overeen.');
  const tasks = (db.prepare('SELECT * FROM tasks ORDER BY id').all() as SnapshotRow[]).map(row =>
    Object.fromEntries(taskColumns.map(column => [column, Object.hasOwn(row, column) ? row[column] : column === 'version' ? 1 : null])) as SnapshotRow);
  for (const row of tasks) {
    try {
      uuidParamSchema.parse({ id: row.id });
      if (typeof row.labels !== 'string' || (row.recurrence !== null && typeof row.recurrence !== 'string')) throw new Error();
      if (row.recurrence_parent_id !== null) uuidParamSchema.parse({ id: row.recurrence_parent_id });
      if (!['todo', 'doing', 'done'].includes(String(row.lane)) || typeof row.created_by !== 'string' || !Number.isFinite(row.position) || !Number.isSafeInteger(row.version) || Number(row.version) < 1) throw new Error();
      for (const key of ['created_at', 'updated_at']) if (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key] as string))) throw new Error();
      if (row.completed_at !== null && (typeof row.completed_at !== 'string' || !Number.isFinite(Date.parse(row.completed_at)))) throw new Error();
      createTaskSchema.parse({ title: row.title, description: row.description ?? undefined,
        plannedDate: row.planned_date, dueDate: row.due_date, dueTime: row.due_time, timezone: row.timezone,
        recurrence: row.recurrence === null ? null : JSON.parse(String(row.recurrence)),
        priority: row.priority, labels: JSON.parse(String(row.labels)),
      });
    } catch { throw new PlannerSnapshotError('INVALID_TASK', `Ongeldig taakrecord ${String(row.id)}.`); }
  }
  const byId = new Map(tasks.map(row => [row.id, row]));
  const ids = new Set(byId.keys());
  if (ids.size !== tasks.length) throw new PlannerSnapshotError('INVALID_TASK', 'Dubbele taak-ID in de bron.');
  const validated = new Set();
  for (const row of tasks) {
    const visited = new Set();
    let current: SnapshotRow | undefined = row;
    while (current?.recurrence_parent_id !== null) {
      if (current && validated.has(current.id)) break;
      if (!current || visited.has(current.id) || !ids.has(current.recurrence_parent_id)) throw new PlannerSnapshotError('INVALID_RELATION', `Ongeldige herhaalrelatie voor ${String(row.id)}.`);
      visited.add(current.id);
      current = byId.get(current.recurrence_parent_id);
    }
    for (const id of visited) validated.add(id);
  }
  if (tables.includes('user_preferences') && (db.pragma('table_info(user_preferences)') as { name: string }[]).some(column => !preferenceColumns.includes(column.name as typeof preferenceColumns[number]))) throw new PlannerSnapshotError('UNSUPPORTED_SCHEMA', 'De snapshot bevat onbekende voorkeurkolommen.');
  const preferences = tables.includes('user_preferences') ? db.prepare('SELECT id, preferences, updated_at FROM user_preferences ORDER BY id').all() as SnapshotRow[] : [];
  if (new Set(preferences.map(row => row.id)).size !== preferences.length) throw new PlannerSnapshotError('INVALID_PREFERENCES', 'Dubbele voorkeur-ID.');
  for (const row of preferences) {
    try {
      if (typeof row.id !== 'string' || !row.id || typeof row.preferences !== 'string' || typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) throw new Error();
      updatePreferencesSchema.parse(JSON.parse(row.preferences));
    } catch { throw new PlannerSnapshotError('INVALID_PREFERENCES', `Ongeldige voorkeuren ${String(row.id)}.`); }
  }
  return { tasks, preferences, tables, migrations: migrations.map(row => row.version) };
}
