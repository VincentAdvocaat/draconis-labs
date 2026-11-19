import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { assertFixtureRoot } from '../media-fixture/safety.js';

const root = process.argv.find(arg => arg.startsWith('--root='))?.slice('--root='.length);
if (!root || !process.argv.includes('--confirm')) throw new Error('Stop the probe, then pass --root=<fixtureRoot> --confirm');
const target = assertFixtureRoot(root);
if (!/^[a-f0-9-]{36}$/.test(readFileSync(join(target, '.media-fixture'), 'utf8')))
  throw new Error('Invalid fixture ownership marker');
rmSync(target, { recursive: true });
console.log('Removed checked temporary media fixture.');
