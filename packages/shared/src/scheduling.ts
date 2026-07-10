export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isIsoDate(value: string) {
  return datePattern.test(value);
}

export function isIsoTime(value: string) {
  return timePattern.test(value);
}

export function isoDateFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

export function todayInTimezone(timezone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return isoDateFromParts(year, month, day);
}

export function nowTimeInTimezone(timezone: string, date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function addRecurrence(dueDate: string, rule: RecurrenceRule) {
  const { year, month, day } = parseIsoDate(dueDate);
  const date = new Date(year, month - 1, day);
  const interval = rule.interval ?? 1;
  switch (rule.frequency) {
    case 'daily':
      date.setDate(date.getDate() + interval);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7 * interval);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + interval);
      break;
  }
  return isoDateFromParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function isTaskOverdue(
  task: {
    lane: string;
    dueDate: string | null;
    dueTime: string | null;
    timezone: string | null;
  },
  timezone: string,
  now = new Date(),
) {
  if (task.lane === 'done' || !task.dueDate) return false;
  const zone = task.timezone ?? timezone;
  const today = todayInTimezone(zone, now);
  if (task.dueDate < today) return true;
  if (task.dueDate > today || !task.dueTime) return false;
  return task.dueTime < nowTimeInTimezone(zone, now);
}
