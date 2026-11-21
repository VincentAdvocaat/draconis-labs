import type { Pool, PoolClient } from 'pg';

export async function transaction<T>(pool: Pool, operation: (client: PoolClient) => Promise<T>, readOnly = false) {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN ISOLATION LEVEL READ COMMITTED');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function requireWorkspace(client: PoolClient, workspaceId: string, lock = false) {
  const result = await client.query(
    lock ? 'SELECT id FROM planner_workspaces WHERE id = $1 FOR UPDATE' : 'SELECT id FROM planner_workspaces WHERE id = $1',
    [workspaceId],
  );
  if (!result.rowCount) throw Object.assign(new Error('Werkruimte niet gevonden.'), { statusCode: 404 });
}
