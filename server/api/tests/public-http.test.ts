import Database from 'better-sqlite3';
import {createHash,randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {createBookingService,createPublicBookingService} from '@draconis/planner-core';
import {createSqlitePublicBookingStorage,initializePlannerSqlite} from '@draconis/planner-sqlite';
import {createBookingClient,createPublicBookingClient} from '@draconis/shared';
import {buildPublicApp} from '../src/public/app.js';
import {createPublicRateLimit,type PublicLimitOptions} from '../src/public/rate-limit.js';

const origin='http://127.0.0.1:3044';
async function setup(options:PublicLimitOptions={}){
  const db=new Database(':memory:');initializePlannerSqlite(db);const storage=createSqlitePublicBookingStorage(db,'local');
  const channel={id:randomUUID(),workspaceId:'local',name:'Fictieve publieke demo',siteOrigin:origin,active:true};storage.insertChannel(channel);
  const env={id:randomUUID,now:()=>'2026-11-19T10:00:00.000Z',hash:(value:string)=>createHash('sha256').update(value).digest('hex')};
  const app=await buildPublicApp(createPublicBookingService(storage,env),options);
  const staff=createBookingClient(async command=>createBookingService(storage,env).invoke(command,{name:'planner'}),'local');
  const base='/api/v1/public/channels/'+channel.id;
  const fetcher=(async(url:string,init?:RequestInit)=>{
    const result=await app.inject({url,method:init?.method as 'GET'|'POST',payload:init?.body as string|undefined,headers:{...init?.headers as Record<string,string>,...(init?.method==='POST'?{origin}:{})}});
    return {ok:result.statusCode<400,status:result.statusCode,json:async()=>result.json()} as Response;
  }) as typeof fetch;
  return {db,app,staff,channel,base,client:createPublicBookingClient(channel.id,fetcher),close:async()=>{await app.close();db.close();}};
}
it('serves only public routes and no PII lookup, including on confirmation-reference paths',async()=>{
  const {app,client,staff,base,close}=await setup();
  try{
    const person=await staff.contacts.create({name:'SECRET_PERSON',email:'secret@example.test'},randomUUID());
    const slots=await client.availability('0002AA','2026-11-20');
    const body={key:randomUUID(),postcode:'0002AA',slotId:slots.slots[0].id,contact:{name:'Fictieve bezoeker',email:'visitor@example.test'}};
    const receipt=await client.reserve(body);expect(await client.reserve(body)).toEqual(receipt);
    const paths=['/api/v1/workspaces/local/tasks','/api/v1/workspaces/local/contacts','/api/v1/planner/tasks','/api/planner/tasks','/docs',base+'/contacts/'+person.id,base+'/confirmations/'+receipt.reference,base+'/reservations/'+receipt.reference];
    for(const url of paths){const result=await app.inject({url});expect(result.statusCode).toBe(404);expect(JSON.stringify(result.json())).not.toContain('SECRET');}
    const availability=await app.inject({url:base+'/availability?postcode=0002AA&date=2026-11-20'});
    expect(availability.headers['cache-control']).toBe('no-store');expect(availability.headers['referrer-policy']).toBe('no-referrer');
    for(const forbidden of ['contactId','appointmentId','arrivalAt','workspaceId','secret@example.test','visitor@example.test'])expect(availability.body).not.toContain(forbidden);
    expect(Object.keys(receipt).sort()).toEqual(['reference','status','window']);
  }finally{await close();}
});

it('requires the bound browser origin and JSON for writes, with bounded payload and sanitized errors',async()=>{
  const {app,client,channel,base,close}=await setup({writeLimit:20});
  try{
    const slots=await client.availability('0002AA','2026-11-20'),body={key:randomUUID(),postcode:'0002AA',slotId:slots.slots[0].id,contact:{name:'Fictieve bezoeker'}};
    for(const requestOrigin of [undefined,'http://foreign.example','null']){
      const result=await app.inject({method:'POST',url:base+'/reservations',headers:{'content-type':'application/json',...(requestOrigin?{origin:requestOrigin}:{})},payload:body});
      expect(result.statusCode).toBe(403);expect(result.json()).toMatchObject({ok:false,error:{code:'ORIGIN_NOT_ALLOWED'}});
    }
    const form=await app.inject({method:'POST',url:base+'/reservations',headers:{origin,'content-type':'application/x-www-form-urlencoded'},payload:'name=Fictieve'});expect(form.statusCode).toBe(400);
    const preflight=await app.inject({method:'OPTIONS',url:base+'/reservations',headers:{origin:'http://foreign.example','access-control-request-method':'POST'}});expect(preflight.statusCode).toBe(404);expect(preflight.headers['access-control-allow-origin']).toBeUndefined();
    const large=await app.inject({method:'POST',url:base+'/reservations',headers:{origin,'content-type':'application/json'},payload:JSON.stringify({...body,contact:{name:'x'.repeat(9000)}})});expect(large.statusCode).toBe(413);expect(large.json()).toMatchObject({error:{code:'PAYLOAD_TOO_LARGE'}});
    const malformed=await app.inject({method:'POST',url:base+'/reservations',headers:{origin,'content-type':'application/json'},payload:'{'});expect(malformed.statusCode).toBe(400);expect(malformed.json()).toMatchObject({error:{code:'INVALID_INPUT'}});
    const unknown=await app.inject({url:'/api/v1/public/channels/'+randomUUID()+'/availability?postcode=0002AA&date=2026-11-20'});expect(unknown.statusCode).toBe(404);
    const forged=await app.inject({method:'POST',url:base+'/reservations',headers:{origin,'content-type':'application/json'},payload:{...body,workspaceId:'other',arrivalAt:'SECRET'}});expect(forged.statusCode).toBe(400);expect(forged.body).not.toContain('SECRET');
    expect(channel.workspaceId).toBe('local');
  }finally{await close();}
});

it('limits writes before persistence and does not trust forwarded addresses',async()=>{
  const {db,app,client,base,close}=await setup({writeLimit:1});
  try{
    const slots=await client.availability('0002AA','2026-11-20'),body={key:randomUUID(),postcode:'0002AA',slotId:slots.slots[0].id,contact:{name:'Fictieve bezoeker'}};
    await client.reserve(body);
    for(const forwarded of ['10.0.0.1','10.0.0.2']){
      const result=await app.inject({method:'POST',url:base+'/reservations',headers:{origin,'content-type':'application/json','x-forwarded-for':forwarded},payload:{...body,key:randomUUID()}});
      expect(result.statusCode).toBe(429);expect(Number(result.headers['retry-after'])).toBeGreaterThan(0);
    }
    expect(db.prepare('SELECT count(*) AS n FROM planner_public_requests').get()).toEqual({n:1});
  }finally{await close();}
});

it('keeps rate-limit memory bounded and expires buckets without evicting active limits',()=>{
  let clock=0;const limit=createPublicRateLimit({now:()=>clock,windowMs:1000,readLimit:1,writeLimit:1,maxClients:2});
  expect(limit.accept('a',false).allowed).toBe(true);expect(limit.accept('a',false).allowed).toBe(false);expect(limit.accept('a',true).allowed).toBe(true);
  expect(limit.accept('b',false).allowed).toBe(true);expect(limit.accept('c',false).allowed).toBe(false);expect(limit.clientCount).toBe(2);
  expect(limit.accept('a',false).allowed).toBe(false);
  clock=1000;expect(limit.accept('c',false).allowed).toBe(true);expect(limit.clientCount).toBe(1);
  expect(limit.accept('x'.repeat(129),false).allowed).toBe(false);expect(limit.clientCount).toBe(1);
});

it('treats a malformed success projection as an unknown outcome rather than exposing extra fields',async()=>{
  const client=createPublicBookingClient(randomUUID(),(async()=>({ok:true,status:200,json:async()=>({ok:true,value:{reference:randomUUID(),status:'confirmed',window:{},contact:'SECRET'}})} as Response)) as typeof fetch);
  await expect(client.reserve({key:randomUUID(),postcode:'0002AA',slotId:randomUUID(),contact:{name:'Demo'}})).rejects.toMatchObject({code:'UNAVAILABLE'});
});
