import { parseArgs } from 'node:util';
import Database from 'better-sqlite3';
import { listPlannerActivity } from '../src/core/planner-audit.js';

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
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    console.log(JSON.stringify(listPlannerActivity(db, {
      ...values,
      limit: values.limit === undefined ? undefined : Number(values.limit),
    }), null, 2));
  } finally {
    db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Auditlog uitlezen mislukt.');
  process.exitCode = 1;
}
