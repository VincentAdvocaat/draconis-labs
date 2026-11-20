import { createHash, randomUUID } from 'node:crypto';
import { createBookingService } from '@draconis/planner-core';
import { createSqliteBookingStorage } from '@draconis/planner-sqlite';
import { LOCAL_WORKSPACE_ID } from '@draconis/shared';
import { sqlite } from '../../core/db.js';
import { identifyActor } from '../../core/auth.js';
import type { ApiModule } from '../../core/module.js';
import { createBookingRoutes } from './routes.js';

export const bookingModule: ApiModule = {
  name: 'bookings', prefix: '/workspaces/:workspaceId', legacyAlias: false,
  description: 'Local workspace contacts, appointments and capacity',
  register: createBookingRoutes(createBookingService(createSqliteBookingStorage(sqlite, LOCAL_WORKSPACE_ID), {
    id: randomUUID, now: () => new Date().toISOString(), hash: value => createHash('sha256').update(value).digest('hex'),
  }), identifyActor),
};
