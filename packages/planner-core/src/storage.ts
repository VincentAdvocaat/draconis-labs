import type { CreateTaskInput, Lane, PaginatedTasks, Task, TaskListQuery, UserPreferences } from '@draconis/shared';

export interface HistoryQuery { from?: string; page?: number; pageSize?: number }

export interface TaskCreationReceiptKey {
  workspaceId: string;
  actor: string;
  key: string;
}

export interface PlannerStorage {
  /** Synchronous write transaction; reads and writes use the same connection. */
  transaction<T>(operation: () => T): T;
  list(query: TaskListQuery): Task[] | PaginatedTasks;
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
