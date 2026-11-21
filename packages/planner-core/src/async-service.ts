import type { CreateTaskInput, UpdateTaskInput, UserPreferences } from '@draconis/shared';
import { newTask } from './new-task.js';
import type { AsyncPlannerTransaction, AsyncPlannerStorage, PlannerEnvironment, TaskCreationReceiptKey } from './storage.js';
import { lanePositionChanges, nextRecurringTask, taskUpdate, TaskCreationConflictError } from './task-mutation.js';

export function createAsyncPlannerService(storage: AsyncPlannerStorage, environment: PlannerEnvironment) {
  async function find(transaction: AsyncPlannerTransaction, id: string) {
    const task = await transaction.find(id);
    if (!task) throw Object.assign(new Error('Taak niet gevonden'), { statusCode: 404 });
    return task;
  }
  return {
    list: storage.list,
    listByCursor: storage.listByCursor,
    history: storage.history,
    create(input: CreateTaskInput, actor: { name: string }, receiptKey?: TaskCreationReceiptKey) {
      return storage.transaction(async transaction => {
        if (receiptKey) {
          const receipt = await transaction.findTaskCreation(receiptKey, input);
          if (receipt) {
            if (!receipt.matches) throw new TaskCreationConflictError();
            return receipt.task;
          }
        }
        const task = newTask(input, {
          id: environment.id(), now: environment.now(), actorName: actor.name,
          maxTodoPosition: await transaction.maxTodoPosition(),
        });
        await transaction.insert(task);
        if (receiptKey) await transaction.saveTaskCreation(receiptKey, input, task);
        return task;
      });
    },
    update(id: string, input: UpdateTaskInput) {
      return storage.transaction(async transaction => {
        const existing = await find(transaction, id);
        const { changes, movingToDone, reorderLane } = taskUpdate(existing, input, () => environment.now());
        await transaction.update(id, changes);
        if (reorderLane) {
          const ordered = await transaction.lane(reorderLane);
          for (const { id: changedId, ...change } of lanePositionChanges(ordered, changes.updatedAt, id)) {
            await transaction.update(changedId, change);
          }
        }
        if (movingToDone) {
          const completed = await find(transaction, id);
          const successor = nextRecurringTask(completed, () => environment.id(), changes.updatedAt, await transaction.maxTodoPosition());
          if (successor) await transaction.insert(successor);
        }
        return find(transaction, id);
      });
    },
    remove(id: string) {
      return storage.transaction(async transaction => {
        if (!await transaction.remove(id)) throw Object.assign(new Error('Taak niet gevonden'), { statusCode: 404 });
      });
    },
    getPreferences: storage.loadPreferences,
    updatePreferences(patch: Partial<UserPreferences>) {
      return storage.transaction(async transaction =>
        transaction.savePreferences({ ...await transaction.loadPreferences(), ...patch }, environment.now()));
    },
  };
}
