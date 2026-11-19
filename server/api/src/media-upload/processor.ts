import sharp from 'sharp';

export const MAX_BYTES = 20_000_000;
export const MAX_PIXELS = 40_000_000;
export const MAX_AXIS = 12_000;
export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export class UploadError extends Error {
  constructor(public readonly statusCode: number, message: string) { super(message); }
}

export function validateEnvelope(bytes: Buffer, filename: string, mime: string): ImageMime {
  if (!bytes.length) throw new UploadError(400, 'Empty file');
  if (bytes.length > MAX_BYTES) throw new UploadError(413, 'File exceeds 20000000 bytes');
  if (!/^[^<>:"/\\|?*]{1,200}$/.test(filename) || [...filename].some(c => c.charCodeAt(0) < 32) || filename === '.' || filename === '..')
    throw new UploadError(400, 'Use a filename without a path or control characters');
  const detected = bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'image/png'
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'image/jpeg'
    : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : undefined;
  const extensions: Record<ImageMime, RegExp> = { 'image/jpeg': /\.jpe?g$/i, 'image/png': /\.png$/i, 'image/webp': /\.webp$/i };
  if (!detected || detected !== mime || !extensions[detected].test(filename))
    throw new UploadError(415, 'Filename, MIME and image signature must agree: JPEG, PNG or WebP only');
  return detected;
}

export interface EncodedVariant {
  bytes: Buffer;
  extension: 'webp' | 'jpg' | 'png';
  mime: ImageMime;
  width: number;
  height: number;
}

export async function processImage(bytes: Buffer, filename: string, mime: string): Promise<EncodedVariant[]> {
  const expected = validateEnvelope(bytes, filename, mime);
  try {
    const options = { limitInputPixels: MAX_PIXELS, failOn: 'warning' as const, animated: true };
    const metadata = await sharp(bytes, options).metadata();
    const format = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' }[expected];
    if (metadata.format !== format || !metadata.width || !metadata.height ||
        metadata.width > MAX_AXIS || metadata.height > MAX_AXIS ||
        metadata.width * metadata.height > MAX_PIXELS || (metadata.pages ?? 1) !== 1)
      throw new UploadError(422, 'Image dimensions, format or frame count not allowed');
    // Reject APNG even on decoders that expose only its first frame.
    if (expected === 'image/png') {
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL')
          throw new UploadError(422, 'Animated PNG not allowed');
        offset += length + 12;
      }
    }
    const orientedWidth = metadata.orientation && metadata.orientation >= 5 ? metadata.height : metadata.width;
    const widths = orientedWidth <= 320 ? [orientedWidth] : [320, 640, 1280, 1920].filter(w => w <= orientedWidth);
    const fallback = metadata.hasAlpha ? 'png' : 'jpg';
    const result: EncodedVariant[] = [];
    for (const width of widths) {
      for (const extension of ['webp', fallback] as const) {
        const pipeline = sharp(bytes, options).rotate().toColourspace('srgb')
          .resize({ width, withoutEnlargement: true }).timeout({ seconds: 15 });
        const { data, info } = await (extension === 'webp' ? pipeline.webp({ quality: 82 })
          : extension === 'png' ? pipeline.png() : pipeline.jpeg({ quality: 85 })).toBuffer({ resolveWithObject: true });
        result.push({ bytes: data, extension, mime: extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
          width: info.width, height: info.height });
      }
    }
    return result;
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(422, 'Image cannot be decoded within the configured limits');
  }
}
