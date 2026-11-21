import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { listPostgresPlannerActivity } from '@draconis/planner-postgres';
import { openLocalPostgresPool } from '../src/modules/planner/postgres.js';
import { listPlannerActivity, parsePlannerActivityFilters } from '../src/core/planner-audit.js';

try {
  const file = process.env.DATABASE_PATH;
  if (!file || !process.env.DRACONIS_LOCAL_IDENTITY_FILE) {
    throw new Error('Gebruik DATABASE_PATH en DRACONIS_LOCAL_IDENTITY_FILE van de lokale test-API.');
  }
  const { values } = parseArgs({
    options: {
      actor: { type: 'string' },
      kind: { type: 'string' },
      from: { type: 'string' },
      through: { type: 'string' },
      limit: { type: 'string' },
    },
  });
  const filter = { ...values, limit: values.limit === undefined ? undefined : Number(values.limit) };
  const postgresUrl = process.env.DRACONIS_PLANNER_POSTGRES_URL;
  if (postgresUrl !== undefined) {
    const pool = openLocalPostgresPool(postgresUrl);
    try {
      console.log(JSON.stringify(await listPostgresPlannerActivity(pool, parsePlannerActivityFilters(filter)), null, 2));
    } finally {
      await pool.end();
    }
  } else {
    const db = new Database(file, { readonly: true, fileMustExist: true });
    try {
      console.log(JSON.stringify(listPlannerActivity(db, filter), null, 2));
    } finally {
      db.close();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Auditlog uitlezen mislukt.');
  process.exitCode = 1;
}
