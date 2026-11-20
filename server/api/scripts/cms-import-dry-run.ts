import { dryRunLegacyImport } from '../src/modules/cms/import-dry-run.js';

const [option, source, ...extra] = process.argv.slice(2);
if (option !== '--source' || !source || source.startsWith('--') || extra.length) {
  console.error('Usage: cms-import-dry-run.ts --source SYNTHETIC_TEMP_FIXTURE');
  process.exitCode = 2;
} else {
  const report = dryRunLegacyImport(source);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
