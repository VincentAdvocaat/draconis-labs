import { randomUUID } from 'node:crypto';
import type { CreateTaskInput, Lane, Task, UpdateTaskInput } from '@draconis/shared';
import type { PlannerListQuery } from './query.js';
import type { Actor } from '../../core/auth.js';
import { rebalanceLaneIfNeeded } from './ordering.js';
import { plannerRepository, serializeRecurrence, type TaskRow } from './repository.js';
import { spawnNextRecurrence, toTask } from './task-mapper.js';

export class TaskConflictError extends Error {
  readonly task: Task;

  constructor(task: Task) {
    super('Deze taak is elders gewijzigd. Vernieuw en probeer opnieuw.');
    this.task = task;
    Object.assign(this, { statusCode: 409 });
  }
}

export const plannerService = {
  list(query: PlannerListQuery) {
    return plannerRepository.list(query);
  },

  history(query: { from?: string; page?: number; pageSize?: number }) {
    return plannerRepository.history(query);
  },

  create(input: CreateTaskInput, actor: Actor): Task {
    const now = new Date().toISOString();
    const row: TaskRow = {
      id: randomUUID(),
      title: input.title,
      description: input.description ?? null,
      lane: 'todo',
      plannedDate: input.plannedDate ?? input.dueDate ?? null,
      dueDate: input.dueDate ?? input.plannedDate ?? null,
      dueTime: input.dueTime ?? null,
      timezone: input.timezone ?? null,
      recurrence: serializeRecurrence(input.recurrence) ?? null,
      recurrenceParentId: null,
      position: plannerRepository.maxTodoPosition() + 1000,
      version: 1,
      createdBy: actor.name,
      priority: input.priority ?? 'normal',
      labels: JSON.stringify(input.labels ?? []),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    plannerRepository.insert(row);
    return toTask(row);
  },

  update(id: string, input: UpdateTaskInput): Task {
    const existing = plannerRepository.findById(id);
    if (!existing) {
      const error = new Error('Taak niet gevonden');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }

    if (input.version !== undefined && input.version !== existing.version) {
      throw new TaskConflictError(toTask(existing));
    }

    const now = new Date().toISOString();
    const movingToDone = input.lane === 'done' && existing.lane !== 'done';
    const completedAt =
      movingToDone
        ? now
        : input.lane && input.lane !== 'done'
          ? null
          : existing.completedAt;

    const { version: _version, recurrence, ...changes } = input;
    plannerRepository.update(id, {
      ...changes,
      labels: input.labels ? JSON.stringify(input.labels) : undefined,
      recurrence: serializeRecurrence(recurrence),
      updatedAt: now,
      completedAt,
      version: existing.version + 1,
    });

    const targetLane = (input.lane ?? existing.lane) as Lane;
    if (input.position !== undefined || input.lane !== undefined) {
      rebalanceLaneIfNeeded(targetLane, now);
    }

    if (movingToDone) {
      const completed = plannerRepository.findById(id)!;
      spawnNextRecurrence(completed, now);
    }

    return toTask(plannerRepository.findById(id)!);
  },

  remove(id: string) {
    const result = plannerRepository.delete(id);
    if (!result.changes) {
      const error = new Error('Taak niet gevonden');
      Object.assign(error, { statusCode: 404 });
      throw error;
    }
  },
};
