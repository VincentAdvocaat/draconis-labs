import type { CreateTaskInput, Task, TaskListQuery, UpdateTaskInput, UserPreferences } from '@draconis/shared';
import { addRecurrence } from '@draconis/shared';
import { newTask } from './new-task.js';
import type { HistoryQuery, PlannerEnvironment, PlannerStorage } from './storage.js';

export class TaskConflictError extends Error {
  readonly task: Task;

  constructor(task: Task) {
    super('Deze taak is elders gewijzigd. Vernieuw en probeer opnieuw.');
    this.task = task;
    Object.assign(this, { statusCode: 409 });
  }
}

export function createPlannerService(storage: PlannerStorage, environment: PlannerEnvironment) {
  function find(id: string) {
    const task = storage.find(id);
    if (!task) throw Object.assign(new Error('Taak niet gevonden'), { statusCode: 404 });
    return task;
  }
  function rebalance(lane: Task['lane'], now: string, updatedId: string) {
    const tasks = storage.lane(lane);
    if (tasks.some((task, index) => index > 0 && task.position - tasks[index - 1].position < 1)) {
      tasks.forEach((task, index) => {
        const position = (index + 1) * 1000;
        if (task.position === position) return;
        storage.update(task.id, {
          position, updatedAt: now,
          ...(task.id === updatedId ? {} : { version: task.version + 1 }),
        });
      });
    }
  }
  return {
    list: (query: TaskListQuery) => storage.list(query),
    history: (query: HistoryQuery) => storage.history(query),
    create(input: CreateTaskInput, actor: { name: string }): Task {
      return storage.transaction(() => {
        const task = newTask(input, {
          id: environment.id(), now: environment.now(), actorName: actor.name,
          maxTodoPosition: storage.maxTodoPosition(),
        });
        storage.insert(task);
        return task;
      });
    },
    update(id: string, input: UpdateTaskInput): Task {
      return storage.transaction(() => {
        const existing = find(id);
        if (input.version !== undefined && input.version !== existing.version) throw new TaskConflictError(existing);
        const now = environment.now();
        const movingToDone = input.lane === 'done' && existing.lane !== 'done';
        const completedAt = movingToDone ? now
          : input.lane && input.lane !== 'done' ? null : existing.completedAt;
        const { version: _version, ...changes } = input;
        storage.update(id, { ...changes, updatedAt: now, completedAt, version: existing.version + 1 });
        if (input.position !== undefined || input.lane !== undefined) rebalance(input.lane ?? existing.lane, now, id);
        if (movingToDone) {
          const completed = find(id);
          const dueDate = completed.dueDate ?? completed.plannedDate;
          if (completed.recurrence && dueDate) {
            const nextDueDate = addRecurrence(dueDate, completed.recurrence);
            storage.insert({
              ...completed, id: environment.id(), lane: 'todo', plannedDate: nextDueDate, dueDate: nextDueDate,
              recurrenceParentId: completed.recurrenceParentId ?? completed.id,
              position: storage.maxTodoPosition() + 1000, version: 1,
              createdAt: now, updatedAt: now, completedAt: null,
            });
          }
        }
        return find(id);
      });
    },
    remove(id: string) {
      return storage.transaction(() => {
        if (!storage.remove(id)) throw Object.assign(new Error('Taak niet gevonden'), { statusCode: 404 });
      });
    },
    getPreferences: () => storage.loadPreferences(),
    updatePreferences(patch: Partial<UserPreferences>) {
      return storage.transaction(() => storage.savePreferences({ ...storage.loadPreferences(), ...patch }, environment.now()));
    },
  };
}

export type PlannerService = ReturnType<typeof createPlannerService>;
