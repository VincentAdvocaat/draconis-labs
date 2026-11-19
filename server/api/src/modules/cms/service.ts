import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CmsError, render, type Attempt, type ReleaseInput } from './model.js';
import { CmsRepository } from './repository.js';
import type { CmsMedia } from './media.js';
import { MediaContractError } from '../../media-fixture/contracts.js';
import type { CmsUploads } from './upload.js';

export interface BuildHooks {
  beforeBuild?: () => Promise<void>;
  beforeActivate?: () => Promise<void>;
  afterActivate?: () => Promise<void>;
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export class CmsService {
  constructor(readonly repository: CmsRepository, readonly releasesRoot: string, private hooks: BuildHooks = {},
    readonly media?: CmsMedia, private mediaUnavailable = false, readonly uploads?: CmsUploads, readonly uploadEnabled = false) {}

  private requireMedia(): void {
    if (!this.media) throw new CmsError(this.mediaUnavailable ? 503 : 409,
      this.mediaUnavailable ? 'Mediaopslag niet beschikbaar. Herstel de mediamap en herstart de proef.' : 'Media-adapter niet ingeschakeld');
  }

  preview(websiteId: string, revisionId: string): string {
    const values = this.repository.revision(websiteId, revisionId);
    const mediaRevision = this.repository.mediaRevision(websiteId, revisionId);
    if (mediaRevision) this.requireMedia();
    return render(values, mediaRevision ? this.uploads && values.image
      ? this.uploads.preview(websiteId, values.image) : this.media!.preview(websiteId, mediaRevision) : undefined);
  }

  async publish(websiteId: string, input: ReleaseInput, key: string, actor: string): Promise<Attempt> {
    const start = this.repository.begin(websiteId, input, key, actor);
    if (!start.created) return start.attempt;
    const attempt = start.attempt;
    try {
      await this.hooks.beforeBuild?.();
      const mediaRevision = this.repository.mediaRevision(websiteId, input.revisionId);
      if (mediaRevision) this.requireMedia();
      const values = this.repository.revision(websiteId, input.revisionId);
      if (values.image && this.uploads) this.uploads.requireApproval(websiteId, values.image.assetId);
      const image = mediaRevision ? this.media!.resolve(websiteId, mediaRevision, attempt.releaseId) : undefined;
      const html = render(values,
        image ? { src: `media/${attempt.releaseId}/hero.${image.extension}`, alt: image.alt } : undefined);
      const siteRoot = join(this.releasesRoot, websiteId);
      const staging = join(siteRoot, `.staging-${randomUUID()}`);
      const complete = join(siteRoot, attempt.releaseId);
      await mkdir(staging, { recursive: true });
      await writeFile(join(staging, 'index.html'), html, { flag: 'wx', flush: true });
      const files: Record<string, string> = { 'index.html': sha256(html) };
      if (image) {
        await mkdir(join(staging, 'media', attempt.releaseId), { recursive: true });
        await writeFile(join(staging, 'media', attempt.releaseId, `hero.${image.extension}`), image.bytes, { flag: 'wx', flush: true });
        files[`media/${attempt.releaseId}/hero.${image.extension}`] = createHash('sha256').update(image.bytes).digest('hex');
      }
      const manifest = JSON.stringify({ schemaVersion: 1, websiteId, releaseId: attempt.releaseId,
        revisionId: input.revisionId, template: 'plain-page@3', files,
        ...(image ? { media: image.manifest } : {}) });
      await writeFile(join(staging, 'release.json'), manifest, { flag: 'wx', flush: true });
      if (sha256(await readFile(join(staging, 'index.html'), 'utf8')) !== sha256(html)) {
        throw new Error('Output validation failed');
      }
      await rename(staging, complete);
      await this.hooks.beforeActivate?.();
      const activated = this.repository.activate(attempt);
      await this.hooks.afterActivate?.();
      return activated;
    } catch (error) {
      // A failure after a committed activation cannot downgrade or undo the published release.
      this.repository.finish(attempt, 'failed', error instanceof MediaContractError ? 'media_not_publishable'
        : error instanceof CmsError && error.statusCode === 503 ? 'media_unavailable' : 'build_failed');
      return this.repository.attempt(websiteId, attempt.releaseId);
    }
  }

  async publicHtml(websiteId: string): Promise<string> {
    this.publicSite(websiteId);
    const active = this.repository.active(websiteId);
    if (!active.activeReleaseId) throw new CmsError(404, 'Nog geen gepubliceerde pagina');
    return (await this.releaseBytes(websiteId, active.activeReleaseId, 'index.html')).toString('utf8');
  }

  private publicSite(websiteId: string): void {
    if (!['demo-cms', 'demo-other'].includes(websiteId)) throw new CmsError(404, 'Website niet gevonden');
  }

  async publicImage(websiteId: string, releaseId: string, filename = 'hero.png'): Promise<Buffer> {
    this.publicSite(websiteId);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(releaseId)) throw new CmsError(404, 'Publicatie niet gevonden');
    if (!['hero.png', 'hero.jpg', 'hero.webp'].includes(filename)) throw new CmsError(404, 'Afbeelding niet gevonden');
    return this.releaseBytes(websiteId, releaseId, `media/${releaseId}/${filename}`);
  }

  private async releaseBytes(websiteId: string, releaseId: string, file: string): Promise<Buffer> {
    // Only successful retained releases are public. Never expose a complete but failed build.
    const attempt = this.repository.attempt(websiteId, releaseId);
    if (attempt.status !== 'published') throw new CmsError(404, 'Publicatie niet beschikbaar');
    try {
      const root = join(this.releasesRoot, websiteId, releaseId);
      const manifest = JSON.parse(await readFile(join(root, 'release.json'), 'utf8')) as { files: Record<string, string> };
      if (!manifest.files[file]) throw new CmsError(404, 'Bestand niet opgenomen in deze publicatie');
      const bytes = await readFile(join(root, file));
      if (manifest.files[file] !== createHash('sha256').update(bytes).digest('hex')) throw new Error('Checksum mismatch');
      return bytes;
    } catch (error) {
      if (error instanceof CmsError) throw error;
      throw new CmsError(503, 'Gepubliceerde pagina tijdelijk niet beschikbaar');
    }
  }
}
