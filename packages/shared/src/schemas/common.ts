import { z } from 'zod';

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const ISO_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const laneSchema = z.enum(['todo', 'doing', 'done']);
export const prioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const recurrenceSchema = z
  .object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    interval: z.number().int().min(1).max(30).optional(),
  })
  .nullable();

export const isoDateString = z.string().regex(ISO_DATE_PATTERN);
export const isoTimeString = z.string().regex(ISO_TIME_PATTERN);

export const uuidParamSchema = z.object({ id: z.string().uuid() });
