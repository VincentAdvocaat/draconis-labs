import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { BookingService } from '@draconis/planner-core';
import { bookingCommandSchema, bookingResultSchemas, PLANNER_ERROR_CODES, type BookingCommand, type PlannerReply } from '@draconis/shared';
import { z } from 'zod';
import type { Actor } from '../../core/auth.js';

export function createBookingRoutes(service: BookingService, identifyActor: (request: FastifyRequest) => Actor) {
  return async (app: FastifyInstance) => {
    app.setValidatorCompiler(() => data => ({ value: data }));
    const failure = { type: 'object', required: ['ok','error'], properties: { ok: { const: false }, error: { type: 'object', required: ['code','status','message'], properties: { code: { type: 'string', enum: [...PLANNER_ERROR_CODES] }, status: { type: 'integer' }, message: { type: 'string' } } } } };
    app.setErrorHandler((error, _request, reply) => {
      const bad = typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400;
      return reply.code(bad ? 400 : 500).send({ ok: false, error: { code: bad ? 'INVALID_INPUT' : 'INTERNAL_ERROR', status: bad ? 400 : 500, message: 'Planner kan de opdracht niet uitvoeren.' } });
    });
    const routes: [string, string, BookingCommand['type']][] = [
      ['GET','/zones','zones.list'], ['GET','/zones/resolve','zones.resolve'], ['PATCH','/zones/:id/capacity','zones.capacity'], ['PATCH','/slots/:id/capacity','slots.capacity'],
      ['GET','/contacts','contacts.list'], ['POST','/contacts','contacts.create'], ['PATCH','/contacts/:id','contacts.update'], ['GET','/contacts/:id','contacts.card'],
      ['GET','/availability','availability.list'], ['GET','/appointments','appointments.list'], ['POST','/appointments','appointments.create'],
      ['POST','/appointments/:id/move','appointments.move'], ['POST','/appointments/:id/status','appointments.status'], ['POST','/blocks','blocks.create'], ['DELETE','/blocks/:id','blocks.remove'],
    ];
    for (const [method, url, type] of routes) {
      const commandSchema = bookingCommandSchema.options.find(option => option.shape.type.value === type)!;
      const shape = commandSchema.shape as Record<string, z.ZodType>;
      const body = z.object(Object.fromEntries(Object.entries(shape).filter(([key]) => !['type','workspaceId','id'].includes(key))));
      app.route({ method: method as 'GET' | 'POST' | 'PATCH' | 'DELETE', url, schema: {
        tags: ['bookings'], summary: `Local workspace ${type}`,
        ...(type === 'zones.resolve' ? {querystring:{type:'object',required:['postcode'],properties:{postcode:{type:'string',minLength:1,maxLength:20}}}} : {}),
        params: { type: 'object', properties: { workspaceId: { type: 'string' }, id: type === 'zones.capacity' ? { type: 'string', pattern: '^[a-z][a-z0-9-]{0,39}$' } : { type: 'string', format: 'uuid' } }, required: url.includes(':id') ? ['workspaceId','id'] : ['workspaceId'] },
        ...(method === 'GET' ? ('query' in commandSchema.shape ? { querystring: z.toJSONSchema(commandSchema.shape.query, { target: 'draft-7' }) } : 'date' in commandSchema.shape ? { querystring: { type: 'object', required: ['date'], properties: { date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, zoneId: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,39}$' } } } } : {}) : { body: z.toJSONSchema(body, { target: 'draft-7' }) }),
        response: { 200: { type: 'object', required: ['ok','value'], properties: { ok: { const: true }, value: z.toJSONSchema(bookingResultSchemas[type], { target: 'draft-7' }) } }, 400: failure, 401: failure, 404: failure, 409: failure, 500: failure, 503: failure },
      }, handler(request, reply) {
        const params = request.params as { workspaceId: string; id?: string }, query = { ...request.query as Record<string, unknown> };
        if (query.archived === 'true') query.archived = true; else if (query.archived === 'false') query.archived = false;
        let outcome: PlannerReply;
        try { outcome = service.invoke({ ...request.body as object, ...(type==='zones.resolve'?{input:{postcode:query.postcode}}:{}), type, workspaceId: params.workspaceId, id: params.id, query, date: query.date, zoneId: query.zoneId }, identifyActor(request)); }
        catch (error) {
          const unauth = typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 401;
          outcome = { ok: false, error: { code: unauth ? 'UNAUTHORIZED' : 'INTERNAL_ERROR', status: unauth ? 401 : 500, message: unauth ? 'Ongeldige aanmelding' : 'Planner kan de opdracht niet uitvoeren.' } };
        }
        return reply.code(outcome.ok ? 200 : outcome.error.status).send(outcome);
      } });
    }
  };
}
