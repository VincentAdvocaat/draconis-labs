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

const desktop=createRequire(new URL('../../../apps/desktop-probe/package.json',import.meta.url))('better-sqlite3') as typeof Database;
describe.each([['api',Database],['desktop',desktop]] as const)('%s real zone writers',(binding,Constructor)=>{
  it.each(['three-bookers','three-same-key','book-reduce','reduce-book','cross-zone-full','cross-zone-same-key'] as const)('%s preserves capacity, source and idempotency',async scenario=>{
    const directory=mkdtempSync(join(tmpdir(),'zone-race-')),path=join(directory,'own.sqlite');
    const db=new Constructor(path);db.pragma('journal_mode=WAL');initializePlannerSqlite(db);
    const service=createBookingService(createSqliteBookingStorage(db,'local'),{now:()=>'2026-11-19T10:00:00.000Z',id:randomUUID,hash:value=>createHash('sha256').update(value).digest('hex')});
    const client=createBookingClient(async command=>service.invoke(command,{name:'demo'}),'local');
    try {
      const contact=await client.contacts.create({name:'Fictieve capaciteitstest'},randomUUID());
      const [north]=await client.availability('2026-11-20','north'),[east]=await client.availability('2026-11-20','east');
      const book: BookingCommand={type:'appointments.create',workspaceId:'local',key:randomUUID(),input:{contactId:contact.id,slotId:north.slot.id}};
      if(scenario.startsWith('three')||scenario.includes('reduce')) await client.slots.capacity(north.slot.id,{version:1,capacity:2},randomUUID());
      if(scenario.startsWith('three')) {
        const commands=scenario==='three-same-key'?[book,book,book]:[book,{...book,key:randomUUID()},{...book,key:randomUUID()}];
        const results=await race(path,binding,commands,directory);
        expect(results.filter(reply=>reply.ok)).toHaveLength(scenario==='three-same-key'?3:2);
        if(scenario==='three-same-key') expect(results).toEqual([results[0],results[0],results[0]]);
        else expect(results.find(reply=>!reply.ok)).toMatchObject({error:{code:'SLOT_FULL',status:409}});
        const visits=await client.appointments.list('2026-11-20','north');expect(visits).toHaveLength(scenario==='three-same-key'?1:2);
        expect((await client.contacts.card(contact.id)).events).toHaveLength(visits.length);
        expect((await client.availability('2026-11-20','east'))[0]).toMatchObject({occupied:0,available:true});
      } else if(scenario.includes('reduce')) {
        await client.appointments.create(book.input as {contactId:string;slotId:string},randomUUID());
        const reduce: BookingCommand={type:'slots.capacity',workspaceId:'local',key:randomUUID(),id:north.slot.id,input:{version:2,capacity:1}};
        const results=await race(path,binding,scenario==='book-reduce'?[book,reduce]:[reduce,book],directory);
        expect(results[0].ok).toBe(true);
        expect(results[1]).toMatchObject({ok:false,error:{code:scenario==='book-reduce'?'CAPACITY_BELOW_OCCUPANCY':'SLOT_FULL',status:409}});
        expect((await client.availability('2026-11-20','north'))[0]).toMatchObject({occupied:scenario==='book-reduce'?2:1,slot:{capacity:scenario==='book-reduce'?2:1}});
      } else {
        const first=await client.appointments.create(book.input as {contactId:string;slotId:string},randomUUID());
        const move: BookingCommand={type:'appointments.move',workspaceId:'local',key:randomUUID(),id:first.id,input:{version:1,slotId:east.slot.id}};
        if(scenario==='cross-zone-full') {
          const second=await client.appointments.create({contactId:contact.id,slotId:east.slot.id},randomUUID());
          const results=await race(path,binding,[move,{...move,key:randomUUID(),id:second.id,input:{version:1,slotId:north.slot.id}}],directory);
          for(const result of results) expect(result).toMatchObject({ok:false,error:{code:'SLOT_FULL'}});
          expect(await client.appointments.list('2026-11-20','north')).toEqual([first]);expect(await client.appointments.list('2026-11-20','east')).toEqual([second]);
        } else {
          const results=await race(path,binding,[move,move],directory);expect(results[0].ok).toBe(true);expect(results[1]).toEqual(results[0]);
          expect(await client.appointments.list('2026-11-20','north')).toEqual([]);
          expect(await client.appointments.list('2026-11-20','east')).toHaveLength(1);
          expect((await client.contacts.card(contact.id)).events.map(event=>event.type)).toEqual(['planned','moved']);
        }
      }
    } finally {db.close();rmSync(directory,{recursive:true,force:true});}
  },30000);
});
