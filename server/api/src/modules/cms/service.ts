import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CmsError, render, type Attempt, type ReleaseInput } from './model.js';
import { CmsRepository } from './repository.js';

export interface BuildHooks {
  beforeBuild?: () => Promise<void>;
  beforeActivate?: () => Promise<void>;
  afterActivate?: () => Promise<void>;
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export class CmsService {
  constructor(readonly repository: CmsRepository, readonly releasesRoot: string, private hooks: BuildHooks = {}) {}

  async publish(websiteId: string, input: ReleaseInput, key: string, actor: string): Promise<Attempt> {
    const start = this.repository.begin(websiteId, input, key, actor);
    if (!start.created) return start.attempt;
    const attempt = start.attempt;
    try {
      await this.hooks.beforeBuild?.();
      const html = render(this.repository.revision(websiteId, input.revisionId));
      const siteRoot = join(this.releasesRoot, websiteId);
      const staging = join(siteRoot, `.staging-${randomUUID()}`);
      const complete = join(siteRoot, attempt.releaseId);
      await mkdir(staging, { recursive: true });
      await writeFile(join(staging, 'index.html'), html, { flag: 'wx', flush: true });
      const manifest = JSON.stringify({ schemaVersion: 1, websiteId, releaseId: attempt.releaseId,
        revisionId: input.revisionId, template: 'plain-page@1', files: { 'index.html': sha256(html) } });
      await writeFile(join(staging, 'release.json'), manifest, { flag: 'wx', flush: true });
      if (sha256(await readFile(join(staging, 'index.html'), 'utf8')) !== sha256(html)) {
        throw new Error('Output validation failed');
      }
      await rename(staging, complete);
      await this.hooks.beforeActivate?.();
      const activated = this.repository.activate(attempt);
      await this.hooks.afterActivate?.();
      return activated;
    } catch {
      // A failure after a committed activation cannot downgrade or undo the published release.
      this.repository.finish(attempt, 'failed', 'build_failed');
      return this.repository.attempt(websiteId, attempt.releaseId);
    }
  }

  async publicHtml(websiteId: string): Promise<string> {
    // Never accept a request path as a filesystem path. All three segments are server-controlled.
    if (!['demo-cms', 'demo-other'].includes(websiteId)) throw new CmsError(404, 'Website niet gevonden');
    const active = this.repository.active(websiteId);
    if (!active.activeReleaseId) throw new CmsError(404, 'Nog geen gepubliceerde pagina');
    try {
      const root = join(this.releasesRoot, websiteId, active.activeReleaseId);
      const html = await readFile(join(root, 'index.html'), 'utf8');
      const manifest = JSON.parse(await readFile(join(root, 'release.json'), 'utf8')) as { files: Record<string, string> };
      if (manifest.files['index.html'] !== sha256(html)) throw new Error('Checksum mismatch');
      return html;
    } catch { throw new CmsError(503, 'Gepubliceerde pagina tijdelijk niet beschikbaar'); }
  }
}
