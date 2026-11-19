import type Database from 'better-sqlite3';
import type { PublicBookingStorage, PublicChannel } from '@draconis/planner-core';
import type { PublicConfirmation } from '@draconis/shared';
import { createSqliteBookingStorage } from './booking-storage.js';

export function createSqlitePublicBookingStorage(db:Database.Database,workspaceId:string,busyTimeoutMs=5000):PublicBookingStorage{
  return {...createSqliteBookingStorage(db,workspaceId,busyTimeoutMs),
    channel(id){
      const row=db.prepare('SELECT * FROM planner_public_channels WHERE workspace_id=? AND id=?').get(workspaceId,id) as {workspace_id:string;id:string;name:string;site_origin:string;active:number}|undefined;
      return row?{id:row.id,workspaceId:row.workspace_id,name:row.name,siteOrigin:row.site_origin,active:row.active===1}:undefined;
    },
    insertChannel(channel:PublicChannel){
      if(channel.workspaceId!==workspaceId)throw new Error('Workspace mismatch');
      db.prepare('INSERT INTO planner_public_channels VALUES(?,?,?,?,?)').run(workspaceId,channel.id,channel.name,channel.siteOrigin,Number(channel.active));
    },
    publicReceipt(channelId,key){
      const row=db.prepare('SELECT hash,result FROM planner_public_receipts WHERE workspace_id=? AND channel_id=? AND key=?').get(workspaceId,channelId,key) as {hash:string;result:string}|undefined;
      return row?{hash:row.hash,result:JSON.parse(row.result) as PublicConfirmation}:undefined;
    },
    savePublicReceipt(channelId,key,hash,result){db.prepare('INSERT INTO planner_public_receipts VALUES(?,?,?,?,?)').run(workspaceId,channelId,key,hash,JSON.stringify(result));},
    insertPublicRequest(request){
      if(request.workspaceId!==workspaceId)throw new Error('Workspace mismatch');
      db.prepare('INSERT INTO planner_public_requests VALUES(?,?,?,?,?,?,?)').run(workspaceId,request.id,request.channelId,request.contactId,request.appointmentId,request.reference,request.createdAt);
    },
  };
}
