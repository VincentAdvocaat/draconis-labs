import { z } from 'zod';
import { bookingDateSchema, contactInputSchema } from './bookings.js';

export const publicAvailabilitySchema = z.strictObject({ postcode:z.string().trim().min(1).max(20), date:bookingDateSchema });
export const publicReservationSchema = z.strictObject({
  key:z.string().uuid(), postcode:z.string().trim().min(1).max(20), slotId:z.string().uuid(),
  contact:contactInputSchema.strict(),
});
export type PublicReservation = z.infer<typeof publicReservationSchema>;
export const publicWindowSchema = z.strictObject({ date:z.string(), daypart:z.string(), zone:z.string(), startTime:z.string(), endTime:z.string(), timezone:z.string(), startAt:z.string(), endAt:z.string() });
export const publicAvailabilityResponseSchema = z.strictObject({ channelName:z.string(), zone:z.string(), date:z.string(), slots:z.array(z.strictObject({id:z.string().uuid(),remaining:z.number().int().positive(),window:publicWindowSchema})) });
export const publicConfirmationSchema = z.strictObject({ reference:z.string().uuid(), status:z.literal('confirmed'), window:publicWindowSchema });
export type PublicWindow = z.infer<typeof publicWindowSchema>;
export type PublicAvailability = z.infer<typeof publicAvailabilityResponseSchema>;
export type PublicConfirmation = z.infer<typeof publicConfirmationSchema>;
export const PUBLIC_BOOKING_CODES = ['INVALID_INPUT','CHANNEL_NOT_FOUND','ORIGIN_NOT_ALLOWED','UNKNOWN_POSTCODE','AMBIGUOUS_POSTCODE','SLOT_NOT_FOUND','SLOT_FULL','SLOT_BLOCKED','OUTSIDE_HORIZON','IDEMPOTENCY_CONFLICT','RATE_LIMITED','PAYLOAD_TOO_LARGE','UNAVAILABLE','INTERNAL_ERROR'] as const;
export const publicErrorSchema = z.strictObject({code:z.enum(PUBLIC_BOOKING_CODES),status:z.union([z.literal(400),z.literal(403),z.literal(404),z.literal(409),z.literal(413),z.literal(429),z.literal(500),z.literal(503)]),message:z.string()});
export type PublicBookingError = z.infer<typeof publicErrorSchema>;
export type PublicReply<T> = {ok:true;value:T}|{ok:false;error:PublicBookingError};
export class PublicBookingClientError extends Error {
  readonly code: PublicBookingError['code']; readonly status:number;
  constructor(error:PublicBookingError){super(error.message);this.code=error.code;this.status=error.status;}
}
export function createPublicBookingClient(channelId:string,fetcher:typeof fetch=fetch) {
  const base='/api/v1/public/channels/'+encodeURIComponent(channelId);
  async function request<T>(path:string,schema:z.ZodType<T>,body?:PublicReservation):Promise<T>{
    let response:Response,raw:unknown;
    try {response=await fetcher(base+path,{method:body?'POST':'GET',credentials:'omit',cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});raw=await response.json();}
    catch{throw new PublicBookingClientError({code:'UNAVAILABLE',status:503,message:'Boeken is tijdelijk niet bereikbaar. Probeer dezelfde aanvraag opnieuw.'});}
    const envelope=z.discriminatedUnion('ok',[z.strictObject({ok:z.literal(true),value:schema}),z.strictObject({ok:z.literal(false),error:publicErrorSchema})]).safeParse(raw);
    if(!envelope.success || response.ok!==envelope.data.ok || (!envelope.data.ok&&response.status!==envelope.data.error.status)) throw new PublicBookingClientError({code:'UNAVAILABLE',status:503,message:'De boekingsuitkomst is niet leesbaar. Probeer dezelfde aanvraag opnieuw.'});
    if(!envelope.data.ok)throw new PublicBookingClientError(envelope.data.error);
    return envelope.data.value;
  }
  return {channelId,
    availability:(postcode:string,date:string)=>request('/availability?'+new URLSearchParams({postcode,date}),publicAvailabilityResponseSchema),
    reserve:(input:PublicReservation)=>request('/reservations',publicConfirmationSchema,input),
  };
}
export type PublicBookingClient = ReturnType<typeof createPublicBookingClient>;
