import type { Task, UserPreferences } from '@draconis/shared';
import { createPlannerSnapshotTools, IMPORT_VERSION, PlannerSnapshotError } from '@draconis/planner-sqlite';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { preferences, receipts, tasks } from './schema.js';
import { requireWorkspace, transaction } from './transaction.js';

const snapshots = createPlannerSnapshotTools(Database);
type SourceTask = ReturnType<typeof snapshots.readTaskSnapshot>['tasks'][number];

function importedTask(row: SourceTask, workspaceId: string): typeof tasks.$inferInsert {
  return {
    workspaceId,
    id: row.id as string,
    title: row.title as string,
    description: row.description as string | null,
    lane: row.lane as Task['lane'],
    plannedDate: row.planned_date as string | null,
    dueDate: row.due_date as string | null,
    dueTime: row.due_time as string | null,
    timezone: row.timezone as string | null,
    recurrence: row.recurrence === null ? null : JSON.parse(row.recurrence as string) as Task['recurrence'],
    recurrenceParentId: row.recurrence_parent_id as string | null,
    position: row.position as number,
    version: row.version as number,
    createdBy: row.created_by as string,
    priority: row.priority as Task['priority'],
    labels: JSON.parse(row.labels as string) as Task['labels'],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    completedAt: row.completed_at as string | null,
  };
}

async function insertBatches<Row>(rows: Row[], insert: (batch: Row[]) => PromiseLike<unknown>) {
  for (let offset = 0; offset < rows.length; offset += 500) await insert(rows.slice(offset, offset + 500));
}

interface ImportOptions {
  snapshotPath: string;
  workspaceId: string;
  sourceId: string;
  expectedSha256: string;
  dryRun: boolean;
}

export async function importPlannerPostgresSnapshot(pool: Pool, options: ImportOptions) {
  const { snapshotPath, workspaceId, sourceId, expectedSha256, dryRun } = options;
  if (!sourceId.trim() || sourceId !== sourceId.trim() || sourceId.length > 120) {
    throw new PlannerSnapshotError('INVALID_IMPORT_IDENTITY', 'Geef een geldige bronidentiteit op.');
  }
  const bundle = snapshots.readTaskSnapshot(snapshotPath, expectedSha256);
  const report = {
    ...bundle.report, workspaceId, sourceId, dryRun,
    taskCreationReceiptCount: bundle.receipts.length,
    excludedTables: bundle.tables.filter(table => !['tasks', 'user_preferences', 'planner_command_receipts'].includes(table)),
  };

  return transaction(pool, async client => {
    await requireWorkspace(client, workspaceId, true);
    const marker = [workspaceId, sourceId, report.sha256, IMPORT_VERSION];
    const prior = await client.query(`
      SELECT 1 FROM planner_snapshot_imports
      WHERE workspace_id = $1 AND source_id = $2 AND source_sha256 = $3 AND import_version = $4
    `, marker);
    if (prior.rowCount) return { ...report, alreadyImported: true, insertedTasks: 0, insertedPreferences: 0, insertedReceipts: 0 };

    const occupied = await client.query<{ occupied: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM planner_snapshot_imports WHERE workspace_id = $1)
          OR EXISTS (SELECT 1 FROM planner_tasks WHERE workspace_id = $1)
          OR EXISTS (SELECT 1 FROM planner_preferences WHERE workspace_id = $1)
          OR EXISTS (SELECT 1 FROM planner_task_creation_receipts WHERE workspace_id = $1)
        AS occupied
    `, [workspaceId]);
    if (occupied.rows[0].occupied) throw new PlannerSnapshotError('TARGET_NOT_EMPTY', 'Kies een lege werkruimte voor de eerste import.');

    const db = drizzle(client);
    if (dryRun) await client.query('SAVEPOINT planner_import_probe');
    await insertBatches(bundle.tasks.map(row => importedTask(row, workspaceId)), batch => db.insert(tasks).values(batch));
    await insertBatches(bundle.preferences.map(row => ({
      workspaceId, id: row.id as string, preferences: JSON.parse(row.preferences as string) as UserPreferences,
      updatedAt: row.updated_at as string,
    })), batch => db.insert(preferences).values(batch));
    await insertBatches(bundle.receipts.map(row => ({ ...row, workspaceId })), batch => db.insert(receipts).values(batch));
    await client.query(`
      INSERT INTO planner_snapshot_imports (workspace_id, source_id, source_sha256, import_version)
      VALUES ($1, $2, $3, $4)
    `, marker);
    if (dryRun) await client.query('ROLLBACK TO SAVEPOINT planner_import_probe');
    return { ...report, alreadyImported: false,
      insertedTasks: dryRun ? 0 : bundle.tasks.length,
      insertedPreferences: dryRun ? 0 : bundle.preferences.length,
      insertedReceipts: dryRun ? 0 : bundle.receipts.length,
    };
  });
}
