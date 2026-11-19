import { parseArgs } from 'node:util';
import { closeSync, existsSync, openSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import Database from 'better-sqlite3';
import { createPlannerSnapshotTools, PlannerSnapshotError } from '@draconis/planner-sqlite';

// No implicit database path: every operation names its own source and destination.
const tools = createPlannerSnapshotTools(Database);
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    source: { type: 'string' }, snapshot: { type: 'string' }, target: { type: 'string' },
    'source-id': { type: 'string' }, 'import-version': { type: 'string' }, sha256: { type: 'string' },
    resume: { type: 'boolean', default: false },
  } });
  function required(key: keyof typeof values): string {
    const value = values[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Vereist: --${key}`);
    return value;
  }
  if (positionals.length !== 1) throw new Error('Gebruik: planner:data backup|dry-run|import|restore met expliciete paden.');
  let result: unknown;
  switch (positionals[0]) {
    case 'backup': result = await tools.backup(required('source'), required('snapshot')); break;
    case 'dry-run': result = tools.dryRun(required('snapshot')); break;
    case 'restore': result = tools.restore(required('snapshot'), required('target'), required('sha256')); break;
    case 'import': {
      const snapshotPath = required('snapshot'), targetPath = required('target');
      const sourceId = required('source-id'), importVersion = Number(required('import-version')), expectedSha256 = required('sha256');
      const report = tools.dryRun(snapshotPath);
      if (report.sha256 !== expectedSha256.toLowerCase()) throw new PlannerSnapshotError('SOURCE_HASH_MISMATCH', 'De snapshot wijkt af van de gecontroleerde bronhash.');
      if (existsSync(targetPath)) {
        const a = statSync(snapshotPath, { bigint: true }), b = statSync(targetPath, { bigint: true });
        if (resolve(snapshotPath) === resolve(targetPath) || (a.ino !== 0n && a.ino === b.ino && a.dev === b.dev)) throw new PlannerSnapshotError('SOURCE_IS_TARGET', 'Bron en doel moeten verschillende databases zijn.');
        if (!values.resume) throw new PlannerSnapshotError('DESTINATION_EXISTS', 'Gebruik een nieuw doel of kies expliciet --resume voor een eerdere importpoging.');
      } else {
        if (['-wal', '-shm', '-journal'].some(suffix => existsSync(targetPath + suffix))) throw new PlannerSnapshotError('DESTINATION_EXISTS', 'Het doel heeft bestaande SQLite-zijbestanden.');
        closeSync(openSync(targetPath, 'wx'));
      }
      const target = new Database(targetPath, { fileMustExist: true });
      try { result = tools.importSnapshot({ snapshotPath, target, sourceId, importVersion, expectedSha256 }); }
      finally { target.close(); }
      break;
    }
    default: throw new Error('Onbekend commando; kies backup, dry-run, import of restore.');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(JSON.stringify(error instanceof PlannerSnapshotError
    ? { code: error.code, message: error.message, conflicts: error.conflicts }
    : { code: 'COMMAND_FAILED', message: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
