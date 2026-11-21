import type { Pool } from 'pg';
import {
  createBookingService, createPublicBookingService, type BookingEnvironment, type PublicChannel,
  type PublicBookingStorage,
} from '@draconis/planner-core';
import { bookingCommandSchema, type PlannerReply } from '@draconis/shared';
import { bookingStateStorage, emptyBookingState, type BookingState } from './booking-state.js';
import { requireWorkspace, transaction } from './transaction.js';

function publicStorageFailure(error: unknown) {
  if (error instanceof Error && 'statusCode' in error && error.statusCode === 404) {
    return { ok: false, error: { code: 'CHANNEL_NOT_FOUND', status: 404, message: 'Boekingskanaal niet gevonden.' } } as const;
  }
  return { ok: false, error: { code: 'INTERNAL_ERROR', status: 500, message: 'De boeking kon niet worden verwerkt.' } } as const;
}

export function createPostgresBookings(pool: Pool, workspaceId: string, environment: BookingEnvironment) {
  async function run<Reply extends { ok: boolean }>(execute: (storage: PublicBookingStorage) => Reply): Promise<Reply> {
    return transaction(pool, async client => {
      await requireWorkspace(client, workspaceId, true);
      const { rows } = await client.query<{ state: BookingState }>(
        'SELECT state FROM planner_booking_state WHERE workspace_id = $1', [workspaceId],
      );
      const state = rows[0]?.state ?? emptyBookingState();
      const { storage, changed } = bookingStateStorage(workspaceId, state);
      const reply = execute(storage);
      if (reply.ok && changed()) {
        await client.query(`
          INSERT INTO planner_booking_state (workspace_id, state) VALUES ($1, $2)
          ON CONFLICT (workspace_id) DO UPDATE SET state = EXCLUDED.state
        `, [workspaceId, state]);
      }
      return reply;
    });
  }

  return {
    async invoke(input: unknown, actor: { name: string }): Promise<PlannerReply> {
      const parsed = bookingCommandSchema.safeParse(input);
      if (!parsed.success) return { ok: false, error: { code: 'INVALID_INPUT', status: 400, message: 'Ongeldige invoer' } };
      if (parsed.data.workspaceId !== workspaceId) {
        return { ok: false, error: { code: 'WORKSPACE_NOT_FOUND', status: 404, message: 'Werkruimte niet gevonden' } };
      }
      try {
        return await run(storage => createBookingService(storage, environment).invoke(parsed.data, actor));
      } catch (error) {
        if (error instanceof Error && 'statusCode' in error && error.statusCode === 404) {
          return { ok: false, error: { code: 'WORKSPACE_NOT_FOUND', status: 404, message: 'Werkruimte niet gevonden' } };
        }
        return { ok: false, error: { code: 'INTERNAL_ERROR', status: 500, message: 'Planner kan de opdracht niet uitvoeren.' } };
      }
    },
    async registerChannel(channel: PublicChannel) {
      await run(storage => {
        storage.insertChannel(channel);
        return { ok: true };
      });
    },
    publicAvailability: (...args: Parameters<ReturnType<typeof createPublicBookingService>['availability']>) =>
      run(storage => createPublicBookingService(storage, environment).availability(...args)).catch(publicStorageFailure),
    publicReserve: (...args: Parameters<ReturnType<typeof createPublicBookingService>['reserve']>) =>
      run(storage => createPublicBookingService(storage, environment).reserve(...args)).catch(publicStorageFailure),
  };
}
