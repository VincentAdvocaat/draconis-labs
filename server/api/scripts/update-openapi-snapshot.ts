import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from '../src/core/index.js';

const out = join(import.meta.dirname, '..', 'openapi', 'v1.snapshot.json');
const app = await buildApp();
const spec = app.swagger();
await app.close();
writeFileSync(out, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`wrote ${out}`);
