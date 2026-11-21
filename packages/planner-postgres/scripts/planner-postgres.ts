import { parseArgs } from 'node:util';
import { Pool } from 'pg';
import { DrizzleQueryError } from 'drizzle-orm';
import { createPlannerPostgresWorkspace, importPlannerPostgresSnapshot, migratePlannerPostgres } from '../src/index.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    workspace: { type: 'string' }, snapshot: { type: 'string' },
    'source-id': { type: 'string' }, sha256: { type: 'string' },
  },
});

function required(key: keyof typeof values) {
  const value = values[key];
  if (!value?.trim()) throw new Error(`Vereist: --${key}`);
  return value;
}

async function main() {
  const [command] = positionals;
  if (positionals.length !== 1 || !['migrate', 'create-workspace', 'dry-run', 'import'].includes(command)) {
    throw new Error('Gebruik planner:postgres migrate|create-workspace|dry-run|import.');
  }
  const connectionString = process.env.PLANNER_POSTGRES_URL;
  if (!connectionString?.trim()) throw new Error('PLANNER_POSTGRES_URL is vereist.');
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    if (command === 'migrate') return { versions: await migratePlannerPostgres(pool) };
    const workspaceId = required('workspace');
    if (command === 'create-workspace') {
      await createPlannerPostgresWorkspace(pool, workspaceId);
      return { workspaceId };
    }
    return await importPlannerPostgresSnapshot(pool, {
      workspaceId, snapshotPath: required('snapshot'), sourceId: required('source-id'),
      expectedSha256: required('sha256'), dryRun: command === 'dry-run',
    });
  } finally {
    await pool.end();
  }
}

try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  if (error instanceof DrizzleQueryError) {
    const cause = error.cause;
    console.error(cause && 'code' in cause ? `PostgreSQL-opdracht mislukt (${cause.code}).` : 'PostgreSQL-opdracht mislukt.');
  } else {
    console.error(error instanceof Error ? error.message : 'PostgreSQL-opdracht mislukt.');
  }
  process.exitCode = 1;
}
