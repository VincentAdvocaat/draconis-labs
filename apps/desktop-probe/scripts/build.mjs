import { build } from 'esbuild';
import { mkdirSync, copyFileSync, writeFileSync, cpSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;
const stage = new URL('../dist/stage/', import.meta.url);
mkdirSync(stage, { recursive: true });
const common = { bundle: true, platform: 'node', format: 'cjs', external: ['electron', 'better-sqlite3'] };
await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/stage/main.cjs' });
await build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/stage/preload.cjs' });
await build({ ...common, entryPoints: ['src/sidecar.ts'], outfile: 'dist/sidecar.cjs' });
await build({ bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' }, minify: true, entryPoints: ['src/renderer.tsx'], outfile: 'dist/stage/renderer.js' });
for (const file of ['index.html', 'probe.css']) copyFileSync(`src/${file}`, new URL(file, stage));
writeFileSync(new URL('package.json', stage), JSON.stringify({
  name: 'draconis-planner-probe', productName: 'DraconisPlannerProbe', version: process.env.PLANNER_PROBE_VERSION || '0.1.0',
  main: 'main.cjs', author: 'Draconis Labs', description: 'Local desktop runtime experiment',
  dependencies: { 'better-sqlite3': '13.2.0' },
}, null, 2));
// Copy the exact locked packages into a flat, self-contained staging tree.
// No native rebuild and no mutation of the API's SQLite 12 / Node ABI package.
const sqliteManifest = require.resolve('better-sqlite3/package.json');
const sqliteRequire = createRequire(sqliteManifest);
for (const [name, manifest] of [
  ['better-sqlite3', sqliteManifest],
  ['node-addon-api', sqliteRequire.resolve('node-addon-api/package.json')],
]) {
  const target = new URL(`node_modules/${name}/`, stage);
  mkdirSync(target, { recursive: true });
  cpSync(dirname(manifest), target, { recursive: true, dereference: true });
}
console.log(`Built local assets and staged Node-API SQLite for Electron ${electronVersion}.`);
