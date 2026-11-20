import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applicationManifestSchema, applicationManifestsSchema } from '../src/index.js';

const local = { name: 'local', baseUrl: 'http://localhost:5180/' } as const;
const manifest = {
  id: 'sample-app', name: 'Sample app', description: 'An example application.', version: '0.1.0',
  owner: 'platform-team', launchUrl: local.baseUrl, iconUrl: 'http://localhost:5180/favicon.svg',
  healthUrl: 'http://127.0.0.1:3001/health', permissions: ['sample.read'], environments: [local],
};

describe('application manifest validation', () => {
  it('accepts the full manifest, including local HTTP and HTTPS environment URLs', () => {
    const withProduction = {
      ...manifest,
      environments: [...manifest.environments, { name: 'production', baseUrl: 'https://app.example.com/' }],
    };
    expect(applicationManifestSchema.parse(withProduction)).toEqual(withProduction);
  });

  it.each([
    ['missing health URL', { healthUrl: undefined }],
    ['relative launch URL', { launchUrl: '/planner' }],
    ['malformed launch URL', { launchUrl: 'https:///planner.example.com' }],
    ['launch URL with whitespace', { launchUrl: 'https://planner.example.com\n' }],
    ['launch URL with credentials', { launchUrl: 'https://alice:password@example.com/' }],
    ['non-web icon URL', { iconUrl: 'file:///private/icon.svg' }],
    ['non-web health URL', { healthUrl: 'mailto:admin@example.com' }],
    ['non-web environment URL', { environments: [{ ...local, baseUrl: 'ftp://example.com/' }] }],
    ['duplicate environment names', { environments: [local, { ...local, baseUrl: 'http://localhost:5181/' }] }],
  ])('rejects %s', (_name, changes) => {
    expect(applicationManifestSchema.safeParse({ ...manifest, ...changes }).success).toBe(false);
  });

  it('rejects two valid registrations with the same ID and points to the second ID', () => {
    const result = applicationManifestsSchema.safeParse([manifest, { ...manifest, name: 'Duplicate' }]);
    expect(result).toMatchObject({ success: false, error: { issues: [{ path: [1, 'id'] }] } });
    expect(applicationManifestsSchema.parse([manifest, { ...manifest, id: 'other-app' }])).toHaveLength(2);
  });

  it('validates the checked-in web app registrations together', () => {
    const apps = fileURLToPath(new URL('../../../apps/', import.meta.url));
    const files = readdirSync(apps, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(apps, entry.name, 'manifest.json'))
      .filter(file => existsSync(file));

    expect(files).toEqual(expect.arrayContaining([join(apps, 'cms', 'manifest.json'), join(apps, 'planner', 'manifest.json')]));
    const manifests = files.map(file => {
      try { return JSON.parse(readFileSync(file, 'utf8')) as unknown; }
      catch (cause) { throw new Error(`Could not read application manifest ${file}`, { cause }); }
    });
    expect(applicationManifestsSchema.safeParse(manifests), `Application manifests in order: ${files.join(', ')}`)
      .toMatchObject({ success: true });
  });
});
