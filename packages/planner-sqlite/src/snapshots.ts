import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { initializePlannerSqlite } from './bootstrap.js';
import { IMPORT_VERSION, PlannerSnapshotError, canonical, dataHash, preferenceColumns, readPlannerData, taskColumns, type SnapshotRow, type ImportConflict } from './snapshot-data.js';

export { IMPORT_VERSION, PlannerSnapshotError } from './snapshot-data.js';
export function createPlannerSnapshotTools(DatabaseClass: typeof Database) {
  function inspect(path: string) {
    if (['-wal', '-journal'].some(suffix => existsSync(path + suffix) && statSync(path + suffix).size > 0)) throw new PlannerSnapshotError('SNAPSHOT_REQUIRED', 'Maak eerst een consistente backup van de actieve WAL-database.');
    const bytes = readFileSync(path);
    if (bytes.subarray(0, 16).toString('ascii') !== 'SQLite format 3\0') throw new PlannerSnapshotError('INVALID_SOURCE', 'Dit bestand is geen SQLite-database.');
    if (bytes[18] !== 1 || bytes[19] !== 1) throw new PlannerSnapshotError('SNAPSHOT_REQUIRED', 'Gebruik een afgesloten snapshot met rollback-journalformaat.');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    let db: Database.Database | undefined;
    try {
      db = new DatabaseClass(bytes, { readonly: true });
      if (db.pragma('integrity_check', { simple: true }) !== 'ok') throw new PlannerSnapshotError('INVALID_SOURCE', 'SQLite-integriteitscontrole faalt.');
      if ((db.pragma('foreign_key_check') as unknown[]).length) throw new PlannerSnapshotError('INVALID_RELATION', 'De snapshot bevat ongeldige databaseverwijzingen.');
      const data = readPlannerData(db);
      return { ...data, report: { importVersion: IMPORT_VERSION, sha256, migrations: data.migrations,
        taskCount: data.tasks.length, preferenceCount: data.preferences.length,
        taskIds: data.tasks.map(row => row.id), preferenceIds: data.preferences.map(row => row.id),
        recurrenceLinks: data.tasks.filter(row => row.recurrence_parent_id !== null).map(row => ({ id: row.id, parentId: row.recurrence_parent_id })),
        taskDataSha256: dataHash(data.tasks), preferenceDataSha256: dataHash(data.preferences),
      } };
    } catch (error) {
      if (error instanceof PlannerSnapshotError) throw error;
      throw new PlannerSnapshotError('INVALID_SOURCE', 'De SQLite-snapshot kan niet worden gelezen.');
    } finally { db?.close(); }
  }
  function destination(path: string) {
    if ([path, `${path}-wal`, `${path}-shm`, `${path}-journal`].some(existsSync)) throw new PlannerSnapshotError('DESTINATION_EXISTS', 'Kies een nieuw, ongebruikt doelbestand.');
  }
  function stage(path: string) {
    const parent = dirname(resolve(path)); mkdirSync(parent, { recursive: true });
    const directory = mkdtempSync(join(parent, '.planner-snapshot-'));
    return { file: join(directory, 'snapshot.sqlite'), close() {
      if (resolve(dirname(directory)) !== parent) throw new Error('Unexpected staging directory');
      rmSync(directory, { recursive: true, force: true });
    } };
  }
  function publish(file: string, target: string) {
    destination(target);
    // Same-volume staging makes publication exclusive and avoids exposing a partial file.
    linkSync(file, target);
  }
  function expected(actual: string, requested: string) {
    if (!/^[a-f0-9]{64}$/i.test(requested) || actual !== requested.toLowerCase()) throw new PlannerSnapshotError('SOURCE_HASH_MISMATCH', 'De snapshot wijkt af van de gecontroleerde bronhash.');
  }
  return {
    dryRun: (snapshotPath: string) => inspect(snapshotPath).report,
    async backup(sourcePath: string, snapshotPath: string) {
      destination(snapshotPath);
      const staging = stage(snapshotPath);
      let source: Database.Database | undefined;
      try {
        source = new DatabaseClass(sourcePath, { readonly: true, fileMustExist: true });
        await source.backup(staging.file);
        const stable = new DatabaseClass(staging.file);
        try { stable.pragma('wal_checkpoint(TRUNCATE)'); stable.pragma('journal_mode = DELETE'); }
        finally { stable.close(); }
        const report = inspect(staging.file).report;
        publish(staging.file, snapshotPath);
        return report;
      } finally { source?.close(); staging.close(); }
    },
    importSnapshot(options: { snapshotPath: string; target: Database.Database; sourceId: string; importVersion: number; expectedSha256: string }) {
      const { snapshotPath, target, sourceId, importVersion } = options;
      if (!sourceId.trim() || sourceId !== sourceId.trim() || sourceId.length > 120 || importVersion !== IMPORT_VERSION) throw new PlannerSnapshotError('INVALID_IMPORT_IDENTITY', 'Geef een bronidentiteit en ondersteunde importversie op.');
      if (target.readonly || target.inTransaction) throw new PlannerSnapshotError('INVALID_TARGET', 'Gebruik een eigen schrijfbare doelverbinding zonder actieve transactie.');
      if (!target.memory && target.name && existsSync(target.name)) {
        const a = statSync(snapshotPath, { bigint: true }), b = statSync(target.name, { bigint: true });
        if (resolve(snapshotPath) === resolve(target.name) || (a.ino !== 0n && a.ino === b.ino && a.dev === b.dev)) throw new PlannerSnapshotError('SOURCE_IS_TARGET', 'Bron en doel moeten verschillende databases zijn.');
      }
      const bundle = inspect(snapshotPath); expected(bundle.report.sha256, options.expectedSha256);
      const allowed = ['tasks', 'user_preferences', 'planner_schema_migrations', 'planner_imports', 'probe_tasks', 'probe_migrations', 'api_keys'];
      if (bundle.migrations.some(version => version > 1) || bundle.tables.some(table => !allowed.includes(table))) throw new PlannerSnapshotError('UNSUPPORTED_IMPORT_SCOPE', 'Deze importversie importeert alleen taken en voorkeuren.');
      return target.transaction(() => {
        initializePlannerSqlite(target);
        target.exec(`CREATE TABLE IF NOT EXISTS planner_imports (
          source_id TEXT NOT NULL, source_sha256 TEXT NOT NULL, import_version INTEGER NOT NULL,
          completed_at TEXT NOT NULL, PRIMARY KEY (source_id, source_sha256, import_version)
        )`);
        const marker = target.prepare('SELECT source_id FROM planner_imports WHERE source_id=? AND source_sha256=? AND import_version=?');
        if (marker.get(sourceId, bundle.report.sha256, importVersion)) return { ...bundle.report, sourceId, alreadyImported: true, insertedTasks: 0, insertedPreferences: 0 };
        const conflicts: ImportConflict[] = [];
        const missing = (table: string, columns: readonly string[], rows: SnapshotRow[]) => rows.filter(row => {
          const existing = target.prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE id=?`).get(row.id) as SnapshotRow | undefined;
          if (!existing) return true;
          if (JSON.stringify(canonical(existing)) !== JSON.stringify(canonical(row))) conflicts.push({ kind: table, id: String(row.id), ...(table === 'tasks' ? { sourceVersion: row.version, targetVersion: existing.version } : {}) });
          return false;
        });
        const tasks = missing('tasks', taskColumns, bundle.tasks), preferences = missing('user_preferences', preferenceColumns, bundle.preferences);
        if (conflicts.length) throw new PlannerSnapshotError('IMPORT_CONFLICT', 'Doelrecords wijken af; er is niets overschreven.', conflicts);
        const sourceIds = new Set(bundle.tasks.map(row => row.id)), preferenceIds = new Set(bundle.preferences.map(row => row.id));
        if ((target.prepare('SELECT id FROM tasks').all() as SnapshotRow[]).some(row => !sourceIds.has(row.id)) || (target.prepare('SELECT id FROM user_preferences').all() as SnapshotRow[]).some(row => !preferenceIds.has(row.id))) throw new PlannerSnapshotError('TARGET_NOT_EMPTY', 'Kies een nieuw doel; live samenvoegen valt buiten deze import.');
        for (const [table, columns, rows] of [['tasks', taskColumns, tasks], ['user_preferences', preferenceColumns, preferences]] as const) {
          const insert = target.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
          for (const row of rows) insert.run(...columns.map(column => row[column]));
        }
        target.prepare('INSERT INTO planner_imports VALUES (?, ?, ?, ?)').run(sourceId, bundle.report.sha256, importVersion, new Date().toISOString());
        return { ...bundle.report, sourceId, alreadyImported: false, insertedTasks: tasks.length, insertedPreferences: preferences.length };
      }).immediate();
    },
    restore(snapshotPath: string, targetPath: string, expectedSha256: string) {
      destination(targetPath);
      expected(inspect(snapshotPath).report.sha256, expectedSha256);
      const staging = stage(targetPath);
      try {
        copyFileSync(snapshotPath, staging.file);
        const report = inspect(staging.file).report; expected(report.sha256, expectedSha256);
        publish(staging.file, targetPath);
        return report;
      } finally { staging.close(); }
    },
  };
}
