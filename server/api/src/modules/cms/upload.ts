import { LocalUploadService } from '../../media-upload/service.js';
import type { CmsMedia } from './media.js';
import { MediaRightsService } from '../../media-upload/rights.js';
import { CmsError } from './model.js';
import Database from 'better-sqlite3';
import { join } from 'node:path';
import { lstatSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { MediaReference, PublicVariant } from '../../media-fixture/contracts.js';

/** Reuses M1's processor and the same media.sqlite, never a second asset store. */
export class CmsUploads {
  readonly service: LocalUploadService;
  readonly rights: MediaRightsService;
  private readonly reader: Database.Database;
  constructor(private media: CmsMedia) {
    this.service = new LocalUploadService(media.root);
    this.rights = new MediaRightsService(media.root);
    this.reader = new Database(join(media.root, 'media.sqlite'), { readonly: true });
  }
  async recover(): Promise<void> { await this.service.recover(); }
  async upload(websiteId: string, bytes: Buffer, filename: string, mime: string) {
    return this.service.upload(this.media.websiteScope(websiteId), bytes, filename, mime);
  }
  status(websiteId: string, assetId: string) {
    const site = this.media.websiteScope(websiteId);
    const job = this.service.status(site, assetId);
    // M1's job DTO describes initial rights. Asset metadata is authoritative after review.
    const metadata = job.state === 'ready' ? this.metadata(websiteId, assetId) : undefined;
    return { ...job, ...(metadata ? { rights: metadata.rights, metadataVersion: metadata.metadataVersion } : {}) };
  }
  async retry(websiteId: string, assetId: string) {
    await this.service.retryFailed(this.media.websiteScope(websiteId), assetId);
    return this.status(websiteId, assetId);
  }
  metadata(websiteId: string, assetId: string) {
    const row = this.reader.prepare(`SELECT id AS assetId,metadata_version AS metadataVersion,rights
      FROM assets WHERE website=? AND id=?`).get(this.media.websiteScope(websiteId), assetId) as
      { assetId: string; metadataVersion: number; rights: string } | undefined;
    if (!row) throw new CmsError(404, 'Afbeelding niet gevonden');
    return row;
  }
  setRights(websiteId: string, assetId: string, input: unknown) {
    return this.rights.setRights(this.media.websiteScope(websiteId), assetId, input);
  }
  requireApproval(websiteId: string, assetId: string): void {
    this.rights.requireApproval(this.media.websiteScope(websiteId), assetId);
  }
  preview(websiteId: string, reference: MediaReference): { src: string; alt: string } {
    const site = this.media.websiteScope(websiteId);
    const row = this.reader.prepare("SELECT variants FROM files WHERE website=? AND asset=? AND version=? AND state='ready'")
      .get(site, reference.assetId, reference.fileVersion) as { variants: string } | undefined;
    if (!row) throw new CmsError(409, 'Afbeelding is nog niet gereed voor privépreview');
    const variants = JSON.parse(row.variants) as PublicVariant[];
    const variant = variants.find((item) => item.mime === 'image/png')
      ?? variants.find((item) => item.mime === 'image/jpeg') ?? variants.find((item) => item.mime === 'image/webp');
    if (!variant) throw new CmsError(409, 'Geen geschikte previewvariant');
    const prefix = `public/${site}/${reference.assetId}/${reference.fileVersion}/`;
    const filename = variant.path.slice(prefix.length);
    if (!variant.path.startsWith(prefix) || !/^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(filename)) {
      throw new CmsError(409, 'Ongeldig previewpad');
    }
    let path = this.media.root;
    for (const segment of variant.path.split('/')) {
      path = join(path, segment);
      if (lstatSync(path).isSymbolicLink()) throw new CmsError(409, 'Onveilig previewpad');
    }
    const bytes = readFileSync(path);
    if (bytes.length !== variant.bytes || createHash('sha256').update(bytes).digest('hex') !== variant.checksum) {
      throw new CmsError(409, 'Previewbestand gewijzigd');
    }
    // Ready sanitized derivatives are private until the separate explicit approval + publication.
    return { src: `data:${variant.mime};base64,${bytes.toString('base64')}`, alt: reference.decorative ? '' : reference.altText.nl ?? '' };
  }
  close(): void { this.reader.close(); this.rights.close(); this.service.close(); }
}
