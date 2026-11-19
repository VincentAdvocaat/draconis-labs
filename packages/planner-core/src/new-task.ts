import type { CreateTaskInput, Task } from '@draconis/shared';

/** Pure creation rule shared by the existing HTTP service and desktop experiment.
 * Storage, actor identity, clock and IDs remain the caller's responsibility.
 */
export function newTask(input: CreateTaskInput, context: {
  id: string; now: string; actorName: string; maxTodoPosition: number;
}): Task {
  return {
    id: context.id, title: input.title, description: input.description ?? null,
    lane: 'todo', plannedDate: input.plannedDate ?? input.dueDate ?? null,
    dueDate: input.dueDate ?? input.plannedDate ?? null, dueTime: input.dueTime ?? null,
    timezone: input.timezone ?? null, recurrence: input.recurrence ?? null,
    recurrenceParentId: null, position: context.maxTodoPosition + 1000, version: 1,
    createdBy: context.actorName, priority: input.priority ?? 'normal', labels: input.labels ?? [],
    createdAt: context.now, updatedAt: context.now, completedAt: null,
  };
}

