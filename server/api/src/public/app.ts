import Fastify from 'fastify';
import { z } from 'zod';
import type { PublicBookingService } from '@draconis/planner-core';
import { publicAvailabilitySchema,publicAvailabilityResponseSchema,publicConfirmationSchema,publicErrorSchema,publicReservationSchema } from '@draconis/shared';
import { createPublicRateLimit,type PublicLimitOptions } from './rate-limit.js';

/** Deliberately registers no private modules, auth fallback, task routes or docs UI. */
export async function buildPublicApp(service:PublicBookingService,options:PublicLimitOptions={}){
  const app=Fastify({logger:false,bodyLimit:8192,trustProxy:false}),limiter=createPublicRateLimit(options);
  const error={type:'object',additionalProperties:false,required:['ok','error'],properties:{ok:{const:false},error:z.toJSONSchema(publicErrorSchema,{target:'draft-7'})}};
  const errors={400:error,403:error,404:error,409:error,413:error,429:error,500:error,503:error};
  app.addHook('onRequest',async(request,reply)=>{
    reply.header('Cache-Control','no-store').header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff');
    // No forwarded-address trust: arbitrary headers cannot create fresh buckets.
    const accepted=limiter.accept(request.ip,request.method==='POST');
    if(!accepted.allowed)return reply.header('Retry-After',String(accepted.retryAfterSeconds)).code(429).send({ok:false,error:{code:'RATE_LIMITED',status:429,message:'Te veel verzoeken. Probeer later dezelfde aanvraag opnieuw.'}});
    if(request.method==='POST'&&request.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json')return reply.code(400).send({ok:false,error:{code:'INVALID_INPUT',status:400,message:'Gebruik een JSON-boekingsaanvraag.'}});
  });
  app.setErrorHandler((error,_request,reply)=>{
    const status=typeof error==='object'&&error!==null&&'statusCode'in error?Number(error.statusCode):500;
    const large=status===413;
    return reply.code(large?413:status>=400&&status<500?400:500).send({ok:false,error:{code:large?'PAYLOAD_TOO_LARGE':status>=400&&status<500?'INVALID_INPUT':'INTERNAL_ERROR',status:large?413:status>=400&&status<500?400:500,message:large?'De aanvraag is te groot.':'De boekingsaanvraag kon niet worden verwerkt.'}});
  });
  app.setNotFoundHandler((_request,reply)=>reply.code(404).send({ok:false,error:{code:'CHANNEL_NOT_FOUND',status:404,message:'Boekingspad niet gevonden.'}}));
  app.get('/health',()=>({status:'ok',service:'public-booking'}));
  await app.register(async api=>{
    // Keep raw body/query types intact; shared Zod schemas validate in the core.
    api.setValidatorCompiler(()=>data=>({value:data}));
    const params={type:'object',required:['channelId'],properties:{channelId:{type:'string',format:'uuid'}}};
    api.get('/channels/:channelId/availability',{schema:{params,querystring:z.toJSONSchema(publicAvailabilitySchema,{target:'draft-7'}),response:{200:{type:'object',additionalProperties:false,required:['ok','value'],properties:{ok:{const:true},value:z.toJSONSchema(publicAvailabilityResponseSchema,{target:'draft-7'})}},...errors}}},(request,reply)=>{
      const result=service.availability((request.params as {channelId:string}).channelId,request.headers.origin,request.query);
      return reply.code(result.ok?200:result.error.status).send(result);
    });
    api.post('/channels/:channelId/reservations',{schema:{params,body:z.toJSONSchema(publicReservationSchema,{target:'draft-7'}),response:{200:{type:'object',additionalProperties:false,required:['ok','value'],properties:{ok:{const:true},value:z.toJSONSchema(publicConfirmationSchema,{target:'draft-7'})}},...errors}}},(request,reply)=>{
      const result=service.reserve((request.params as {channelId:string}).channelId,request.headers.origin,request.body);
      return reply.code(result.ok?200:result.error.status).send(result);
    });
  },{prefix:'/api/v1/public'});
  await app.ready();return app;
}
