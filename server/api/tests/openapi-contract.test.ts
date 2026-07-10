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

  it('documents versioned planner paths', async () => {
    const app = await buildApp();
    const spec = app.swagger() as { paths?: Record<string, unknown> };
    await app.close();

    expect(spec.paths).toHaveProperty('/api/v1/planner/tasks');
    expect(spec.paths).toHaveProperty('/api/v1/system/info');
  });
});
