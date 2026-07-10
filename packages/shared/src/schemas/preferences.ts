import { z } from 'zod';
import { ISO_DATE_PATTERN, laneSchema, prioritySchema } from './common.js';

export const taskFilterSchema = z.object({
  lane: laneSchema.optional(),
  plannedDate: z.string().regex(ISO_DATE_PATTERN).optional(),
  dueDate: z.string().regex(ISO_DATE_PATTERN).optional(),
  priority: prioritySchema.optional(),
  label: z.string().trim().min(1).max(40).optional(),
  createdBy: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  overdue: z.boolean().optional(),
});

export const savedViewSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  filter: taskFilterSchema,
});

export const updatePreferencesSchema = z.object({
  locale: z.enum(['nl', 'en']).optional(),
  timezone: z.string().min(1).max(80).optional(),
  weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
  defaultView: z.enum(['board', 'scheduled', 'history']).optional(),
  savedViews: z.array(savedViewSchema).max(24).optional(),
});

export const userPreferencesSchema = z.object({
  locale: z.enum(['nl', 'en']),
  timezone: z.string().min(1).max(80),
  weekStart: z.union([z.literal(0), z.literal(1)]),
  defaultView: z.enum(['board', 'scheduled', 'history']),
  savedViews: z.array(savedViewSchema),
});

export type TaskFilter = z.infer<typeof taskFilterSchema>;
export type SavedView = z.infer<typeof savedViewSchema>;
export type UserPreferences = z.infer<typeof userPreferencesSchema>;
