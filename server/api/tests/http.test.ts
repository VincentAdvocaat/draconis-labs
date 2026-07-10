import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('planner HTTP API', () => {
  let app: FastifyInstance;
  let tempDir: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'draconis-http-'));
    process.env.DATABASE_PATH = join(tempDir, 'test.db');
    process.env.DRACONIS_API_KEYS = 'test-agent:test-key';
    vi.resetModules();
    const { buildApp } = await import('../src/core/index.js');
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // SQLite WAL files may remain locked briefly on Windows.
    }
  });

  it('POST /api/v1/planner/tasks returns full task shape', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/planner/tasks',
      payload: { title: 'Integration test', labels: ['review'] },
    });

    expect(response.statusCode).toBe(201);
    const task = response.json();
    expect(task.title).toBe('Integration test');
    expect(task.labels).toEqual(['review']);
    expect(task.priority).toBe('normal');
    expect(task.version).toBe(1);
    expect(task.lane).toBe('todo');
  });

  it('legacy GET /api/planner/tasks sends deprecation headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/planner/tasks',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBe('true');
    expect(response.headers.sunset).toBe('2026-12-31');
    expect(response.headers.link).toContain('/api/v1');
  });

  it('uses user actor when no Bearer token is supplied', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/planner/tasks',
      payload: { title: 'Anonymous task' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().createdBy).toBe('user');
  });

  it('uses agent name when Bearer key is supplied', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/planner/tasks',
      headers: { authorization: 'Bearer test-key' },
      payload: { title: 'Agent task' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().createdBy).toBe('test-agent');
  });

  it('returns paginated list when page is set', async () => {
    for (let index = 0; index < 3; index += 1) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/planner/tasks',
        payload: { title: `Paged ${index}` },
      });
    }

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/planner/tasks?page=1&pageSize=2',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(2);
    expect(body.total).toBeGreaterThanOrEqual(3);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(2);
  });

  it('returns 409 on version conflict', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/planner/tasks',
      payload: { title: 'Conflict task' },
    });
    const task = created.json();

    const first = await app.inject({
      method: 'PATCH',
      url: `/api/v1/planner/tasks/${task.id}`,
      payload: { title: 'First edit', version: task.version },
    });
    expect(first.statusCode).toBe(200);

    const conflict = await app.inject({
      method: 'PATCH',
      url: `/api/v1/planner/tasks/${task.id}`,
      payload: { title: 'Stale edit', version: task.version },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().task.title).toBe('First edit');
  });

  it('GET /api/v1/system/info lists registered modules', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/system/info' });
    expect(response.statusCode).toBe(200);
    const names = response.json().modules.map((mod: { name: string }) => mod.name);
    expect(names).toContain('planner');
    expect(names).toContain('system');
  });
});
