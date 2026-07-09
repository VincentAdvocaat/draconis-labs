import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerPlannerRoutes } from './planner.js';

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') ?? true,
});

app.get('/health', async () => ({
  status: 'ok',
  service: 'draconis-api',
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

await registerPlannerRoutes(app);

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
await app.listen({ port, host });
