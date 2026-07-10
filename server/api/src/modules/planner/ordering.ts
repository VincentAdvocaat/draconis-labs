import type { Lane } from '@draconis/shared';
import { asc, eq } from 'drizzle-orm';
import { db } from '../../core/db.js';
import { tasks } from './schema.js';

const MIN_GAP = 1;
const POSITION_STEP = 1000;

export function rebalanceLaneIfNeeded(lane: Lane, now: string) {
  const laneTasks = db
    .select()
    .from(tasks)
    .where(eq(tasks.lane, lane))
    .orderBy(asc(tasks.position))
    .all();

  for (let index = 1; index < laneTasks.length; index += 1) {
    if (laneTasks[index]!.position - laneTasks[index - 1]!.position < MIN_GAP) {
      laneTasks.forEach((task, taskIndex) => {
        db.update(tasks)
          .set({
            position: (taskIndex + 1) * POSITION_STEP,
            updatedAt: now,
          })
          .where(eq(tasks.id, task.id))
          .run();
      });
      return true;
    }
  }

  return false;
}
