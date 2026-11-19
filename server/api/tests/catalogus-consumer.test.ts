import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checksum } from '../src/media-fixture/storage.js';
import { CatalogSnapshotConsumer, type CatalogActivationOutcome } from '../src/catalogus/consumer.js';
import { createCatalogConsumerFixture } from '../src/catalogus/consumer-fixture.js';

describe('catalog consumer pins and two independent databases', () => {
  let fixture: ReturnType<typeof createCatalogConsumerFixture>;
  let cms: Database.Database;
  beforeEach(() => {
    fixture = createCatalogConsumerFixture();
    cms = new Database(join(fixture.root, 'cms-activation-fixture.sqlite'));
    cms.pragma('synchronous = FULL');
    // A minimal external consumer fixture, deliberately not a copy of the CMS implementation.
    cms.exec("CREATE TABLE attempts(id TEXT PRIMARY KEY,status TEXT); CREATE TABLE pointer(id TEXT); INSERT INTO pointer VALUES('previous-release');");
  });
  afterEach(() => { cms.close(); fixture.cleanup(); });
  function active() { return (cms.prepare('SELECT id FROM pointer').get() as { id: string }).id; }
  function activate(): CatalogActivationOutcome {
    cms.transaction(() => {
      cms.prepare("INSERT INTO attempts VALUES(?,'published')").run('cms-attempt-one');
      cms.prepare('UPDATE pointer SET id=?').run('cms-attempt-one');
    }).immediate();
    return { status: 'published', activationId: 'cms-attempt-one' };
  }
  function pin() { return fixture.consumer.preparePin(fixture.website, fixture.request()); }

  it('prepares durable idempotent immutable owner references and scopes reads to a website', () => {
    const first = pin();
    expect(pin()).toEqual(first);
    expect(fixture.consumer.listPins(fixture.website, { module: 'cms', attemptId: 'cms-attempt-one' })).toEqual([first]);
    expect(fixture.consumer.listPins(fixture.website, { ownerId: 'another-page' })).toEqual([]);
    expect(() => fixture.consumer.getPin('fixture-beta', first.pinId)).toThrow('not found');
    expect(() => fixture.consumer.preparePin('fixture-beta', fixture.request())).toThrow('another website');
    expect(() => fixture.consumer.preparePin(fixture.website, fixture.request(fixture.en))).toThrow('already pins');
    expect(fixture.media.usages(fixture.website, 'photo')).toContainEqual(expect.objectContaining({ kind: 'release', owner: `consumer-${first.pinId}-${fixture.item.itemId}` }));
    fixture.consumer.close();
    const reopened = new CatalogSnapshotConsumer(fixture.root);
    try { expect(reopened.getPin(fixture.website, first.pinId)).toEqual(first); } finally { reopened.close(); }
  });

  it('rejects checksum and locale substitutions without retaining partial pins', () => {
    expect(() => fixture.consumer.preparePin(fixture.website, { ...fixture.request(), checksum: '0'.repeat(64) })).toThrow('checksum');
    expect(() => fixture.consumer.preparePin(fixture.website, { ...fixture.request(), localeContext: { defaultLocale: 'nl', locale: 'en' } })).toThrow('locale');
    expect(fixture.consumer.listPins(fixture.website)).toEqual([]);
  });

  it('materializes the frozen EN snapshot and clean hashed derivative bytes', () => {
    const prepared = fixture.consumer.preparePin(fixture.website, fixture.request(fixture.en));
    const result = fixture.consumer.materialize(fixture.website, prepared.pinId);
    expect(result.snapshot.items[0]).toMatchObject({ title: 'Red sample', description: 'Nederlandse beschrijving' });
    expect(result.files).toHaveLength(1);
    expect(checksum(result.files[0].bytes)).toBe(result.files[0].checksum);
    expect(result.files[0]).not.toHaveProperty('path');
    expect(JSON.stringify(result)).not.toContain('private/');
  });

  it.each(['rights', 'withdrawal', 'bytes', 'fileVersion'] as const)('rechecks %s after async build and prevents activation', async change => {
    const prepared = pin();
    fixture.consumer.materialize(fixture.website, prepared.pinId);
    await Promise.resolve(); // CMS async build boundary is outside the synchronous gate.
    if (change === 'rights') fixture.catalog.setRights(fixture.website, 'photo', { expectedVersion: 2, status: 'blocked',
      owner: 'Test', source: 'Synthetic', basis: 'Test block', employee: 'Test', confirmed: true });
    if (change === 'withdrawal') fixture.catalog.withdraw(fixture.website, fixture.nl.snapshotId,
      { expectedVersion: 1, confirmed: true, employee: 'Test', reason: 'Test withdrawal during build' });
    if (change === 'bytes') writeFileSync(join(fixture.root, fixture.nl.items[0].resolvedMedia.variants[0].path), 'changed');
    if (change === 'fileVersion') {
      const db = new Database(join(fixture.root, 'media.sqlite'));
      db.prepare("UPDATE files SET state='failed' WHERE website=? AND asset='photo' AND version=1").run(fixture.website); db.close();
    }
    let called = false;
    expect(() => fixture.consumer.finalize(fixture.website, [prepared.pinId], () => { called = true; return activate(); })).toThrow();
    expect(called).toBe(false);
    expect(active()).toBe('previous-release');
    expect(fixture.consumer.getPin(fixture.website, prepared.pinId).state).toBe('prepared');
  });

  it('keeps prepared references if activation throws before the external commit', () => {
    const prepared = pin();
    expect(() => fixture.consumer.finalize(fixture.website, [prepared.pinId], () => { throw new Error('before activation'); })).toThrow('before activation');
    expect(active()).toBe('previous-release');
    expect(fixture.consumer.reconcile(fixture.website, [prepared.pinId], () => ({ status: 'not-published' })).pins[0].state).toBe('prepared');
    expect(() => fixture.media.purge(fixture.website, 'photo')).toThrow();
  });

  it('reconciles the durable CMS commit when the media transaction rolls back after activation', () => {
    const prepared = pin();
    expect(() => fixture.consumer.finalize(fixture.website, [prepared.pinId], () => { activate(); throw new Error('crash gap'); })).toThrow('crash gap');
    expect(active()).toBe('cms-attempt-one');
    expect(fixture.consumer.getPin(fixture.website, prepared.pinId).state).toBe('prepared');
    fixture.consumer.close(); cms.close();
    cms = new Database(join(fixture.root, 'cms-activation-fixture.sqlite'));
    const reopened = new CatalogSnapshotConsumer(fixture.root);
    try {
      expect(reopened.reconcile(fixture.website, [prepared.pinId], () => ({ status: 'unknown' })).pins[0].state).toBe('prepared');
      const result = reopened.reconcile(fixture.website, [prepared.pinId], owner => {
        const row = cms.prepare('SELECT status FROM attempts WHERE id=?').get(owner.attemptId) as { status: 'published' };
        return { status: row.status, activationId: owner.attemptId };
      });
      expect(result.pins[0]).toMatchObject({ state: 'activated', activationId: 'cms-attempt-one', version: 2 });
      expect(reopened.reconcile(fixture.website, [prepared.pinId], () => ({ status: 'published', activationId: 'cms-attempt-one' })).pins[0].version).toBe(2);
    } finally { reopened.close(); }
  });

  it('finalizes every portfolio slot under one write lock with exactly one activation callback', () => {
    const first = pin();
    const second = fixture.consumer.preparePin(fixture.website, fixture.request(fixture.en, { slot: 'portfolio-two' }));
    let calls = 0;
    const callback = () => {
      calls++;
      const writer = new Database(join(fixture.root, 'media.sqlite'), { timeout: 1 });
      try { expect(() => writer.prepare("UPDATE assets SET rights='blocked'").run()).toThrow('locked'); } finally { writer.close(); }
      return activate();
    };
    expect(fixture.consumer.finalize(fixture.website, [first.pinId, second.pinId], callback).pins.map(p => p.state)).toEqual(['activated', 'activated']);
    fixture.consumer.finalize(fixture.website, [first.pinId, second.pinId], callback);
    expect(calls).toBe(1);
    expect(active()).toBe('cms-attempt-one');
  });

  it('rejects mixed attempts, draft activation, asynchronous callbacks and mismatched activation IDs', () => {
    const first = pin();
    const other = fixture.consumer.preparePin(fixture.website, fixture.request(fixture.en, { attemptId: 'other-attempt' }));
    const draft = fixture.consumer.preparePin(fixture.website, fixture.request(fixture.nl, { kind: 'draft', slot: 'draft' }));
    expect(() => fixture.consumer.finalize(fixture.website, [first.pinId, other.pinId], activate)).toThrow('same consumer');
    expect(() => fixture.consumer.finalize(fixture.website, [draft.pinId], activate)).toThrow('same consumer');
    const asyncCallback = async () => activate();
    expect(() => fixture.consumer.finalize(fixture.website, [first.pinId], asyncCallback as unknown as typeof activate)).toThrow('synchronous');
    expect(active()).toBe('previous-release');
    expect(() => fixture.consumer.finalize(fixture.website, [first.pinId], () => Promise.resolve({ status: 'published', activationId: 'x' }) as unknown as CatalogActivationOutcome)).toThrow('Promise');
    expect(() => fixture.consumer.finalize(fixture.website, [first.pinId], () => ({ status: 'published', activationId: 'wrong' }))).toThrow('does not match');
    expect(fixture.consumer.getPin(fixture.website, first.pinId).state).toBe('prepared');
  });

  it('retains consumer references independently of source usage rows and supports same-process handles', () => {
    const prepared = pin();
    const another = new CatalogSnapshotConsumer(fixture.root);
    another.close();
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      db.pragma('foreign_keys = ON');
      expect(() => db.prepare('DELETE FROM catalog_snapshots WHERE id=?').run(fixture.nl.snapshotId)).toThrow('FOREIGN KEY');
      db.prepare("DELETE FROM usages WHERE owner NOT LIKE 'consumer-%'").run();
    } finally { db.close(); }
    expect(() => fixture.media.purge(fixture.website, 'photo')).toThrow();
    expect(fixture.consumer.getPin(fixture.website, prepared.pinId).state).toBe('prepared');
    expect(JSON.parse(readFileSync(join(fixture.root, '.catalog-consumer-owner.json'), 'utf8')).pid).toBe(process.pid);
  });

  it('refuses a second consumer process without terminating it or the owning process', () => {
    const module = pathToFileURL(join(process.cwd(), 'src/catalogus/consumer.ts')).href;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
      `import { CatalogSnapshotConsumer } from ${JSON.stringify(module)}; new CatalogSnapshotConsumer(${JSON.stringify(fixture.root)});`],
    { cwd: process.cwd(), windowsHide: true, encoding: 'utf8', timeout: 10000 });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('owned by another process');
    expect(pin().state).toBe('prepared');
  });

  it('recovers retained prepared pins after a real child-process exit between the two commits', () => {
    const prepared = pin();
    fixture.consumer.close(); cms.close();
    const module = pathToFileURL(join(process.cwd(), 'src/catalogus/consumer.ts')).href;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import { CatalogSnapshotConsumer } from ${JSON.stringify(module)};
      import Database from 'better-sqlite3';
      const consumer = new CatalogSnapshotConsumer(${JSON.stringify(fixture.root)});
      const cms = new Database(${JSON.stringify(join(fixture.root, 'cms-activation-fixture.sqlite'))});
      cms.pragma('synchronous = FULL');
      consumer.finalize('fixture-alpha', [${JSON.stringify(prepared.pinId)}], () => {
        cms.transaction(() => {
          cms.prepare("INSERT INTO attempts VALUES('cms-attempt-one','published')").run();
          cms.prepare("UPDATE pointer SET id='cms-attempt-one'").run();
        }).immediate();
        process.exit(0); // own fixture child only; skips consumer commit and close handlers
      });`], { cwd: process.cwd(), windowsHide: true, encoding: 'utf8', timeout: 10000 });
    cms = new Database(join(fixture.root, 'cms-activation-fixture.sqlite'));
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(active()).toBe('cms-attempt-one');
    const reopened = new CatalogSnapshotConsumer(fixture.root);
    try {
      expect(reopened.getPin(fixture.website, prepared.pinId).state).toBe('prepared');
      expect(reopened.reconcile(fixture.website, [prepared.pinId], owner => {
        const attempt = cms.prepare('SELECT status FROM attempts WHERE id=?').get(owner.attemptId) as { status: 'published' };
        return { status: attempt.status, activationId: owner.attemptId };
      }).pins[0].state).toBe('activated');
      expect(() => fixture.media.purge(fixture.website, 'photo')).toThrow();
    } finally { reopened.close(); }
  });
});
