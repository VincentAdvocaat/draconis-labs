import { CatalogService } from '../../catalogus/service.js';
import { CatalogSnapshotConsumer } from '../../catalogus/consumer.js';
import type { z } from 'zod';
import type { portfolioBlockSchema } from './documents.js';
import { defaultPortfolioLabels } from './portfolio-schema.js';
import { CmsError, encode, type Attempt } from './model.js';
import type { CmsMedia } from './media.js';
import type { CmsRepository } from './repository.js';
import { validateContentField, CONTENT_PUBLICATION_RULES_V1 } from '@draconis/shared';

type Block = z.infer<typeof portfolioBlockSchema>;
export class CmsPortfolio {
  readonly catalog: CatalogService;
  readonly consumer: CatalogSnapshotConsumer;
  constructor(private media: CmsMedia, private repository: CmsRepository) {
    this.catalog = new CatalogService(media.root);
    this.consumer = new CatalogSnapshotConsumer(media.root);
    for (const website of ['demo-cms', 'demo-other']) {
      const scope = media.websiteScope(website);
      const pins = this.consumer.listPins(scope, { module: 'cms' }).filter((pin) => pin.owner.siteId === website && pin.owner.kind === 'release');
      for (const attemptId of new Set(pins.map((pin) => pin.owner.attemptId!))) {
        this.consumer.reconcile(scope, pins.filter((pin) => pin.owner.attemptId === attemptId).map((pin) => pin.pinId), () => {
          try { return { status: repository.attempt(website, attemptId).status === 'published' ? 'published' : 'not-published', activationId: attemptId }; }
          catch { return { status: 'unknown' }; }
        });
      }
    }
  }
  selections(website: string) {
    const scope = this.media.websiteScope(website);
    return this.catalog.listSnapshots(scope).filter((item) => item.status === 'published').map((item) => {
      const ref = { websiteId: scope, collectionId: 'portfolio' as const, snapshotId: item.snapshotId };
      const snapshot = this.catalog.resolveSnapshot(ref);
      return { ref, checksum: snapshot.checksum, localeContext: snapshot.localeContext ?? { locale: 'nl' as const }, itemCount: snapshot.items.length };
    });
  }
  pin(website: string, pageId: string, revisionId: string, block: Block, attemptId?: string) {
    const scope = this.media.websiteScope(website);
    if (block.ref.websiteId !== scope) throw new CmsError(404, 'Catalogus niet gevonden');
    return this.consumer.preparePin(scope, { owner: { module: 'cms', siteId: website, ownerId: pageId, revisionId,
      kind: attemptId ? 'release' : 'draft', slot: block.blockId, ...(attemptId ? { attemptId } : {}) },
      ref: block.ref, checksum: block.checksum, localeContext: block.localeContext });
  }
  render(website: string, pageId: string, revisionId: string, block: Block, attemptId?: string, absolutePaths=false) {
    const pin = this.pin(website, pageId, revisionId, block, attemptId);
    const output = this.consumer.materialize(this.media.websiteScope(website), pin.pinId);
    const files: Array<{ path: string; bytes: Buffer }> = [];
    // Earlier immutable revisions predate editorial labels. Their compatibility
    // text is explicit in both supported locales; new saves persist these maps.
    const labels = block.labels ?? defaultPortfolioLabels();
    const heading = validateContentField(labels.heading, block.localeContext, CONTENT_PUBLICATION_RULES_V1.title);
    const empty = validateContentField(labels.empty, block.localeContext, CONTENT_PUBLICATION_RULES_V1.title);
    if (!heading.valid || !empty.valid) throw new CmsError(400, 'Vul portfolio-kop en lege-staattekst rechtstreeks in de gekozen bloktaal in');
    const html = `<section lang="${encode(block.localeContext.locale)}"><h2>${encode(heading.value!)}</h2>` +
      (output.snapshot.items.length ? '' : `<p>${encode(empty.value!)}</p>`) + output.snapshot.items.map((item) => {
      const image = output.files.find((file) => file.itemId === item.itemId && ['image/png', 'image/jpeg', 'image/webp'].includes(file.mime));
      if (!image) throw new CmsError(409, 'Publieke portfoliovariant ontbreekt');
      const extension = image.mime === 'image/png' ? 'png' : image.mime === 'image/jpeg' ? 'jpg' : 'webp';
      // The server pin distinguishes page/revision/slot/attempt and is a canonical
      // lowercase UUID even when callers reuse or uppercase their block UUID.
      const path = attemptId ? `media/${attemptId}/portfolio-${pin.pinId}-${item.itemId.toLowerCase()}.${extension}` : '';
      if (attemptId) files.push({ path, bytes: image.bytes });
      const src = attemptId ? (absolutePaths?`/sites/${website}/${path}`:path) : `data:${image.mime};base64,${image.bytes.toString('base64')}`;
      const alt = item.media.decorative ? '' : item.resolvedMedia.altText[block.localeContext.locale];
      const language=(field:'title'|'description'|'alt')=>{
        const source=item.fieldSources?.[field];
        return source?.isFallback&&source.sourceLocale?` lang="${encode(source.sourceLocale)}"`:'';
      };
      return `<article><h3${language('title')}>${encode(item.title)}</h3><p${language('description')}>${encode(item.description)}</p><img${language('alt')} src="${encode(src)}" alt="${encode(alt ?? '')}" width="${image.width}" height="${image.height}"></article>`;
    }).join('') + '</section>';
    return { html, files };
  }
  activate(website: string, attemptId: string, callback: () => Attempt): Attempt {
    const scope = this.media.websiteScope(website);
    const pins = this.consumer.listPins(scope, { module: 'cms', attemptId }).filter((pin) => pin.owner.siteId === website);
    if (!pins.length) return callback();
    let attempt!: Attempt;
    this.consumer.finalize(scope, pins.map((pin) => pin.pinId), () => {
      attempt = callback();
      return { status: attempt.status === 'published' ? 'published' : 'not-published', activationId: attempt.releaseId };
    });
    return attempt;
  }
  close() { this.consumer.close(); this.catalog.close(); }
}
