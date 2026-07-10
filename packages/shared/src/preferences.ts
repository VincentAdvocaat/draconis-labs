import type { Lane, Priority } from './index.js';

export const LOCALES = ['nl', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const PLANNER_VIEWS = ['board', 'scheduled', 'history'] as const;
export type PlannerView = (typeof PLANNER_VIEWS)[number];

export interface TaskFilter {
  lane?: Lane;
  plannedDate?: string;
  dueDate?: string;
  priority?: Priority;
  label?: string;
  createdBy?: string;
  q?: string;
  overdue?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  filter: TaskFilter;
}

export interface UserPreferences {
  locale: Locale;
  timezone: string;
  weekStart: 0 | 1;
  defaultView: PlannerView;
  savedViews: SavedView[];
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  locale: 'nl',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam',
  weekStart: 1,
  defaultView: 'board',
  savedViews: [],
};
