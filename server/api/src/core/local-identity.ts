import { createHash } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { LOCAL_WORKSPACE_ID, type PlannerCommand } from '@draconis/shared';
import type { Actor } from './auth.js';
import { isAgentCredential, type AgentCredentials } from './agent-credentials.js';

const userId = z.string().regex(/^[a-zA-Z0-9._~-]{1,100}$/);
const configSchema = z.strictObject({
  ownerId: userId,
  members: z.array(z.strictObject({ userId, role: z.enum(['editor', 'viewer']) })),
  sessions: z.array(z.strictObject({
    userId,
    tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: z.iso.datetime(),
  })).min(1),
});

type Role = 'owner' | 'editor' | 'viewer';
const permissions: Record<PlannerCommand['type'], readonly Role[]> = {
  'tasks.list': ['owner', 'editor', 'viewer'],
  'tasks.create': ['owner', 'editor'],
  'tasks.update': ['owner', 'editor'],
  'tasks.remove': ['owner'],
  'history.list': ['owner', 'editor', 'viewer'],
  'preferences.get': ['owner', 'editor', 'viewer'],
  'preferences.update': ['owner'],
};

export type AuthorizePlanner = (
  request: FastifyRequest,
  workspaceId: string,
  operation: PlannerCommand['type'],
) => { ok: true; actor: Actor } | {
  ok: false;
  error: { code: 'UNAUTHORIZED'; status: 401; message: string } | { code: 'FORBIDDEN'; status: 403; message: string };
};

const unauthorized = { ok: false, error: { code: 'UNAUTHORIZED', status: 401, message: 'Ongeldige aanmelding' } } as const;
const forbidden = { ok: false, error: { code: 'FORBIDDEN', status: 403, message: 'Geen toegang tot deze werkruimte of handeling.' } } as const;
const readBearer = (request: FastifyRequest) => /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization ?? '')?.[1];

export function allowScopedAgents(authorizeUser: AuthorizePlanner, credentials: AgentCredentials): AuthorizePlanner {
  return (request, workspaceId, operation) => {
    const token = readBearer(request);
    if (!token || !isAgentCredential(token)) return authorizeUser(request, workspaceId, operation);
    const access = credentials.authenticate(token, workspaceId, operation);
    if (access.status === 401) return unauthorized;
    if (access.status === 403) return forbidden;
    return { ok: true, actor: { kind: 'agent', name: access.name } };
  };
}

export function createLocalIdentity(input: unknown, now = Date.now): AuthorizePlanner {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) throw new Error('Ongeldige configuratie voor lokale testidentiteit.');
  const { ownerId, members, sessions } = parsed.data;
  const roles = new Map<string, Role>([[ownerId, 'owner']]);
  for (const member of members) {
    if (roles.has(member.userId)) throw new Error('Dubbel gebruikers-ID in werkruimtelidmaatschap.');
    roles.set(member.userId, member.role);
  }
  const sessionsByHash = new Map(sessions.map(session => [session.tokenHash, session]));
  if (sessionsByHash.size !== sessions.length) throw new Error('Dubbele lokale testsessie.');

  return (request, workspaceId, operation) => {
    const bearer = readBearer(request);
    const hash = bearer && createHash('sha256').update(bearer).digest('hex');
    const session = hash ? sessionsByHash.get(hash) : undefined;
    if (!session || Date.parse(session.expiresAt) <= now()) {
      return unauthorized;
    }

    const role = roles.get(session.userId);
    if (workspaceId !== LOCAL_WORKSPACE_ID || !role || !permissions[operation]?.includes(role)) {
      return forbidden;
    }
    return { ok: true, actor: { kind: 'user', name: session.userId } };
  };
}

export function localIdentityHost(host: string | undefined): string {
  if (host === undefined) return '127.0.0.1';
  if (host === '127.0.0.1' || host === '::1') return host;
  throw new Error('Het lokale testidentiteitsprofiel vereist HOST=127.0.0.1 of HOST=::1.');
}
