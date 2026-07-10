export const LANES = ['todo', 'doing', 'done'] as const;
export type Lane = (typeof LANES)[number];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export type { RecurrenceFrequency, RecurrenceRule } from './scheduling.js';
export {
  RECURRENCE_FREQUENCIES,
  addRecurrence,
  isIsoDate,
  isIsoTime,
  isTaskOverdue,
  nowTimeInTimezone,
  todayInTimezone,
} from './scheduling.js';

export type {
  Locale,
  PlannerView,
  SavedView,
  TaskFilter,
  UserPreferences,
} from './preferences.js';
export {
  DEFAULT_PREFERENCES,
  LOCALES,
  PLANNER_VIEWS,
} from './preferences.js';

import type { RecurrenceRule } from './scheduling.js';
import type { TaskFilter } from './preferences.js';

export interface Task {
  id: string;
  title: string;
  description: string | null;
  lane: Lane;
  plannedDate: string | null;
  dueDate: string | null;
  dueTime: string | null;
  timezone: string | null;
  recurrence: RecurrenceRule | null;
  recurrenceParentId: string | null;
  position: number;
  version: number;
  createdBy: string;
  priority: Priority;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  plannedDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  timezone?: string | null;
  recurrence?: RecurrenceRule | null;
  priority?: Priority;
  labels?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  lane?: Lane;
  plannedDate?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  timezone?: string | null;
  recurrence?: RecurrenceRule | null;
  position?: number;
  priority?: Priority;
  labels?: string[];
  version?: number;
}

export interface TaskListQuery extends TaskFilter {
  date?: string;
  future?: boolean;
  timezone?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedTasks {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}
