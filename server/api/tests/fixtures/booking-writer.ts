import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBookingService,createPublicBookingService } from '@draconis/planner-core';
import { createSqlitePublicBookingStorage } from '@draconis/planner-sqlite';

const [path, binding, serialized, gate, role] = process.argv.slice(2);
const Constructor: typeof Database = binding === 'desktop' ? createRequire(new URL('../../../../apps/desktop-probe/package.json', import.meta.url))('better-sqlite3') : Database;
const db = new Constructor(path), storage = createSqlitePublicBookingStorage(db, 'local');
const transaction = storage.transaction;
storage.transaction = operation => {
  if (role !== 'first') writeFileSync(join(gate, role === 'second' ? 'attempt' : `${role}-attempt`), '1');
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
const env={now:()=>'2026-11-19T10:00:00.000Z',id:randomUUID,hash:(value:string)=>createHash('sha256').update(value).digest('hex')};
const service = createBookingService(storage,env),publicService=createPublicBookingService(storage,env);
process.once('message', () => {
  const command=JSON.parse(serialized);
  const result = command.type==='public.reserve'?publicService.reserve(command.channelId,command.origin,command.input):service.invoke(command, { name: 'demo' });
  db.close(); process.send?.(result, () => process.disconnect());
});
process.send?.({ ready: true });
