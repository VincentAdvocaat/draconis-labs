import { randomBytes } from 'node:crypto';
import { createMediaFixture } from '../media-fixture/fixture.js';
import { buildCatalogApp } from './app.js';

const rootArg = process.argv.find(arg => arg.startsWith('--root='))?.slice('--root='.length);
const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice('--port='.length) ?? 0);
if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535');
const fixture = rootArg ? undefined : createMediaFixture();
fixture?.close();
const root = rootArg ?? fixture!.root;
const token = randomBytes(32).toString('hex');
const app = await buildCatalogApp(root, token);
try {
  const address = await app.listen({ host: '127.0.0.1', port });
  console.log(JSON.stringify({ url: `${address}/catalogus`, token, fixtureRoot: root }, null, 2));
} catch (error) {
  await app.close();
  fixture?.cleanup();
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    let instance = 'onbekende lokale service';
    try {
      const response = await fetch(`http://127.0.0.1:${port}/catalogus/instance`, { signal: AbortSignal.timeout(1000) });
      const info = await response.json() as { module?: string; instanceId?: string };
      if (info.module === 'catalogus') instance = `catalogus-instantie ${info.instanceId}`;
    } catch { /* The occupied port may serve another protocol or application. */ }
    console.error(`Poort ${port} is bezet door ${instance}. Er is geen proces gestopt. Kies --port=0 voor een vrije poort.`);
    process.exitCode = 1;
  } else throw error;
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, async () => { await app.close(); });
