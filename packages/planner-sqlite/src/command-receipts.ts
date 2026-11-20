import type Database from 'better-sqlite3';

interface CommandReceiptKey {
  workspaceId: string;
  actor: string;
  operation: string;
  key: string;
}

export function readCommandReceipt<Result>(db: Database.Database, scope: CommandReceiptKey): { hash: string; result: Result } | undefined {
  const row = db.prepare(`
    SELECT hash, result FROM planner_command_receipts
    WHERE workspace_id = ? AND actor = ? AND operation = ? AND key = ?
  `).get(scope.workspaceId, scope.actor, scope.operation, scope.key) as { hash: string; result: string } | undefined;
  return row && { hash: row.hash, result: JSON.parse(row.result) as Result };
}

export function writeCommandReceipt(db: Database.Database, scope: CommandReceiptKey, hash: string, result: unknown) {
  db.prepare(`
    INSERT INTO planner_command_receipts (workspace_id, actor, operation, key, hash, result)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(scope.workspaceId, scope.actor, scope.operation, scope.key, hash, JSON.stringify(result));
}
