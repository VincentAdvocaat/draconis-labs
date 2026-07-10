import type { ParsedTaskListQuery } from '@draconis/shared';

export type PlannerListQuery = Omit<ParsedTaskListQuery, 'future' | 'overdue'> & {
  future?: boolean;
  overdue?: boolean;
};

export function parseTaskListQuery(query: ParsedTaskListQuery): PlannerListQuery {
  const { future, overdue, ...rest } = query;
  return {
    ...rest,
    future: future === 'true' ? true : undefined,
    overdue: overdue === 'true' ? true : undefined,
  };
}
