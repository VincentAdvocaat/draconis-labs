import { publicAvailabilitySchema, publicReservationSchema, type Appointment, type Availability, type Contact, type CustomerWindow, type PlannerReply, type PublicAvailability, type PublicBookingError, type PublicConfirmation, type PublicReply, type PublicWindow, type Zone } from '@draconis/shared';
import { createBookingService } from './bookings.js';
import type { BookingEnvironment } from './booking-storage.js';
import type { PublicBookingStorage } from './public-storage.js';

class PublicFailure extends Error {
  readonly detail:PublicBookingError;
  constructor(detail:PublicBookingError){super(detail.message);this.detail=detail;}
}
const fail=(code:PublicBookingError['code'],status:PublicBookingError['status'],message:string):never=>{throw new PublicFailure({code,status,message});};
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,child])=>[key,canonical(child)]));
  return value;
}
function unwrap<T>(reply:PlannerReply):T {
  if(reply.ok)return reply.value as T;
  switch(reply.error.code){
    case 'INVALID_INPUT':return fail('INVALID_INPUT',400,'Controleer de ingevulde gegevens.');
    case 'UNKNOWN_POSTCODE':return fail('UNKNOWN_POSTCODE',404,'Deze demonstratiepostcode hoort niet bij een aangeboden gebied.');
    case 'AMBIGUOUS_POSTCODE':return fail('AMBIGUOUS_POSTCODE',409,'De postcode-indeling is niet eenduidig. Neem contact op met de planner.');
    case 'NOT_FOUND':return fail('SLOT_NOT_FOUND',404,'Dit tijdvak is niet beschikbaar.');
    case 'SLOT_FULL':return fail('SLOT_FULL',409,'Dit tijdvak is inmiddels vol. Kies een ander tijdvak.');
    case 'SLOT_BLOCKED':return fail('SLOT_BLOCKED',409,'Dit tijdvak is niet meer beschikbaar. Kies een ander tijdvak.');
    case 'OUTSIDE_HORIZON':return fail('OUTSIDE_HORIZON',409,'Deze datum valt buiten de boekingsperiode.');
    case 'UNAVAILABLE':return fail('UNAVAILABLE',503,'Boeken is tijdelijk bezet. Probeer dezelfde aanvraag opnieuw.');
    default:return fail('INTERNAL_ERROR',500,'De boeking kon niet worden verwerkt.');
  }
}
function publicWindow(window:CustomerWindow,zone:string):PublicWindow {
  const {date,startTime,endTime,timezone,startAt,endAt}=window;
  return {date,daypart:window.label,zone,startTime,endTime,timezone,startAt,endAt};
}
export function createPublicBookingService(storage:PublicBookingStorage,env:BookingEnvironment) {
  const bookings=createBookingService(storage,{...env,appointmentSource:'public'});
  function channel(id:string,origin:string|undefined,write:boolean) {
    // An unknown, inactive or foreign-workspace channel has the same outcome.
    const value=/^[0-9a-f-]{36}$/i.test(id)?storage.channel(id):undefined;
    if(!value?.active||value.workspaceId!==storage.workspaceId)return fail('CHANNEL_NOT_FOUND',404,'Boekingskanaal niet gevonden.');
    if((write&&!origin)||(origin!==undefined&&origin!==value.siteOrigin))return fail('ORIGIN_NOT_ALLOWED',403,'Deze site mag dit boekingskanaal niet gebruiken.');
    return value;
  }
  function run<T>(operation:()=>T):PublicReply<T> {
    try{return {ok:true,value:storage.transaction(operation)};}
    catch(error){
      if(error instanceof PublicFailure)return {ok:false,error:error.detail};
      if(error instanceof Error&&'statusCode'in error&&error.statusCode===503)return {ok:false,error:{code:'UNAVAILABLE',status:503,message:'Boeken is tijdelijk bezet. Probeer dezelfde aanvraag opnieuw.'}};
      return {ok:false,error:{code:'INTERNAL_ERROR',status:500,message:'De boeking kon niet worden verwerkt.'}};
    }
  }
  return {
    availability(channelId:string,origin:string|undefined,input:unknown):PublicReply<PublicAvailability>{
      const parsed=publicAvailabilitySchema.safeParse(input);
      if(!parsed.success)return {ok:false,error:{code:'INVALID_INPUT',status:400,message:'Vul een geldige demonstratiepostcode en datum in.'}};
      return run(()=>{
        const site=channel(channelId,origin,false),actor={name:'public:'+site.id};
        const {zone}=unwrap<{zone:Zone}>(bookings.invoke({type:'zones.resolve',workspaceId:storage.workspaceId,input:{postcode:parsed.data.postcode}},actor));
        const slots=unwrap<Availability[]>(bookings.invoke({type:'availability.list',workspaceId:storage.workspaceId,zoneId:zone.id,date:parsed.data.date},actor));
        return {channelName:site.name,zone:zone.name,date:parsed.data.date,slots:slots.filter(item=>item.available).map(item=>({id:item.slot.id,remaining:item.slot.capacity-item.occupied,window:publicWindow(item.slot,zone.name)}))};
      });
    },
    reserve(channelId:string,origin:string|undefined,input:unknown):PublicReply<PublicConfirmation>{
      const parsed=publicReservationSchema.safeParse(input);
      if(!parsed.success)return {ok:false,error:{code:'INVALID_INPUT',status:400,message:'Controleer de boekingsgegevens.'}};
      return run(()=>{
        const site=channel(channelId,origin,true),command=parsed.data,actor={name:'public:'+site.id};
        const hash=env.hash(JSON.stringify(canonical(command))),receipt=storage.publicReceipt(site.id,command.key);
        if(receipt){
          if(receipt.hash!==hash)return fail('IDEMPOTENCY_CONFLICT',409,'Deze aanvraagcode is al voor andere gegevens gebruikt.');
          return receipt.result;
        }
        const {zone}=unwrap<{zone:Zone}>(bookings.invoke({type:'zones.resolve',workspaceId:storage.workspaceId,input:{postcode:command.postcode}},actor));
        const slot=storage.slot(command.slotId);
        if(!slot||slot.workspaceId!==site.workspaceId||slot.zoneId!==zone.id)return fail('SLOT_NOT_FOUND',404,'Dit tijdvak hoort niet bij de gekozen demonstratiepostcode.');
        // All nested commands use this same adapter/connection. A failed reply is
        // thrown so the outer transaction also rolls back the contact and receipts.
        const contact=unwrap<Contact>(bookings.invoke({type:'contacts.create',workspaceId:storage.workspaceId,key:command.key,input:command.contact},actor));
        const appointment=unwrap<Appointment>(bookings.invoke({type:'appointments.create',workspaceId:storage.workspaceId,key:command.key,input:{contactId:contact.id,slotId:slot.id,arrivalAt:null}},actor));
        const reference=env.id(),result:PublicConfirmation={reference,status:'confirmed',window:publicWindow(appointment.window,appointment.zoneName)};
        storage.insertPublicRequest({id:env.id(),workspaceId:storage.workspaceId,channelId:site.id,contactId:contact.id,appointmentId:appointment.id,reference,createdAt:env.now()});
        storage.savePublicReceipt(site.id,command.key,hash,result);
        return result;
      });
    },
  };
}
export type PublicBookingService=ReturnType<typeof createPublicBookingService>;
