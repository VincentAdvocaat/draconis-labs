import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { MediaContractError } from '../media-fixture/contracts.js';
import { FIXTURE_WEBSITES } from '../media-fixture/fixture.js';
import { assertFixtureRoot } from '../media-fixture/safety.js';
import { ensureUploadSchema } from './schema.js';

export const rightsInputSchema = z.object({
  expectedVersion: z.number().int().positive(), status: z.enum(['cleared', 'blocked']),
  owner: z.string().trim().min(2).max(200), source: z.string().trim().min(3).max(1000),
  basis: z.string().trim().min(10).max(2000), employee: z.string().trim().min(2).max(200), confirmed: z.literal(true),
}).strict();
export type RightsInput = z.infer<typeof rightsInputSchema>;

/** Shared media metadata service. The caller supplies a trusted employee context in this local probe. */
export class MediaRightsService {
  private readonly db: Database.Database;
  private readonly ownsDatabase: boolean;
  constructor(root: string, database?: Database.Database) {
    const path = join(assertFixtureRoot(root), 'media.sqlite');
    if (database && resolve(database.name) !== resolve(path)) throw new Error('Injected database must belong to fixture');
    this.ownsDatabase = !database;
    this.db = database ?? new Database(path);
    try {
      ensureUploadSchema(this.db);
      this.db.exec(`CREATE TABLE IF NOT EXISTS media_rights_audit(website TEXT NOT NULL,asset TEXT NOT NULL,
        version INTEGER NOT NULL,decision TEXT NOT NULL,recorded_at TEXT NOT NULL,PRIMARY KEY(website,asset,version))`);
    } catch (error) { if (this.ownsDatabase) this.db.close(); throw error; }
  }
  close() { if (this.ownsDatabase) this.db.close(); }
  private authorize(website: string) {
    if (!FIXTURE_WEBSITES.includes(website)) throw new MediaContractError(403, 'Website access denied');
  }
  setRights(website: string, assetId: string, input: unknown) {
    this.authorize(website);
    const decision = rightsInputSchema.parse(input);
    return this.db.transaction(() => {
      const asset = this.db.prepare('SELECT metadata_version FROM assets WHERE website=? AND id=?')
        .get(website, assetId) as { metadata_version: number } | undefined;
      if (!asset) throw new MediaContractError(404, 'Asset not found');
      if (asset.metadata_version !== decision.expectedVersion) throw new MediaContractError(409, 'Rights version conflict');
      if (decision.status === 'cleared' && this.db.prepare("SELECT 1 FROM upload_jobs WHERE website=? AND asset=? AND state='processing'").get(website, assetId))
        throw new MediaContractError(409, 'Wait for the pending file version before approving rights');
      const version = decision.expectedVersion + 1;
      this.db.prepare('UPDATE assets SET rights=?,metadata_version=? WHERE website=? AND id=?')
        .run(decision.status, version, website, assetId);
      this.db.prepare('INSERT INTO media_rights_audit VALUES(?,?,?,?,?)')
        .run(website, assetId, version, JSON.stringify(decision), new Date().toISOString());
      return { metadataVersion: version, rights: decision.status };
    }).immediate();
  }
  requireApproval(website: string, assetId: string) {
    this.authorize(website);
    const evidence = this.db.prepare('SELECT decision FROM media_rights_audit WHERE website=? AND asset=? ORDER BY version DESC LIMIT 1')
      .get(website, assetId) as { decision: string } | undefined;
    if (!evidence || (JSON.parse(evidence.decision) as { status: string }).status !== 'cleared')
      throw new MediaContractError(409, 'Explicit employee rights approval required');
  }
  invalidateForNewVersion(website: string, assetId: string, fileVersion: number, jobId: string) {
    this.authorize(website);
    return this.db.transaction(() => {
      const asset = this.db.prepare('SELECT metadata_version,rights FROM assets WHERE website=? AND id=?').get(website, assetId) as { metadata_version: number; rights: string } | undefined;
      if (!asset) throw new MediaContractError(404, 'Asset not found');
      const rights = asset.rights === 'blocked' ? 'blocked' : 'unknown', version = asset.metadata_version + 1;
      this.db.prepare('UPDATE assets SET rights=?,metadata_version=? WHERE website=? AND id=?').run(rights, version, website, assetId);
      this.db.prepare('INSERT INTO media_rights_audit VALUES(?,?,?,?,?)').run(website, assetId, version,
        JSON.stringify({ status: rights, type: 'new-file-version', fileVersion, jobId, requiresEmployeeApproval: true }), new Date().toISOString());
      return { rights, metadataVersion: version };
    }).immediate();
  }
}
