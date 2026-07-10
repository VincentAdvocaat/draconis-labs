import { DEFAULT_PREFERENCES, type UserPreferences } from '@draconis/shared';
import { eq } from 'drizzle-orm';
import { db } from '../../core/db.js';
import { userPreferences } from './schema.js';

const PREFERENCES_ID = 'default';

export const preferencesRepository = {
  load(): UserPreferences {
    const row = db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.id, PREFERENCES_ID))
      .get();
    if (!row) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences) as UserPreferences };
  },

  save(preferences: UserPreferences): UserPreferences {
    const now = new Date().toISOString();
    const payload = JSON.stringify(preferences);
    const existing = db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.id, PREFERENCES_ID))
      .get();
    if (existing) {
      db.update(userPreferences)
        .set({ preferences: payload, updatedAt: now })
        .where(eq(userPreferences.id, PREFERENCES_ID))
        .run();
    } else {
      db.insert(userPreferences)
        .values({ id: PREFERENCES_ID, preferences: payload, updatedAt: now })
        .run();
    }
    return preferences;
  },
};

export const preferencesService = {
  get() {
    return preferencesRepository.load();
  },

  update(patch: Partial<UserPreferences>) {
    const current = preferencesRepository.load();
    return preferencesRepository.save({ ...current, ...patch });
  },
};
