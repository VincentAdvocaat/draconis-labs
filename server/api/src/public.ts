import Database from 'better-sqlite3';
import { createHash,randomUUID } from 'node:crypto';
import { createPublicBookingService } from '@draconis/planner-core';
import { createSqlitePublicBookingStorage,initializePlannerSqlite } from '@draconis/planner-sqlite';
import { buildPublicApp } from './public/app.js';

if(!process.env.DATABASE_PATH)throw new Error('Public demo requires an explicit DATABASE_PATH to its own existing local database');
const host=process.env.PUBLIC_HOST??'127.0.0.1';
if(!['127.0.0.1','::1','localhost'].includes(host))throw new Error('This public demo binds only to loopback');
const db=new Database(process.env.DATABASE_PATH,{fileMustExist:true});
db.pragma('journal_mode=WAL');db.pragma('foreign_keys=ON');
try{
  initializePlannerSqlite(db);
  const service=createPublicBookingService(createSqlitePublicBookingStorage(db,'local'),{id:randomUUID,now:()=>new Date().toISOString(),hash:value=>createHash('sha256').update(value).digest('hex')});
  const app=await buildPublicApp(service);
  const address=await app.listen({host,port:Number(process.env.PUBLIC_PORT??3043)});
  console.log('Local public booking API listening on '+address);
  const close=()=>{void app.close().finally(()=>{if(db.open)db.close();});};process.once('SIGINT',close);process.once('SIGTERM',close);
}catch(error){if(db.open)db.close();throw error;}
