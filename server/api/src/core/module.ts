import type { FastifyInstance } from 'fastify';

export interface ApiModule {
  /** Stable module identifier (e.g. planner, system). */
  name: string;
  /** Route prefix under /api/v1 (e.g. /planner). */
  prefix: string;
  description?: string;
  register: (app: FastifyInstance) => Promise<void>;
}
