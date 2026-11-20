import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/core/index.js';

const snapshotPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi', 'v1.snapshot.json');

describe('OpenAPI contract', () => {
  it('matches committed v1 snapshot', async () => {
    expect(existsSync(snapshotPath)).toBe(true);

    const app = await buildApp();
    const spec = app.swagger();
    await app.close();

    const expected = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    expect(spec).toEqual(expected);
  });

  it('keeps every pre-workspace path schema identical', async () => {
    const baseline = JSON.parse(readFileSync(new URL('./fixtures/pre-workspace-openapi-sha256.json', import.meta.url), 'utf8')) as Record<string, string>;
    const app = await buildApp();
    const spec = JSON.parse(JSON.stringify(app.swagger())) as { paths: Record<string, unknown> };
    await app.close();
    function canonical(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(canonical);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]));
      return value;
    }
    for (const [path, expected] of Object.entries(baseline)) {
      const digest = createHash('sha256').update(JSON.stringify(canonical(spec.paths[path]))).digest('hex');
      expect(digest, path).toBe(expected);
    }
    expect(spec.paths).toHaveProperty('/api/v1/workspaces/{workspaceId}/tasks');
    expect(spec.paths).not.toHaveProperty('/api/workspaces/{workspaceId}/tasks');
  });

  it('documents versioned planner paths', async () => {
    const app = await buildApp();
    const spec = app.swagger() as { paths?: Record<string, unknown> };
    await app.close();

    expect(spec.paths).toHaveProperty('/api/v1/planner/tasks');
    expect(spec.paths).toHaveProperty('/api/v1/system/info');
  });

  it('documents only path parameters present in each workspace URL', async () => {
    const app = await buildApp();
    try {
      const spec = app.swagger() as { paths?: Record<string, Record<string, {
        parameters?: Array<{ in: string; name: string; required: boolean }>;
      }>> };
      const workspacePaths = Object.entries(spec.paths ?? {}).filter(([path]) => path.startsWith('/api/v1/workspaces/'));
      expect(workspacePaths.length).toBeGreaterThan(0);
      for (const [path, operations] of workspacePaths) {
        const expected = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort();
        for (const operation of Object.values(operations)) {
          const declared = operation.parameters?.filter(parameter => parameter.in === 'path') ?? [];
          expect(declared.map(parameter => parameter.name).sort(), path).toEqual(expected);
          expect(declared.every(parameter => parameter.required), path).toBe(true);
        }
      }
    } finally {
      await app.close();
    }
  });
});
