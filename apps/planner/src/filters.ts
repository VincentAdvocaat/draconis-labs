import type { PlannerView, TaskFilter } from '@draconis/shared';
import { LANES, PLANNER_VIEWS, PRIORITIES } from '@draconis/shared';

export function parseFiltersFromUrl(search: string): TaskFilter & { view?: PlannerView } {
  const params = new URLSearchParams(search);
  const filter: TaskFilter & { view?: PlannerView } = {};
  const view = params.get('view');
  if (view && (PLANNER_VIEWS as readonly string[]).includes(view)) {
    filter.view = view as PlannerView;
  }
  const lane = params.get('lane');
  if (lane && (LANES as readonly string[]).includes(lane)) {
    filter.lane = lane as TaskFilter['lane'];
  }
  const priority = params.get('priority');
  if (priority && (PRIORITIES as readonly string[]).includes(priority)) {
    filter.priority = priority as TaskFilter['priority'];
  }
  const plannedDate = params.get('plannedDate');
  if (plannedDate) filter.plannedDate = plannedDate;
  const dueDate = params.get('dueDate');
  if (dueDate) filter.dueDate = dueDate;
  const label = params.get('label');
  if (label) filter.label = label;
  const createdBy = params.get('createdBy');
  if (createdBy) filter.createdBy = createdBy;
  const q = params.get('q');
  if (q) filter.q = q;
  if (params.get('overdue') === 'true') filter.overdue = true;
  return filter;
}

export function filtersToSearchParams(
  filter: TaskFilter,
  view?: PlannerView,
  page?: number,
) {
  const params = new URLSearchParams();
  if (view) params.set('view', view);
  if (filter.lane) params.set('lane', filter.lane);
  if (filter.priority) params.set('priority', filter.priority);
  if (filter.plannedDate) params.set('plannedDate', filter.plannedDate);
  if (filter.dueDate) params.set('dueDate', filter.dueDate);
  if (filter.label) params.set('label', filter.label);
  if (filter.createdBy) params.set('createdBy', filter.createdBy);
  if (filter.q) params.set('q', filter.q);
  if (filter.overdue) params.set('overdue', 'true');
  if (page && page > 1) params.set('page', String(page));
  return params;
}

export function syncUrl(filter: TaskFilter, view: PlannerView, page?: number) {
  const params = filtersToSearchParams(filter, view, page);
  const next = `${window.location.pathname}${params.size ? `?${params}` : ''}`;
  window.history.replaceState(null, '', next);
}
