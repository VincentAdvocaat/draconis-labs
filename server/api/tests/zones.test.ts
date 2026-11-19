import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBookingService } from '@draconis/planner-core';
import { createSqliteBookingStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { createBookingClient, type Appointment } from '@draconis/shared';
import { applyBookings } from '../../../packages/planner-sqlite/src/booking-migration.js';

const desktop = createRequire(new URL('../../../apps/desktop-probe/package.json', import.meta.url))('better-sqlite3') as typeof Database;
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const environment = { now: () => '2026-11-19T10:00:00.000Z', id: randomUUID, hash };
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,child])=>[key,canonical(child)]));
  return value;
}
const failure = (code: string) => expect.objectContaining({ code });
describe.each([['API12',Database],['desktop13',desktop]] as const)('%s zones and capacities', (_, Constructor) => {
  function setup() {
    const db = new Constructor(':memory:'); initializePlannerSqlite(db);
    const storage = createSqliteBookingStorage(db,'local');
    const service = createBookingService(storage,environment);
    return { db,storage,client:createBookingClient(async command=>service.invoke(command,{name:'demo'}),'local') };
  }
  it('migrates v2 keys/windows/events/receipts atomically into the permanent standard zone', async()=>{
    const db = new Constructor(':memory:'); db.pragma('foreign_keys=ON');
    db.exec(readFileSync(new URL('./fixtures/legacy.sql',import.meta.url),'utf8'));
    db.exec(readFileSync(new URL('./fixtures/current.sql',import.meta.url),'utf8'));
    applyBookings(db);
    db.exec("CREATE TABLE planner_schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL); INSERT INTO planner_schema_migrations VALUES(1,'old'),(2,'old')");
    const contactId=randomUUID(),slotId=randomUUID(),blockSlotId=randomUUID(),appointmentId=randomUUID(),key=randomUUID(),now=environment.now();
    db.prepare('INSERT INTO planner_contacts VALUES(?,?,?,?,?,?,?,?,?)').run('local',contactId,'Fictieve bestaande klant','demo@example.test',null,0,4,now,now);
    for(const [id,part,start,end] of [[slotId,'morning','08:00','12:00'],[blockSlotId,'afternoon','13:00','17:00']]) db.prepare('INSERT INTO planner_slots VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('local',id,'2026-11-20',part,part,start,end,'Europe/Amsterdam',`2026-11-20T${start}:00+01:00`,`2026-11-20T${end}:00+01:00`,1);
    const window={date:'2026-11-20',daypartId:'morning',label:'morning',startTime:'08:00',endTime:'12:00',timezone:'Europe/Amsterdam',startAt:'2026-11-20T08:00:00+01:00',endAt:'2026-11-20T12:00:00+01:00'};
    const rawWindow=JSON.stringify(window,null,2),rawEvent=JSON.stringify({window,arrivalAt:null},null,2);
    const oldAppointment={id:appointmentId,workspaceId:'local',contactId,slotId,status:'planned',source:'manual',version:1,window,arrivalAt:null,createdAt:now,updatedAt:now};
    db.prepare('INSERT INTO planner_appointments VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('local',appointmentId,contactId,slotId,'planned','manual',1,rawWindow,null,now,now);
    db.prepare('INSERT INTO planner_appointment_events VALUES(?,?,?,?,?,?,?,?)').run('local',randomUUID(),appointmentId,'demo',now,'planned',null,rawEvent);
    db.prepare('INSERT INTO planner_blocks VALUES(?,?,?,?,?,?)').run('local',randomUUID(),blockSlotId,'Fictieve oude blokkade','demo',now);
    const command={type:'appointments.create',workspaceId:'local',key,input:{contactId,slotId,arrivalAt:null}};
    db.prepare('INSERT INTO planner_command_receipts VALUES(?,?,?,?,?,?)').run('local','demo','appointments.create',key,hash(JSON.stringify(canonical(command))),JSON.stringify(oldAppointment));
    db.exec('CREATE TABLE planner_slot_occupancy(collision TEXT)');
    const beforeSchema=db.prepare('SELECT * FROM sqlite_master ORDER BY name').all(),beforeTasks=db.prepare('SELECT * FROM tasks ORDER BY id').all();
    try {
      expect(()=>initializePlannerSqlite(db)).toThrow();
      expect(db.prepare('SELECT * FROM sqlite_master ORDER BY name').all()).toEqual(beforeSchema);
      expect(db.prepare('SELECT window FROM planner_appointments').get()).toEqual({window:rawWindow});
      expect(db.prepare('SELECT * FROM planner_schema_migrations').all()).toHaveLength(2);
      db.exec('DROP TABLE planner_slot_occupancy'); initializePlannerSqlite(db); initializePlannerSqlite(db);
      expect(db.prepare('SELECT * FROM tasks ORDER BY id').all()).toEqual(beforeTasks);
      expect(db.prepare('SELECT window,zone_id,zone_name FROM planner_appointments').get()).toEqual({window:rawWindow,zone_id:'standard',zone_name:'Standaardgebied'});
      expect(db.prepare('SELECT after FROM planner_appointment_events').get()).toEqual({after:rawEvent});
      expect(db.pragma('foreign_key_check')).toEqual([]);
      const service=createBookingService(createSqliteBookingStorage(db,'local'),environment),client=createBookingClient(async command=>service.invoke(command,{name:'demo'}),'local');
      expect(await client.zones.list()).toHaveLength(5);
      expect(await client.appointments.create(command.input,key)).toEqual({...oldAppointment,zoneId:'standard',zoneName:'Standaardgebied'});
      expect(await client.appointments.list('2026-11-20')).toHaveLength(1);
      expect((await client.contacts.card(contactId)).events).toHaveLength(1);
      expect((await client.availability('2026-11-20'))[0].slot.id).toBe(slotId);
      expect((await client.availability('2026-11-20','north'))[0].slot.id).not.toBe(slotId);
    } finally {db.close();}
  });

  it('keeps zones separate, applies defaults only to new slots, and rejects capacity below occupancy',async()=>{
    const {db,client}=setup();
    try {
      const zones=await client.zones.list(),north=zones.find(zone=>zone.id==='north')!;
      const [oldNorth]=await client.availability('2026-11-20','north');
      const changed=await client.zones.capacity('north',{version:north.version,defaultCapacity:2},randomUUID());
      expect(changed.version).toBe(2);
      expect((await client.availability('2026-11-20','north'))[0].slot.capacity).toBe(1);
      const [two]=await client.availability('2026-11-21','north'); expect(two.slot.capacity).toBe(2);
      const [standard]=await client.availability('2026-11-21'); expect(standard.slot.capacity).toBe(1);
      const contact=await client.contacts.create({name:'Fictieve zoneklant'},randomUUID());
      await client.appointments.create({contactId:contact.id,slotId:two.slot.id},randomUUID());
      await expect(client.blocks.create({slotId:two.slot.id,reason:'Ook deels bezet'},randomUUID())).rejects.toMatchObject(failure('SLOT_FULL'));
      const completed=await client.appointments.create({contactId:contact.id,slotId:two.slot.id},randomUUID());
      await client.appointments.status(completed.id,{version:1,status:'completed'},randomUUID());
      const key=randomUUID();
      await expect(client.slots.capacity(two.slot.id,{version:1,capacity:1},key)).rejects.toMatchObject(failure('CAPACITY_BELOW_OCCUPANCY'));
      expect(db.prepare('SELECT key FROM planner_command_receipts WHERE key=?').get(key)).toBeUndefined();
      expect((await client.availability('2026-11-21','north'))[0]).toMatchObject({occupied:2,available:false,slot:{capacity:2,version:1}});
      await expect(client.blocks.create({slotId:two.slot.id,reason:'Demo'},randomUUID())).rejects.toMatchObject(failure('SLOT_FULL'));
      await expect(client.appointments.create({contactId:contact.id,slotId:two.slot.id},randomUUID())).rejects.toMatchObject(failure('SLOT_FULL'));
      const block=await client.blocks.create({slotId:standard.slot.id,reason:'Alleen standaardgebied'},randomUUID());
      expect((await client.availability('2026-11-21','north'))[0].block).toBeNull();
      await client.blocks.remove(block.id,randomUUID());
      const cap=await client.slots.capacity(oldNorth.slot.id,{version:1,capacity:0},randomUUID()); expect(cap.version).toBe(2);
      await expect(client.slots.capacity(oldNorth.slot.id,{version:1,capacity:2},randomUUID())).rejects.toMatchObject(failure('VERSION_CONFLICT'));
      await expect(client.availability('2026-11-21','unknown')).rejects.toMatchObject(failure('NOT_FOUND'));
    } finally {db.close();}
  });

  it.each(['planned','completed'] as const)('rejects direct SQL blocks on a partially occupied slot with a %s appointment',async status=>{
    const {db,client}=setup();
    try {
      const [destination,source]=await client.availability('2026-11-21','north');
      await client.slots.capacity(destination.slot.id,{version:1,capacity:2},randomUUID());
      const contact=await client.contacts.create({name:'Fictieve SQL-blokkadeklant'},randomUUID());
      const appointment=await client.appointments.create({contactId:contact.id,slotId:destination.slot.id},randomUUID());
      if(status==='completed') await client.appointments.status(appointment.id,{version:1,status},randomUUID());
      const block=await client.blocks.create({slotId:source.slot.id,reason:'Fictieve bronblokkade'},randomUUID());
      expect(()=>db.prepare('INSERT INTO planner_blocks VALUES(?,?,?,?,?,?)').run('local',randomUUID(),destination.slot.id,'Directe blokkade','demo',environment.now())).toThrow('planner slot occupied');
      expect(()=>db.prepare('UPDATE planner_blocks SET slot_id=? WHERE workspace_id=? AND id=?').run(destination.slot.id,'local',block.id)).toThrow('planner slot occupied');
      expect(db.prepare('SELECT slot_id FROM planner_blocks WHERE workspace_id=? AND id=?').get('local',block.id)).toEqual({slot_id:source.slot.id});
      expect(db.prepare('SELECT id FROM planner_blocks WHERE workspace_id=? AND slot_id=?').get('local',destination.slot.id)).toBeUndefined();
      expect((await client.availability('2026-11-21','north'))[0]).toMatchObject({occupied:1,block:null,available:true,slot:{capacity:2}});
    } finally {db.close();}
  });

  it('rolls back cross-zone moves, keeps windows, and replays a successful move once',async()=>{
    const {db,client}=setup();
    try {
      const contact=await client.contacts.create({name:'Fictieve verhuisklant'},randomUUID());
      const [source]=await client.availability('2026-11-20'),[destination]=await client.availability('2026-11-20','east');
      const a=await client.appointments.create({contactId:contact.id,slotId:source.slot.id,arrivalAt:'2026-11-20T09:15:00+01:00'},randomUUID());
      const b=await client.appointments.create({contactId:contact.id,slotId:destination.slot.id},randomUUID());
      await expect(client.appointments.move(a.id,{version:1,slotId:destination.slot.id},randomUUID())).rejects.toMatchObject(failure('SLOT_FULL'));
      expect(await client.appointments.list('2026-11-20')).toEqual([a]);
      await client.appointments.status(b.id,{version:1,status:'cancelled'},randomUUID());
      const key=randomUUID(),input={version:1,slotId:destination.slot.id,arrivalAt:'2026-11-20T10:00:00+01:00'};
      db.exec("CREATE TRIGGER zone_move_failure BEFORE INSERT ON planner_appointment_events WHEN NEW.type='moved' BEGIN SELECT RAISE(ABORT,'injected zone move error'); END");
      await expect(client.appointments.move(a.id,input,key)).rejects.toMatchObject(failure('INTERNAL_ERROR'));
      expect(await client.appointments.list('2026-11-20')).toEqual([a]);
      expect((await client.availability('2026-11-20','east'))[0].available).toBe(true);
      expect(db.prepare('SELECT key FROM planner_command_receipts WHERE key=?').get(key)).toBeUndefined();
      db.exec('DROP TRIGGER zone_move_failure');
      const moved=await client.appointments.move(a.id,input,key);
      expect(moved).toMatchObject({zoneId:'east',zoneName:'Oost (fictief)',version:2,window:a.window});
      expect(await client.appointments.move(a.id,input,key)).toEqual(moved);
      expect((await client.contacts.card(contact.id)).events.filter(event=>event.type==='moved')).toMatchObject([{before:{zoneId:'standard'},after:{zoneId:'east'}}]);
      expect(await client.appointments.list('2026-11-20')).toEqual([]);
      expect(await client.appointments.list('2026-11-20','east')).toHaveLength(2);
      // Direct SQL cannot overbook or lower capacity behind the use-case checks.
      expect(()=>db.prepare('UPDATE planner_slots SET capacity=0 WHERE id=?').run(destination.slot.id)).toThrow('capacity below occupancy');
      expect(()=>db.prepare('UPDATE planner_slots SET capacity=1.5 WHERE id=?').run(destination.slot.id)).toThrow('CHECK constraint');
      const extra={...moved,id:randomUUID()} as Appointment;
      expect(()=>createSqliteBookingStorage(db,'local').saveAppointment(extra)).toThrow('slot full');
    } finally {db.close();}
  });

  it('resolves only the fictional postcode assignment and reports unknown or duplicate configuration',async()=>{
    const {db,client,storage}=setup();
    try {
      expect(await client.zones.resolve('0002 aa')).toMatchObject({postcode:'0002AA',zone:{id:'north'},demonstration:true});
      await expect(client.zones.resolve('9999 ZZ')).rejects.toMatchObject(failure('UNKNOWN_POSTCODE'));
      await expect(client.zones.resolve('invalid')).rejects.toMatchObject(failure('INVALID_INPUT'));
      const duplicateService=createBookingService(storage,environment,undefined,[{postcode:'0002AA',zoneId:'north'},{postcode:'0002 AA',zoneId:'east'}]);
      expect(duplicateService.invoke({type:'zones.resolve',workspaceId:'local',input:{postcode:'0002AA'}},{name:'demo'})).toMatchObject({ok:false,error:{code:'AMBIGUOUS_POSTCODE',status:409}});
      expect(db.prepare('SELECT * FROM planner_appointments').all()).toEqual([]);
    } finally {db.close();}
  });
});
