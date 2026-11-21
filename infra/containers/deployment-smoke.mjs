import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const [originArgument, mode, ...extra] = process.argv.slice(2);
assert(originArgument && (mode === undefined || mode === '--write-fixture') && extra.length === 0,
  'Usage: node deployment-smoke.mjs <planner-origin> [--write-fixture]');
const base = new URL(originArgument);
assert.equal(base.href, base.origin + '/', 'Provide the Planner origin without path, credentials or query');
const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
assert(base.protocol === 'https:' || (loopback && base.protocol === 'http:'), 'Remote smoke requires HTTPS');

async function request(path, options = {}, expectedStatus = 200) {
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin, 'Expected same-origin smoke request');
  const response = await fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, expectedStatus, `${options.method ?? 'GET'} ${url.pathname}`);
  return response;
}

async function discovery() {
  const response = await request('/api/v1/system/info');
  const info = await response.json();
  assert.equal(info.apiVersion, 'v1');
  assert(info.modules.some(module => module.prefix === '/api/v1/workspaces/:workspaceId'));
}

if (mode === '--write-fixture') {
  assert(loopback, 'The write smoke requires a local Compose fixture');
  assert(process.env.DRACONIS_SMOKE_KEY, 'Missing DRACONIS_SMOKE_KEY for the local fixture');
}

const deadline = Date.now() + 60_000;
for (;;) {
  try {
    assert.equal(await (await request('/health')).text(), 'ok');
    await discovery();
    break;
  } catch (error) {
    if (Date.now() >= deadline) throw error;
    await delay(1000);
  }
}

const html = await (await request('/')).text();
assert.match(html, /id="root"/, 'Planner entry HTML');
const asset = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"/)?.[1];
assert(asset, 'Planner entry JavaScript must be a same-origin build asset');
const script = await request(asset);
assert.match(script.headers.get('content-type') ?? '', /javascript/);
assert((await script.arrayBuffer()).byteLength > 0, 'Planner entry JavaScript must be nonempty');
await request('/assets/nonexistent-smoke.js', {}, 404);
await request('/api/v1/openapi.json', {}, 404);

if (mode === '--write-fixture') {
  const tasks = '/api/v1/workspaces/local/tasks';
  const title = `Fictieve containersmoke ${randomUUID()}`;
  const headers = {
    Authorization: `Bearer ${process.env.DRACONIS_SMOKE_KEY}`,
    'Content-Type': 'application/json',
  };
  const created = await request(tasks, {
    method: 'POST',
    headers: { ...headers, 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ title }),
  }, 201);
  const result = await created.json();
  assert.equal(result.ok, true);
  const id = result.value.id;
  assert.match(id, /^[\da-f-]{36}$/i);

  async function list() {
    const response = await request(`${tasks}?q=${encodeURIComponent(title)}`, { headers });
    const page = await response.json();
    assert.equal(page.ok, true);
    return page.value;
  }

  try {
    assert.equal(result.value.title, title);
    assert.equal(result.value.createdBy, 'smoke-agent');
    assert((await list()).some(task => task.id === id && task.title === title));
  } finally {
    const deleted = await request(`${tasks}/${id}`, { method: 'DELETE', headers: { Authorization: headers.Authorization } });
    assert.equal((await deleted.json()).ok, true);
  }
  assert.deepEqual(await list(), []);
}

console.log(`Planner HTML, build asset, health and same-origin API discovery OK${mode ? ', fictional task created, read and removed' : ''}.`);
