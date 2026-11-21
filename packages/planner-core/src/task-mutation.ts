import { addRecurrence } from '@draconis/shared';
import type { Task, UpdateTaskInput } from '@draconis/shared';

export class TaskConflictError extends Error {
  readonly task: Task;

  constructor(task: Task) {
    super('Deze taak is elders gewijzigd. Vernieuw en probeer opnieuw.');
    this.task = task;
    Object.assign(this, { statusCode: 409 });
  }
}

export class TaskCreationConflictError extends Error {
  constructor() {
    super('Deze opdrachtsleutel is al voor andere invoer gebruikt.');
  }
}

export function taskUpdate(existing: Task, input: UpdateTaskInput, currentTime: () => string) {
  const { version, ...changes } = input;
  if (version !== undefined && version !== existing.version) throw new TaskConflictError(existing);
  const now = currentTime();
  const movingToDone = input.lane === 'done' && existing.lane !== 'done';
  const completedAt = movingToDone ? now
    : input.lane && input.lane !== 'done' ? null : existing.completedAt;
  return {
    changes: { ...changes, updatedAt: now, completedAt, version: existing.version + 1 },
    movingToDone,
    reorderLane: input.position !== undefined || input.lane !== undefined ? input.lane ?? existing.lane : undefined,
  };
}

export function lanePositionChanges(tasks: Task[], now: string, updatedId: string) {
  if (!tasks.some((task, index) => index > 0 && task.position - tasks[index - 1].position < 1)) return [];
  return tasks.flatMap((task, index) => {
    const position = (index + 1) * 1000;
    return position === task.position ? [] : [{
      id: task.id,
      position,
      updatedAt: now,
      version: task.id === updatedId ? task.version : task.version + 1,
    }];
  });
}

export function nextRecurringTask(completed: Task, id: () => string, now: string, maxTodoPosition: number): Task | undefined {
  const dueDate = completed.dueDate ?? completed.plannedDate;
  if (!completed.recurrence || !dueDate) return;
  const nextDueDate = addRecurrence(dueDate, completed.recurrence);
  return {
    ...completed, id: id(), lane: 'todo', plannedDate: nextDueDate, dueDate: nextDueDate,
    recurrenceParentId: completed.recurrenceParentId ?? completed.id,
    position: maxTodoPosition + 1000, version: 1, createdAt: now, updatedAt: now, completedAt: null,
  };
}
