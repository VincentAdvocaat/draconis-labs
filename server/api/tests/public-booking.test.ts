import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import {createBookingService,createPublicBookingService} from '@draconis/planner-core';
import {createSqlitePublicBookingStorage,initializePlannerSqlite} from '@draconis/planner-sqlite';
import {createBookingClient,type PublicReservation} from '@draconis/shared';
import {plannerMigrations} from '../../../packages/planner-sqlite/src/migrations.js';

const desktop=createRequire(new URL('../../../apps/desktop-probe/package.json',import.meta.url))('better-sqlite3') as typeof Database;
const env={id:randomUUID,now:()=>'2026-11-19T10:00:00.000Z',hash:(s:string)=>createHash('sha256').update(s).digest('hex')};
const origin='http://127.0.0.1:3044';
describe.each([['API12',Database],['desktop13',desktop]] as const)('%s public reservation core',(_,Constructor)=>{
  function setup(){
    const db=new Constructor(':memory:');initializePlannerSqlite(db);
    const storage=createSqlitePublicBookingStorage(db,'local'),channel={id:randomUUID(),workspaceId:'local',name:'Fictief onderhoud',siteOrigin:origin,active:true};storage.insertChannel(channel);
    const staff=createBookingClient(async command=>createBookingService(storage,env).invoke(command,{name:'planner'}),'local');
    return {db,storage,channel,staff,publicService:createPublicBookingService(storage,env)};
  }
  function request(slotId:string):PublicReservation{return {key:randomUUID(),postcode:'0002 AA',slotId,contact:{name:'Fictieve bezoeker',email:'visitor@example.test',phone:'0611110000'}};}
  it('projects only offered customer windows and confirms/replays without exposing private data',async()=>{
    const {db,channel,staff,publicService}=setup();
    try{
      const [morning,afternoon]=await staff.availability('2026-11-20','north');
      await staff.slots.capacity(morning.slot.id,{version:1,capacity:2},randomUUID());
      const privateContact=await staff.contacts.create({name:'SECRET_PRIVATE_PERSON',email:'private@example.test',phone:'SECRET_PHONE'},randomUUID());
      await staff.appointments.create({contactId:privateContact.id,slotId:morning.slot.id,arrivalAt:'2026-11-20T09:15:00+01:00'},randomUUID());
      await staff.blocks.create({slotId:afternoon.slot.id,reason:'SECRET_BLOCK_REASON'},randomUUID());
      const offered=publicService.availability(channel.id,undefined,{postcode:'0002 aa',date:'2026-11-20'});
      expect(offered).toMatchObject({ok:true,value:{zone:'Noord (fictief)',slots:[{id:morning.slot.id,remaining:1}]}});
      const serialized=JSON.stringify(offered);
      for(const forbidden of ['SECRET','arrivalAt','contactId','workspaceId','09:15','private@example.test','reason'])expect(serialized).not.toContain(forbidden);
      const input=request(morning.slot.id),result=publicService.reserve(channel.id,origin,input);
      expect(result).toMatchObject({ok:true,value:{status:'confirmed',window:{startTime:'08:00',endTime:'12:00',zone:'Noord (fictief)'}}});
      expect(publicService.reserve(channel.id,origin,{contact:{phone:input.contact.phone,email:input.contact.email,name:input.contact.name},slotId:input.slotId,postcode:input.postcode,key:input.key})).toEqual(result);
      expect(publicService.reserve(channel.id,origin,{...input,contact:{...input.contact,name:'Other payload'}})).toMatchObject({ok:false,error:{code:'IDEMPOTENCY_CONFLICT',status:409}});
      for(const forbidden of ['contact','arrivalAt','appointmentId','workspaceId','visitor@example.test','0611110000'])expect(JSON.stringify(result)).not.toContain(forbidden);
      expect(await staff.appointments.list('2026-11-20','north')).toMatchObject(expect.arrayContaining([expect.objectContaining({source:'public',arrivalAt:null})]));
      expect(db.prepare('SELECT count(*) AS n FROM planner_public_requests').get()).toEqual({n:1});
      expect(db.prepare('SELECT count(*) AS n FROM planner_public_receipts').get()).toEqual({n:1});
    }finally{db.close();}
  });

  it('rolls back contact, appointment, audit and every receipt when final persistence fails',async()=>{
    const {db,channel,staff,publicService}=setup();
    try{
      const [slot]=await staff.availability('2026-11-20','north'),input=request(slot.slot.id);
      db.exec("CREATE TRIGGER fail_public_receipt BEFORE INSERT ON planner_public_receipts BEGIN SELECT RAISE(ABORT,'injected public receipt failure'); END");
      expect(publicService.reserve(channel.id,origin,input)).toMatchObject({ok:false,error:{code:'INTERNAL_ERROR',status:500}});
      for(const table of ['planner_contacts','planner_appointments','planner_appointment_events','planner_public_requests','planner_public_receipts','planner_command_receipts'])expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({n:0});
      db.exec('DROP TRIGGER fail_public_receipt');
      expect(publicService.reserve(channel.id,origin,input).ok).toBe(true);
      const other=request(slot.slot.id),before=db.prepare('SELECT * FROM planner_contacts').all();
      expect(publicService.reserve(channel.id,origin,other)).toMatchObject({ok:false,error:{code:'SLOT_FULL'}});
      expect(db.prepare('SELECT * FROM planner_contacts').all()).toEqual(before);
      expect(db.prepare('SELECT key FROM planner_public_receipts WHERE key=?').get(other.key)).toBeUndefined();
    }finally{db.close();}
  });

  it('revalidates channel, origin, postcode, zone, horizon and strict public payload',async()=>{
    const {db,storage,channel,staff,publicService}=setup();
    try{
      const [north]=await staff.availability('2026-11-20','north'),[east]=await staff.availability('2026-11-20','east');
      const input=request(north.slot.id);
      expect(publicService.reserve(channel.id,undefined,input)).toMatchObject({ok:false,error:{code:'ORIGIN_NOT_ALLOWED',status:403}});
      expect(publicService.reserve(channel.id,'http://foreign.example',input)).toMatchObject({ok:false,error:{code:'ORIGIN_NOT_ALLOWED'}});
      expect(publicService.availability(channel.id,'http://foreign.example',{postcode:'0002AA',date:'2026-11-20'})).toMatchObject({ok:false,error:{code:'ORIGIN_NOT_ALLOWED'}});
      expect(publicService.reserve(randomUUID(),origin,input)).toMatchObject({ok:false,error:{code:'CHANNEL_NOT_FOUND',status:404}});
      expect(publicService.reserve(channel.id,origin,{...input,postcode:'9999ZZ'})).toMatchObject({ok:false,error:{code:'UNKNOWN_POSTCODE'}});
      expect(publicService.reserve(channel.id,origin,{...input,slotId:east.slot.id})).toMatchObject({ok:false,error:{code:'SLOT_NOT_FOUND'}});
      expect(publicService.reserve(channel.id,origin,{...input,arrivalAt:'2026-11-20T09:15:00+01:00'})).toMatchObject({ok:false,error:{code:'INVALID_INPUT'}});
      expect(publicService.reserve(channel.id,origin,{...input,contact:{...input.contact,createdBy:'forged'}})).toMatchObject({ok:false,error:{code:'INVALID_INPUT'}});
      expect(publicService.availability(channel.id,undefined,{postcode:'0002AA',date:'2026-02-30'})).toMatchObject({ok:false,error:{code:'INVALID_INPUT'}});
      expect(publicService.availability(channel.id,undefined,{postcode:'0002AA',date:'2027-03-01'})).toMatchObject({ok:true,value:{slots:[]}});
      storage.insertSlot({...north.slot,id:randomUUID(),date:'2027-03-01',startAt:'2027-03-01T07:00:00Z',endAt:'2027-03-01T11:00:00Z'});
      const future=storage.slots('2027-03-01','north')[0];
      expect(publicService.reserve(channel.id,origin,{...input,slotId:future.id})).toMatchObject({ok:false,error:{code:'OUTSIDE_HORIZON'}});
      const foreign=createSqlitePublicBookingStorage(db,'other'),foreignChannel={...channel,id:randomUUID(),workspaceId:'other'};foreign.insertChannel(foreignChannel);
      expect(publicService.reserve(foreignChannel.id,origin,input)).toMatchObject({ok:false,error:{code:'CHANNEL_NOT_FOUND'}});
      db.prepare('UPDATE planner_public_channels SET active=0 WHERE id=?').run(channel.id);
      expect(publicService.reserve(channel.id,origin,input)).toMatchObject({ok:false,error:{code:'CHANNEL_NOT_FOUND'}});
      expect(db.prepare('SELECT count(*) AS n FROM planner_contacts').get()).toEqual({n:0});
    }finally{db.close();}
  });

  it('migrates existing v3 appointments/receipts without changing snapshots or disabling SQL guards',async()=>{
    const db=new Constructor(':memory:');db.pragma('foreign_keys=ON');
    db.exec('CREATE TABLE planner_schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL)');
    db.transaction(()=>{for(const migration of plannerMigrations.filter(m=>m.version<4)){migration.apply(db);db.prepare('INSERT INTO planner_schema_migrations VALUES(?,?)').run(migration.version,env.now());}}).immediate();
    const storage=createSqlitePublicBookingStorage(db,'local'),staff=createBookingClient(async command=>createBookingService(storage,env).invoke(command,{name:'planner'}),'local');
    try{
      const contact=await staff.contacts.create({name:'Fictieve v3 klant'},randomUUID()),[slot]=await staff.availability('2026-11-20','north');
      await staff.appointments.create({contactId:contact.id,slotId:slot.slot.id},randomUUID());
      const rows=db.prepare('SELECT * FROM planner_appointments').all(),events=db.prepare('SELECT * FROM planner_appointment_events ORDER BY rowid').all(),receipts=db.prepare('SELECT * FROM planner_command_receipts ORDER BY key').all();
      db.exec('CREATE TABLE planner_public_channels(collision TEXT)');
      const schema=db.prepare('SELECT * FROM sqlite_master ORDER BY name').all();
      expect(()=>initializePlannerSqlite(db)).toThrow();
      expect(db.prepare('SELECT * FROM sqlite_master ORDER BY name').all()).toEqual(schema);
      expect(db.prepare('SELECT * FROM planner_appointments').all()).toEqual(rows);
      db.exec('DROP TABLE planner_public_channels');initializePlannerSqlite(db);initializePlannerSqlite(db);
      expect(db.prepare('SELECT * FROM planner_appointments').all()).toEqual(rows);
      expect(db.prepare('SELECT * FROM planner_appointment_events ORDER BY rowid').all()).toEqual(events);
      expect(db.prepare('SELECT * FROM planner_command_receipts ORDER BY key').all()).toEqual(receipts);
      expect(db.pragma('foreign_key_check')).toEqual([]);
      const blockSlot=(await staff.availability('2026-11-20','east'))[0].slot,block=await staff.blocks.create({slotId:blockSlot.id,reason:'Only demo'},randomUUID());
      expect(()=>db.prepare('UPDATE planner_blocks SET slot_id=? WHERE id=?').run(slot.slot.id,block.id)).toThrow('slot occupied');
    }finally{db.close();}
  });
});
