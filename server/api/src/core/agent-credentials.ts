import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { LOCAL_WORKSPACE_ID, type PlannerCommand } from '@draconis/shared';
import { z } from 'zod';

const scopeSchema = z.enum(['tasks:read', 'tasks:create', 'tasks:update', 'tasks:delete']);
type Scope = z.infer<typeof scopeSchema>;
const operationScopes: Partial<Record<PlannerCommand['type'], Scope>> = {
  'tasks.list': 'tasks:read',
  'history.list': 'tasks:read',
  'tasks.create': 'tasks:create',
  'tasks.update': 'tasks:update',
  'tasks.remove': 'tasks:delete',
};

const newPrincipal = z.strictObject({
  name: z.string().regex(/^[a-zA-Z0-9._~-]{1,100}$/),
  scopes: z.array(scopeSchema).min(1),
});
const prefix = 'dla_';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

type Credential = {
  id: string;
  principalId: string;
  name: string;
  workspaceId: string;
  scopes: Scope[];
  expiresAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  rotatedAt: number | null;
};
type CredentialRow = Omit<Credential, 'scopes'> & { scopes: string };
const describeCredential = (row: CredentialRow): Credential => ({
  ...row, scopes: z.array(scopeSchema).parse(JSON.parse(row.scopes)),
});

const credentialProjection = [
  'k.id',
  'k.principal_id AS principalId',
  'p.name',
  'p.workspace_id AS workspaceId',
  'p.scopes',
  'k.expires_at AS expiresAt',
  'k.last_used_at AS lastUsedAt',
  'k.revoked_at AS revokedAt',
  'k.rotated_at AS rotatedAt',
].join(', ');

export function isAgentCredential(token: string) {
  return token.startsWith(prefix);
}

export function agentScopeFor(operation: PlannerCommand['type']) {
  return operationScopes[operation];
}

export function createAgentCredentials(db: Database.Database, clock = Date.now) {
  db.exec(
    'CREATE TABLE IF NOT EXISTS local_agent_principals (' +
      'id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL, scopes TEXT NOT NULL' +
    ');' +
    'CREATE TABLE IF NOT EXISTS local_agent_credentials (' +
      'id TEXT PRIMARY KEY, principal_id TEXT NOT NULL REFERENCES local_agent_principals(id),' +
      'token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL,' +
      'last_used_at INTEGER, revoked_at INTEGER, rotated_at INTEGER' +
    ');',
  );
  const read = db.prepare<string, CredentialRow>(
    'SELECT ' + credentialProjection + ' FROM local_agent_credentials k ' +
    'JOIN local_agent_principals p ON p.id = k.principal_id WHERE k.id = ?',
  );
  const list = db.prepare<[], CredentialRow>(
    'SELECT ' + credentialProjection + ' FROM local_agent_credentials k ' +
    'JOIN local_agent_principals p ON p.id = k.principal_id ORDER BY p.name, k.id',
  );
  const lookup = db.prepare<string, CredentialRow>(
    'SELECT ' + credentialProjection + ' FROM local_agent_credentials k ' +
    'JOIN local_agent_principals p ON p.id = k.principal_id WHERE k.token_hash = ?',
  );
  const use = db.prepare<[number, string]>(
    'UPDATE local_agent_credentials SET last_used_at = MAX(COALESCE(last_used_at, 0), ?) WHERE id = ?',
  );
  const insert = db.prepare<[string, string, string, number]>(
    'INSERT INTO local_agent_credentials (id, principal_id, token_hash, expires_at) VALUES (?, ?, ?, ?)',
  );

  const expiry = (value: unknown, now: number) => {
    const time = Date.parse(z.iso.datetime().parse(value));
    if (time <= now) throw new Error('Kies een vervaltijd in de toekomst.');
    return time;
  };
  const issue = (principalId: string, expiresAt: number) => {
    const id = randomUUID();
    const token = prefix + randomBytes(32).toString('base64url');
    insert.run(id, principalId, hash(token), expiresAt);
    return { credential: describeCredential(read.get(id)!), token };
  };

  const create = db.transaction((input: unknown, expires: unknown) => {
    const { name, scopes } = newPrincipal.parse(input);
    const expiresAt = expiry(expires, clock());
    const id = randomUUID();
    db.prepare('INSERT INTO local_agent_principals (id, name, workspace_id, scopes) VALUES (?, ?, ?, ?)')
      .run(id, name, LOCAL_WORKSPACE_ID, JSON.stringify([...new Set(scopes)]));
    return issue(id, expiresAt);
  });

  const rotate = db.transaction((id: string, expires: unknown, overlapSeconds: unknown) => {
    const now = clock();
    const expiresAt = expiry(expires, now);
    const overlap = z.number().int().nonnegative().max(86400).parse(overlapSeconds) * 1000;
    const current = read.get(id);
    if (!current || current.revokedAt !== null || current.rotatedAt !== null || current.expiresAt <= now) {
      throw new Error('Deze credential kan niet worden geroteerd.');
    }
    db.prepare('UPDATE local_agent_credentials SET rotated_at = ?, expires_at = ? WHERE id = ?')
      .run(now, Math.min(current.expiresAt, now + overlap), id);
    return issue(current.principalId, expiresAt);
  });

  const authenticate = db.transaction((token: string, workspaceId: string, operation: PlannerCommand['type']) => {
    if (!/^dla_[A-Za-z0-9_-]{43}$/.test(token)) return { status: 401 } as const;
    const credential = lookup.get(hash(token));
    const now = clock();
    if (!credential || credential.revokedAt !== null || credential.expiresAt <= now) return { status: 401 } as const;

    const requiredScope = agentScopeFor(operation);
    const { scopes } = describeCredential(credential);
    if (workspaceId !== credential.workspaceId || !requiredScope || !scopes.includes(requiredScope)) {
      return { status: 403 } as const;
    }
    use.run(now, credential.id);
    return { status: 200, name: credential.name } as const;
  });

  return {
    create: create.immediate,
    rotate: rotate.immediate,
    authenticate: authenticate.immediate,
    revoke(id: string) {
      const result = db.prepare('UPDATE local_agent_credentials SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?').run(clock(), id);
      if (!result.changes) throw new Error('Onbekende credential.');
      return describeCredential(read.get(id)!);
    },
    list: () => list.all().map(describeCredential),
  };
}

export type AgentCredentials = ReturnType<typeof createAgentCredentials>;
