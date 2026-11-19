import { randomUUID } from 'node:crypto';
import { createPlannerService } from '@draconis/planner-core';
import { createSqlitePlannerStorage } from '@draconis/planner-sqlite';
import { sqlite } from '../../core/db.js';

export { TaskConflictError } from '@draconis/planner-core';
export const plannerService = createPlannerService(createSqlitePlannerStorage(sqlite), {
  id: randomUUID, now: () => new Date().toISOString(),
});
