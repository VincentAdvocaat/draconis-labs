import { replyEnvelopeSchema, type PlannerReply } from './planner-client.js';
import type { BookingTransport } from './bookings.js';

export function createBookingHttpTransport(baseUrl = '', fetcher: typeof fetch = fetch): BookingTransport {
  return async command => {
    const base = `${baseUrl}/api/v1/workspaces/${encodeURIComponent(command.workspaceId)}`;
    let path: string, method = 'GET';
    switch (command.type) {
      case 'zones.list': path = '/zones'; break;
      case 'zones.resolve': path = `/zones/resolve?postcode=${encodeURIComponent(command.input.postcode)}`; break;
      case 'zones.capacity': path = `/zones/${encodeURIComponent(command.id)}/capacity`; method = 'PATCH'; break;
      case 'slots.capacity': path = `/slots/${command.id}/capacity`; method = 'PATCH'; break;
      case 'contacts.list': {
        const query = new URLSearchParams();
        if (command.query?.q !== undefined) query.set('q', command.query.q);
        if (command.query?.archived !== undefined) query.set('archived', String(command.query.archived));
        path = `/contacts?${query}`; break;
      }
      case 'contacts.card': path = `/contacts/${command.id}`; break;
      case 'contacts.create': path = '/contacts'; method = 'POST'; break;
      case 'contacts.update': path = `/contacts/${command.id}`; method = 'PATCH'; break;
      case 'availability.list': path = `/availability?date=${command.date}${command.zoneId === undefined ? '' : '&zoneId='+encodeURIComponent(command.zoneId)}`; break;
      case 'appointments.list': path = `/appointments?date=${command.date}${command.zoneId === undefined ? '' : '&zoneId='+encodeURIComponent(command.zoneId)}`; break;
      case 'appointments.create': path = '/appointments'; method = 'POST'; break;
      case 'appointments.move': path = `/appointments/${command.id}/move`; method = 'POST'; break;
      case 'appointments.status': path = `/appointments/${command.id}/status`; method = 'POST'; break;
      case 'blocks.create': path = '/blocks'; method = 'POST'; break;
      case 'blocks.remove': path = `/blocks/${command.id}`; method = 'DELETE'; break;
    }
    try {
      const response = await fetcher(base + path, { method, ...('key' in command ? {
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: command.key, ...('input' in command ? { input: command.input } : {}) }),
      } : {}) });
      const raw: unknown = await response.json(), parsed = replyEnvelopeSchema.safeParse(raw);
      if (!parsed.success || response.ok !== parsed.data.ok || (parsed.data.ok && !Object.hasOwn(raw as object, 'value')) || (!parsed.data.ok && response.status !== parsed.data.error.status)) throw new Error('Invalid response');
      return parsed.data as PlannerReply;
    } catch { return { ok: false, error: { code: 'UNAVAILABLE', status: 503, message: 'Planner is niet bereikbaar. Probeer dezelfde handeling opnieuw.' } }; }
  };
}
