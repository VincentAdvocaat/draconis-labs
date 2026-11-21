import type { FastifyInstance, FastifyRequest } from 'fastify';
import { executePlannerCommand, type PlannerService } from '@draconis/planner-core';
import type { Actor } from '../../core/auth.js';
import type { AuthorizePlanner } from '../../core/local-identity.js';
import { agentScopeFor } from '../../core/agent-credentials.js';
import { createTaskSchema, workspaceUpdateTaskSchema, updatePreferencesSchema, historyQuerySchema, type PlannerReply } from '@draconis/shared';
import { z } from 'zod';
import { taskResponseSchema, paginatedTaskListSchema } from './schemas.js';
import { listWorkspaceTasksByCursor, workspaceTaskListQuerySchema } from './task-cursor.js';

const taskRef = { $ref: 'PlannerWorkspaceTask#' };
const errorRef = { $ref: 'PlannerWorkspaceError#' };
const idempotencyKeyPattern = '^[A-Za-z0-9._~-]{1,128}$';
const idempotencyKeySchema = z.string().regex(new RegExp(idempotencyKeyPattern)).optional();
const errorSchema = (authorize?: AuthorizePlanner) => ({
  $id: 'PlannerWorkspaceError',
  type: 'object', required: ['ok', 'error'],
  properties: {
    ok: { const: false },
    error: { type: 'object', required: ['code', 'status', 'message'], properties: {
      code: { type: 'string', enum: ['INVALID_INPUT', 'WORKSPACE_NOT_FOUND', 'TASK_NOT_FOUND', 'VERSION_CONFLICT', 'UNAUTHORIZED', 'UNAVAILABLE', 'INTERNAL_ERROR', 'IDEMPOTENCY_CONFLICT', ...(authorize ? ['FORBIDDEN'] : [])] },
      status: { type: 'integer' }, message: { type: 'string' }, task: taskRef,
    } },
  },
});
const success = (value: object) => ({ type: 'object', required: ['ok', 'value'], properties: { ok: { const: true }, value } });
const taskList = { oneOf: [{ type: 'array', items: taskRef }, { $ref: 'PlannerWorkspacePage#' }] };
const workspaceTaskList = { anyOf: [{ $ref: 'PlannerWorkspaceCursorPage#' }, ...taskList.oneOf] };

export function createWorkspacePlannerRoutes(service: PlannerService, workspaceId: string, identifyActor: (request: FastifyRequest) => Actor, authorize?: AuthorizePlanner) {
  return async (app: FastifyInstance) => {
    // Schemas document this transport. Shared Zod dispatch validates the raw input,
    // including trim transformations, without AJV changing its types first.
    app.setValidatorCompiler(() => data => ({ value: data }));
    app.addSchema({ $id: 'PlannerWorkspaceTask', ...taskResponseSchema });
    app.addSchema({ $id: 'PlannerWorkspacePage', ...paginatedTaskListSchema, properties: { ...paginatedTaskListSchema.properties, items: { type: 'array', items: taskRef } } });
    app.addSchema(errorSchema(authorize));
    if (authorize) app.decorateRequest('plannerActor', null);
    app.addSchema({
      $id: 'PlannerWorkspaceCursorPage', type: 'object', required: ['items', 'pageSize', 'nextCursor'],
      properties: {
        items: { type: 'array', items: taskRef },
        pageSize: { type: 'integer' },
        nextCursor: { type: ['string', 'null'], description: 'Pass this value as cursor on the next request. Null marks the last page.' },
      },
    });
    // Keep validation/transport errors in the same envelope as dispatched commands.
    app.setErrorHandler((error, _request, reply) => {
      const invalid = typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 400;
      return reply.code(invalid ? 400 : 500).send({ ok: false, error: { code: invalid ? 'INVALID_INPUT' : 'INTERNAL_ERROR', status: invalid ? 400 : 500, message: invalid ? 'Ongeldige invoer' : 'Planner kan de opdracht niet uitvoeren.' } });
    });
    const routes = [
      ['GET', '/tasks', 'tasks.list', workspaceTaskList],
      ['POST', '/tasks', 'tasks.create', taskRef],
      ['PATCH', '/tasks/:id', 'tasks.update', taskRef],
      ['DELETE', '/tasks/:id', 'tasks.remove', { type: 'null' }],
      ['GET', '/history', 'history.list', taskList],
      ['GET', '/preferences', 'preferences.get', { type: 'object', additionalProperties: true }],
      ['PATCH', '/preferences', 'preferences.update', { type: 'object', additionalProperties: true }],
    ] as const;
    for (const [method, url, type, result] of routes) {
      const pathParameters = url.includes(':id') ? ['workspaceId', 'id'] : ['workspaceId'];
      const scope = agentScopeFor(type);
      app.route({ method, url,
        ...(authorize ? { onRequest: async (request: FastifyRequest, reply) => {
          const { workspaceId } = request.params as { workspaceId: string };
          const access = authorize(request, workspaceId, type);
          if (!access.ok) return reply.code(access.error.status).send(access);
          request.setDecorator('plannerActor', access.actor);
        } } : {}),
        schema: {
        tags: ['planner'], summary: `Local workspace ${type}`,
        ...(authorize ? { description: scope ? 'Agent scope: ' + scope : 'Requires a user session.' } : {}),
        security: authorize ? [{ bearerAuth: [] }] : [{ bearerAuth: [] }, {}],
        ...(type === 'tasks.create' ? {
          body: z.toJSONSchema(createTaskSchema, { target: 'draft-7' }),
          headers: { type: 'object', properties: {
            'idempotency-key': {
              type: 'string', pattern: idempotencyKeyPattern,
              description: 'Retry task creation with the same key and validated input to receive the original 201 response. This key is scoped to the current actor and workspace.',
            },
          } },
        } : {}),
        ...(type === 'tasks.update' ? { body: z.toJSONSchema(workspaceUpdateTaskSchema, { target: 'draft-7' }) } : {}),
        ...(type === 'preferences.update' ? { body: z.toJSONSchema(updatePreferencesSchema, { target: 'draft-7' }) } : {}),
        ...(type === 'tasks.list' ? { querystring: z.toJSONSchema(workspaceTaskListQuerySchema, { target: 'draft-7' }) } : {}),
        ...(type === 'history.list' ? { querystring: z.toJSONSchema(historyQuerySchema, { target: 'draft-7' }) } : {}),
        params: {
          type: 'object',
          properties: Object.fromEntries(pathParameters.map(name => [name, { type: 'string' }])),
          required: pathParameters,
        },
        response: { [method === 'POST' ? 201 : 200]: success(result), 400: errorRef, 401: errorRef, ...(authorize ? { 403: errorRef } : {}), 404: errorRef, 409: errorRef, 500: errorRef, 503: errorRef },
      }, handler: (request, reply) => {
        const params = request.params as { workspaceId: string; id?: string };
        const query = { ...request.query as Record<string, unknown> };
        let outcome: PlannerReply;
        try {
          const actor = authorize ? request.getDecorator<Actor>('plannerActor') : identifyActor(request);
          if (type === 'tasks.list' && ('pagination' in query || 'cursor' in query)) {
            outcome = listWorkspaceTasksByCursor(service, workspaceId, params.workspaceId, query);
          } else {
            for (const key of ['future', 'overdue']) {
              if (query[key] === 'true') query[key] = true;
              else if (query[key] === 'false') query[key] = false;
            }
            const key = idempotencyKeySchema.safeParse(type === 'tasks.create' ? request.headers['idempotency-key'] : undefined);
            if (!key.success) return reply.code(400).send({ ok: false, error: { code: 'INVALID_INPUT', status: 400, message: 'Ongeldige Idempotency-Key' } });
            outcome = executePlannerCommand(service, workspaceId, actor, {
              workspaceId: params.workspaceId, type, id: params.id, query, input: request.body,
            }, key.data === undefined ? undefined : { key: key.data, actorKind: actor.kind });
          }
        } catch (error) {
          const unauthorized = typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === 401;
          outcome = { ok: false, error: unauthorized
            ? { code: 'UNAUTHORIZED', status: 401, message: 'Ongeldige aanmelding' }
            : { code: 'INTERNAL_ERROR', status: 500, message: 'Planner kan de opdracht niet uitvoeren.' } };
        }
        return reply.code(outcome.ok ? method === 'POST' ? 201 : 200 : outcome.error.status).send(outcome);
      } });
    }
  };
}
