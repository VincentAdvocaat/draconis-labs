import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { backupRecoveryFixture, createRecoveryFixture, openRecoveryFixture, quiesceRecoveryFixture, restoreRecoveryFixture } from '../src/modules/cms/recovery.js';

const args = process.argv.slice(2);
const command = args.shift();
const options: Record<string, string> = {};
while (args.length) {
  const key = args.shift(), value = args.shift();
  if (!key || !['--source', '--target', '--port'].includes(key) || !value || value.startsWith('--') || options[key]) throw new Error('Invalid or duplicate option');
  options[key] = value;
}
const keys = Object.keys(options).sort().join(',');
if (command === 'init' && keys === '--target') console.log(JSON.stringify(await createRecoveryFixture(options['--target']!)));
else if (command === 'quiesce' && keys === '--source') console.log(JSON.stringify(quiesceRecoveryFixture(options['--source']!)));
else if (command === 'backup' && keys === '--source,--target') console.log(JSON.stringify(await backupRecoveryFixture(options['--source']!, options['--target']!)));
else if (command === 'restore' && keys === '--source,--target') console.log(JSON.stringify(await restoreRecoveryFixture(options['--source']!, options['--target']!)));
else if (command === 'serve' && keys === '--port,--source') {
  const port = Number(options['--port']);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local port');
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const running = await openRecoveryFixture(options['--source']!, join(repo, 'apps/cms/dist'));
  try { await running.app.listen({ host: '127.0.0.1', port }); }
  catch (error) { await running.app.close(); throw error; }
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await running.app.close(); process.exit(0); });
  console.log(`Synthetic restored CMS: http://127.0.0.1:${port}. Credentials: ${join(options['--source']!, 'local-access.json')}`);
} else throw new Error('Usage: cms-recovery.ts init --target NEW_TEMP_FIXTURE | quiesce --source STOPPED_FIXTURE | backup/restore --source FIXTURE_OR_PACKAGE --target NEW_TEMP_TARGET | serve --source FIXTURE --port PORT');
