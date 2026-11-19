import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBookingService } from '@draconis/planner-core';
import { createSqliteBookingStorage } from '@draconis/planner-sqlite';

const [path, binding, serialized, gate, role] = process.argv.slice(2);
const Constructor: typeof Database = binding === 'desktop' ? createRequire(new URL('../../../../apps/desktop-probe/package.json', import.meta.url))('better-sqlite3') : Database;
const db = new Constructor(path), storage = createSqliteBookingStorage(db, 'local');
const transaction = storage.transaction;
storage.transaction = operation => {
  if (role === 'second') writeFileSync(join(gate, 'attempt'), '1');
  return transaction(() => {
    writeFileSync(join(gate, `${role}-entered`), '1');
    if (role === 'first') {
      const until = Date.now() + 10000;
      while (!existsSync(join(gate, 'release'))) {
        if (Date.now() > until) throw new Error('Gate timed out');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    return operation();
  });
};
const service = createBookingService(storage, { now: () => '2026-11-19T10:00:00.000Z', id: randomUUID, hash: value => createHash('sha256').update(value).digest('hex') });
process.once('message', () => {
  const result = service.invoke(JSON.parse(serialized), { name: 'demo' });
  db.close(); process.send?.(result, () => process.disconnect());
});
process.send?.({ ready: true });
