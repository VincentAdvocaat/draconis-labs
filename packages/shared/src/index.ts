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

export { API_V1_BASE, PLANNER_API_BASE } from './api.js';

export type {
  ApplicationManifest,
  CreateTaskInput,
  ParsedTaskListQuery,
  UpdateTaskInput,
} from './schemas/index.js';
export {
  applicationManifestSchema,
  createTaskSchema,
  historyQuerySchema,
  taskListQuerySchema,
  updatePreferencesSchema,
  updateTaskSchema,
  userPreferencesSchema,
  uuidParamSchema,
} from './schemas/index.js';
export { ISO_DATE_PATTERN, ISO_TIME_PATTERN } from './schemas/common.js';

import type { RecurrenceRule } from './scheduling.js';
import type { TaskFilter } from './preferences.js';

export interface TaskListQuery extends TaskFilter {
  date?: string;
  future?: boolean;
  timezone?: string;
  page?: number;
  pageSize?: number;
}

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

export interface PaginatedTasks {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export {
  CONTENT_LOCALES,
  CONTENT_PUBLICATION_RULES_V1,
  contentLocaleSchema,
  contentLocaleContextSchema,
  localizedTextValuesSchema,
  contentFieldRuleSchema,
  resolveContentField,
  validateContentField,
} from './schemas/content-locale.js';
export type {
  ContentLocale,
  ContentLocaleContext,
  LocalizedTextValues,
  ContentFieldRule,
  ResolvedContentField,
} from './schemas/content-locale.js';
export { LOCAL_WORKSPACE_ID, plannerCommandSchema, createPlannerClient, createPlannerHttpTransport, PlannerClientError, PlannerConflictError } from './planner-client.js';
export type { PlannerClient, PlannerCommand, PlannerError, PlannerErrorCode, PlannerReply, PlannerTransport } from './planner-client.js';

export { workspaceUpdateTaskSchema } from './planner-client.js';
export type { WorkspaceTaskUpdate } from './planner-client.js';
export * from './bookings.js';
export { createBookingHttpTransport } from './booking-http.js';
export { bookingResultSchemas } from './booking-responses.js';
export { PLANNER_ERROR_CODES } from './planner-client.js';
export * from './public-booking.js';
