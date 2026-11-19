import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createMediaFixture, FIXTURE_WEBSITES } from '../../media-fixture/fixture.js';
import { MediaFixtureStore } from '../../media-fixture/storage.js';
import type { MediaReference } from '../../media-fixture/contracts.js';
import { CmsError } from './model.js';

/** Server-owned mapping between the two fixture namespaces; never supplied by the browser. */
const sites: Record<string, string> = { 'demo-cms': 'fixture-alpha', 'demo-other': 'fixture-beta' };

export class CmsMedia {
  readonly store: MediaFixtureStore;
  readonly root: string;
  constructor(runtimeRoot: string, existingRoot?: string) {
    const pointer = join(runtimeRoot, 'media-root.json');
    if (existingRoot) {
      this.root = existingRoot;
      this.store = new MediaFixtureStore(existingRoot, FIXTURE_WEBSITES);
    } else if (existsSync(pointer)) {
      this.root = (JSON.parse(readFileSync(pointer, 'utf8')) as { root: string }).root;
      this.store = new MediaFixtureStore(this.root, FIXTURE_WEBSITES);
    } else {
      const fixture = createMediaFixture();
      this.root = fixture.root;
      this.store = fixture.store;
      // Retain fixture bytes across process restarts. No cleanup or purge in the CMS runtime.
      writeFileSync(pointer, JSON.stringify({ root: this.root }), { flag: 'wx' });
    }
  }
  websiteScope(websiteId: string): string {
    const site = sites[websiteId];
    if (!site) throw new CmsError(404, 'Website niet gevonden');
    return site;
  }
  register(websiteId: string, revisionId: string, image: MediaReference | null,
    previousImage: MediaReference | null, previousMediaRevision: string | null): string | null {
    if (!image) return null;
    // Text-only revisions reuse the retained reference snapshot. An archived existing
    // image is not accidentally treated as a new selection when only text changes.
    if (previousMediaRevision && JSON.stringify(image) === JSON.stringify(previousImage)) return previousMediaRevision;
    this.store.saveReferences(this.websiteScope(websiteId), { module: 'cms', ownerId: 'home',
      revisionId, expectedVersion: 0, references: [image] });
    return revisionId;
  }
  resolve(websiteId: string, mediaRevisionId: string, snapshotId: string) {
    const manifest = this.store.resolveRelease(this.websiteScope(websiteId), {
      releaseId: snapshotId, revisionId: mediaRevisionId, locales: ['nl'],
    });
    const image = manifest.references[0];
    if (manifest.references.length !== 1 || image.usage !== 'hero') {
      throw new CmsError(409, 'Deze proef ondersteunt één publieke afbeelding');
    }
    // The reviewed media resolver validates public paths, symlinks, rights and bytes first.
    const variant = image.variants.find((v) => v.mime === 'image/png')
      ?? image.variants.find((v) => v.mime === 'image/jpeg')
      ?? image.variants.find((v) => v.mime === 'image/webp');
    if (!variant) throw new CmsError(409, 'Geen ondersteunde publieke derivative');
    const bytes = readFileSync(join(this.root, variant.path));
    if (bytes.length !== variant.bytes || createHash('sha256').update(bytes).digest('hex') !== variant.checksum) {
      throw new CmsError(409, 'Afbeelding gewijzigd tijdens lezen');
    }
    const extension = variant.mime === 'image/png' ? 'png' : variant.mime === 'image/jpeg' ? 'jpg' : 'webp';
    return { manifest, bytes, alt: image.decorative ? '' : image.altText.nl, mime: variant.mime, extension };
  }
  preview(websiteId: string, mediaRevisionId: string): { src: string; alt: string } {
    const resolved = this.resolve(websiteId, mediaRevisionId, `preview-${mediaRevisionId}`);
    return { src: `data:${resolved.mime};base64,${resolved.bytes.toString('base64')}`, alt: resolved.alt };
  }
  close(): void { this.store.close(); }
}
