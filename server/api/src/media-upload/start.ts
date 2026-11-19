import { randomBytes } from 'node:crypto';
import { createMediaFixture } from '../media-fixture/fixture.js';
import { buildUploadApp } from './app.js';

const rootArg = process.argv.find(arg => arg.startsWith('--root='))?.slice('--root='.length);
const created = rootArg ? undefined : createMediaFixture();
created?.close();
const root = rootArg ?? created!.root;
const token = randomBytes(32).toString('hex');
const app = await buildUploadApp(root, token);
const address = await app.listen({ host: '127.0.0.1', port: 0 });
console.log(JSON.stringify({ address, token, fixtureRoot: root, website: 'fixture-alpha',
  upload: 'POST /websites/fixture-alpha/media with Bearer token, image content-type and x-media-filename',
  persistence: 'Temporary fixture retained on exit; restart with --root=<printed fixtureRoot>' }, null, 2));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => {
  await app.close();
  console.log(`Stopped. Temporary fixture retained at ${root}`);
});
