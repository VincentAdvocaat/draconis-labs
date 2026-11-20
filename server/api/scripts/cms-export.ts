import { exportStaticRelease } from '../src/modules/cms/static-export.js';

const args = process.argv.slice(2), options: Record<string, string> = {};
while (args.length) {
  const key = args.shift(), value = args.shift();
  if (!key || !['--source', '--website', '--release', '--target'].includes(key) || !value || value.startsWith('--') || options[key]) throw new Error('Invalid or duplicate export option');
  options[key] = value;
}
if (Object.keys(options).length !== 4) throw new Error('Usage: cms-export.ts --source OWN_SYNTHETIC_ROOT --website demo-cms --release active|PUBLISHED_UUID --target NEW_TEMP_EXPORT');
console.log(JSON.stringify(exportStaticRelease({ sourceRoot: options['--source']!, websiteId: options['--website']!, release: options['--release']!, targetRoot: options['--target']! })));
