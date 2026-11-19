import { describe, expect, it } from 'vitest';
import { createPlannerClient, createPlannerHttpTransport, type PlannerCommand } from '../src/index.js';

describe('injected Planner client context', () => {
  it('captures workspace context independently for outstanding calls', async () => {
    const seen: PlannerCommand[] = [];
    const transport = async (command: PlannerCommand) => { seen.push(command); return { ok: true as const, value: [] }; };
    const first = createPlannerClient(transport, 'local');
    const second = createPlannerClient(transport, 'other');
    await Promise.all([first.list(), second.history(), first.preferences.get()]);
    expect(seen.map(command => command.workspaceId)).toEqual(['local', 'other', 'local']);
  });
  it('reports transport failure without attempting another storage mode', async () => {
    let attempts = 0;
    const fetcher: typeof fetch = async () => { attempts++; throw new Error('Offline'); };
    const client = createPlannerClient(createPlannerHttpTransport('', fetcher), 'local');
    await expect(client.create({ title: 'Fictieve offline taak' })).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
    expect(attempts).toBe(1);
  });
  it('maps a malformed HTTP envelope to the shared unavailable error', async () => {
    const fetcher: typeof fetch = async () => new Response('{"error":"Bad gateway"}', { status: 502 });
    const client = createPlannerClient(createPlannerHttpTransport('', fetcher), 'local');
    await expect(client.list()).rejects.toMatchObject({ code: 'UNAVAILABLE', status: 503 });
  });

});
