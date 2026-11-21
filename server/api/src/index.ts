import cors from '@fastify/cors';
import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { ZodError } from 'zod';
import { allowScopedAgents, createLocalIdentity, localIdentityHost } from './core/local-identity.js';
import { createAgentCredentials } from './core/agent-credentials.js';

const identityFile = process.env.DRACONIS_LOCAL_IDENTITY_FILE;
if (identityFile !== undefined && !process.env.DATABASE_PATH) {
  throw new Error('Geef DATABASE_PATH op voor de aparte lokale testdatabase.');
}
const authorize = identityFile === undefined
  ? undefined
  : createLocalIdentity(JSON.parse(readFileSync(identityFile, 'utf8')));
const host = authorize ? localIdentityHost(process.env.HOST) : process.env.HOST ?? '0.0.0.0';
const { registerPlatformApi } = await import('./core/index.js');

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
  methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});

app.get('/health', async () => ({
  status: 'ok',
  service: 'draconis-api',
  apiVersion: 'v1',
  timestamp: new Date().toISOString(),
}));

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      message: 'Ongeldige invoer',
      issues: error.issues,
    });
  }

  const statusCode =
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;
  if (statusCode >= 500) app.log.error(error);
  return reply.code(statusCode).send({
    message:
      statusCode >= 500
        ? 'Interne serverfout'
        : error instanceof Error
          ? error.message
          : 'Verzoek mislukt',
  });
});

if (authorize) {
  const { sqlite } = await import('./core/db.js');
  await registerPlatformApi(app, allowScopedAgents(authorize, createAgentCredentials(sqlite)));
} else {
  await registerPlatformApi(app);
}

const port = Number(process.env.PORT ?? 3001);
await app.listen({ port, host });
