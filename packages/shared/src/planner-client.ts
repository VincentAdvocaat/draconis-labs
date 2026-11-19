import { z } from 'zod';
import { createTaskSchema, updateTaskSchema, taskListQuerySchema, historyQuerySchema } from './schemas/planner.js';
import { updatePreferencesSchema } from './schemas/preferences.js';
import type { CreateTaskInput, Task, PaginatedTasks, TaskListQuery, UserPreferences } from './index.js';

export const LOCAL_WORKSPACE_ID = 'local';
export const workspaceUpdateTaskSchema = updateTaskSchema.safeExtend({ version: z.number().int().positive() });
export type WorkspaceTaskUpdate = z.infer<typeof workspaceUpdateTaskSchema>;
const context = { workspaceId: z.string().min(1).max(120) };
const id = z.string().uuid();
const listQuery = taskListQuerySchema.omit({ future: true, overdue: true }).extend({ future: z.boolean().optional(), overdue: z.boolean().optional() });
export const plannerCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...context, type: z.literal('tasks.list'), query: listQuery.optional() }),
  z.object({ ...context, type: z.literal('tasks.create'), input: createTaskSchema }),
  z.object({ ...context, type: z.literal('tasks.update'), id, input: workspaceUpdateTaskSchema }),
  z.object({ ...context, type: z.literal('tasks.remove'), id }),
  z.object({ ...context, type: z.literal('history.list'), query: historyQuerySchema.optional() }),
  z.object({ ...context, type: z.literal('preferences.get') }),
  z.object({ ...context, type: z.literal('preferences.update'), input: updatePreferencesSchema }),
]);
export type PlannerCommand = z.infer<typeof plannerCommandSchema>;
export const PLANNER_ERROR_CODES = ['INVALID_INPUT', 'WORKSPACE_NOT_FOUND', 'TASK_NOT_FOUND', 'VERSION_CONFLICT', 'UNAUTHORIZED', 'UNAVAILABLE', 'INTERNAL_ERROR'] as const;
export type PlannerErrorCode = typeof PLANNER_ERROR_CODES[number];
export interface PlannerError { code: PlannerErrorCode; message: string; status: 400 | 401 | 404 | 409 | 500 | 503; task?: Task }
export type PlannerReply<T = unknown> = { ok: true; value: T } | { ok: false; error: PlannerError };
const replyEnvelopeSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ ok: z.literal(false), error: z.object({
    code: z.enum(PLANNER_ERROR_CODES), status: z.union([z.literal(400),z.literal(401),z.literal(404),z.literal(409),z.literal(500),z.literal(503)]),
    message: z.string(), task: z.unknown().optional(),
  }) }),
]);
export type PlannerTransport = (command: PlannerCommand) => Promise<PlannerReply>;

export class PlannerClientError extends Error {
  readonly code: PlannerErrorCode;
  readonly status: number;
  constructor(error: PlannerError) {
    super(error.message); this.name = 'PlannerClientError';
    this.code = error.code; this.status = error.status;
  }
}
export class PlannerConflictError extends PlannerClientError {
  readonly task: Task;
  constructor(error: PlannerError & { task: Task }) {
    super(error); this.name = 'PlannerConflictError'; this.task = error.task;
  }
}
type WithoutWorkspace<T> = T extends unknown ? Omit<T, 'workspaceId'> : never;
type ClientCommand = WithoutWorkspace<PlannerCommand>;

export function createPlannerClient(transport: PlannerTransport, workspaceId: string) {
  async function send<T>(command: ClientCommand): Promise<T> {
    const reply = await transport({ ...command, workspaceId });
    if (!reply.ok) {
      if (reply.error.code === 'VERSION_CONFLICT' && reply.error.task) throw new PlannerConflictError({ ...reply.error, task: reply.error.task });
      throw new PlannerClientError(reply.error);
    }
    return reply.value as T;
  }
  return {
    get workspaceId() { return workspaceId; },
    list: (query?: TaskListQuery) => send<Task[] | PaginatedTasks>({ type: 'tasks.list', query }),
    history: (query?: { from?: string; page?: number; pageSize?: number }) => send<Task[] | PaginatedTasks>({ type: 'history.list', query }),
    create: (input: CreateTaskInput) => send<Task>({ type: 'tasks.create', input }),
    update: (id: string, input: WorkspaceTaskUpdate) => send<Task>({ type: 'tasks.update', id, input }),
    remove: async (id: string) => { await send<null>({ type: 'tasks.remove', id }); },
    preferences: {
      get: () => send<UserPreferences>({ type: 'preferences.get' }),
      update: (input: Partial<UserPreferences>) => send<UserPreferences>({ type: 'preferences.update', input }),
    },
  };
}
export type PlannerClient = ReturnType<typeof createPlannerClient>;

export function createPlannerHttpTransport(baseUrl = '', fetcher: typeof fetch = fetch): PlannerTransport {
  return async command => {
    const base = `${baseUrl}/api/v1/workspaces/${encodeURIComponent(command.workspaceId)}`;
    let path: string, method = 'GET', input: unknown;
    const query = new URLSearchParams();
    if ('query' in command && command.query) {
      for (const [key, value] of Object.entries(command.query)) if (value !== undefined) query.set(key, String(value));
    }
    switch (command.type) {
      case 'tasks.list': path = '/tasks'; break;
      case 'tasks.create': path = '/tasks'; method = 'POST'; input = command.input; break;
      case 'tasks.update': path = `/tasks/${encodeURIComponent(command.id)}`; method = 'PATCH'; input = command.input; break;
      case 'tasks.remove': path = `/tasks/${encodeURIComponent(command.id)}`; method = 'DELETE'; break;
      case 'history.list': path = '/history'; break;
      case 'preferences.get': path = '/preferences'; break;
      case 'preferences.update': path = '/preferences'; method = 'PATCH'; input = command.input; break;
    }
    try {
      const response = await fetcher(`${base}${path}${query.size ? `?${query}` : ''}`, {
        method, ...(input === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
      });
      const raw: unknown = await response.json();
      const decoded = replyEnvelopeSchema.safeParse(raw);
      if (!decoded.success || response.ok !== decoded.data.ok || (decoded.data.ok && !Object.hasOwn(raw as object, 'value')) || (!decoded.data.ok && response.status !== decoded.data.error.status)) {
        throw new Error('Invalid Planner response');
      }
      return decoded.data as PlannerReply;
    } catch { return { ok: false, error: { code: 'UNAVAILABLE', status: 503, message: 'Planner is niet bereikbaar. Probeer opnieuw.' } }; }
  };
}
