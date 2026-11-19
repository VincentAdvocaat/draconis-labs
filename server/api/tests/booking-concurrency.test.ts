import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createBookingService } from '@draconis/planner-core';
import { createSqliteBookingStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { createBookingClient, type BookingCommand, type PlannerReply } from '@draconis/shared';

const desktop = createRequire(new URL('../../../apps/desktop-probe/package.json', import.meta.url))('better-sqlite3') as typeof Database;
async function race(path: string, binding: string, commands: BookingCommand[], gate: string) {
  const children = commands.map((command, index) => fork(new URL('./fixtures/booking-writer.ts', import.meta.url), [path, binding, JSON.stringify(command), gate, index ? 'second' : 'first'], { execArgv: ['--import','tsx'], stdio: ['ignore','ignore','pipe','ipc'], windowsHide: true }));
  let log = '';
  const closed = children.map(child => new Promise<void>(resolve => child.once('close', () => resolve())));
  const ready = children.map(child => new Promise<void>((resolve, reject) => {
    child.stderr?.on('data', data => { log += data; });
    child.on('message', message => { if ('ready' in (message as object)) resolve(); });
    child.once('error', reject); child.once('exit', exit => { if (exit) reject(new Error(log)); });
  }));
  const results = children.map(child => new Promise<PlannerReply>((resolve, reject) => {
    child.on('message', message => { if ('ok' in (message as object)) resolve(message as PlannerReply); });
    child.once('error', reject); child.once('exit', exit => { if (exit) reject(new Error(log)); });
  }));
  // Prevent unhandled rejections while waiting on the deterministic gate.
  const result = Promise.all(results); result.catch(() => undefined);
  async function marker(name: string) {
    const deadline = Date.now() + 10000;
    while (!existsSync(join(gate, name))) {
      if (Date.now() > deadline) throw new Error(`Missing gate ${name}: ${log}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  try {
    await Promise.all(ready); children[0].send('go'); await marker('first-entered');
    children[1].send('go'); await marker('attempt');
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(existsSync(join(gate, 'second-entered'))).toBe(false);
    writeFileSync(join(gate, 'release'), '1');
    const values = await result; await Promise.all(closed); return values;
  } finally { for (const child of children) if (child.exitCode === null) child.kill(); await Promise.all(closed); }
}
describe.each([['api',Database],['desktop',desktop]] as const)('%s independent booking writers', (binding, Constructor) => {
  it.each(['book-book','book-block','block-book','same-key'] as const)('%s has one atomic outcome under a held SQLite lock', async scenario => {
    const directory = mkdtempSync(join(tmpdir(), 'booking-race-')), path = join(directory, 'own.sqlite');
    const db = new Constructor(path); db.pragma('journal_mode=WAL'); initializePlannerSqlite(db);
    const service = createBookingService(createSqliteBookingStorage(db, 'local'), { now: () => '2026-11-19T10:00:00.000Z', id: randomUUID, hash: value => createHash('sha256').update(value).digest('hex') });
    const client = createBookingClient(async command => service.invoke(command, { name:'demo' }), 'local');
    try {
      const contact = await client.contacts.create({ name:'Fictieve raceklant' }, randomUUID()), [availability] = await client.availability('2026-11-20');
      const book: BookingCommand = { type:'appointments.create', workspaceId:'local', key:randomUUID(), input:{ contactId:contact.id, slotId:availability.slot.id } };
      const block: BookingCommand = { type:'blocks.create', workspaceId:'local', key:randomUUID(), input:{ slotId:availability.slot.id, reason:'Demo blokkade' } };
      const commands = scenario === 'book-book' ? [book,{...book,key:randomUUID()}] : scenario === 'book-block' ? [book,block] : scenario === 'block-book' ? [block,book] : [book,book];
      const results = await race(path, binding, commands, directory);
      expect(results[0].ok).toBe(true);
      if (scenario === 'same-key') expect(results[1]).toEqual(results[0]);
      else expect(results[1]).toMatchObject({ ok:false,error:{ status:409,code:scenario === 'block-book' ? 'SLOT_BLOCKED':'SLOT_FULL' } });
      const visits = await client.appointments.list('2026-11-20');
      expect(visits).toHaveLength(scenario === 'block-book' ? 0:1);
      expect((await client.contacts.card(contact.id)).events).toHaveLength(visits.length);
      const [state] = await client.availability('2026-11-20'); expect(state.available).toBe(false);
      expect(Boolean(state.block)).toBe(scenario === 'block-book');
    } finally { db.close(); rmSync(directory,{recursive:true,force:true}); }
  }, 20000);
});
