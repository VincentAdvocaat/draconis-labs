import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { apiKeys, db } from './db.js';

export interface Actor {
  kind: 'user' | 'agent';
  name: string;
}

const hashKey = (key: string) =>
  createHash('sha256').update(key).digest('hex');

const configuredKeys =
  process.env.DRACONIS_API_KEYS ??
  (process.env.NODE_ENV === 'production' ? '' : 'local-agent:dev-agent-key');

for (const value of configuredKeys.split(',').filter(Boolean)) {
  const separator = value.indexOf(':');
  if (separator < 1) continue;
  const name = value.slice(0, separator).trim();
  const key = value.slice(separator + 1).trim();
  if (!key) continue;

  db.insert(apiKeys)
    .values({
      id: randomUUID(),
      name,
      keyHash: hashKey(key),
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: apiKeys.name,
      set: { keyHash: hashKey(key) },
    })
    .run();
}

export function identifyActor(request: FastifyRequest): Actor {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return { kind: 'user', name: 'user' };
  }

  const suppliedHash = hashKey(authorization.slice('Bearer '.length));
  const records = db.select().from(apiKeys).all();
  const match = records.find((record) => {
    const expected = Buffer.from(record.keyHash, 'hex');
    const supplied = Buffer.from(suppliedHash, 'hex');
    return (
      expected.length === supplied.length && timingSafeEqual(expected, supplied)
    );
  });

  if (!match) {
    const error = new Error('Ongeldige API-key');
    Object.assign(error, { statusCode: 401 });
    throw error;
  }

  return { kind: 'agent', name: match.name };
}

export function listApiKeyNames() {
  return db
    .select({ name: apiKeys.name })
    .from(apiKeys)
    .all()
    .map(({ name }) => name);
}
