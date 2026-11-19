import type { FastifyInstance } from 'fastify';

export interface ApiModule {
  /** Stable module identifier (e.g. planner, system). */
  name: string;
  /** Route prefix under /api/v1 (e.g. /planner). */
  prefix: string;
  description?: string;
  /** Defaults to true for existing modules. New workspace contracts are versioned only. */
  legacyAlias?: boolean;
  register: (app: FastifyInstance) => Promise<void>;
}
