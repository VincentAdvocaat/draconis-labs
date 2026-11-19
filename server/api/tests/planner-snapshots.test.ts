import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { createPlannerSnapshotTools, createSqlitePlannerStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { createPlannerService } from '@draconis/planner-core';

const desktopRequire = createRequire(new URL('../../../apps/desktop-probe/package.json', import.meta.url));
const DesktopDatabase = desktopRequire('better-sqlite3') as typeof Database;
const legacy = readFileSync(new URL('./fixtures/legacy.sql', import.meta.url), 'utf8');
const current = readFileSync(new URL('./fixtures/current.sql', import.meta.url), 'utf8');
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';

it('runs the explicit CLI backup/dry-run/import/resume/restore flow on an own fixture', () => {
  const directory = mkdtempSync(join(tmpdir(), 'planner-cli-test-')); directories.push(directory);
  const source = join(directory, 'source.sqlite'), snapshot = join(directory, 'backup.sqlite');
  const target = join(directory, 'import.sqlite'), restored = join(directory, 'restored.sqlite');
  const db = new Database(source); db.exec(legacy); db.exec(current); db.close();
  const before = hash(source);
  const run = (...args: string[]) => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../scripts/planner-snapshots.ts', import.meta.url)), ...args], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const fileReport = run('backup', '--source', source, '--snapshot', snapshot);
  const report = run('dry-run', '--snapshot', snapshot);
  expect(report.sha256).toBe(fileReport.sha256);
  const args = ['import', '--snapshot', snapshot, '--target', target, '--source-id', 'cli-demo', '--import-version', '1', '--sha256', report.sha256];
  expect(run(...args)).toMatchObject({ insertedTasks: 3, alreadyImported: false });
  const refused = spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../scripts/planner-snapshots.ts', import.meta.url)), ...args], { encoding: 'utf8' });
  expect(refused.status).toBe(1); expect(JSON.parse(refused.stderr).code).toBe('DESTINATION_EXISTS');
  expect(run(...args, '--resume')).toMatchObject({ insertedTasks: 0, alreadyImported: true });
  run('restore', '--snapshot', snapshot, '--target', restored, '--sha256', report.sha256);
  expect(hash(restored)).toBe(report.sha256); expect(hash(source)).toBe(before);
}, 30000);

describe.each([['API 12', Database], ['desktop 13', DesktopDatabase]] as const)('%s snapshot tools', (_, Constructor) => {
  function fixture(modern = true) {
    const directory = mkdtempSync(join(tmpdir(), 'planner-snapshot-test-')); directories.push(directory);
    const source = join(directory, 'source.sqlite');
    const db = new Constructor(source); db.exec(legacy); if (modern) db.exec(current); db.close();
    return { directory, source, tools: createPlannerSnapshotTools(Constructor) };
  }
  it.each([false, true])('backs up and inspects old/current data without changing the source (current=%s)', async modern => {
    const { directory, source, tools } = fixture(modern);
    const before = hash(source);
    const snapshot = join(directory, 'backup.sqlite');
    const fileReport = await tools.backup(source, snapshot);
    const backup = tools.dryRun(snapshot);
    expect(hash(source)).toBe(before);
    expect(fileReport.sha256).toBe(backup.sha256);
    expect(backup).toMatchObject({ taskCount: 3, preferenceCount: 1, sha256: hash(snapshot), migrations: [] });
    expect(backup.taskIds).toContain(first);
    expect(backup.recurrenceLinks).toHaveLength(modern ? 1 : 0);
    expect(readdirSync(directory).sort()).toEqual(['backup.sqlite', 'source.sqlite']);
    const target = new Constructor(join(directory, 'import.sqlite'));
    try {
      const options = { snapshotPath: snapshot, target, sourceId: 'own-demo', importVersion: 1, expectedSha256: backup.sha256 };
      expect(tools.importSnapshot(options)).toMatchObject({ insertedTasks: 3, insertedPreferences: 1, alreadyImported: false });
      await tools.backup(target.name, join(directory, 'import-backup.sqlite'));
      const imported = tools.dryRun(join(directory, 'import-backup.sqlite'));
      expect(imported.taskDataSha256).toBe(backup.taskDataSha256);
      expect(imported.preferenceDataSha256).toBe(backup.preferenceDataSha256);
      expect(target.prepare('SELECT version, labels FROM tasks WHERE id=?').get(first)).toEqual({ version: modern ? 7 : 1, labels: '["demo","onderhoud"]' });
      target.prepare('DELETE FROM tasks WHERE id=?').run(second);
      expect(tools.importSnapshot(options)).toMatchObject({ insertedTasks: 0, alreadyImported: true });
      expect(target.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 2 });
      expect(target.prepare('SELECT count(*) AS n FROM planner_imports').get()).toEqual({ n: 1 });
    } finally { target.close(); }
  });

  it('backs up committed WAL data while its writer remains open', async () => {
    const { directory, source, tools } = fixture();
    const writer = new Constructor(source);
    try {
      writer.pragma('journal_mode = WAL'); writer.pragma('wal_autocheckpoint = 0');
      writer.prepare('UPDATE tasks SET title=? WHERE id=?').run('Committed in WAL', first);
      const before = hash(source);
      expect(() => tools.dryRun(source)).toThrow(expect.objectContaining({ code: 'SNAPSHOT_REQUIRED' }));
      const path = join(directory, 'wal-backup.sqlite'); await tools.backup(source, path);
      expect(hash(source)).toBe(before);
      const copied = new Constructor(path, { readonly: true });
      try { expect(copied.prepare('SELECT title FROM tasks WHERE id=?').get(first)).toEqual({ title: 'Committed in WAL' }); }
      finally { copied.close(); }
    } finally { writer.close(); }
  });

  it('preserves a historical missing recurrence parent in full backup and restore', async () => {
    const { directory, source, tools } = fixture();
    const db = new Constructor(source); initializePlannerSqlite(db);
    let sequence = 10;
    const service = createPlannerService(createSqlitePlannerStorage(db), {
      id: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
      now: () => '2026-11-19T10:00:00.000Z',
    });
    const parent = service.create({ title: 'Own recurrence', plannedDate: '2026-11-19', recurrence: { frequency: 'daily', interval: 1 } }, { name: 'demo' });
    service.update(parent.id, { lane: 'done', version: 1 }); service.remove(parent.id);
    const rows = db.prepare('SELECT * FROM tasks ORDER BY id').all(); db.close();
    const snapshot = join(directory, 'historical.sqlite'), restored = join(directory, 'historical-restored.sqlite');
    const before = hash(source), report = await tools.backup(source, snapshot);
    expect(hash(source)).toBe(before);
    expect(() => tools.dryRun(snapshot)).toThrow(expect.objectContaining({ code: 'INVALID_RELATION' }));
    tools.restore(snapshot, restored, report.sha256);
    expect(hash(restored)).toBe(report.sha256);
    const copy = new Constructor(restored, { readonly: true });
    try { expect(copy.prepare('SELECT * FROM tasks ORDER BY id').all()).toEqual(rows); }
    finally { copy.close(); }
  });

  it('rolls back every imported row and marker, then permits repair and retry', async () => {
    const { directory, source, tools } = fixture();
    const snapshot = join(directory, 'backup.sqlite'); const report = await tools.backup(source, snapshot);
    const target = new Constructor(join(directory, 'target.sqlite'));
    try {
      initializePlannerSqlite(target);
      target.exec(`CREATE TRIGGER fail_second BEFORE INSERT ON tasks WHEN NEW.id='${second}' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
      const schema = target.prepare('SELECT * FROM sqlite_master ORDER BY name').all();
      const options = { snapshotPath: snapshot, target, sourceId: 'own-demo', importVersion: 1, expectedSha256: report.sha256 };
      expect(() => tools.importSnapshot(options)).toThrow('injected failure');
      expect(target.prepare('SELECT * FROM tasks').all()).toEqual([]);
      expect(target.prepare('SELECT * FROM user_preferences').all()).toEqual([]);
      expect(target.prepare('SELECT * FROM sqlite_master ORDER BY name').all()).toEqual(schema);
      target.exec('DROP TRIGGER fail_second');
      expect(tools.importSnapshot(options).insertedTasks).toBe(3);
    } finally { target.close(); }
  });

  it('reports a newer target version and preserves all target data', async () => {
    const { directory, source, tools } = fixture();
    const snapshot = join(directory, 'backup.sqlite'); const report = await tools.backup(source, snapshot);
    const target = new Constructor(join(directory, 'target.sqlite')); target.exec(legacy); target.exec(current); initializePlannerSqlite(target);
    try {
      target.prepare('UPDATE tasks SET version=8, title=? WHERE id=?').run('Keep newer', first);
      target.prepare('DELETE FROM tasks WHERE id=?').run(second);
      const before = target.prepare('SELECT * FROM tasks ORDER BY id').all();
      expect(() => tools.importSnapshot({ snapshotPath: snapshot, target, sourceId: 'own-demo', importVersion: 1, expectedSha256: report.sha256 })).toThrow(expect.objectContaining({ code: 'IMPORT_CONFLICT', conflicts: [{ kind: 'tasks', id: first, sourceVersion: 7, targetVersion: 8 }] }));
      expect(target.prepare('SELECT * FROM tasks ORDER BY id').all()).toEqual(before);
      expect(target.prepare("SELECT name FROM sqlite_master WHERE name='planner_imports'").get()).toBeUndefined();
    } finally { target.close(); }
  });

  it('restores only to an unused file and rejects wrong hashes and active sources', async () => {
    const { directory, source, tools } = fixture();
    const snapshot = join(directory, 'backup.sqlite'); const report = await tools.backup(source, snapshot);
    const target = join(directory, 'restored.sqlite');
    expect(() => tools.restore(snapshot, target, '0'.repeat(64))).toThrow(expect.objectContaining({ code: 'SOURCE_HASH_MISMATCH' }));
    expect(readdirSync(directory)).not.toContain('restored.sqlite');
    writeFileSync(snapshot + '-journal', 'unresolved journal');
    expect(() => tools.restore(snapshot, target, report.sha256)).toThrow(expect.objectContaining({ code: 'SNAPSHOT_REQUIRED' }));
    rmSync(snapshot + '-journal');
    tools.restore(snapshot, target, report.sha256); expect(hash(target)).toBe(report.sha256);
    const open = new Constructor(target);
    try {
      expect(() => tools.restore(snapshot, target, report.sha256)).toThrow(expect.objectContaining({ code: 'DESTINATION_EXISTS' }));
      expect(open.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 3 });
    } finally { open.close(); }
    await expect(tools.backup(join(directory, 'missing.sqlite'), join(directory, 'failed.sqlite'))).rejects.toThrow();
    expect(readdirSync(directory).some(name => name.startsWith('.planner-snapshot-'))).toBe(false);
  });

  it('rejects invalid relationships, preferences, unsupported schema and import scope before writing', () => {
    for (const [sql, code] of [
      [`UPDATE tasks SET recurrence_parent_id='00000000-0000-4000-8000-000000000099' WHERE id='${first}'`, 'INVALID_RELATION'],
      [`UPDATE tasks SET recurrence_parent_id='${first}' WHERE id='${first}'`, 'INVALID_RELATION'],
      ["UPDATE user_preferences SET preferences='{}garbage'", 'INVALID_PREFERENCES'],
      ['CREATE TABLE planner_schema_migrations(version INTEGER); INSERT INTO planner_schema_migrations VALUES(99)', 'UNSUPPORTED_SCHEMA'],
      ['ALTER TABLE tasks ADD COLUMN future_business_data TEXT', 'UNSUPPORTED_SCHEMA'],
    ]) {
      const { source, tools } = fixture(); const db = new Constructor(source); db.exec(sql); db.close();
      const before = hash(source); expect(() => tools.dryRun(source)).toThrow(expect.objectContaining({ code })); expect(hash(source)).toBe(before);
    }
    const { source, tools } = fixture(); const db = new Constructor(source); db.exec('CREATE TABLE future_contacts(id TEXT)'); db.close();
    const target = new Constructor(':memory:');
    try {
      expect(() => tools.importSnapshot({ snapshotPath: source, target, sourceId: 'own-demo', importVersion: 1, expectedSha256: '0'.repeat(64) })).toThrow(expect.objectContaining({ code: 'SOURCE_HASH_MISMATCH' }));
      expect(() => tools.importSnapshot({ snapshotPath: source, target, sourceId: 'own-demo', importVersion: 1, expectedSha256: hash(source) })).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_IMPORT_SCOPE' }));
      expect(target.prepare('SELECT * FROM sqlite_master').all()).toEqual([]);
    } finally { target.close(); }
  });
});
