import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createBookingService } from '@draconis/planner-core';
import { createSqliteBookingStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { createBookingClient, type BookingCommand } from '@draconis/shared';

import { race } from './fixtures/booking-race.js';

const desktop = createRequire(new URL('../../../apps/desktop-probe/package.json', import.meta.url))('better-sqlite3') as typeof Database;

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
