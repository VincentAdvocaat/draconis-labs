export const LOCALES = ['nl', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const PLANNER_VIEWS = ['board', 'scheduled', 'history'] as const;
export type PlannerView = (typeof PLANNER_VIEWS)[number];

export type { SavedView, TaskFilter, UserPreferences } from './schemas/preferences.js';

export const DEFAULT_PREFERENCES: import('./schemas/preferences.js').UserPreferences = {
  locale: 'nl',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam',
  weekStart: 1,
  defaultView: 'board',
  savedViews: [],
};
