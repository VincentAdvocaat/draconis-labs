import type { FastifyReply, FastifyRequest } from 'fastify';

const LEGACY_SUNSET = '2026-12-31';

export async function addLegacyDeprecationHeaders(
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  reply.header('Deprecation', 'true');
  reply.header('Sunset', LEGACY_SUNSET);
  reply.header('Link', '</api/v1>; rel="successor-version"');
}
