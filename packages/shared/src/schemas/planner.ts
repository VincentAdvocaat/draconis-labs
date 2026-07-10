import { z } from 'zod';
import {
  ISO_DATE_PATTERN,
  ISO_TIME_PATTERN,
  laneSchema,
  prioritySchema,
  recurrenceSchema,
} from './common.js';

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(10_000).optional(),
  plannedDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
  dueDate: z.string().regex(ISO_DATE_PATTERN).nullable().optional(),
  dueTime: z.string().regex(ISO_TIME_PATTERN).nullable().optional(),
  timezone: z.string().min(1).max(80).nullable().optional(),
  recurrence: recurrenceSchema.optional(),
  priority: prioritySchema.optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
});

export const updateTaskSchema = createTaskSchema
  .partial()
  .extend({
    description: z.string().max(10_000).nullable().optional(),
    lane: laneSchema.optional(),
    position: z.number().finite().optional(),
    version: z.number().int().positive().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Geen wijzigingen opgegeven');

export const taskListQuerySchema = z.object({
  date: z.string().optional(),
  lane: laneSchema.optional(),
  future: z.enum(['true', 'false']).optional(),
  plannedDate: z.string().regex(ISO_DATE_PATTERN).optional(),
  dueDate: z.string().regex(ISO_DATE_PATTERN).optional(),
  priority: prioritySchema.optional(),
  label: z.string().trim().min(1).max(40).optional(),
  createdBy: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  timezone: z.string().min(1).max(80).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export const historyQuerySchema = z.object({
  from: z.string().regex(ISO_DATE_PATTERN).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ParsedTaskListQuery = z.infer<typeof taskListQuerySchema>;
