import { randomBytes } from 'node:crypto';
import { createMediaFixture } from '../media-fixture/fixture.js';
import { buildCatalogApp } from './app.js';

const rootArg = process.argv.find(arg => arg.startsWith('--root='))?.slice('--root='.length);
const fixture = rootArg ? undefined : createMediaFixture();
fixture?.close();
const root = rootArg ?? fixture!.root;
const token = randomBytes(32).toString('hex');
const app = await buildCatalogApp(root, token);
const address = await app.listen({ host: '127.0.0.1', port: 0 });
console.log(JSON.stringify({ url: `${address}/catalogus`, token, fixtureRoot: root }, null, 2));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await app.close(); });
