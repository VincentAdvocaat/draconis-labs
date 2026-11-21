import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAgentCredentials } from '../src/core/agent-credentials.js';
import { createLocalIdentity, allowScopedAgents } from '../src/core/local-identity.js';
import { listPlannerActivity } from '../src/core/planner-audit.js';

const base = '/api/v1/workspaces/local';
const expiry = '2026-04-02T13:00:00Z';
const now = () => Date.parse('2026-04-02T12:00:00Z');
const ownerToken = 'synthetic-owner-' + randomUUID();
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
const owner = bearer(ownerToken);

describe('protected Planner audit log', () => {
  let app: FastifyInstance;
  let sqlite: Database.Database;
  let agentToken: string;

  beforeAll(async () => {
    vi.stubEnv('DATABASE_PATH', ':memory:');
    const { buildApp } = await import('../src/core/index.js');
    ({ sqlite } = await import('../src/core/db.js'));
    const users = createLocalIdentity({
      ownerId: 'audit-owner', members: [],
      sessions: [{ userId: 'audit-owner', tokenHash: createHash('sha256').update(ownerToken).digest('hex'), expiresAt: expiry }],
    }, now);
    const agents = createAgentCredentials(sqlite, now);
    agentToken = agents.create({ name: 'audit-agent', scopes: ['tasks:create', 'tasks:update'] }, expiry).token;
    app = await buildApp(allowScopedAgents(users, agents));
  });

  afterAll(async () => {
    await app?.close();
    sqlite?.close();
    vi.unstubAllEnvs();
  });

  it('records REST mutations, identities, correlation IDs and authenticated denials without input data', async () => {
    const agent = bearer(agentToken);
    const secretInput = 'Synthetic private task text';
    const idempotencyKey = 'synthetic-receipt-audit';
    const created = await app.inject({
      method: 'POST', url: base + '/tasks',
      headers: { ...agent, 'idempotency-key': idempotencyKey, 'request-id': 'client-supplied-value' },
      payload: { title: secretInput },
    });
    expect(created.statusCode).toBe(201);
    const task = created.json().value;
    const taskPath = base + '/tasks/' + task.id;
    const updated = await app.inject({
      method: 'PATCH', url: taskPath, headers: agent, payload: { lane: 'done', version: 1 },
    });
    expect(updated.statusCode).toBe(200);
    const denied = await app.inject({ method: 'DELETE', url: taskPath, headers: agent });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).not.toHaveProperty('actor');
    const foreign = await app.inject({ url: '/api/v1/workspaces/fictitious-other/tasks', headers: agent });
    expect(foreign.statusCode).toBe(403);
    const removed = await app.inject({ method: 'DELETE', url: taskPath, headers: owner });
    expect(removed.statusCode).toBe(200);
    const preferences = await app.inject({
      method: 'PATCH', url: base + '/preferences', headers: owner, payload: { locale: 'en' },
    });
    expect(preferences.statusCode).toBe(200);

    const entries = listPlannerActivity(sqlite, {});
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ actor: 'audit-agent', actorKind: 'agent', client: 'rest', requestId: created.headers['x-request-id'], workspaceId: 'local', operation: 'tasks.create', targetId: task.id, status: 201 }),
      expect.objectContaining({ requestId: updated.headers['x-request-id'], operation: 'tasks.update', targetId: task.id, status: 200 }),
      expect.objectContaining({ requestId: denied.headers['x-request-id'], actorKind: 'agent', operation: 'tasks.remove', targetId: task.id, status: 403 }),
      expect.objectContaining({ requestId: foreign.headers['x-request-id'], workspaceId: null, operation: 'tasks.list', status: 403 }),
      expect.objectContaining({ requestId: removed.headers['x-request-id'], actorKind: 'user', actor: 'audit-owner', operation: 'tasks.remove', targetId: task.id, status: 200 }),
      expect.objectContaining({ requestId: preferences.headers['x-request-id'], operation: 'preferences.update', status: 200 }),
    ]));
    const publicLog = JSON.stringify(entries);
    for (const sensitive of [secretInput, agentToken, ownerToken, 'client-supplied-value', idempotencyKey, 'fictitious-other']) {
      expect(publicLog).not.toContain(sensitive);
    }
    const row = entries.find(entry => entry.requestId === created.headers['x-request-id']);
    expect(row).toBeDefined();
    const day = row!.occurredAt.slice(0, 10);
    expect(listPlannerActivity(sqlite, { actor: 'audit-agent', kind: 'agent', from: day, through: day })).toContainEqual(row);
    expect(listPlannerActivity(sqlite, { actor: 'audit-agent', kind: 'user', from: day })).toEqual([]);
    expect(listPlannerActivity(sqlite, { actor: 'audit-agent', through: '2000-01-01' })).toEqual([]);
  });

  it('rolls back the mutation and receipt when the audit write fails', async () => {
    sqlite.exec("CREATE TRIGGER fail_audit BEFORE INSERT ON local_planner_activity BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END");
    const request = {
      method: 'POST' as const, url: base + '/tasks',
      headers: { ...bearer(agentToken), 'idempotency-key': 'retry-after-audit' },
      payload: { title: 'Audit retry fixture' },
    };
    try {
      expect((await app.inject(request)).statusCode).toBe(500);
      const list = await app.inject({ url: base + '/tasks?q=Audit%20retry%20fixture', headers: owner });
      expect(list.json()).toEqual({ ok: true, value: [] });
      expect(sqlite.prepare('SELECT key FROM planner_command_receipts WHERE key = ?').get('retry-after-audit')).toBeUndefined();
    } finally {
      sqlite.exec('DROP TRIGGER fail_audit');
    }
    const retry = await app.inject(request);
    expect(retry.statusCode).toBe(201);
    expect(listPlannerActivity(sqlite, { actor: 'audit-agent' })).toContainEqual(
      expect.objectContaining({ requestId: retry.headers['x-request-id'], status: 201 }),
    );
  });
});
