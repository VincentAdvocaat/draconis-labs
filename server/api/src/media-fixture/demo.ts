import assert from 'node:assert/strict';
import { MediaContractError, type MediaReference } from './contracts.js';
import { createMediaFixture } from './fixture.js';

const fixture = createMediaFixture();
try {
  const { store } = fixture;
  const website = 'fixture-alpha';
  const ref: MediaReference = { assetId: 'photo', fileVersion: 1, usage: 'hero',
    altText: { nl: 'Een proefafbeelding', en: 'A fixture image' }, decorative: false };
  store.saveReferences(website, { module: 'cms', ownerId: 'home', revisionId: 'home-draft', expectedVersion: 0,
    references: [ref, { ...ref, usage: 'portfolio' }] });
  const release = store.resolveRelease(website, { releaseId: 'release-one', revisionId: 'home-draft', locales: ['nl', 'en'] });
  store.saveReferences(website, { module: 'cms', ownerId: 'home', revisionId: 'home-draft', expectedVersion: 1,
    references: [{ ...ref, fileVersion: 2 }] });
  assert.deepEqual(store.resolveRelease(website, {
    releaseId: 'release-one', revisionId: 'home-draft', locales: ['nl', 'en'],
  }), release);
  let purgeBlocked = false;
  try { store.purge(website, 'photo', 1, true); }
  catch (error) {
    if (!(error instanceof MediaContractError) || error.statusCode !== 409) throw error;
    purgeBlocked = true;
  }
  assert.ok(purgeBlocked);
  console.log(JSON.stringify({ fixtureRoot: fixture.root, twoUsesOneAsset: release.references.length === 2,
    pinnedVersion: release.references[0].fileVersion, purgeBlocked, usages: store.usages(website, 'photo'), release }, null, 2));
} finally {
  fixture.cleanup();
  console.log('Fixture database and files removed from checked temporary directory.');
}
