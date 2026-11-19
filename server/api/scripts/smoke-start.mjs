import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const directory = mkdtempSync(join(tmpdir(), 'draconis-start-smoke-'));
const child = spawn(process.execPath, ['--import', 'tsx', 'dist/index.js'], {
  windowsHide: true,
  env: { ...process.env, DATABASE_PATH: join(directory, 'smoke.sqlite'), HOST: '127.0.0.1', PORT: String(port), DRACONIS_API_KEYS: 'smoke:synthetic-key' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', data => { log = (log + data).slice(-5000); });
child.stderr.on('data', data => { log = (log + data).slice(-5000); });
const ended = once(child, 'close');
const base = `http://127.0.0.1:${port}`;
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, ...(method !== 'GET' && body ? { body: JSON.stringify(body) } : {}) });
  assert(response.ok, `${method} ${path}: ${response.status}`);
  return response.json();
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(log);
    try { await request('/health'); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert(ready, `API startup timed out: ${log}`);
  const task = await request('/api/v1/planner/tasks', 'POST', { title: 'Fictieve startcontrole', plannedDate: '2026-11-19' });
  const moved = await request(`/api/v1/planner/tasks/${task.id}`, 'PATCH', { lane: 'doing', version: 1 });
  assert.equal(moved.version, 2);
  assert.equal(moved.lane, 'doing');
  assert.deepEqual(await request('/api/v1/planner/tasks'), [moved]);
  assert.deepEqual(await request('/api/planner/tasks'), [moved]);
  assert.deepEqual(await request('/api/v1/workspaces/local/tasks'), { ok: true, value: [moved] });
  const wrong = await fetch(base + '/api/v1/workspaces/other/tasks');
  assert.equal(wrong.status, 404);
  assert.equal((await wrong.json()).error.code, 'WORKSPACE_NOT_FOUND');
  for (const method of ['PATCH','DELETE']) {
    const preflight = await fetch(base + '/api/v1/workspaces/local/blocks/00000000-0000-4000-8000-000000000001', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers':'content-type' } });
    assert.equal(preflight.status, 204);
    assert(preflight.headers.get('access-control-allow-methods').split(',').map(value=>value.trim()).includes(method));
  }
  const date = new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Amsterdam'});
  const slots = (await request('/api/v1/workspaces/local/availability?date='+date)).value;
  const block = (await request('/api/v1/workspaces/local/blocks','POST',{key:randomUUID(),input:{slotId:slots[0].slot.id,reason:'Fictieve startcontrole'}})).value;
  const release = {key:randomUUID()};
  assert.deepEqual(await request('/api/v1/workspaces/local/blocks/'+block.id,'DELETE',release),{ok:true,value:null});
  assert.deepEqual(await request('/api/v1/workspaces/local/blocks/'+block.id,'DELETE',release),{ok:true,value:null});
  assert((await request('/api/v1/workspaces/local/availability?date='+date)).value[0].available);
  console.log(JSON.stringify({ startCommand: 'node --import tsx dist/index.js', health: true, createMoveRead: true, legacy: true, workspace: true, wrongWorkspaceRejected: true, corsWriteMethods:true, blockReleaseRetry:true, node: process.version }));
} finally {
  child.kill();
  await ended;
  rmSync(directory, { recursive: true, force: true });
}
