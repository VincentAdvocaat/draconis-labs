import type { PublicConfirmation } from '@draconis/shared';
import type { BookingStorage } from './booking-storage.js';

export interface PublicChannel {id:string;workspaceId:string;name:string;siteOrigin:string;active:boolean}
export interface PublicRequest {id:string;workspaceId:string;channelId:string;contactId:string;appointmentId:string;reference:string;createdAt:string}
/** Extending the same storage port guarantees nested use cases share its transaction. */
export interface PublicBookingStorage extends BookingStorage {
  channel(id:string):PublicChannel|undefined;
  insertChannel(channel:PublicChannel):void;
  publicReceipt(channelId:string,key:string):{hash:string;result:PublicConfirmation}|undefined;
  savePublicReceipt(channelId:string,key:string,hash:string,result:PublicConfirmation):void;
  insertPublicRequest(request:PublicRequest):void;
}
