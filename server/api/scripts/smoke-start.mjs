import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

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
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
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
  console.log(JSON.stringify({ startCommand: 'node --import tsx dist/index.js', health: true, createMoveRead: true, legacy: true, node: process.version }));
} finally {
  child.kill();
  await ended;
  rmSync(directory, { recursive: true, force: true });
}
