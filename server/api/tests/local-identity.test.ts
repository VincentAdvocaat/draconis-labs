import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createPlannerClient, createPlannerHttpTransport } from '@draconis/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalIdentity, localIdentityHost } from '../src/core/local-identity.js';

const config = {
  ownerId: 'test-owner',
  members: [
    { userId: 'test-editor', role: 'editor' },
    { userId: 'test-viewer', role: 'viewer' },
  ],
  sessions: [
    ['owner-token', 'test-owner'],
    ['owner-other-session', 'test-owner'],
    ['editor-token', 'test-editor'],
    ['viewer-token', 'test-viewer'],
    ['outside-token', 'test-outsider'],
    ['expired-token', 'test-owner'],
  ].map(([token, userId]) => ({
    tokenHash: createHash('sha256').update(token).digest('hex'),
    userId,
    expiresAt: token === 'expired-token' ? '2026-04-02T14:00:00Z' : '2026-04-02T15:00:00Z',
  })),
};
const now = () => Date.parse('2026-04-02T14:00:00Z');
const authorize = createLocalIdentity(config, now);
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
const base = '/api/v1/workspaces';
const workspace = base + '/local';

describe('protected Planner HTTP profile', () => {
  let app: FastifyInstance;
  let closeDb: () => void;

  beforeAll(async () => {
    vi.stubEnv('DATABASE_PATH', ':memory:');
    vi.stubEnv('DRACONIS_API_KEYS', 'fixture-agent:old-agent-key');
    const { buildApp } = await import('../src/core/index.js');
    const { sqlite } = await import('../src/core/db.js');
    closeDb = () => { sqlite.close(); };
    app = await buildApp(authorize);
  });

  afterAll(async () => {
    await app?.close();
    closeDb?.();
    vi.unstubAllEnvs();
  });

  it.each([
    undefined, 'Basic owner-token', 'Bearer unknown-token', 'Bearer expired-token', 'Bearer old-agent-key',
  ])('rejects a missing or invalid session before parsing a mutation (%s)', async authorization => {
    const headers = { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) };
    const response = await app.inject({ method: 'POST', url: workspace + '/tasks', payload: '{', headers });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED', status: 401 } });
  });

  it('enforces owner, editor and viewer permissions before looking up Planner records', async () => {
    const created = await app.inject({
      method: 'POST', url: workspace + '/tasks', headers: bearer('editor-token'), payload: { title: 'Test task' },
    });
    expect(created.statusCode).toBe(201);
    const task = created.json().value;
    expect(task.createdBy).toBe('test-editor');

    const taskPath = workspace + '/tasks/' + task.id;
    const updated = await app.inject({
      method: 'PATCH', url: taskPath, headers: bearer('editor-token'), payload: { lane: 'done', version: 1 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().value.lane).toBe('done');

    for (const route of ['/tasks', '/tasks?pagination=cursor&pageSize=1', '/history', '/preferences']) {
      expect((await app.inject({ url: workspace + route, headers: bearer('viewer-token') })).statusCode).toBe(200);
      expect((await app.inject({ url: workspace + route, headers: bearer('outside-token') })).statusCode).toBe(403);
    }
    const denied = await app.inject({ method: 'DELETE', url: taskPath, headers: bearer('editor-token') });
    expect(denied.statusCode).toBe(403);
    const deniedMissing = await app.inject({ method: 'DELETE', url: workspace + '/tasks/' + randomUUID(), headers: bearer('editor-token') });
    expect(deniedMissing.json()).toEqual(denied.json());
    const deniedPreferences = await app.inject({
      method: 'PATCH', url: workspace + '/preferences', headers: bearer('editor-token'), payload: { locale: 'en' },
    });
    expect(deniedPreferences.statusCode).toBe(403);

    const prefs = await app.inject({
      method: 'PATCH', url: workspace + '/preferences', headers: bearer('owner-token'), payload: { locale: 'en' },
    });
    expect(prefs.statusCode).toBe(200);
    expect(prefs.json()).toMatchObject({ value: { locale: 'en' } });
    expect((await app.inject({ method: 'DELETE', url: taskPath, headers: bearer('owner-token') })).statusCode).toBe(200);
  });

  it('rejects cross-workspace access across the REST operations before they can use local data', async () => {
    const headers = { ...bearer('owner-token'), 'idempotency-key': 'workspace-identity-regression' };
    const preferencesBefore = (await app.inject({ url: workspace + '/preferences', headers })).json();
    const creation = { method: 'POST' as const, payload: { title: 'Only local' } };
    const created = await app.inject({ ...creation, url: workspace + '/tasks', headers });
    expect(created.statusCode).toBe(201);
    const task = created.json().value;
    const taskPath = '/tasks/' + task.id;
    const other = base + '/other';
    for (const request of [
      { method: 'GET', url: '/tasks' },
      { method: 'GET', url: '/tasks?pagination=cursor&pageSize=1' },
      { method: 'HEAD', url: '/tasks' },
      { method: 'GET', url: '/history' },
      { method: 'GET', url: '/preferences' },
      { ...creation, url: '/tasks' },
      { method: 'PATCH', url: taskPath, payload: { title: 'Cross-workspace change', version: 1 } },
      { method: 'DELETE', url: taskPath },
      { method: 'PATCH', url: '/preferences', payload: { locale: 'nl' } },
    ] as const) {
      const response = await app.inject({ ...request, url: other + request.url, headers });
      expect(response.statusCode, request.method + ' ' + request.url).toBe(403);
      if (request.method !== 'HEAD') {
        expect(response.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN', status: 403 } });
      }
    }

    const replay = await app.inject({
      ...creation, url: workspace + '/tasks', headers: { ...headers, ...bearer('owner-other-session') },
    });
    expect(replay.statusCode).toBe(201);
    expect(replay.json().value).toEqual(task);
    expect((await app.inject({ url: workspace + '/tasks?q=Only%20local', headers })).json().value).toEqual([task]);
    expect((await app.inject({ url: workspace + '/preferences', headers })).json()).toEqual(preferencesBefore);
  });

  it('exposes the protected OpenAPI contract without compatibility routes around authorization', async () => {
    for (const url of ['/api/planner/tasks', '/api/v1/planner/tasks', workspace + '/contacts']) {
      for (const method of ['GET', 'POST'] as const) {
        expect((await app.inject({ method, url })).statusCode).toBe(404);
      }
    }
    const { paths } = (await app.inject('/api/v1/openapi.json')).json();
    const operations = Object.values(paths['/api/v1/workspaces/{workspaceId}/tasks']);
    for (const operation of operations) {
      expect(operation).toMatchObject({ security: [{ bearerAuth: [] }], responses: { '401': {}, '403': {} } });
    }
    const { modules } = (await app.inject('/api/v1/system/info')).json();
    expect(modules.map(({ name }: { name: string }) => name)).toEqual(['system', 'planner-workspaces']);
  });

  it('reports 403 through the shared Planner client', async () => {
    const fetcher: typeof fetch = async url => {
      const response = await app.inject({ url: String(url), headers: bearer('owner-token') });
      return new Response(response.body, { status: response.statusCode });
    };
    const client = createPlannerClient(createPlannerHttpTransport('', fetcher), 'other');
    await expect(client.list()).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });
});

it('validates local identity configuration and refuses non-loopback listeners', () => {
  expect(() => createLocalIdentity({ ...config, members: [{ userId: config.ownerId, role: 'viewer' }] }, now)).toThrow();
  expect(() => createLocalIdentity({ ...config, sessions: [config.sessions[0], config.sessions[0]] }, now)).toThrow();
  expect(localIdentityHost(undefined)).toBe('127.0.0.1');
  expect(localIdentityHost('::1')).toBe('::1');
  expect(() => localIdentityHost('0.0.0.0')).toThrow();
});
