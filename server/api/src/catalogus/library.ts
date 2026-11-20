import type Database from 'better-sqlite3';
import { z } from 'zod';
import { MediaContractError, type PublicVariant } from '../media-fixture/contracts.js';

const querySchema = z.object({
  q: z.string().max(100).default(''), rights: z.enum(['unknown', 'cleared', 'blocked']).optional(),
  state: z.enum(['ready', 'processing', 'failed']).optional(),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).strict();
interface AssetRow { assetId: string; metadataVersion: number; rights: string; archived: number; fileVersion: number | null; state: string | null }

/** Read queries only; caller owns website authorization and the existing schema/connection. */
export class MediaLibrary {
  constructor(private db: Database.Database) {}
  list(website: string, input: unknown) {
    const query = querySchema.parse(input);
    // One read transaction gives total and rows the same database snapshot. Across requests
    // offsets have normal live-list semantics: concurrent inserts can shift later pages.
    return this.db.transaction(() => {
      const where = `a.website=@website AND a.archived=0 AND instr(lower(a.id),lower(@q))>0
        AND (@rights IS NULL OR a.rights=@rights) AND (@state IS NULL OR f.state=@state)`;
      const from = `FROM assets a LEFT JOIN files f ON f.website=a.website AND f.asset=a.id
        AND f.version=(SELECT MAX(version) FROM files WHERE website=a.website AND asset=a.id)`;
      const parameters = { website, q: query.q, rights: query.rights ?? null, state: query.state ?? null };
      const { total } = this.db.prepare(`SELECT COUNT(*) AS total ${from} WHERE ${where}`).get(parameters) as { total: number };
      const items = this.db.prepare(`SELECT a.id AS assetId,a.metadata_version AS metadataVersion,a.rights,
        f.version AS fileVersion,f.state ${from} WHERE ${where} ORDER BY a.id COLLATE BINARY LIMIT @limit OFFSET @offset`)
        .all({ ...parameters, limit: query.limit, offset: query.offset }) as Omit<AssetRow, 'archived'>[];
      return { ...query, total, items };
    })();
  }
  detail(website: string, id: string) {
    z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).parse(id);
    return this.db.transaction(() => {
      const asset = this.db.prepare('SELECT id AS assetId,metadata_version AS metadataVersion,rights,archived FROM assets WHERE website=? AND id=?')
        .get(website, id) as Pick<AssetRow, 'assetId' | 'metadataVersion' | 'rights' | 'archived'> | undefined;
      if (!asset) throw new MediaContractError(404, 'Afbeelding niet gevonden voor deze website');
      const files = this.db.prepare('SELECT version AS fileVersion,state,variants FROM files WHERE website=? AND asset=? ORDER BY version DESC')
        .all(website, id) as { fileVersion: number; state: string; variants: string }[];
      const usages = this.db.prepare('SELECT kind,owner,file_version AS fileVersion,slot FROM usages WHERE website=? AND asset=? ORDER BY kind,owner,slot')
        .all(website, id);
      return { ...asset, versions: files.map(file => ({ fileVersion: file.fileVersion, state: file.state,
        variants: (JSON.parse(file.variants) as PublicVariant[]).map(({ mime, width, height, bytes }) => ({ mime, width, height, bytes })) })), usages };
    })();
  }
}
