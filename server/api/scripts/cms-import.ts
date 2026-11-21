import { join } from 'node:path';
import { applyLegacyImport, openImportedFixture } from '../src/modules/cms/import-apply.js';

const [command, first, firstValue, second, secondValue, ...extra] = process.argv.slice(2);
const valid = firstValue && secondValue && !firstValue.startsWith('--') && !secondValue.startsWith('--') && !extra.length;
const port = Number(secondValue);
try {
  if (valid && command === 'apply' && first === '--source' && second === '--target') {
    const report = await applyLegacyImport(firstValue, secondValue);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } else if (valid && command === 'serve' && first === '--target' && second === '--port' &&
      Number.isInteger(port) && port >= 1024 && port <= 65535) {
    const runtime = await openImportedFixture(firstValue);
    try { await runtime.app.listen({ host: '127.0.0.1', port }); }
    catch (error) { await runtime.app.close(); throw error; }
    for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await runtime.app.close(); process.exit(0); });
    console.log(`Synthetic imported CMS: http://127.0.0.1:${port}. Credentials: ${join(firstValue, 'local-access.json')}`);
  } else {
    console.error('Usage: cms-import.ts apply --source SYNTHETIC_SOURCE --target TEMP_TARGET | serve --target TEMP_TARGET --port PORT');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
