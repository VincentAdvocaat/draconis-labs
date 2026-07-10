import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applicationManifestSchema } from '../src/schemas/manifest.js';

const templateRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'templates', 'app');

describe('application template', () => {
  it('manifest.json satisfies applicationManifestSchema', () => {
    const manifest = JSON.parse(
      readFileSync(join(templateRoot, 'manifest.json'), 'utf8'),
    );
    expect(applicationManifestSchema.parse(manifest)).toMatchObject({
      id: 'example-app',
      name: 'Example App',
    });
  });

  it('does not reference planner package', () => {
    const pkg = readFileSync(join(templateRoot, 'package.json'), 'utf8');
    expect(pkg).not.toContain('@draconis/planner');
    expect(pkg).toContain('@draconis/ui');
    expect(pkg).toContain('@draconis/shared');
  });
});
