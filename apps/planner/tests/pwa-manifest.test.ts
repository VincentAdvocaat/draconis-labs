import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('links a scoped staff PWA manifest with the declared PNG dimensions', () => {
  const root = new URL('../', import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root));
  expect(read('index.html').toString()).toContain('rel="manifest" href="%BASE_URL%planner.webmanifest"');
  expect(read('public-site/index.html').toString()).not.toContain('rel="manifest"');
  const manifest = JSON.parse(read('public/planner.webmanifest').toString());
  expect(manifest).toMatchObject({
    id: './', scope: './', start_url: './', display: 'standalone',
    theme_color: '#10131b', background_color: '#10131b',
  });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const png = read(`public/${icon.src}`);
    expect(icon.type).toBe('image/png');
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
  }
});
