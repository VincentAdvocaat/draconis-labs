import type {
  CreateTaskInput,
  PaginatedTasks,
  Task,
  TaskListQuery,
  UpdateTaskInput,
  UserPreferences,
} from '@draconis/shared';
import { PLANNER_API_BASE } from '@draconis/shared';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiConflictError extends Error {
  readonly task: Task;

  constructor(message: string, task: Task) {
    super(message);
    this.name = 'ApiConflictError';
    this.task = task;
  }
}

function buildQuery(query: TaskListQuery = {}) {
  const params = new URLSearchParams();
  if (query.date) params.set('date', query.date);
  if (query.lane) params.set('lane', query.lane);
  if (query.future) params.set('future', 'true');
  if (query.plannedDate) params.set('plannedDate', query.plannedDate);
  if (query.dueDate) params.set('dueDate', query.dueDate);
  if (query.priority) params.set('priority', query.priority);
  if (query.label) params.set('label', query.label);
  if (query.createdBy) params.set('createdBy', query.createdBy);
  if (query.q) params.set('q', query.q);
  if (query.overdue) params.set('overdue', 'true');
  if (query.timezone) params.set('timezone', query.timezone);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  const suffix = params.size ? `?${params}` : '';
  return suffix;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string; task?: Task }
      | null;
    if (response.status === 409 && body?.task) {
      throw new ApiConflictError(
        body.message ?? 'Deze taak is elders gewijzigd.',
        body.task,
      );
    }
    throw new Error(body?.message ?? `API-fout (${response.status})`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const plannerApi = {
  list: (query?: TaskListQuery) =>
    request<Task[] | PaginatedTasks>(`${PLANNER_API_BASE}/tasks${buildQuery(query)}`),
  history: (query?: TaskListQuery) =>
    request<Task[] | PaginatedTasks>(`${PLANNER_API_BASE}/history${buildQuery(query)}`),
  create: (input: CreateTaskInput) =>
    request<Task>(`${PLANNER_API_BASE}/tasks`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: UpdateTaskInput) =>
    request<Task>(`${PLANNER_API_BASE}/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    request<void>(`${PLANNER_API_BASE}/tasks/${id}`, { method: 'DELETE' }),
  preferences: {
    get: () => request<UserPreferences>(`${PLANNER_API_BASE}/preferences`),
    update: (input: Partial<UserPreferences>) =>
      request<UserPreferences>(`${PLANNER_API_BASE}/preferences`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
  },
};

export function isPaginatedTasks(value: Task[] | PaginatedTasks): value is PaginatedTasks {
  return !Array.isArray(value) && 'items' in value;
}
