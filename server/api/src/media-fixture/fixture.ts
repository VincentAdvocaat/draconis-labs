import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { checksum, MediaFixtureStore } from './storage.js';
import type { PublicVariant } from './contracts.js';
import { assertFixtureRoot } from './safety.js';

export const FIXTURE_WEBSITES = ['fixture-alpha', 'fixture-beta'];

/** A fixed 1x1 PNG. This is a safe test derivative, not an upload processor. */
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');

export function createMediaFixture({ seed = true } = {}) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'draconis-media-fixture-'));
  const token = randomUUID();
  writeFileSync(join(root, '.media-fixture'), token, { flag: 'wx' });
  const store = new MediaFixtureStore(root, FIXTURE_WEBSITES);
  const db = new Database(join(root, 'media.sqlite'));
  db.pragma('foreign_keys = ON');
  try {
    const asset = db.prepare('INSERT INTO assets(website,id,rights) VALUES(?,?,?)');
    const file = db.prepare('INSERT INTO files VALUES(?,?,?,?,?)');
    for (const website of seed ? FIXTURE_WEBSITES : []) {
      for (const [id, state, rights] of [
        ['photo', 'ready', 'cleared'], ['pending', 'processing', 'cleared'],
        ['unlicensed', 'ready', 'unknown'], ['blocked', 'ready', 'blocked'],
      ] as const) {
        asset.run(website, id, rights);
        for (const version of [1, 2]) {
          const publicPath = `public/${website}/${id}/${version}/tiny.png`;
          const privatePath = join(root, 'private', website, id, String(version), 'original.png');
          mkdirSync(dirname(join(root, publicPath)), { recursive: true });
          mkdirSync(dirname(privatePath), { recursive: true });
          writeFileSync(join(root, publicPath), png);
          writeFileSync(privatePath, png);
          const variants: PublicVariant[] = [{ path: publicPath, mime: 'image/png', bytes: png.length,
            width: 1, height: 1, checksum: checksum(png) }];
          file.run(website, id, version, state, JSON.stringify(variants));
        }
      }
    }
  } finally { db.close(); }
  let closed = false;
  return {
    root, store,
    close() { if (!closed) { store.close(); closed = true; } },
    cleanup() {
      // Resolve and check the final target before recursive removal, including on Windows.
      const target = assertFixtureRoot(root);
      if (readFileSync(join(target, '.media-fixture'), 'utf8') !== token)
        throw new Error('Fixture ownership marker changed; refusing cleanup');
      this.close();
      rmSync(target, { recursive: true });
    },
  };
}
