import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { newTask } from '@draconis/planner-core';
import { createTaskSchema, type CreateTaskInput, type Task } from '@draconis/shared';

/** Deliberately isolated spike storage. Does not open or migrate the real Planner DB. */
export function openProbeStore(path: string) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE IF NOT EXISTS probe_tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  const list = (): Task[] => (db.prepare('SELECT payload FROM probe_tasks ORDER BY rowid').all() as { payload: string }[])
    .map(row => JSON.parse(row.payload) as Task);
  return {
    list,
    create(input: CreateTaskInput): Task {
      const validated = createTaskSchema.parse(input);
      const task = newTask(validated, {
        id: randomUUID(), now: new Date().toISOString(), actorName: 'local-probe',
        maxTodoPosition: Math.max(0, ...list().map(t => t.position)),
      });
      db.prepare('INSERT INTO probe_tasks VALUES (?, ?)').run(task.id, JSON.stringify(task));
      return task;
    },
    close: () => db.close(),
  };
}
