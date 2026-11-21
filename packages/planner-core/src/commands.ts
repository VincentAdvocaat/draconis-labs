import { plannerCommandSchema, type PlannerReply } from '@draconis/shared';
import type { AsyncPlannerService } from './async-service.js';
import { TaskConflictError, TaskCreationConflictError, type PlannerService } from './service.js';

export type PlannerCommandService = PlannerService | AsyncPlannerService;
type TaskCreation = { key: string; actorKind: 'user' | 'agent' };

function commandFailure(error: unknown): PlannerReply {
  if (error instanceof TaskCreationConflictError) return { ok: false, error: { code: 'IDEMPOTENCY_CONFLICT', status: 409, message: error.message } };
  if (error instanceof TaskConflictError) return { ok: false, error: { code: 'VERSION_CONFLICT', status: 409, message: error.message, task: error.task } };
  if (error instanceof Error && 'statusCode' in error && error.statusCode === 503) return { ok: false, error: { code: 'UNAVAILABLE', status: 503, message: error.message } };
  if (error instanceof Error && 'statusCode' in error && error.statusCode === 404) return { ok: false, error: { code: 'TASK_NOT_FOUND', status: 404, message: error.message } };
  return { ok: false, error: { code: 'INTERNAL_ERROR', status: 500, message: 'Planner kan de opdracht niet uitvoeren.' } };
}

export function executePlannerCommand(
  service: PlannerService, workspaceId: string, actor: { name: string }, input: unknown, taskCreation?: TaskCreation,
): PlannerReply;
export function executePlannerCommand(
  service: PlannerCommandService, workspaceId: string, actor: { name: string }, input: unknown, taskCreation?: TaskCreation,
): PlannerReply | Promise<PlannerReply>;
export function executePlannerCommand(
  service: PlannerCommandService, workspaceId: string, actor: { name: string }, input: unknown, taskCreation?: TaskCreation,
): PlannerReply | Promise<PlannerReply> {
  const parsed = plannerCommandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { code: 'INVALID_INPUT', status: 400, message: 'Ongeldige invoer' } };
  const command = parsed.data;
  if (command.workspaceId !== workspaceId) return { ok: false, error: { code: 'WORKSPACE_NOT_FOUND', status: 404, message: 'Werkruimte niet gevonden' } };
  const success = (value: unknown): PlannerReply => ({ ok: true, value: command.type === 'tasks.remove' ? null : value });
  try {
    let value: unknown;
    switch (command.type) {
      case 'tasks.list': value = service.list(command.query ?? {}); break;
      case 'tasks.create':
        value = service.create(command.input, actor, taskCreation && {
          workspaceId, actor: JSON.stringify([taskCreation.actorKind, actor.name]), key: taskCreation.key,
        });
        break;
      case 'tasks.update': value = service.update(command.id, command.input); break;
      case 'tasks.remove': value = service.remove(command.id); break;
      case 'history.list': value = service.history(command.query ?? {}); break;
      case 'preferences.get': value = service.getPreferences(); break;
      case 'preferences.update': value = service.updatePreferences(command.input); break;
    }
    return value instanceof Promise ? value.then(success, commandFailure) : success(value);
  } catch (error) {
    return commandFailure(error);
  }
}
