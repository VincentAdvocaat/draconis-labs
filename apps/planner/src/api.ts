import type { PaginatedTasks, Task } from '@draconis/shared';
import { createPlannerClient, createPlannerHttpTransport, LOCAL_WORKSPACE_ID } from '@draconis/shared';

export { PlannerConflictError as ApiConflictError } from '@draconis/shared';
export const plannerApi = createPlannerClient(
  createPlannerHttpTransport(import.meta.env.VITE_API_URL ?? ''), LOCAL_WORKSPACE_ID,
);
export function isPaginatedTasks(value: Task[] | PaginatedTasks): value is PaginatedTasks {
  return !Array.isArray(value) && 'items' in value;
}
