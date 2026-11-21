import type { CreateTaskInput, Task, TaskListQuery, UpdateTaskInput, UserPreferences } from '@draconis/shared';
import { newTask } from './new-task.js';
import type { HistoryQuery, PlannerEnvironment, PlannerStorage, TaskCreationReceiptKey, TaskCursorQuery } from './storage.js';
import { lanePositionChanges, nextRecurringTask, taskUpdate, TaskCreationConflictError } from './task-mutation.js';

export { TaskConflictError, TaskCreationConflictError } from './task-mutation.js';

export function createPlannerService(storage: PlannerStorage, environment: PlannerEnvironment) {
  function find(id: string) {
    const task = storage.find(id);
    if (!task) throw Object.assign(new Error('Taak niet gevonden'), { statusCode: 404 });
    return task;
  }
  return {
    list: (query: TaskListQuery) => storage.list(query),
    listByCursor: (query: TaskCursorQuery) => storage.listByCursor(query),
    history: (query: HistoryQuery) => storage.history(query),
    create(input: CreateTaskInput, actor: { name: string }, receiptKey?: TaskCreationReceiptKey): Task {
      return storage.transaction(() => {
        if (receiptKey) {
          const receipt = storage.findTaskCreation(receiptKey, input);
          if (receipt) {
            if (!receipt.matches) throw new TaskCreationConflictError();
            return receipt.task;
          }
        }
        const task = newTask(input, {
          id: environment.id(), now: environment.now(), actorName: actor.name,
          maxTodoPosition: storage.maxTodoPosition(),
        });
        storage.insert(task);
        if (receiptKey) storage.saveTaskCreation(receiptKey, input, task);
        return task;
      });
    },
    update(id: string, input: UpdateTaskInput): Task {
      return storage.transaction(() => {
        const existing = find(id);
        const { changes, movingToDone, reorderLane } = taskUpdate(existing, input, () => environment.now());
        storage.update(id, changes);
        if (reorderLane) {
          for (const { id: changedId, ...change } of lanePositionChanges(storage.lane(reorderLane), changes.updatedAt, id)) {
            storage.update(changedId, change);
          }
        }
        if (movingToDone) {
          const successor = nextRecurringTask(find(id), () => environment.id(), changes.updatedAt, storage.maxTodoPosition());
          if (successor) storage.insert(successor);
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
