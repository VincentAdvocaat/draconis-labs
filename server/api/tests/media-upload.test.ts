import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMediaFixture } from '../src/media-fixture/fixture.js';
import { buildUploadApp } from '../src/media-upload/app.js';
import { MAX_BYTES, processImage, validateEnvelope } from '../src/media-upload/processor.js';
import type { PublicVariant } from '../src/media-fixture/contracts.js';

const website = 'fixture-alpha';
const token = 'local-fixture-token-for-tests-only-123456789';
const auth = { authorization: `Bearer ${token}` };
const image = (width = 200, height = 100, channels: 3 | 4 = 3) => sharp({ create: {
  width, height, channels, background: { r: 240, g: 10, b: 30, alpha: 0.5 },
} }).png().toBuffer();

describe('local HTTP upload and real image processor', () => {
  let fixture: ReturnType<typeof createMediaFixture>;
  let app: Awaited<ReturnType<typeof buildUploadApp>>;
  beforeEach(async () => { fixture = createMediaFixture(); app = await buildUploadApp(fixture.root, token); });
  afterEach(async () => { await app.close(); fixture.cleanup(); });
  const headers = (filename = 'source.png', mime = 'image/png') => ({ ...auth, 'x-media-filename': filename, 'content-type': mime });
  const upload = (bytes: Buffer, filename?: string, mime?: string) => app.inject({ method: 'POST',
    url: `/websites/${website}/media`, headers: headers(filename, mime), payload: bytes });

  it.each([1, 200, 320, 640])('serves a real upload of width %i with clean WebP and fallback without enlargement', async width => {
    const result = await upload(await image(width, 1));
    expect(result.statusCode).toBe(201);
    const body = result.json();
    expect(body).toMatchObject({ fileVersion: 1, state: 'ready', rights: 'unknown' });
    const variants = body.variants as PublicVariant[];
    const expectedWidths = width <= 320 ? [width] : [320, 640];
    expect([...new Set(variants.map(v => v.width))]).toEqual(expectedWidths);
    for (const w of expectedWidths) expect(variants.filter(v => v.width === w).map(v => v.mime)).toEqual(['image/webp', 'image/jpeg']);
    for (const variant of variants) {
      const decoded = await sharp(readFileSync(join(fixture.root, variant.path))).metadata();
      expect(decoded.width).toBeLessThanOrEqual(width);
      expect(decoded.exif).toBeUndefined();
      expect(decoded.xmp).toBeUndefined();
    }
    const ref = { assetId: body.assetId, fileVersion: 1, usage: 'hero', altText: { nl: 'Rood proefbeeld' }, decorative: false };
    fixture.store.saveReferences(website, { module: 'cms', ownerId: 'home', revisionId: 'draft', expectedVersion: 0, references: [ref] });
    expect(() => fixture.store.resolveRelease(website, { releaseId: 'one', revisionId: 'draft', locales: ['nl'] })).toThrow('Rights not cleared');
  });

  it('supports JPEG/WebP and preserves transparent images with PNG fallback', async () => {
    const source = await image(20, 10, 4);
    const png = (await upload(source)).json();
    expect(png.variants.map((v: PublicVariant) => v.mime)).toEqual(['image/webp', 'image/png']);
    for (const [filename, mime, bytes] of [
      ['photo.jpg', 'image/jpeg', await sharp(source).jpeg().toBuffer()],
      ['photo.webp', 'image/webp', await sharp(source).webp().toBuffer()],
    ] as const) expect((await upload(bytes, filename, mime)).statusCode).toBe(201);
  });

  it('auto-orients EXIF and removes GPS, EXIF, XMP and ICC from all public derivatives', async () => {
    const source = await sharp(await image(200, 100)).jpeg().withMetadata({ orientation: 6 })
      .withExifMerge({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } }).toBuffer();
    const original = await sharp(source).metadata();
    expect(original.orientation).toBe(6);
    expect(original.exif).toBeDefined();
    const result = (await upload(source, 'gps.jpg', 'image/jpeg')).json();
    expect(result.state).toBe('ready');
    for (const variant of result.variants as PublicVariant[]) {
      const meta = await sharp(readFileSync(join(fixture.root, variant.path))).metadata();
      expect(meta.width).toBe(100);
      expect(meta.height).toBe(200);
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    }
  });

  it('rejects empty, wrong MIME/signature, path filenames and decode errors with no public ready file', async () => {
    expect((await upload(Buffer.alloc(0))).statusCode).toBe(400);
    expect((await upload(await image(), 'source.jpg', 'image/jpeg')).statusCode).toBe(415);
    expect((await upload(await image(), '../source.png')).statusCode).toBe(400);
    expect((await upload(Buffer.from('<svg/>'))).statusCode).toBe(415);
    const bad = Buffer.from('89504e470d0a1a0a000000', 'hex');
    expect((await upload(bad)).statusCode).toBe(422);
    const db = new Database(join(fixture.root, 'media.sqlite'));
    try {
      const jobs = db.prepare('SELECT * FROM upload_jobs').all() as { id: string; state: string }[];
      expect(jobs).toHaveLength(1);
      expect(jobs[0].state).toBe('failed');
      expect(existsSync(join(fixture.root, 'public', website, jobs[0].id, '1'))).toBe(false);
      expect(db.prepare('SELECT * FROM assets WHERE id=?').get(jobs[0].id)).toBeUndefined();
    } finally { db.close(); }
  });

  it('rejects pixel/axis limits, truncated images and animated PNG/WebP', async () => {
    await expect(processImage(await image(12001, 1), 'wide.png', 'image/png')).rejects.toThrow('dimensions');
    await expect(processImage(await image(6400, 6400), 'huge.png', 'image/png')).rejects.toThrow('limits');
    const jpeg = await sharp(await image()).jpeg().toBuffer();
    expect((await upload(jpeg.subarray(0, jpeg.length - 30), 'truncated.jpg', 'image/jpeg')).statusCode).toBe(422);
    const png = await image();
    const apngChunk = Buffer.concat([Buffer.from('000000086163544c', 'hex'), Buffer.alloc(12)]);
    const apng = Buffer.concat([png.subarray(0, 33), apngChunk, png.subarray(33)]);
    await expect(processImage(apng, 'animated.png', 'image/png')).rejects.toThrow();
    const animated = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]), {
      raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
    }).webp({ delay: [100, 100], loop: 0 }).toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
    await expect(processImage(animated, 'animated.webp', 'image/webp')).rejects.toThrow('frame');
  });

  it('enforces byte boundaries including HTTP chunked requests without Content-Length', async () => {
    const source = await image(1, 1);
    const atLimit = Buffer.alloc(MAX_BYTES); source.copy(atLimit);
    expect(() => validateEnvelope(atLimit, 'limit.png', 'image/png')).not.toThrow();
    expect(() => validateEnvelope(Buffer.alloc(MAX_BYTES + 1), 'limit.png', 'image/png')).toThrow('exceeds');
    expect((await upload(Buffer.alloc(MAX_BYTES + 1))).statusCode).toBe(413);
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${address}/websites/${website}/media`, { method: 'POST', headers: headers() }, res => {
        res.resume(); resolve(res.statusCode!);
      });
      req.on('error', reject);
      const chunk = Buffer.alloc(1_000_000);
      for (let i = 0; i < 21; i++) req.write(chunk);
      req.end();
    });
    expect(status).toBe(413);
  });

  it('denies missing tokens, browser origins and unrecognized websites before processing', async () => {
    const bytes = await image();
    for (const customHeaders of [
      { ...headers(), authorization: '' },
      { ...headers(), origin: 'https://unrelated.example' },
      { ...headers(), 'sec-fetch-site': 'cross-site' },
    ]) expect((await app.inject({ method: 'POST', url: `/websites/${website}/media`, headers: customHeaders, payload: bytes })).statusCode).toBeGreaterThanOrEqual(400);
    expect((await app.inject({ method: 'POST', url: '/websites/other/media', headers: headers(), payload: bytes })).statusCode).toBe(403);
  });

  it('admits only one upload before buffering and keeps the slot locked after rejected concurrent requests', async () => {
    let entered!: () => void;
    const admitted = new Promise<void>(resolve => { entered = resolve; });
    app.addHook('preParsing', async (request, _reply, payload) => {
      if (request.headers['x-test-held'] === 'true') entered();
      return payload;
    });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const bytes = await image();
    let finish!: () => void;
    const firstResponse = new Promise<number>((resolve, reject) => {
      const req = httpRequest(`${address}/websites/${website}/media`, { method: 'POST', headers: { ...headers(), 'x-test-held': 'true' } }, res => {
        res.resume(); resolve(res.statusCode!);
      });
      req.on('error', reject);
      req.write(bytes.subarray(0, 8));
      finish = () => req.end(bytes.subarray(8));
    });
    await admitted;
    try {
      for (let i = 0; i < 2; i++) expect((await upload(bytes)).statusCode).toBe(429);
    } finally { finish(); }
    expect(await firstResponse).toBe(201);
    expect((await upload(bytes)).statusCode).toBe(201);
  });

  it('reopens ready jobs and recovers an interrupted job from the private source idempotently', async () => {
    const uploaded = (await upload(await image())).json();
    await app.close();
    const id = randomUUID();
    const sourceDir = join(fixture.root, 'private', website, id);
    mkdirSync(sourceDir, { recursive: true });
    writeFileSync(join(sourceDir, 'source'), await image(320, 1));
    // Simulate a crash after the public directory rename but before the DB commit.
    const orphanPublic = join(fixture.root, 'public', website, id, '1');
    mkdirSync(orphanPublic, { recursive: true });
    writeFileSync(join(orphanPublic, 'partial.png'), Buffer.from('unfinished'));
    const db = new Database(join(fixture.root, 'media.sqlite'));
    db.prepare("INSERT INTO upload_jobs VALUES(?,?,?,?,'processing',NULL)").run(id, website, 'recovered.png', 'image/png');
    const failedId = randomUUID();
    db.prepare("INSERT INTO upload_jobs VALUES(?,?,?,?,'processing',NULL)").run(failedId, website, 'missing.png', 'image/png');
    db.close();
    app = await buildUploadApp(fixture.root, token);
    expect(existsSync(join(orphanPublic, 'partial.png'))).toBe(false);
    for (const readyId of [uploaded.assetId, id]) {
      const response = await app.inject({ url: `/websites/${website}/media/${readyId}`, headers: auth });
      expect(response.json()).toMatchObject({ assetId: readyId, fileVersion: 1, state: 'ready' });
    }
    expect((await app.inject({ url: `/websites/${website}/media/${failedId}`, headers: auth })).json().state).toBe('failed');
    expect((await app.inject({ url: `/websites/fixture-beta/media/${id}`, headers: auth })).statusCode).toBe(404);
    await app.close();
    app = await buildUploadApp(fixture.root, token);
    expect((await app.inject({ url: `/websites/${website}/media/${id}`, headers: auth })).json().variants).toHaveLength(2);
  });
});
