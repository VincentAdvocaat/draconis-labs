import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe,expect,it} from 'vitest';
import {createBookingService} from '@draconis/planner-core';
import {createSqlitePublicBookingStorage,initializePlannerSqlite} from '@draconis/planner-sqlite';
import {createBookingClient} from '@draconis/shared';
import {race,type WriterCommand} from './fixtures/booking-race.js';

const desktop=createRequire(new URL('../../../apps/desktop-probe/package.json',import.meta.url))('better-sqlite3') as typeof Database;
describe.each([['api',Database],['desktop',desktop]] as const)('%s public/staff writers',(binding,Constructor)=>{
  it.each(['public-staff','staff-public','public-block','block-public','same-key','three-cap2','public-fails-staff'] as const)('%s commits only accepted reservations and public requests',async scenario=>{
    const directory=mkdtempSync(join(tmpdir(),'public-race-')),path=join(directory,'own.sqlite'),db=new Constructor(path);
    db.pragma('journal_mode=WAL');initializePlannerSqlite(db);const storage=createSqlitePublicBookingStorage(db,'local');
    const channel={id:randomUUID(),workspaceId:'local',name:'Fictieve race',siteOrigin:'http://127.0.0.1:3044',active:true};storage.insertChannel(channel);
    const service=createBookingService(storage,{id:randomUUID,now:()=>'2026-11-19T10:00:00.000Z',hash:value=>createHash('sha256').update(value).digest('hex')});
    const staff=createBookingClient(async command=>service.invoke(command,{name:'demo'}),'local');
    try{
      const person=await staff.contacts.create({name:'Fictieve interne klant'},randomUUID()),[slot]=await staff.availability('2026-11-20','north');
      if(scenario==='three-cap2')await staff.slots.capacity(slot.slot.id,{version:1,capacity:2},randomUUID());
      const pub:WriterCommand={type:'public.reserve',channelId:channel.id,origin:channel.siteOrigin,input:{key:randomUUID(),postcode:'0002AA',slotId:slot.slot.id,contact:{name:'Fictieve bezoeker',email:'demo@example.test'}}};
      const book:WriterCommand={type:'appointments.create',workspaceId:'local',key:randomUUID(),input:{contactId:person.id,slotId:slot.slot.id}},block:WriterCommand={type:'blocks.create',workspaceId:'local',key:randomUUID(),input:{slotId:slot.slot.id,reason:'Private reason'}};
      if(scenario==='public-fails-staff')db.exec("CREATE TRIGGER public_commit_failure BEFORE INSERT ON planner_public_receipts BEGIN SELECT RAISE(ABORT,'injected public commit failure'); END");
      const commands=scenario==='same-key'?[pub,pub,pub]:scenario==='three-cap2'?[pub,{...pub,input:{...pub.input,key:randomUUID()}},{...pub,input:{...pub.input,key:randomUUID()}}]:scenario==='staff-public'?[book,pub]:scenario==='public-block'?[pub,block]:scenario==='block-public'?[block,pub]:[pub,book];
      const results=await race(path,binding,commands,directory);
      if(scenario==='same-key'){expect(results[0].ok).toBe(true);expect(results).toEqual([results[0],results[0],results[0]]);}
      else if(scenario==='three-cap2'){expect(results.filter(result=>result.ok)).toHaveLength(2);expect(results.find(result=>!result.ok)).toMatchObject({error:{code:'SLOT_FULL'}});}
      else if(scenario==='public-fails-staff'){expect(results[0]).toMatchObject({ok:false,error:{code:'INTERNAL_ERROR'}});expect(results[1].ok).toBe(true);}
      else{expect(results[0].ok).toBe(true);expect(results[1]).toMatchObject({ok:false,error:{code:scenario==='block-public'?'SLOT_BLOCKED':'SLOT_FULL'}});}
      const publicCount=scenario==='three-cap2'?2:['staff-public','block-public','public-fails-staff'].includes(scenario)?0:1;
      const appointmentCount=scenario==='block-public'?0:scenario==='three-cap2'?2:1;
      expect(db.prepare('SELECT count(*) AS n FROM planner_public_requests').get()).toEqual({n:publicCount});
      expect(db.prepare('SELECT count(*) AS n FROM planner_public_receipts').get()).toEqual({n:publicCount});
      expect(db.prepare('SELECT count(*) AS n FROM planner_contacts').get()).toEqual({n:1+publicCount});
      expect(db.prepare('SELECT count(*) AS n FROM planner_appointment_events').get()).toEqual({n:appointmentCount});
      expect(await staff.appointments.list('2026-11-20','north')).toHaveLength(appointmentCount);
    }finally{db.close();rmSync(directory,{recursive:true,force:true});}
  },30000);
});
