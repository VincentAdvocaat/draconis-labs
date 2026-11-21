import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAgentCredentials, type AgentCredentials } from '../src/core/agent-credentials.js';
import { allowScopedAgents, createLocalIdentity } from '../src/core/local-identity.js';

const asBearer = (token: string) => ({ authorization: 'Bearer ' + token });
const base = '/api/v1/workspaces/local';
const start = Date.parse('2026-04-02T12:00:00Z');
const expiry = '2026-04-02T13:00:00Z';
const ownerToken = 'fake-owner-test-token';
const prefixedSessions = [
  { userId: 'fixture-owner', token: 'dla_' + 'a'.repeat(43) },
  { userId: 'fixture-viewer', token: 'dla_' + 'b'.repeat(43) },
  { userId: 'fixture-outsider', token: 'dla_' + 'c'.repeat(43) },
];
const identity = createLocalIdentity({
  ownerId: 'fixture-owner',
  members: [{ userId: 'fixture-viewer', role: 'viewer' }],
  sessions: [{
    userId: 'fixture-owner',
    tokenHash: createHash('sha256').update(ownerToken).digest('hex'),
    expiresAt: expiry,
  }, ...prefixedSessions.map(({ userId, token }) => ({
    userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: expiry,
  }))],
}, () => start);

describe('local Planner agent credentials', () => {
  let fixture: string;
  let store: AgentCredentials;
  let app: FastifyInstance;
  let operatorDb: Database.Database;
  let closeServerDb: () => void;
  let time = start;

  beforeAll(async () => {
    fixture = mkdtempSync(join(tmpdir(), 'draconis-agent-credentials-'));
    const path = join(fixture, 'planner.sqlite');
    vi.stubEnv('DATABASE_PATH', path);
    vi.stubEnv('DRACONIS_API_KEYS', 'fixture-legacy:legacy-key');
    const { buildApp } = await import('../src/core/index.js');
    const { sqlite } = await import('../src/core/db.js');
    closeServerDb = () => { sqlite.close(); };
    const serverStore = createAgentCredentials(sqlite, () => time);
    operatorDb = new Database(path, { fileMustExist: true });
    store = createAgentCredentials(operatorDb, () => time);
    app = await buildApp(allowScopedAgents(identity, serverStore));
  });

  afterAll(async () => {
    await app?.close();
    closeServerDb?.();
    operatorDb?.close();
    vi.unstubAllEnvs();
    if (fixture) rmSync(fixture, { recursive: true, force: true });
  });

  it('permits only the granted Planner operations in the bound workspace', async () => {
    const { token, credential } = store.create({ name: 'read-agent', scopes: ['tasks:read'] }, expiry);
    const headers = asBearer(token);
    expect((await app.inject({ url: base + '/tasks?pagination=cursor', headers })).statusCode).toBe(200);
    expect((await app.inject({ url: base + '/history', headers })).statusCode).toBe(200);
    for (const request of [
      { method: 'GET', url: '/api/v1/workspaces/other/tasks' },
      { method: 'POST', url: base + '/tasks', payload: { title: 'Denied fixture' } },
      { method: 'PATCH', url: base + '/tasks/' + randomUUID(), payload: { lane: 'doing', version: 1 } },
      { method: 'DELETE', url: base + '/tasks/' + randomUUID() },
      { method: 'GET', url: base + '/preferences' },
      { method: 'PATCH', url: base + '/preferences', payload: { locale: 'en' } },
    ] as const) {
      const denied = await app.inject({ ...request, headers });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toMatchObject({ error: { code: 'FORBIDDEN', status: 403 } });
    }
    const tasks = await app.inject({ url: base + '/tasks?q=Denied%20fixture', headers });
    expect(tasks.json()).toEqual({ ok: true, value: [] });
    expect(store.list().find(item => item.id === credential.id)?.lastUsedAt).toBe(time);
    expect(JSON.stringify(store.list())).not.toContain(token);
    expect(JSON.stringify(store.list())).not.toContain('token_hash');
    const row = operatorDb.prepare('SELECT token_hash FROM local_agent_credentials WHERE id = ?').get(credential.id);
    expect(row).toEqual({ token_hash: createHash('sha256').update(token).digest('hex') });
    expect((await app.inject({ url: base + '/tasks', headers: asBearer('legacy-key') })).statusCode).toBe(401);
    expect((await app.inject({ url: base + '/tasks', headers: asBearer(ownerToken) })).statusCode).toBe(200);
  });

  it('preserves configured user sessions and permissions when their tokens have the agent prefix', async () => {
    for (const { userId, token } of prefixedSessions) {
      const headers = asBearer(token);
      const read = await app.inject({ url: base + '/tasks', headers });
      expect(read.statusCode).toBe(userId === 'fixture-outsider' ? 403 : 200);
      if (read.statusCode === 403) {
        expect(read.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', status: 403 } });
      }
      const created = await app.inject({
        method: 'POST', url: base + '/tasks', headers, payload: { title: 'Prefixed user session fixture' },
      });
      if (userId === 'fixture-owner') {
        expect(created.statusCode).toBe(201);
        expect(created.json().value.createdBy).toBe(userId);
        expect((await app.inject({
          method: 'DELETE', url: base + '/tasks/' + created.json().value.id, headers,
        })).statusCode).toBe(200);
      } else {
        expect(created.statusCode).toBe(403);
        expect(created.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', status: 403 } });
      }
      const otherWorkspace = await app.inject({ url: '/api/v1/workspaces/other/tasks', headers });
      expect(otherWorkspace.statusCode).toBe(403);
      expect(otherWorkspace.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', status: 403 } });
    }
  });

  it('rotates a key with bounded overlap and preserves actor identity for task creation retries', async () => {
    const first = store.create({ name: 'rotation-agent', scopes: ['tasks:create'] }, expiry);
    const create = async (token: string) => app.inject({
      method: 'POST', url: base + '/tasks',
      headers: { ...asBearer(token), 'Idempotency-Key': 'rotation-fixture' },
      payload: { title: 'Only one task during rotation' },
    });
    try {
      const firstResult = await create(first.token);
      expect(firstResult.statusCode).toBe(201);
      expect(firstResult.json().value.createdBy).toBe('rotation-agent');
      const next = store.rotate(first.credential.id, expiry, 30);
      expect(next.credential.principalId).toBe(first.credential.principalId);
      expect(next.token).not.toBe(first.token);
      expect(() => store.rotate(first.credential.id, expiry, 30)).toThrow();
      time = start + 29999;
      expect((await create(first.token)).json()).toEqual(firstResult.json());
      expect((await create(next.token)).json()).toEqual(firstResult.json());
      time = start + 30000;
      expect((await create(first.token)).statusCode).toBe(401);
      expect((await create(next.token)).json()).toEqual(firstResult.json());
      expect((await app.inject({ url: base + '/tasks', headers: asBearer(next.token) })).statusCode).toBe(403);
      const revoked = store.revoke(next.credential.id);
      expect(revoked.revokedAt).toBe(time);
      expect(store.revoke(next.credential.id)).toEqual(revoked);
      expect((await create(next.token)).statusCode).toBe(401);
      expect((await app.inject({ url: base + '/tasks?q=Only%20one%20task', headers: asBearer(ownerToken) })).json().value).toHaveLength(1);
    } finally {
      time = start;
    }
  });

  it('rejects expired and bogus agent keys without updating their activity', async () => {
    expect(() => store.create({ name: 'nobody', scopes: ['*'] }, expiry)).toThrow();
    expect(() => store.create({ name: 'nobody', scopes: ['tasks:read'] }, new Date(start).toISOString())).toThrow();
    const key = store.create({ name: 'expiring-agent', scopes: ['tasks:read'] }, new Date(start + 1000).toISOString());
    try {
      time = start + 1000;
      for (const token of [key.token, 'dla_' + '9'.repeat(43), 'dla_malformed']) {
        expect((await app.inject({ url: base + '/tasks', headers: asBearer(token) })).statusCode).toBe(401);
      }
      expect(store.list().find(item => item.id === key.credential.id)?.lastUsedAt).toBeNull();
    } finally {
      time = start;
    }
  });

  it('revokes all overlapping credentials for one agent without restarting the API', async () => {
    const first = store.create({ name: 'emergency-agent', scopes: ['tasks:read'] }, expiry);
    const next = store.rotate(first.credential.id, expiry, 30);
    const unaffected = store.create({ name: 'separate-agent', scopes: ['tasks:read'] }, expiry);
    const read = (token: string) => app.inject({ url: base + '/tasks', headers: asBearer(token) });
    for (const token of [first.token, next.token, unaffected.token]) {
      expect((await read(token)).statusCode).toBe(200);
    }

    const { principalId } = first.credential;
    expect(store.revokePrincipal(principalId)).toEqual({ principalId, revokedCredentials: 2 });
    expect(store.revokePrincipal(principalId)).toEqual({ principalId, revokedCredentials: 0 });
    expect(() => store.revokePrincipal(first.credential.id)).toThrow('Onbekende agent');
    expect((await read(first.token)).statusCode).toBe(401);
    expect((await read(next.token)).statusCode).toBe(401);
    expect((await read(unaffected.token)).statusCode).toBe(200);
    expect(() => store.rotate(next.credential.id, expiry, 30)).toThrow();
  });
});
