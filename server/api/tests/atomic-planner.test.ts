import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlannerService, executePlannerCommand } from '@draconis/planner-core';
import { initializePlannerSqlite, createSqlitePlannerStorage } from '@draconis/planner-sqlite';
import { describe, expect, it } from 'vitest';

const desktopRequire = createRequire(new URL('../../../apps/desktop-probe/package.json', import.meta.url));
function hostDatabase(binding: string): typeof Database { return binding === 'desktop' ? desktopRequire('better-sqlite3') : Database; }
const environment = { id: randomUUID, now: () => '2026-11-19T10:00:00.000Z' };
const fixtureId = '00000000-0000-4000-8000-000000000001';

async function concurrentWriters(path: string, id: string, version: string, binding: string) {
  const gate = mkdtempSync(join(tmpdir(), 'planner-writer-gate-'));
  const children = ['first', 'second'].map(role => fork(new URL('./fixtures/planner-writer.ts', import.meta.url), [path, id, version, gate, role, binding], {
    execArgv: ['--import', 'tsx'], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  }));
  const ready: Promise<void>[] = [], results: Promise<{ status: number }>[] = [], closed: Promise<void>[] = [];
  for (const child of children) {
    let log = '';
    child.stdout?.on('data', data => { log += data; });
    child.stderr?.on('data', data => { log += data; });
    let isReady = false, hasResult = false;
    ready.push(new Promise((resolve, reject) => {
      child.on('message', message => { if ((message as { ready?: boolean }).ready) { isReady = true; resolve(); } });
      child.on('error', reject);
      child.on('exit', code => { if (!isReady) reject(new Error(`Writer exited before ready (${code}): ${log}`)); });
    }));
    results.push(new Promise((resolve, reject) => {
      child.on('message', message => { if ('status' in (message as object)) { hasResult = true; resolve(message as { status: number }); } });
      child.on('error', reject);
      child.on('exit', code => { if (!hasResult) reject(new Error(`Writer exited before result (${code}): ${log}`)); });
    }));
    closed.push(new Promise(resolve => child.once('close', () => resolve())));
  }
  const result = Promise.all(results);
  result.catch(() => undefined);
  const allClosed = Promise.all(closed);
  async function marker(name: string) {
    const until = Date.now() + 10_000;
    while (!existsSync(join(gate, name))) {
      if (Date.now() > until) throw new Error(`Writer marker timed out: ${name}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Concurrent writer deadline exceeded')), 15_000); });
  try {
    const run = (async () => {
      await Promise.all(ready);
      children[0].send('go');
      await marker('first-read');
      children[1].send('go');
      await marker('second-attempt');
      await new Promise(resolve => setTimeout(resolve, 100));
      // First writer is paused after reading its parent under the write lock.
      // The contender has attempted its update but cannot read a stale parent.
      expect(existsSync(join(gate, 'second-read'))).toBe(false);
      writeFileSync(join(gate, 'release'), 'go');
      const outcomes = await result;
      await allClosed;
      return outcomes;
    })();
    return await Promise.race([run, deadline]);
  } finally {
    writeFileSync(join(gate, 'release'), 'go');
    children.forEach(child => { if (child.exitCode === null) child.kill(); });
    await allClosed;
    clearTimeout(timer!);
    rmSync(gate, { recursive: true, force: true });
  }
}

describe('atomic SQLite task mutations', () => {
  it.each([['api', '1'], ['api', 'compat'], ['desktop', '1'], ['desktop', 'compat']])('serializes two independent process writers (%s, %s)', async (binding, version) => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-concurrent-'));
    const path = join(dir, 'tasks.sqlite');
    const db = new Database(path); db.pragma('journal_mode = WAL'); initializePlannerSqlite(db);
    const service = createPlannerService(createSqlitePlannerStorage(db), environment);
    const task = service.create({ title: 'Fictieve herhaaltaak', dueDate: '2026-11-20', recurrence: { frequency: 'weekly', interval: 2 } }, { name: 'test' });
    try {
      const outcomes = await concurrentWriters(path, task.id, version, binding);
      expect(outcomes.map(result => result.status).sort()).toEqual(version === 'compat' ? [200, 200] : [200, 409]);
      expect(db.prepare('SELECT count(*) AS n FROM tasks WHERE recurrence_parent_id=?').get(task.id)).toEqual({ n: 1 });
      expect(db.prepare('SELECT lane, version FROM tasks WHERE id=?').get(task.id)).toEqual({ lane: 'done', version: version === 'compat' ? 3 : 2 });
    } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
  }, 20_000);

  it.each(['api', 'desktop'])('rolls back parent, successor and rebalance after an insert failure (%s)', binding => {
    const HostDatabase = hostDatabase(binding);
    const db = new HostDatabase(':memory:');
    db.exec(readFileSync(new URL('./fixtures/legacy.sql', import.meta.url), 'utf8'));
    db.exec(readFileSync(new URL('./fixtures/current.sql', import.meta.url), 'utf8'));
    initializePlannerSqlite(db);
    const storage = createSqlitePlannerStorage(db);
    db.prepare('UPDATE tasks SET position=500 WHERE lane=?').run('done');
    const before = db.prepare('SELECT * FROM tasks ORDER BY id').all();
    let inserted = false, rebalanceChanged = false;
    const service = createPlannerService({
      ...storage,
      insert(task) {
        storage.insert(task);
        inserted = true;
        const changed = db.prepare('SELECT position FROM tasks WHERE id=?').get('00000000-0000-4000-8000-000000000003') as { position: number };
        rebalanceChanged = changed.position !== 500;
        throw new Error('Fault after successor insert');
      },
    }, environment);
    try {
      expect(() => service.update(fixtureId, { lane: 'done', position: 500.5, version: 7 })).toThrow('Fault after successor insert');
      expect(inserted).toBe(true);
      expect(rebalanceChanged).toBe(true);
      expect(db.prepare('SELECT * FROM tasks ORDER BY id').all()).toEqual(before);
    } finally { db.close(); }
  });

  it.each(['api', 'desktop'])('invalidates stale neighbor versions after lane rebalance (%s)', binding => {
    const HostDatabase = hostDatabase(binding), db = new HostDatabase(':memory:');
    initializePlannerSqlite(db);
    const service = createPlannerService(createSqlitePlannerStorage(db), environment);
    try {
      const first = service.create({ title: 'First' }, { name: 'test' });
      const second = service.create({ title: 'Second' }, { name: 'test' });
      const moved = service.update(second.id, { position: first.position - 0.5, version: 1 });
      expect(moved).toMatchObject({ position: 1000, version: 2 });
      expect(service.list({ lane: 'todo' })).toMatchObject([
        { id: second.id, position: 1000, version: 2 },
        { id: first.id, position: 2000, version: 2 },
      ]);
      expect(executePlannerCommand(service, 'local', { name: 'test' }, {
        type: 'tasks.update', workspaceId: 'local', id: first.id, input: { position: 1999.5, version: 1 },
      })).toMatchObject({ ok: false, error: { code: 'VERSION_CONFLICT', status: 409 } });
    } finally { db.close(); }
  });

  it.each(['api', 'desktop'])('bounds a busy connection and returns unavailable without writing (%s)', binding => {
    const dir = mkdtempSync(join(tmpdir(), 'planner-busy-')), path = join(dir, 'tasks.sqlite');
    const HostDatabase = hostDatabase(binding);
    const owner = new HostDatabase(path), contender = new HostDatabase(path);
    initializePlannerSqlite(owner);
    const service = createPlannerService(createSqlitePlannerStorage(contender, 25), environment);
    owner.exec('BEGIN IMMEDIATE');
    try {
      expect(executePlannerCommand(service, 'local', { name: 'test' }, { type: 'tasks.create', workspaceId: 'local', input: { title: 'Must not write' } }))
        .toMatchObject({ ok: false, error: { code: 'UNAVAILABLE', status: 503 } });
      expect(owner.prepare('SELECT count(*) AS n FROM tasks').get()).toEqual({ n: 0 });
    } finally { owner.exec('ROLLBACK'); owner.close(); contender.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});
