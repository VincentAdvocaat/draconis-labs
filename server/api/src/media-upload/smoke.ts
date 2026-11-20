import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createMediaFixture } from '../media-fixture/fixture.js';
import { buildUploadApp } from './app.js';

const fixture = createMediaFixture();
const token = 'temporary-local-smoke-token-not-a-production-secret';
const app = await buildUploadApp(fixture.root, token);
try {
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const response = await fetch(`${address}/websites/fixture-alpha/media`, { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png', 'x-media-filename': 'smoke.png' },
    body: readFileSync(join(fixture.root, 'public/fixture-alpha/photo/1/tiny.png')),
  });
  assert.equal(response.status, 201);
  const upload = await response.json() as { assetId: string; fileVersion: number; state: string; variants: unknown[] };
  assert.equal(upload.state, 'ready');
  assert.equal(upload.fileVersion, 1);
  assert.equal(upload.variants.length, 2);
  const status = await fetch(`${address}/websites/fixture-alpha/media/${upload.assetId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(status.status, 200);
  console.log(JSON.stringify({ address, status: response.status, ...upload }, null, 2));
} finally {
  await app.close();
  fixture.cleanup();
}
