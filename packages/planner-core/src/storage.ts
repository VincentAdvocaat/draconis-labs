import type { CreateTaskInput, Lane, PaginatedTasks, Task, TaskListQuery, UserPreferences } from '@draconis/shared';

export interface HistoryQuery { from?: string; page?: number; pageSize?: number }

export interface TaskCreationReceiptKey {
  workspaceId: string;
  actor: string;
  key: string;
}

export interface TaskCursorQuery {
  filters: Omit<TaskListQuery, 'page' | 'pageSize'>;
  after?: Pick<Task, 'lane' | 'position' | 'id'>;
  limit: number;
  now: Date;
}

export interface PlannerStorage {
  /** Synchronous write transaction; reads and writes use the same connection. */
  transaction<T>(operation: () => T): T;
  list(query: TaskListQuery): Task[] | PaginatedTasks;
  listByCursor(query: TaskCursorQuery): Task[];
  history(query: HistoryQuery): Task[] | PaginatedTasks;
  find(id: string): Task | undefined;
  lane(lane: Lane): Task[];
  maxTodoPosition(): number;
  insert(task: Task): void;
  findTaskCreation(key: TaskCreationReceiptKey, input: CreateTaskInput): { matches: boolean; task: Task } | undefined;
  saveTaskCreation(key: TaskCreationReceiptKey, input: CreateTaskInput, task: Task): void;
  update(id: string, changes: Partial<Task>): void;
  remove(id: string): boolean;
  loadPreferences(): UserPreferences;
  savePreferences(value: UserPreferences, now: string): UserPreferences;
}

export interface PlannerEnvironment {
  now(): string;
  id(): string;
}

type AsyncOperations<Keys extends Exclude<keyof PlannerStorage, 'transaction'>> = {
  [Key in Keys]: (...args: Parameters<PlannerStorage[Key]>) => Promise<ReturnType<PlannerStorage[Key]>>;
};

type PlannerReadOperation = 'list' | 'listByCursor' | 'history' | 'loadPreferences';
export type AsyncPlannerTransaction = AsyncOperations<Exclude<keyof PlannerStorage, 'transaction' | 'list' | 'listByCursor' | 'history'>>;

export interface AsyncPlannerStorage extends AsyncOperations<PlannerReadOperation> {
  /** Hold the workspace write lock and a single connection until the operation resolves. */
  transaction<T>(operation: (transaction: AsyncPlannerTransaction) => Promise<T>): Promise<T>;
}
