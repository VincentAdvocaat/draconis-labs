import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { contentLocaleContextSchema } from '@draconis/shared';
import { MediaContractError } from '../media-fixture/contracts.js';
import { FIXTURE_WEBSITES } from '../media-fixture/fixture.js';
import { assertFixtureRoot } from '../media-fixture/safety.js';
import { checksum, MediaFixtureStore } from '../media-fixture/storage.js';
import { MediaRightsService } from '../media-upload/rights.js';
import { CatalogService } from './service.js';
import { assertOutsideCatalogConsumerGate, ownCatalogConsumer, withCatalogConsumerGate } from './consumer-owner.js';
import type { CatalogSnapshot } from './contracts.js';

const label = z.string().trim().min(1).max(200);
export const catalogConsumerOwnerSchema = z.object({
  module: label, siteId: label, ownerId: label, revisionId: label,
  kind: z.enum(['draft', 'release']), slot: label, attemptId: label.optional(),
}).strict().superRefine((owner, context) => {
  if (owner.kind === 'release' && !owner.attemptId)
    context.addIssue({ code: 'custom', path: ['attemptId'], message: 'A release pin requires its consumer attempt ID' });
});
export const catalogConsumerRequestSchema = z.object({
  owner: catalogConsumerOwnerSchema,
  ref: z.object({ websiteId: label, collectionId: z.literal('portfolio'), snapshotId: z.string().uuid() }).strict(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/), localeContext: contentLocaleContextSchema,
}).strict();
export type CatalogConsumerOwner = z.infer<typeof catalogConsumerOwnerSchema>;
export type CatalogConsumerRequest = z.infer<typeof catalogConsumerRequestSchema>;
export interface CatalogConsumerPin extends CatalogConsumerRequest {
  pinId: string; state: 'prepared' | 'activated'; version: number;
  activationId: string | null; createdAt: string; snapshot: CatalogSnapshot;
}
export interface CatalogActivationOutcome { status: 'published' | 'not-published'; activationId: string }
export interface CatalogActivationInspection { status: 'published' | 'not-published' | 'unknown'; activationId?: string }
interface PinRow { id: string; request: string; snapshot: string; state: CatalogConsumerPin['state']; version: number; activation_id: string | null; created_at: string }
const outcomeSchema = z.object({ status: z.enum(['published', 'not-published']), activationId: label }).strict();
const inspectionSchema = z.object({ status: z.enum(['published', 'not-published', 'unknown']), activationId: label.optional() }).strict();
const batchSchema = z.array(z.string().uuid()).min(1).max(100).refine(ids => new Set(ids).size === ids.length, 'Duplicate pins');

function synchronous<T>(callback: () => T): T {
  if (callback.constructor.name === 'AsyncFunction') throw new MediaContractError(400, 'Consumer callbacks must be synchronous');
  const result = callback();
  if (result && typeof (result as { then?: unknown }).then === 'function')
    throw new MediaContractError(400, 'Consumer callbacks must not return a Promise');
  return result;
}

/** Internal single-owner-process integration. No HTTP server and no distributed transaction claim. */
export class CatalogSnapshotConsumer {
  private readonly root: string;
  private db!: Database.Database;
  private catalog!: CatalogService;
  private media!: MediaFixtureStore;
  private rights!: MediaRightsService;
  private readonly unlock: () => void;
  private closed = false;

  constructor(root: string) {
    this.root = assertFixtureRoot(root);
    this.unlock = ownCatalogConsumer(this.root);
    try {
      this.catalog = new CatalogService(this.root);
      this.db = new Database(join(this.root, 'media.sqlite'));
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = FULL');
      this.media = new MediaFixtureStore(this.root, FIXTURE_WEBSITES, this.db);
      this.rights = new MediaRightsService(this.root, this.db);
      this.db.exec(`CREATE TABLE IF NOT EXISTS catalog_consumer_pins(
        id TEXT PRIMARY KEY,website TEXT NOT NULL,owner_key TEXT NOT NULL,snapshot_id TEXT NOT NULL,
        request TEXT NOT NULL,snapshot TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('prepared','activated')),
        version INTEGER NOT NULL,activation_id TEXT,created_at TEXT NOT NULL,UNIQUE(website,owner_key),
        FOREIGN KEY(website,snapshot_id) REFERENCES catalog_snapshots(website,id));
        CREATE TABLE IF NOT EXISTS catalog_consumer_pin_events(
          pin TEXT NOT NULL REFERENCES catalog_consumer_pins(id),version INTEGER NOT NULL,
          action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(pin,version));`);
    } catch (error) { this.db?.close(); this.catalog?.close(); this.unlock(); throw error; }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.db.close(); this.catalog.close(); } finally { this.unlock(); }
  }
  private authorize(website: string) {
    if (!FIXTURE_WEBSITES.includes(website)) throw new MediaContractError(403, 'Consumer website access denied');
  }
  private row(website: string, id: string): PinRow {
    const row = this.db.prepare('SELECT * FROM catalog_consumer_pins WHERE website=? AND id=?').get(website, id) as PinRow | undefined;
    if (!row) throw new MediaContractError(404, 'Consumer pin not found for website');
    return row;
  }
  private pin(row: PinRow): CatalogConsumerPin {
    return { ...JSON.parse(row.request) as CatalogConsumerRequest, pinId: row.id, state: row.state, version: row.version,
      activationId: row.activation_id, createdAt: row.created_at, snapshot: JSON.parse(row.snapshot) as CatalogSnapshot };
  }
  getPin(website: string, id: string) {
    this.authorize(website); z.string().uuid().parse(id);
    return this.pin(this.row(website, id));
  }
  listPins(website: string, filter: { module?: string; attemptId?: string; ownerId?: string } = {}) {
    this.authorize(website);
    const pins = (this.db.prepare('SELECT * FROM catalog_consumer_pins WHERE website=? ORDER BY rowid').all(website) as PinRow[]).map(row => this.pin(row));
    return pins.filter(pin => (!filter.module || pin.owner.module === filter.module) &&
      (!filter.attemptId || pin.owner.attemptId === filter.attemptId) && (!filter.ownerId || pin.owner.ownerId === filter.ownerId));
  }
  private assertSnapshot(snapshot: CatalogSnapshot, request: CatalogConsumerRequest) {
    const { checksum: expected, ...payload } = snapshot;
    if (expected !== request.checksum || checksum(Buffer.from(JSON.stringify(payload))) !== expected)
      throw new MediaContractError(409, 'Pinned catalog checksum mismatch');
    const context = contentLocaleContextSchema.parse(snapshot.localeContext ?? { defaultLocale: 'nl', locale: 'nl' });
    if (JSON.stringify(context) !== JSON.stringify(request.localeContext)) throw new MediaContractError(409, 'Pinned catalog locale context mismatch');
  }
  private validate(website: string, pin: CatalogConsumerPin) {
    const current = this.catalog.resolveSnapshot(pin.ref);
    this.assertSnapshot(current, pin);
    this.assertSnapshot(pin.snapshot, pin);
    for (const item of pin.snapshot.items) {
      const references = [item.resolvedMedia, ...(item.resolvedGallery ?? [])];
      for (const photo of references) this.rights.requireApproval(website, photo.assetId);
      // A separate retained manifest for the consumer pins the existing immutable source revision.
      // This reuses a retained revision rather than selecting archived media anew.
      const manifest = this.media.resolveRelease(website, { releaseId: `consumer-${pin.pinId}-${item.itemId}`,
        revisionId: `catalog-${item.revisionId}`, locales: [pin.localeContext.locale] });
      if (JSON.stringify(manifest.references) !== JSON.stringify(references))
        throw new MediaContractError(409, 'Consumer media manifest differs from the pinned snapshot');
    }
  }
  preparePin(website: string, input: CatalogConsumerRequest) {
    assertOutsideCatalogConsumerGate(this.root);
    this.authorize(website);
    const request = catalogConsumerRequestSchema.parse(input);
    if (request.ref.websiteId !== website) throw new MediaContractError(404, 'Catalog reference belongs to another website');
    return this.db.transaction(() => {
      const ownerKey = checksum(Buffer.from(JSON.stringify(request.owner)));
      const existing = this.db.prepare('SELECT * FROM catalog_consumer_pins WHERE website=? AND owner_key=?').get(website, ownerKey) as PinRow | undefined;
      if (existing) {
        if (existing.request !== JSON.stringify(request)) throw new MediaContractError(409, 'Immutable consumer owner already pins another request');
        const pin = this.pin(existing); this.validate(website, pin); return pin;
      }
      if (request.owner.kind === 'release' && this.attemptPins(website, request.owner).some(pin => pin.state === 'activated'))
        throw new MediaContractError(409, 'Finalized consumer attempt cannot add another slot');
      const snapshot = this.catalog.resolveSnapshot(request.ref);
      this.assertSnapshot(snapshot, request);
      const pin: CatalogConsumerPin = { ...request, pinId: randomUUID(), state: 'prepared', version: 1,
        activationId: null, createdAt: new Date().toISOString(), snapshot };
      this.db.prepare('INSERT INTO catalog_consumer_pins VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(pin.pinId, website, ownerKey, request.ref.snapshotId, JSON.stringify(request), JSON.stringify(snapshot), 'prepared', 1, null, pin.createdAt);
      this.validate(website, pin);
      this.db.prepare('INSERT INTO catalog_consumer_pin_events VALUES(?,1,?,?,?)').run(pin.pinId, 'prepared', JSON.stringify(request.owner), pin.createdAt);
      return pin;
    }).immediate();
  }
  materialize(website: string, id: string) {
    const pin = this.getPin(website, id);
    this.validate(website, pin);
    const files = pin.snapshot.items.flatMap(item => item.resolvedMedia.variants.map((variant, variantIndex) => {
      const file = this.catalog.variant(pin.ref, item.itemId, variantIndex);
      return { key: `${pin.pinId}/${item.itemId}/${variantIndex}`, itemId: item.itemId, variantIndex,
        assetId: item.media.assetId, fileVersion: item.media.fileVersion, mime: file.mime,
        width: variant.width, height: variant.height, checksum: variant.checksum, bytes: file.bytes };
    }));
    return { pin, snapshot: pin.snapshot, files };
  }
  private batch(website: string, ids: string[]) {
    this.authorize(website);
    const pins = batchSchema.parse(ids).map(id => this.getPin(website, id));
    const first = pins[0].owner;
    if (pins.some(pin => pin.owner.kind !== 'release' || !pin.owner.attemptId || pin.owner.module !== first.module ||
      pin.owner.siteId !== first.siteId || pin.owner.attemptId !== first.attemptId))
      throw new MediaContractError(409, 'One finalization gate requires release pins from the same consumer site/attempt');
    const full = this.attemptPins(website, first);
    if (full.length !== pins.length || full.some(pin => !ids.includes(pin.pinId)))
      throw new MediaContractError(409, 'Finalization requires the complete consumer attempt pin set');
    return pins;
  }
  private attemptPins(website: string, owner: CatalogConsumerOwner) {
    return this.listPins(website, { module: owner.module, attemptId: owner.attemptId })
      .filter(pin => pin.owner.kind === 'release' && pin.owner.siteId === owner.siteId && pin.owner.attemptId === owner.attemptId);
  }
  finalize(website: string, ids: string[], syncActivate: (pins: readonly CatalogConsumerPin[]) => CatalogActivationOutcome) {
    // Reject native async callbacks before they can start any side effects.
    if (syncActivate.constructor.name === 'AsyncFunction') throw new MediaContractError(400, 'Activation must be synchronous');
    return withCatalogConsumerGate(this.root, () => this.db.transaction(() => {
      const pins = this.batch(website, ids);
      for (const pin of pins) this.validate(website, pin);
      const activationId = pins[0].owner.attemptId!;
      if (pins.every(pin => pin.state === 'activated')) return { status: 'published' as const, activationId, pins };
      if (pins.some(pin => pin.state === 'activated')) throw new MediaContractError(409, 'Mixed pin states require reconciliation');
      const outcome = outcomeSchema.parse(synchronous(() => syncActivate(pins)));
      if (outcome.activationId !== activationId) throw new MediaContractError(409, 'Activation ID does not match prepared owner attempt');
      if (outcome.status === 'published') for (const pin of pins) this.recordActivation(pin, activationId, 'activated');
      return { ...outcome, pins: ids.map(id => this.getPin(website, id)) };
    }).immediate());
  }
  private recordActivation(pin: CatalogConsumerPin, activationId: string, action: string) {
    this.db.prepare("UPDATE catalog_consumer_pins SET state='activated',activation_id=?,version=version+1 WHERE id=? AND state='prepared'")
      .run(activationId, pin.pinId);
    this.db.prepare('INSERT INTO catalog_consumer_pin_events VALUES(?,?,?,?,?)')
      .run(pin.pinId, pin.version + 1, action, JSON.stringify({ activationId }), new Date().toISOString());
  }
  reconcile(website: string, ids: string[], inspect: (owner: CatalogConsumerOwner) => CatalogActivationInspection) {
    if (inspect.constructor.name === 'AsyncFunction') throw new MediaContractError(400, 'Reconciliation lookup must be synchronous');
    return withCatalogConsumerGate(this.root, () => this.db.transaction(() => {
      const pins = this.batch(website, ids);
      const result = inspectionSchema.parse(synchronous(() => inspect(pins[0].owner)));
      if (result.status === 'published') {
        if (result.activationId !== pins[0].owner.attemptId) throw new MediaContractError(409, 'Reconciliation activation ID mismatch');
        for (const pin of pins) if (pin.state === 'prepared') this.recordActivation(pin, result.activationId!, 'reconciled-published');
      }
      // Unknown or not-published never frees a pin or its media references.
      return { inspection: result.status, pins: ids.map(id => this.getPin(website, id)) };
    }).immediate());
  }
}
