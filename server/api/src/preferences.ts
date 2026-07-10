import { DEFAULT_PREFERENCES, type UserPreferences } from '@draconis/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db, userPreferences } from './db.js';

const PREFERENCES_ID = 'default';

const preferencesSchema = z.object({
  locale: z.enum(['nl', 'en']).optional(),
  timezone: z.string().min(1).max(80).optional(),
  weekStart: z.union([z.literal(0), z.literal(1)]).optional(),
  defaultView: z.enum(['board', 'scheduled', 'history']).optional(),
  savedViews: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    filter: z.object({
      lane: z.enum(['todo', 'doing', 'done']).optional(),
      plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      label: z.string().trim().min(1).max(40).optional(),
      createdBy: z.string().trim().min(1).max(80).optional(),
      q: z.string().trim().min(1).max(120).optional(),
      overdue: z.boolean().optional(),
    }),
  })).max(24).optional(),
});

function loadPreferences(): UserPreferences {
  const row = db.select().from(userPreferences).where(eq(userPreferences.id, PREFERENCES_ID)).get();
  if (!row) return DEFAULT_PREFERENCES;
  return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences) as UserPreferences };
}

function savePreferences(preferences: UserPreferences) {
  const now = new Date().toISOString();
  const payload = JSON.stringify(preferences);
  const existing = db.select().from(userPreferences).where(eq(userPreferences.id, PREFERENCES_ID)).get();
  if (existing) {
    db.update(userPreferences).set({ preferences: payload, updatedAt: now }).where(eq(userPreferences.id, PREFERENCES_ID)).run();
  } else {
    db.insert(userPreferences).values({ id: PREFERENCES_ID, preferences: payload, updatedAt: now }).run();
  }
  return preferences;
}

export async function registerPreferencesRoutes(app: FastifyInstance) {
  app.get('/api/planner/preferences', async () => loadPreferences());

  app.patch('/api/planner/preferences', async (request) => {
    const input = preferencesSchema.parse(request.body);
    const current = loadPreferences();
    return savePreferences({ ...current, ...input });
  });
}
