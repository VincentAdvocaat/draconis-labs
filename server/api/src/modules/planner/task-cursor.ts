import { createHash } from 'node:crypto';
import type { PlannerCommandService } from '@draconis/planner-core';
import { ISO_DATE_PATTERN, LANES, taskListQuerySchema, todayInTimezone, type PlannerReply } from '@draconis/shared';
import { z } from 'zod';
import { parseTaskListQuery } from './query.js';

export const workspaceTaskListQuerySchema = taskListQuerySchema.extend({
  pagination: z.literal('cursor').optional().describe('Select cursor pagination on the first request. Omit page.'),
  cursor: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).optional()
    .describe('The nextCursor from the previous page. Repeat the same filters and omit page.'),
});

const cursorSchema = z.strictObject({
  version: z.literal(1),
  context: z.string().regex(/^[a-f0-9]{64}$/),
  lane: z.enum(LANES),
  position: z.number().finite(),
  id: z.string().uuid(),
});

const invalidInput = { ok: false, error: { code: 'INVALID_INPUT', status: 400, message: 'Ongeldige invoer' } } as const;

function decodeCursor(token: string) {
  try {
    const bytes = Buffer.from(token, 'base64url');
    if (bytes.toString('base64url') !== token) return;
    const parsed = cursorSchema.safeParse(JSON.parse(bytes.toString('utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export async function listWorkspaceTasksByCursor(service: PlannerCommandService, workspaceId: string, requestedWorkspaceId: string, rawQuery: unknown): Promise<PlannerReply> {
  const parsed = workspaceTaskListQuerySchema.safeParse(rawQuery);
  if (!parsed.success || parsed.data.page !== undefined) return invalidInput;
  if (requestedWorkspaceId !== workspaceId) {
    return { ok: false, error: { code: 'WORKSPACE_NOT_FOUND', status: 404, message: 'Werkruimte niet gevonden' } };
  }

  const { cursor, pagination: _pagination, pageSize = 50, page: _page, ...filterInput } = parsed.data;
  const filters = parseTaskListQuery(filterInput);
  if (filters.date !== undefined && filters.date !== 'today' && !ISO_DATE_PATTERN.test(filters.date)) return invalidInput;
  const now = new Date();
  const timezone = filters.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  let day: string;
  try {
    day = todayInTimezone(timezone, now);
  } catch (error) {
    if (error instanceof RangeError) return invalidInput;
    throw error;
  }

  const relativeDate = filters.date === 'today' || filters.future || filters.overdue;
  const context = createHash('sha256')
    .update(JSON.stringify([workspaceId, filters, relativeDate ? { timezone, day } : null]))
    .digest('hex');
  const after = cursor === undefined ? undefined : decodeCursor(cursor);
  if (cursor !== undefined && after?.context !== context) return invalidInput;

  const rows = await service.listByCursor({ filters: { ...filters, timezone }, after, limit: pageSize + 1, now });
  const items = rows.slice(0, pageSize);
  const last = items.at(-1);
  const nextCursor = rows.length > pageSize && last
    ? Buffer.from(JSON.stringify({ version: 1, context, lane: last.lane, position: last.position, id: last.id })).toString('base64url')
    : null;
  return { ok: true, value: { items, pageSize, nextCursor } };
}
