import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

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
  const credentials = JSON.parse(execFileSync(process.execPath, [
    '--import', 'tsx', 'scripts/agent-credentials.ts', 'create', '--name', 'fixture-audit-agent',
    '--scope', 'tasks:read', '--scope', 'tasks:create', '--expires', new Date(Date.now() + 120_000).toISOString(),
  ], {
    env: { ...process.env, DATABASE_PATH: sqlitePath, DRACONIS_LOCAL_IDENTITY_FILE: identityFile },
    encoding: 'utf8', windowsHide: true,
  }));
  const mcp = new Client({ name: 'postgres-planner-smoke', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath, args: ['--import', 'tsx', 'dist/mcp.js'], cwd: process.cwd(),
    env: {
      DATABASE_PATH: sqlitePath, DRACONIS_LOCAL_IDENTITY_FILE: identityFile,
      DRACONIS_PLANNER_POSTGRES_URL: databaseUrl.href, DRACONIS_MCP_AGENT_TOKEN: credentials.token,
    },
  });
  let mcpTaskId;
  try {
    await mcp.connect(transport);
    const fromRest = await mcp.callTool({ name: 'list_tasks', arguments: { pageSize: 10 } });
    assert(fromRest.structuredContent.value.items.some(task => task.id === successor.id));
    const mcpInput = { title: 'Fictieve gedeelde MCP-taak' };
    const createMcp = await mcp.callTool({
      name: 'create_task', arguments: { input: mcpInput, idempotencyKey: 'shared-transport' },
    });
    assert.equal(createMcp.structuredContent.ok, true);
    mcpTaskId = createMcp.structuredContent.value.id;
    const viaRest = await request(tasks, 201, {
      method: 'POST', token: credentials.token, data: mcpInput, key: 'shared-transport',
    });
    assert.deepEqual(viaRest, createMcp.structuredContent);
  } finally {
    await mcp.close();
  }

  const auditDb = new Pool({ connectionString: databaseUrl.href });
  try {
    const before = await auditDb.query('SELECT id FROM planner_tasks ORDER BY id');
    const receipts = await auditDb.query('SELECT workspace_id, actor, key FROM planner_task_creation_receipts ORDER BY actor, key');
    const activity = await auditDb.query('SELECT actor_name, client, operation, target_id, status FROM local_planner_activity ORDER BY id');
    assert(activity.rows.some(row => row.client === 'mcp' && row.target_id === mcpTaskId && row.status === 201));
    assert(activity.rows.some(row => row.client === 'rest' && row.target_id === mcpTaskId && row.status === 201));
    assert(activity.rows.some(row => row.actor_name === 'fixture-viewer' && row.status === 403));
    assert(activity.rows.some(row => row.target_id === original.id && row.status === 409));
    await auditDb.query(`
      CREATE FUNCTION reject_test_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.status = 201 THEN RAISE EXCEPTION 'fixture audit fault'; END IF;
        RETURN NEW;
      END
      $$;
      CREATE TRIGGER reject_test_audit BEFORE INSERT ON local_planner_activity
      FOR EACH ROW EXECUTE FUNCTION reject_test_audit()
    `);
    try {
      const failed = await request(tasks, 500, {
        method: 'POST', data: { title: 'Fictieve auditrollback' }, key: 'audit-rollback',
      });
      assert.equal(failed.error.code, 'INTERNAL_ERROR');
      assert.deepEqual((await auditDb.query('SELECT id FROM planner_tasks ORDER BY id')).rows, before.rows);
      assert.deepEqual((await auditDb.query('SELECT workspace_id, actor, key FROM planner_task_creation_receipts ORDER BY actor, key')).rows, receipts.rows);
    } finally {
      await auditDb.query('DROP TRIGGER reject_test_audit ON local_planner_activity; DROP FUNCTION reject_test_audit()');
    }
    await request(tasks, 201, { method: 'POST', data: { title: 'Fictieve auditrollback' }, key: 'audit-rollback' });
  } finally { await auditDb.end(); }

  const report = JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', 'scripts/planner-audit.ts',
    '--actor', 'fixture-audit-agent', '--kind', 'agent', '--limit', '10',
  ], {
    env: {
      ...process.env, DATABASE_PATH: sqlitePath, DRACONIS_LOCAL_IDENTITY_FILE: identityFile,
      DRACONIS_PLANNER_POSTGRES_URL: databaseUrl.href,
    },
    encoding: 'utf8', windowsHide: true,
  }));
  assert.deepEqual(report.map(row => row.client).sort(), ['mcp', 'rest']);
  assert(report.every(row => row.targetId === mcpTaskId && row.status === 201));

  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(sqlite.prepare('SELECT count(*) AS total FROM tasks').get().total, 0);
    assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'local_planner_activity'").get(), undefined);
  } finally { sqlite.close(); }

  console.log(JSON.stringify({
    startCommand: 'node --import tsx dist/index.js', loopback: true, authorization: true,
    idempotentCreate: true, versionRace: true, recurringSuccessor: true, cursor: true,
    history: true, preferences: true, restart: true, deletion: true, postgresOnlyTasks: true,
    sharedMcpRestStorage: true, postgresAudit: true, auditCli: true, auditFaultRollsBackTaskAndReceipt: true,
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
