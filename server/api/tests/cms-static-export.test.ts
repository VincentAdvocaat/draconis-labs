import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, symlinkSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { exportStaticRelease } from '../src/modules/cms/static-export.js';
import { staticExportFixture } from './helpers/static-export-fixture.js';

vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, lstatSync: vi.fn(fs.lstatSync), readFileSync: vi.fn(fs.readFileSync) };
});

const roots: string[] = [], media: string[] = [];
function target(kind = 'export') { const root = join(tmpdir(), `draconis-cms-${kind}-${randomUUID()}`); roots.push(root); return root; }
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
let fixture: Awaited<ReturnType<typeof staticExportFixture>>;
const input = (sourceRoot = fixture.root) => ({ sourceRoot, websiteId: 'demo-cms', release: 'active', targetRoot: target() });
const sourceRelease = (root = fixture.root, id = fixture.releaseId) => join(root, 'releases/demo-cms', id);
const files = (root: string, prefix = ''): string[] => readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(root, entry.name), prefix + entry.name + '/') : [prefix + entry.name]).sort();
beforeAll(async () => { fixture = await staticExportFixture(target('recovery')); media.push(fixture.mediaRoot); });
afterAll(() => { for (const root of [...roots, ...media]) {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.split(/[\\/]/).pop()!.startsWith('draconis-')) throw Error('Unsafe cleanup');
  rmSync(root, { recursive: true, force: true });
} });
function clone() { const root = target('recovery'); cpSync(fixture.root, root, { recursive: true }); return root; }
function manifest(root: string, change: (value: ReturnType<typeof json>) => void) {
  const path = join(sourceRelease(root), 'release.json'), value = json(path); change(value); writeFileSync(path, JSON.stringify(value));
}

describe('published static release export', () => {
  it('copies exact NL/EN home/contact/doc/portfolio/empty artifacts with a public-only manifest', () => {
    const source = json(join(sourceRelease(), 'release.json'));
    const root = clone();
    manifest(root, value => { value.privateDraft = 'SECRET_UNRENDERED_METADATA'; });
    writeFileSync(join(sourceRelease(root), 'private-original.bin'), 'PRIVATE_ORIGINAL');
    const beforeDb = hash(readFileSync(join(root, 'cms.db'))), beforeManifest = hash(readFileSync(join(sourceRelease(root), 'release.json')));
    const exported = exportStaticRelease(input(root));
    const output = json(join(exported.root, 'export-manifest.json'));
    for (const path of ['index.html', 'en/index.html', 'contact-fixture.html', 'en/contact-fixture.html', 'tekst.html', 'en/tekst-en.html', 'projecten.html', 'en/projecten-en.html', 'lege-projecten.html', 'en/lege-projecten-en.html']) expect(output.files[path], path).toBeDefined();
    expect(readFileSync(join(exported.root, 'sites/demo-cms/en/lege-projecten-en.html'), 'utf8')).toContain('No projects yet.');
    expect(readFileSync(join(exported.root, 'sites/demo-cms/lege-projecten.html'), 'utf8')).toContain('Er zijn nog geen projecten.');
    for (const [name, expected] of Object.entries(source.files)) expect(hash(readFileSync(join(exported.root, 'sites/demo-cms', name)))).toBe(expected);
    expect(files(exported.root)).toEqual(['export-manifest.json', ...Object.keys(source.files).map(path => 'sites/demo-cms/' + path)].sort());
    const text = files(exported.root).filter(path => /\.(?:html|json|css|js)$/.test(path)).map(path => readFileSync(join(exported.root, path), 'utf8')).join('');
    for (const value of ['NOT_EXPORTED_DRAFT', fixture.token, 'SECRET_UNRENDERED_METADATA', 'PRIVATE_ORIGINAL', 'local-access.json', 'catalog_consumer_pins']) expect(text).not.toContain(value);
    expect(hash(readFileSync(join(root, 'cms.db')))).toBe(beforeDb);
    expect(hash(readFileSync(join(sourceRelease(root), 'release.json')))).toBe(beforeManifest);
  });
  it('exports an older explicitly published pin unchanged and runs through the real CLI', () => {
    const old = exportStaticRelease({ ...input(), release: fixture.oldReleaseId });
    const source = json(join(sourceRelease(fixture.root, fixture.oldReleaseId), 'release.json'));
    for (const [name, expected] of Object.entries(source.files)) expect(hash(readFileSync(join(old.root, 'sites/demo-cms', name)))).toBe(expected);
    expect(readFileSync(join(old.root, 'sites/demo-cms/index.html'), 'utf8')).not.toContain('New published NL home');
    const destination = target();
    const stdout = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/cms-export.ts', '--source', fixture.root, '--website', 'demo-cms', '--release', fixture.oldReleaseId, '--target', destination], { encoding: 'utf8' });
    expect(JSON.parse(stdout).releaseId).toBe(fixture.oldReleaseId);
    expect(files(destination)).toEqual(files(old.root));
    for (const path of files(destination)) expect(readFileSync(join(destination, path))).toEqual(readFileSync(join(old.root, path)));
  });
  it('serves only static bytes with CMS/API absent, denied connections and normal 404s', async () => {
    const exported = exportStaticRelease(input()), output = json(join(exported.root, 'export-manifest.json'));
    const requests: string[] = [];
    const server = createServer((request, response) => {
      const path = new URL(request.url!, 'http://localhost').pathname; requests.push(path);
      response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; font-src 'none'; object-src 'none'; form-action 'none'");
      const relative = path.startsWith(exported.basePath) ? path.slice(exported.basePath.length) : '';
      if (!Object.hasOwn(output.files, relative)) { response.writeHead(404); response.end(); return; }
      response.writeHead(200); response.end(readFileSync(join(exported.root, 'sites/demo-cms', relative)));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      for (const name of Object.keys(output.files)) {
        const response = await fetch(origin + exported.basePath + name);
        expect(response.status).toBe(200); expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'");
        expect(hash(Buffer.from(await response.arrayBuffer()))).toBe(output.files[name].sha256);
      }
      for (const path of ['/api/v1/cms/websites/demo-cms/pages/home', '/cms.db', exported.basePath + 'release.json', exported.basePath + 'missing.html']) expect((await fetch(origin + path)).status).toBe(404);
      expect(requests.some(path => path.includes('local-access'))).toBe(false);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it('rejects unknown/unpublished releases and sites without an active release', () => {
    expect(() => exportStaticRelease({ ...input(), release: randomUUID() })).toThrow('Unknown or unpublished');
    expect(() => exportStaticRelease({ ...input(), websiteId: 'demo-other' })).toThrow('No active');
    const root = clone(), db = new Database(join(root, 'cms.db')); db.prepare("UPDATE cms_attempts SET status='failed' WHERE id=?").run(fixture.releaseId); db.close();
    const chosen = input(root); expect(() => exportStaticRelease(chosen)).toThrow('Unknown or unpublished'); expect(existsSync(chosen.targetRoot)).toBe(false);
  });
  it('fails before writing on missing bytes, bad hashes, bad links and non-public paths', () => {
    for (const mode of ['missing', 'hash', 'link', 'fragment', 'path', 'external', 'identity']) {
      const root = clone();
      if (mode === 'missing') rmSync(join(sourceRelease(root), 'index.html'));
      if (mode === 'hash') writeFileSync(join(sourceRelease(root), 'index.html'), 'changed');
      if (mode === 'link' || mode === 'external' || mode === 'fragment') {
        const path = join(sourceRelease(root), 'index.html'), text = readFileSync(path, 'utf8') + (mode === 'link' ? '<a href="/sites/demo-cms/missing.html">Missing</a>' : mode === 'fragment' ? '<a href="#missing">Missing</a>' : '<link rel="stylesheet" href="https://example.invalid/style">');
        writeFileSync(path, text); manifest(root, value => { value.files['index.html'] = hash(text); });
      }
      if (mode === 'path') manifest(root, value => { value.files['../private.html'] = '0'.repeat(64); });
      if (mode === 'identity') manifest(root, value => { value.releaseId = randomUUID(); });
      const chosen = input(root); expect(() => exportStaticRelease(chosen), mode).toThrow(); expect(existsSync(chosen.targetRoot), mode).toBe(false);
    }
  });
  it.each([
    '<script>fetch("/api/v1/cms")</script>',
    '<style>body{background:url(https://example.invalid/image)}</style>',
    '<p style="background:url(/api/image)">Inline</p>',
    '<img srcset="https://example.invalid/image 1x">',
    '<img src=https://example.invalid/image>',
    '<img src="/sites/demo-cms/index.html" onerror="fetch(\'/api\')">',
    '<iframe src="https://example.invalid/"></iframe>',
    '<meta http-equiv="refresh" content="0;url=https://example.invalid/">',
    '<object data="/api/image"></object>',
  ])('rejects unsupported HTML before creating a target: %s', addition => {
    const root = clone(), path = join(sourceRelease(root), 'index.html');
    const text = readFileSync(path, 'utf8') + addition;
    writeFileSync(path, text); manifest(root, value => { value.files['index.html'] = hash(text); });
    const chosen = input(root);
    expect(() => exportStaticRelease(chosen)).toThrow(/Unsupported HTML|Inline scripts/);
    expect(existsSync(chosen.targetRoot)).toBe(false);
  });
  it('rejects a file exceeding the remaining budget before reading its bytes', () => {
    const root = clone(), source = sourceRelease(root), inventory = json(join(source, 'release.json'));
    const names = Object.keys(inventory.files), oversized = join(source, names[1]!);
    const firstBytes = readFileSync(join(source, names[0]!)).length;
    const original = vi.mocked(lstatSync).getMockImplementation()!;
    vi.mocked(lstatSync).mockImplementation(((...args: Parameters<typeof lstatSync>) => {
      const stat = original(...args);
      return args[0] === oversized ? Object.assign(Object.create(Object.getPrototypeOf(stat)), stat, { size: 256 * 1024 * 1024 - firstBytes + 1 }) : stat;
    }) as typeof lstatSync);
    vi.mocked(readFileSync).mockClear();
    const chosen = input(root);
    try {
      expect(() => exportStaticRelease(chosen)).toThrow('exceeds 256 MiB');
      expect(vi.mocked(readFileSync).mock.calls.some(args => args[0] === oversized)).toBe(false);
      expect(existsSync(chosen.targetRoot)).toBe(false);
    } finally { vi.mocked(lstatSync).mockImplementation(original); }
  });
  it('rejects symlinks and preserves an existing destination', () => {
    const root = clone(), path = join(sourceRelease(root), 'template-assets'), original = path + '-original';
    cpSync(path, original, { recursive: true }); rmSync(path, { recursive: true }); symlinkSync(original, path, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => exportStaticRelease(input(root))).toThrow('Unsafe release file'); unlinkSync(path);
    const chosen = input(); mkdirSync(chosen.targetRoot); writeFileSync(join(chosen.targetRoot, 'keep.txt'), 'keep');
    expect(() => exportStaticRelease(chosen)).toThrow('already exists'); expect(readFileSync(join(chosen.targetRoot, 'keep.txt'), 'utf8')).toBe('keep');
  });
  it('cleans its own partial copy and permits retry without touching source pins', () => {
    const chosen = input(), before = hash(readFileSync(join(sourceRelease(), 'release.json')));
    expect(() => exportStaticRelease(chosen, { afterFile: () => { throw Error('copy failure'); } })).toThrow('copy failure');
    expect(existsSync(chosen.targetRoot)).toBe(false); expect(hash(readFileSync(join(sourceRelease(), 'release.json')))).toBe(before);
    expect(exportStaticRelease(chosen).releaseId).toBe(fixture.releaseId);
  });
  it('does not delete a replacement directory after a copy failure', () => {
    const chosen = input();
    expect(() => exportStaticRelease(chosen, { afterFile: () => {
      if (!existsSync(chosen.targetRoot)) { mkdirSync(chosen.targetRoot); writeFileSync(join(chosen.targetRoot, 'keep.txt'), 'other owner'); }
    } })).toThrow('overwrite is forbidden');
    expect(readFileSync(join(chosen.targetRoot, 'keep.txt'), 'utf8')).toBe('other owner');
  });
});
