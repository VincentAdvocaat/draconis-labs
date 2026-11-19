import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPlannerService } from '@draconis/planner-core';
import { initializePlannerSqlite, createSqlitePlannerStorage } from '@draconis/planner-sqlite';

const [path, id, expectedVersion, gate, role, binding] = process.argv.slice(2);
const HostDatabase: typeof Database = binding === 'desktop' ? createRequire(new URL('../../../../apps/desktop-probe/package.json', import.meta.url))('better-sqlite3') : Database;
const db = new HostDatabase(path);
db.pragma('journal_mode = WAL');
initializePlannerSqlite(db);
const storage = createSqlitePlannerStorage(db);
let held = false;
const service = createPlannerService({ ...storage, find(taskId) {
  const task = storage.find(taskId);
  if (!held) {
    held = true;
    writeFileSync(join(gate, `${role}-read`), 'read');
    if (role === 'first') {
      const wait = new Int32Array(new SharedArrayBuffer(4));
      while (!existsSync(join(gate, 'release'))) Atomics.wait(wait, 0, 0, 10);
    }
  }
  return task;
} }, {
  id: randomUUID, now: () => '2026-11-19T10:00:00.000Z',
});
process.once('message', () => {
  try {
    writeFileSync(join(gate, `${role}-attempt`), 'attempt');
    const task = service.update(id, { lane: 'done', ...(expectedVersion === 'compat' ? {} : { version: Number(expectedVersion) }) });
    process.send?.({ status: 200, version: task.version });
  } catch (error) {
    process.send?.({ status: typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : 500 });
  } finally { db.close(); process.disconnect(); }
});
process.send?.({ ready: true });
