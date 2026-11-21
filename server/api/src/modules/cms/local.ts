import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createCatalogConsumerFixture } from '../../catalogus/consumer-fixture.js';
import { buildCmsApp } from './app.js';
import type { LocalePreviewConfigs } from './locale-preview.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const configPath = process.env.CMS_FIXTURE_CONFIG;
if (!configPath) throw new Error('Gebruik scripts/start-cms-fixture.ps1 voor deze lokale proef');
const config = JSON.parse(await readFile(configPath, 'utf8')) as { credentials: unknown; runtimeRoot: string; port: number; localePreviews?: LocalePreviewConfigs };
// A new local demo gets only synthetic catalog data. Existing media roots are never reseeded.
const mediaPointer = join(config.runtimeRoot, 'media-root.json');
if (!existsSync(mediaPointer)) {
  mkdirSync(config.runtimeRoot, { recursive: true });
  const fixture = createCatalogConsumerFixture();
  writeFileSync(mediaPointer, JSON.stringify({ root: fixture.root }), { flag: 'wx' });
  fixture.consumer.close(); fixture.catalog.close(); fixture.media.close();
}
const { app } = await buildCmsApp({ runtimeRoot: config.runtimeRoot, credentials: config.credentials,
  localePreviews: config.localePreviews, seed: true, enableMedia: true, enableUploads: true, enablePages: true, enablePortfolio: true, enableSharedNavigation: true, enableContactTemplate:true, uiRoot: join(repoRoot, 'apps', 'cms', 'dist') });
try {
  await app.listen({ host: '127.0.0.1', port: config.port });
} catch (error) { await app.close(); throw error; }
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await app.close(); process.exit(0); });
console.log(`Lokale CMS-proef: http://127.0.0.1:${config.port}`);
if (process.env.CMS_FIXTURE_OPEN === '1' && process.platform === 'win32') {
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', `http://127.0.0.1:${config.port}`],
    { windowsHide: true, detached: true, stdio: 'ignore' });
  browser.on('error', () => console.log('Open de bovenstaande lokale URL handmatig.'));
  browser.unref();
}
