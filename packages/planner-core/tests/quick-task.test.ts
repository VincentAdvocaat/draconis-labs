import { describe, expect, it } from 'vitest';
import { parseQuickTask } from '../src/index.js';

describe('Planner quick entry', () => {
  it.each([
    ['Inspectie vandaag', 'nl', '2026-11-19', 1, 'Inspectie', '2026-11-19'],
    ['Inspectie morgen', 'nl', '2026-12-31', 1, 'Inspectie', '2027-01-01'],
    ['Inspection next month', 'en', '2026-12-31', 1, 'Inspection', '2027-01-01'],
    ['Inspectie volgende maand', 'nl', '2026-11-30', 1, 'Inspectie', '2026-12-01'],
    ['Inspectie volgende week', 'nl', '2026-11-23', 1, 'Inspectie', '2026-11-30'],
    ['Inspection next week', 'en', '2026-11-19', 0, 'Inspection', '2026-11-22'],
    ['Inspection tomorrow', 'en', '2028-02-28', 1, 'Inspection', '2028-02-29'],
    ['  Zonder datum  ', 'nl', '2026-11-19', 1, 'Zonder datum', undefined],
  ] as const)('%s', (input, locale, today, weekStart, title, plannedDate) => {
    expect(parseQuickTask(input, locale, today, weekStart)).toEqual({ title, plannedDate });
  });
});
