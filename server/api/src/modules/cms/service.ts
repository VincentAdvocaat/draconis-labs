import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { CmsError, render, type Attempt, type ReleaseInput } from './model.js';
import { CmsRepository } from './repository.js';
import type { CmsMedia } from './media.js';
import { MediaContractError } from '../../media-fixture/contracts.js';
import type { CmsUploads } from './upload.js';
import type { CmsDocuments, RenderedSite } from './documents.js';

export interface BuildHooks {
  beforeBuild?: () => Promise<void>;
  beforeActivate?: () => Promise<void>;
  afterActivate?: () => Promise<void>;
}
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

export class CmsService {
  constructor(readonly repository: CmsRepository, readonly releasesRoot: string, private hooks: BuildHooks = {},
    readonly media?: CmsMedia, private mediaUnavailable = false, readonly uploads?: CmsUploads, readonly uploadEnabled = false,
    readonly documents?: CmsDocuments) {}

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

  private legacyBuild(websiteId: string, input: ReleaseInput, releaseId: string): RenderedSite {
    const mediaRevision = this.repository.mediaRevision(websiteId, input.revisionId);
    if (mediaRevision) this.requireMedia();
    const values = this.repository.revision(websiteId, input.revisionId);
    const validate = () => {
      if (values.image && this.uploads) this.uploads.requireApproval(websiteId, values.image.assetId);
      return mediaRevision ? this.media!.resolve(websiteId, mediaRevision, releaseId) : undefined;
    };
    const image = validate();
    const html = render(values, image ? { src: `media/${releaseId}/hero.${image.extension}`, alt: image.alt } : undefined);
    return { files: [{ path: 'index.html', bytes: Buffer.from(html) },
      ...(image ? [{ path: `media/${releaseId}/hero.${image.extension}`, bytes: image.bytes }] : [])],
      metadata: { template: 'plain-page@3', ...(image ? { media: image.manifest } : {}) },
      revalidate: () => { validate(); } };
  }

  async publish(websiteId: string, input: ReleaseInput, key: string, actor: string): Promise<Attempt> {
    const start = this.repository.begin(websiteId, input, key, actor);
    if (!start.created) return start.attempt;
    const attempt = start.attempt;
    try {
      this.documents?.preparePortfolio(websiteId, attempt.releaseId);
      await this.hooks.beforeBuild?.();
      const output = this.documents ? this.documents.build(websiteId, attempt.releaseId)
        : this.legacyBuild(websiteId, input, attempt.releaseId);
      const siteRoot = join(this.releasesRoot, websiteId);
      const staging = join(siteRoot, `.staging-${randomUUID()}`);
      const complete = join(siteRoot, attempt.releaseId);
      await mkdir(staging, { recursive: true });
      const files: Record<string, string> = {};
      if (new Set(output.files.map((file) => file.path)).size !== output.files.length) throw new CmsError(400, 'Dubbel uitvoerpad');
      for (const file of output.files) {
        const target = join(staging, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.bytes, { flag: 'wx', flush: true });
        files[file.path] = sha256(file.bytes);
        if (sha256(await readFile(target)) !== files[file.path]) throw new Error('Output validation failed');
      }
      const manifest = JSON.stringify({ schemaVersion: 1, websiteId, releaseId: attempt.releaseId,
        revisionId: input.revisionId, ...output.metadata, files });
      await writeFile(join(staging, 'release.json'), manifest, { flag: 'wx', flush: true });
      await rename(staging, complete);
      await this.hooks.beforeActivate?.();
      // The supported local writer model is one owning CMS process. All rights routes
      // run on this event loop. No await may separate this final synchronous validation
      // (including ready, exact variants/hash and current approval) from pointer activation.
      // Multiple independent writer processes need a shared transaction/lock protocol.
      output.revalidate();
      const activated = output.activate ? output.activate(() => this.repository.activate(attempt)) : this.repository.activate(attempt);
      await this.hooks.afterActivate?.();
      return activated;
    } catch (error) {
      // A failure after a committed activation cannot downgrade or undo the published release.
      this.repository.finish(attempt, 'failed', error instanceof MediaContractError ? 'media_not_publishable'
        : error instanceof CmsError && error.statusCode === 503 ? 'media_unavailable'
        : error instanceof CmsError && error.statusCode === 400 ? 'content_not_publishable' : 'build_failed');
      return this.repository.attempt(websiteId, attempt.releaseId);
    }
  }

  async publicHtml(websiteId: string, file = 'index.html'): Promise<string> {
    this.publicSite(websiteId);
    if (!/^(?:en\/)?[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(file)) throw new CmsError(404, 'Pagina niet gevonden');
    const active = this.repository.active(websiteId);
    if (!active.activeReleaseId) throw new CmsError(404, 'Nog geen gepubliceerde pagina');
    return (await this.releaseBytes(websiteId, active.activeReleaseId, file)).toString('utf8');
  }

  private publicSite(websiteId: string): void {
    if (!['demo-cms', 'demo-other'].includes(websiteId)) throw new CmsError(404, 'Website niet gevonden');
  }

  async publicImage(websiteId: string, releaseId: string, filename = 'hero.png'): Promise<Buffer> {
    this.publicSite(websiteId);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(releaseId)) throw new CmsError(404, 'Publicatie niet gevonden');
    if (!/^(?:hero|portfolio-[a-f0-9-]+|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.(png|jpg|webp)$/.test(filename)) throw new CmsError(404, 'Afbeelding niet gevonden');
    return this.releaseBytes(websiteId, releaseId, `media/${releaseId}/${filename}`);
  }

  async publicTemplateAsset(websiteId:string,releaseId:string,filename:string){
    this.publicSite(websiteId);
    if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(releaseId)||!['contact.css','contact.js'].includes(filename))throw new CmsError(404,'Templatebestand niet gevonden');
    return this.releaseBytes(websiteId,releaseId,`template-assets/${releaseId}/${filename}`);
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
