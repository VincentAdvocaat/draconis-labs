import { McpServer, type CallToolResult } from '@modelcontextprotocol/server';
import type { FastifyInstance } from 'fastify';
import {
  LOCAL_WORKSPACE_ID, createPlannerHttpTransport, createTaskSchema, taskListQuerySchema, workspaceUpdateTaskSchema,
  type PlannerCommand,
} from '@draconis/shared';
import { z } from 'zod';
import { idempotencyKeyPattern } from './modules/planner/workspace-routes.js';

export const plannerSchemaUri = 'draconis://planner/schema/v1';
const workspaceId = LOCAL_WORKSPACE_ID;
const id = z.uuid();
const version = workspaceUpdateTaskSchema.shape.version;
const taskVersion = z.strictObject({ id, version });
const listInput = taskListQuerySchema.extend({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
}).strict();

export function createPlannerMcp(app: FastifyInstance, token: string) {
  const server = new McpServer({ name: 'draconis-planner', version: '1.0.0' });

  async function send(command: PlannerCommand, idempotencyKey?: string): Promise<CallToolResult> {
    const rest = createPlannerHttpTransport('', async (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', 'Bearer ' + token);
      if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
      const injected = await app.inject({
        url: String(url),
        method: init?.method as 'GET' | 'POST' | 'PATCH',
        headers: Object.fromEntries(headers),
        payload: init?.body as string | undefined,
      });
      return new Response(injected.body, { status: injected.statusCode });
    });
    const result = await rest(command);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      structuredContent: result,
      ...(result.ok ? {} : { isError: true }),
    };
  }

  server.registerTool('list_tasks', {
    description: 'List a page of Planner tasks with optional REST filters.',
    inputSchema: listInput,
    annotations: { readOnlyHint: true },
  }, ({ future, overdue, ...query }) => send({
    workspaceId, type: 'tasks.list',
    query: { ...query, future: future === undefined ? undefined : future === 'true', overdue: overdue === undefined ? undefined : overdue === 'true' },
  }));
  server.registerTool('create_task', {
    description: 'Create a Planner task. Reuse the same idempotency key and input when retrying.',
    inputSchema: z.strictObject({ input: createTaskSchema, idempotencyKey: z.string().regex(new RegExp(idempotencyKeyPattern)) }),
    annotations: { destructiveHint: false, idempotentHint: true },
  }, ({ input, idempotencyKey }) => send({ workspaceId, type: 'tasks.create', input }, idempotencyKey));
  server.registerTool('update_task', {
    description: 'Update a Planner task using its current version.',
    inputSchema: z.strictObject({ id, input: workspaceUpdateTaskSchema }),
  }, ({ id, input }) => send({ workspaceId, type: 'tasks.update', id, input }));
  server.registerTool('complete_task', {
    description: 'Complete a Planner task using its current version.',
    inputSchema: taskVersion,
  }, ({ id, version }) => send({ workspaceId, type: 'tasks.update', id, input: { version, lane: 'done' } }));
  server.registerTool('schedule_task', {
    description: 'Set or clear the planned date of a task using its current version.',
    inputSchema: taskVersion.extend({ plannedDate: createTaskSchema.shape.plannedDate.unwrap() }),
  }, ({ id, version, plannedDate }) => send({ workspaceId, type: 'tasks.update', id, input: { plannedDate, version } }));

  server.registerResource('planner-schema', plannerSchemaUri, {
    title: 'Planner REST OpenAPI', mimeType: 'application/json',
  }, async uri => {
    const access = await app.inject({
      url: '/api/v1/workspaces/' + workspaceId + '/tasks?page=1&pageSize=1',
      headers: { authorization: 'Bearer ' + token },
    });
    if (access.statusCode !== 200) throw new Error('Planner schema requires an active tasks:read credential.');
    const response = await app.inject('/api/v1/openapi.json');
    if (response.statusCode !== 200) throw new Error('Planner OpenAPI is unavailable.');
    return { contents: [{ uri: uri.href, text: response.body, mimeType: 'application/json' }] };
  });
  return server;
}
