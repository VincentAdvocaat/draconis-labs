import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { createPlannerService } from '@draconis/planner-core';
import { createSqlitePlannerStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { createTaskSchema, updateTaskSchema, uuidParamSchema, type Task } from '@draconis/shared';

/** Deliberately isolated spike storage. Does not open or migrate the real Planner DB. */
export function openProbeStore(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initializePlannerSqlite(db);
  const storage = createSqlitePlannerStorage(db);
  // Preserve the isolated PL-02 JSON records when adopting the shared schema.
  // Retain the source table; only missing IDs are imported, in one transaction.
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='probe_tasks'").get()) {
    db.transaction(() => {
      const rows = db.prepare('SELECT payload FROM probe_tasks ORDER BY rowid').all() as { payload: string }[];
      for (const row of rows) {
        const task = JSON.parse(row.payload) as Task;
        if (!storage.find(task.id)) storage.insert(task);
      }
    })();
  }
  const service = createPlannerService(storage, {
    id: randomUUID, now: () => new Date().toISOString(),
  });
  return {
    list() {
      const tasks = service.list({});
      if (!Array.isArray(tasks)) throw new Error('Unexpected paginated result');
      return tasks;
    },
    create(input: unknown) {
      return service.create(createTaskSchema.parse(input), { name: 'local-probe' });
    },
    update(id: string, input: unknown) {
      return service.update(uuidParamSchema.parse({ id }).id, updateTaskSchema.parse(input));
    },
    close: () => db.close(),
  };
}
