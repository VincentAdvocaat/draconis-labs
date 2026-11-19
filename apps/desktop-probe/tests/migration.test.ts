import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializePlannerSqlite, createSqlitePlannerStorage } from '@draconis/planner-sqlite';
import { describe, expect, it } from 'vitest';
import { openProbeStore } from '../src/store.js';
import type { Task } from '@draconis/shared';

const fixture = JSON.parse(readFileSync(new URL('../../../docs/planner/evidence/upgrade-records.json', import.meta.url), 'utf8')).previous.read[0] as Task;
function seed() {
  const dir = mkdtempSync(join(tmpdir(), 'planner-probe-migration-'));
  const path = join(dir, 'probe.sqlite');
  const db = new Database(path);
  db.exec(readFileSync(new URL('./fixtures/pl02.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO probe_tasks VALUES (?, ?)').run(fixture.id, JSON.stringify(fixture));
  return { dir, path, db };
}

describe('PL-02 schema import completion', () => {
  it('keeps newer existing IDs and does not resurrect an imported record after delete/restart', () => {
    const { dir, path, db } = seed();
    initializePlannerSqlite(db);
    const newer = { ...fixture, title: 'Nieuwere bewaarde taak', version: 7 };
    createSqlitePlannerStorage(db).insert(newer);
    db.close();
    try {
      const first = openProbeStore(path);
      expect(first.list()).toEqual([newer]);
      expect(first.invoke({ type: 'tasks.remove', workspaceId: 'local', id: fixture.id })).toEqual({ ok: true, value: null });
      first.close();
      const second = openProbeStore(path);
      expect(second.list()).toEqual([]);
      second.close();
      const check = new Database(path);
      expect(check.prepare('SELECT count(*) AS n FROM probe_tasks').get()).toEqual({ n: 1 });
      expect(check.prepare('SELECT count(*) AS n FROM probe_migrations').get()).toEqual({ n: 1 });
      check.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('rolls back inserts and completion marker on malformed JSON, then retries the repaired source', () => {
    const { dir, path, db } = seed();
    const nextId = '00000000-0000-4000-8000-000000000099';
    db.prepare('INSERT INTO probe_tasks VALUES (?, ?)').run(nextId, '{invalid');
    db.close();
    try {
      expect(() => openProbeStore(path)).toThrow();
      const check = new Database(path);
      expect(check.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 0 });
      expect(check.prepare('SELECT count(*) AS n FROM probe_migrations').get()).toEqual({ n: 0 });
      expect(check.prepare('SELECT count(*) AS n FROM probe_tasks').get()).toEqual({ n: 2 });
      check.prepare('UPDATE probe_tasks SET payload=? WHERE id=?').run(JSON.stringify({ ...fixture, id: nextId }), nextId);
      check.close();
      const repaired = openProbeStore(path);
      expect(repaired.list()).toHaveLength(2);
      repaired.close();
      const restarted = openProbeStore(path);
      expect(restarted.list()).toHaveLength(2);
      restarted.close();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
