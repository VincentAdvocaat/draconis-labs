import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { Pool } from 'pg';

const testUrl = new URL(process.env.PLANNER_POSTGRES_TEST_URL ?? '');
assert(['postgres:', 'postgresql:'].includes(testUrl.protocol)
  && ['127.0.0.1', '[::1]'].includes(testUrl.hostname)
  && testUrl.pathname === '/draconis_planner_test' && !testUrl.search && !testUrl.hash,
'Use a disposable draconis_planner_test database on loopback.');
const admin = new Pool({ connectionString: testUrl.href, connectionTimeoutMillis: 5000 });
const database = `draconis_http_${randomUUID().replaceAll('-', '')}`;
const databaseUrl = new URL(testUrl);
databaseUrl.pathname = `/${database}`;
const directory = mkdtempSync(join(tmpdir(), 'draconis-planner-postgres-http-'));
const identityFile = join(directory, 'identity.json');
const sqlitePath = join(directory, 'identity-sidecar.sqlite');
const owner = randomUUID();
const viewer = randomUUID();
const digest = token => createHash('sha256').update(token).digest('hex');
writeFileSync(identityFile, JSON.stringify({
  ownerId: 'fixture-owner',
  members: [{ userId: 'fixture-viewer', role: 'viewer' }],
  sessions: [
    { userId: 'fixture-owner', tokenHash: digest(owner), expiresAt: new Date(Date.now() + 300_000).toISOString() },
    { userId: 'fixture-viewer', tokenHash: digest(viewer), expiresAt: new Date(Date.now() + 300_000).toISOString() },
  ],
}));

function launch(overrides = {}) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'dist/index.js'], {
    windowsHide: true,
    env: {
      ...process.env, PORT: '0', HOST: '127.0.0.1', NODE_ENV: 'test', DRACONIS_API_KEYS: '',
      DATABASE_PATH: sqlitePath, DRACONIS_LOCAL_IDENTITY_FILE: identityFile,
      DRACONIS_PLANNER_POSTGRES_URL: databaseUrl.href, ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { log = (log + chunk).slice(-6000); });
  }
  const ended = once(child, 'close');
  return {
    async address() {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline && child.exitCode === null) {
        const address = log.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
        if (address) return address;
        await delay(50);
      }
      throw new Error(`API did not start: ${log}`);
    },
    async refusal(message) {
      const timeout = new AbortController();
      try {
        const [exitCode] = await Promise.race([
          ended, delay(20_000, [null], { signal: timeout.signal }),
        ]);
        assert.equal(exitCode, 1, log);
        assert.match(log, message);
        assert(!log.includes('Server listening at'), log);
      } finally {
        timeout.abort();
        await this.stop();
      }
    },
    async stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await ended;
    },
  };
}

const workspace = '/api/v1/workspaces/local';
const tasks = `${workspace}/tasks`;
let createdDatabase = false;
let running;
try {
  await admin.query(`CREATE DATABASE ${database}`);
  createdDatabase = true;

  await launch({ DRACONIS_LOCAL_IDENTITY_FILE: undefined }).refusal(/vereist DRACONIS_LOCAL_IDENTITY_FILE/);
  await launch({ HOST: '0.0.0.0' }).refusal(/vereist HOST=127\.0\.0\.1/);
  const remoteUrl = new URL(databaseUrl);
  remoteUrl.hostname = 'postgres.example.invalid';
  await launch({ DRACONIS_PLANNER_POSTGRES_URL: remoteUrl.href }).refusal(/vereist een PostgreSQL-URL/);
  await launch({ DRACONIS_PLANNER_POSTGRES_URL: `${databaseUrl.href}?host=postgres.example.invalid` }).refusal(/vereist een PostgreSQL-URL/);

  running = launch();
  let base = await running.address();

  async function request(path, status, { method = 'GET', token = owner, data, key } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
        ...(data !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(body)}`);
    return body;
  }

  assert.equal((await request('/health', 200, { token: null })).status, 'ok');
  assert.equal((await request(tasks, 401, { token: null })).error.code, 'UNAUTHORIZED');
  assert.equal((await request('/api/v1/workspaces/other/tasks', 403)).error.code, 'FORBIDDEN');
  assert.equal((await request(tasks, 403, { token: viewer, method: 'POST', data: { title: 'Geen schrijfrecht' } })).error.code, 'FORBIDDEN');
  await request('/api/v1/planner/tasks', 404);
  await request(`${workspace}/contacts`, 404);

  const input = {
    title: 'Fictieve onderhoudstaak', dueDate: '2026-11-20',
    recurrence: { frequency: 'weekly', interval: 2 }, labels: ['demo'],
  };
  const create = { method: 'POST', data: input, key: 'fixture-recurring' };
  const [first, second] = await Promise.all([request(tasks, 201, create), request(tasks, 201, create)]);
  assert.deepEqual(second, first);
  const original = first.value;
  assert.equal(original.createdBy, 'fixture-owner');
  const reused = await request(tasks, 409, { ...create, data: { ...input, title: 'Andere invoer' } });
  assert.equal(reused.error.code, 'IDEMPOTENCY_CONFLICT');

  const updatedPath = `${tasks}/${original.id}`;
  const response = await Promise.all([1, 2].map(async () => {
    const result = await fetch(base + updatedPath, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${owner}`, 'content-type': 'application/json' },
      body: JSON.stringify({ lane: 'done', version: 1 }),
      signal: AbortSignal.timeout(10_000),
    });
    return { status: result.status, body: await result.json() };
  }));
  assert.deepEqual(response.map(result => result.status).sort(), [200, 409]);
  const completed = response.find(result => result.status === 200).body.value;
  const conflict = response.find(result => result.status === 409).body.error;
  assert.equal(conflict.code, 'VERSION_CONFLICT');
  assert.deepEqual(conflict.task, completed);

  const list = await request(tasks, 200, { token: viewer });
  assert.equal(list.value.length, 2);
  const successor = list.value.find(task => task.recurrenceParentId === original.id);
  assert.equal(successor?.dueDate, '2026-12-04');
  assert.deepEqual((await request(`${workspace}/history`, 200)).value, [completed]);

  const page = (await request(`${tasks}?pagination=cursor&pageSize=1&label=demo`, 200)).value;
  assert.equal(page.items.length, 1);
  assert(page.nextCursor);
  const tail = (await request(`${tasks}?cursor=${page.nextCursor}&pageSize=1&label=demo`, 200)).value;
  assert.equal(tail.nextCursor, null);
  assert.deepEqual([...page.items, ...tail.items], list.value);
  await request(`${tasks}?cursor=${page.nextCursor}&pageSize=1&label=other`, 400);

  const preferences = await request(`${workspace}/preferences`, 200, { method: 'PATCH', data: { locale: 'en' } });
  assert.equal(preferences.value.locale, 'en');
  await running.stop();
  running = launch();
  base = await running.address();
  assert.deepEqual(await request(tasks, 200), list);
  assert.deepEqual(await request(tasks, 201, create), first);
  assert.deepEqual(await request(`${workspace}/preferences`, 200), preferences);

  assert.deepEqual(await request(updatedPath, 200, { method: 'DELETE' }), { ok: true, value: null });
  const missing = await request(updatedPath, 404, { method: 'DELETE' });
  assert.equal(missing.error.code, 'TASK_NOT_FOUND');
  assert.deepEqual(await request(tasks, 200), { ok: true, value: [successor] });

  const postgres = new Pool({ connectionString: databaseUrl.href });
  try {
    const { rows } = await postgres.query('SELECT id FROM planner_tasks WHERE workspace_id = $1', ['local']);
    assert.deepEqual(rows, [{ id: successor.id }]);
  } finally { await postgres.end(); }
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(sqlite.prepare('SELECT count(*) AS total FROM tasks').get().total, 0);
  } finally { sqlite.close(); }

  console.log(JSON.stringify({
    startCommand: 'node --import tsx dist/index.js', loopback: true, authorization: true,
    idempotentCreate: true, versionRace: true, recurringSuccessor: true, cursor: true,
    history: true, preferences: true, restart: true, deletion: true, postgresOnlyTasks: true,
  }));
} finally {
  try {
    await running?.stop();
    if (createdDatabase) await admin.query(`DROP DATABASE ${database}`);
  } finally {
    await admin.end();
    rmSync(directory, { recursive: true, force: true });
  }
}
