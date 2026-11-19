import {parseArgs} from 'node:util';
import {randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
import {createSqlitePublicBookingStorage,initializePlannerSqlite} from '@draconis/planner-sqlite';

try{
  const {values}=parseArgs({options:{database:{type:'string'},origin:{type:'string'},name:{type:'string'}}});
  if(!values.database||!values.origin||!values.name?.trim()||values.name.trim().length>160)throw new Error('Provide --database, --origin and --name for an own local fixture');
  const origin=new URL(values.origin);
  if(!['http:','https:'].includes(origin.protocol)||origin.origin!==values.origin)throw new Error('Use a canonical site origin without path, credentials or trailing slash');
  const db=new Database(values.database,{fileMustExist:true});
  try{
    initializePlannerSqlite(db);const storage=createSqlitePublicBookingStorage(db,'local');
    const channel={id:randomUUID(),workspaceId:'local',name:values.name.trim(),siteOrigin:origin.origin,active:true};
    storage.transaction(()=>storage.insertChannel(channel));
    console.log(JSON.stringify({channelId:channel.id,publicUrl:origin.origin+'/?channel='+channel.id,scope:'Explicit local synthetic fixture; only one active channel per workspace'},null,2));
  }finally{db.close();}
}catch(error){console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
