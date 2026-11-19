import type { Lane, PaginatedTasks, Task, TaskListQuery, UserPreferences } from '@draconis/shared';

export interface HistoryQuery { from?: string; page?: number; pageSize?: number }

export interface PlannerStorage {
  list(query: TaskListQuery): Task[] | PaginatedTasks;
  history(query: HistoryQuery): Task[] | PaginatedTasks;
  find(id: string): Task | undefined;
  lane(lane: Lane): Task[];
  maxTodoPosition(): number;
  insert(task: Task): void;
  update(id: string, changes: Partial<Task>): void;
  remove(id: string): boolean;
  loadPreferences(): UserPreferences;
  savePreferences(value: UserPreferences, now: string): UserPreferences;
}

export interface PlannerEnvironment {
  now(): string;
  id(): string;
}
