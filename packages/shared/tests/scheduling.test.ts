import { describe, expect, it } from 'vitest';
import { addRecurrence, isTaskOverdue, todayInTimezone } from '../src/scheduling.js';

describe('Planner calendar recurrence', () => {
  it.each([
    ['2026-03-28', 'daily', '2026-03-29'],
    ['2026-10-24', 'weekly', '2026-10-31'],
    ['2026-01-31', 'monthly', '2026-02-28'],
    ['2028-01-31', 'monthly', '2028-02-29'],
    ['2026-12-31', 'monthly', '2027-01-31'],
  ] as const)('advances %s by one %s occurrence', (dueDate, frequency, nextDate) => {
    expect(addRecurrence(dueDate, { frequency })).toBe(nextDate);
  });
});

describe('Planner task timezone', () => {
  it('uses the configured local date across UTC midnight', () => {
    const midnight = new Date('2026-03-28T23:00:00.000Z');
    expect(todayInTimezone('Europe/Amsterdam', midnight)).toBe('2026-03-29');
    expect(todayInTimezone('UTC', midnight)).toBe('2026-03-28');
  });

  it('uses the task timezone for the deadline after the spring DST change', () => {
    const task = { lane: 'todo', dueDate: '2026-03-29', dueTime: '03:00', timezone: 'Europe/Amsterdam' };
    expect(isTaskOverdue(task, 'UTC', new Date('2026-03-29T00:59:00.000Z'))).toBe(false);
    expect(isTaskOverdue(task, 'UTC', new Date('2026-03-29T01:01:00.000Z'))).toBe(true);
  });
});
