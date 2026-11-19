import { bookingCommandSchema, bookingAddDays, bookingToday, bookingInstant, DEFAULT_ZONE_ID, LOCAL_DEMO_ZONES, LOCAL_DEMO_POSTCODES, resolveDemoPostcode, LOCAL_BOOKING_POLICY,
  type Appointment, type BookingCommand, type BookingPolicy, type CustomerWindow, type DemoPostcodeAssignment, type PlannerErrorCode, type PlannerReply, type Slot } from '@draconis/shared';
import type { BookingEnvironment, BookingStorage } from './booking-storage.js';

class BookingError extends Error {
  readonly code: PlannerErrorCode;
  readonly status: 400 | 404 | 409;
  constructor(code: PlannerErrorCode, message: string, status: 400 | 404 | 409 = 409) { super(message); this.code = code; this.status = status; }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, child]) => [key, canonical(child)]));
  return value;
}
export function createBookingService(storage: BookingStorage, env: BookingEnvironment, suppliedPolicy: BookingPolicy = LOCAL_BOOKING_POLICY, suppliedPostcodes: readonly DemoPostcodeAssignment[] = LOCAL_DEMO_POSTCODES) {
  const policy: BookingPolicy = structuredClone(suppliedPolicy);
  const postcodeAssignments = structuredClone(suppliedPostcodes);
  if (!Number.isInteger(policy.horizonDays) || policy.horizonDays < 1 || policy.horizonDays > 366 || !policy.dayparts.length || policy.dayparts.length > 8 || new Set(policy.dayparts.map(part => part.id)).size !== policy.dayparts.length) throw new Error('Ongeldig pilotrooster');
  // Validate the zone and time syntax; actual DST validity is checked per date.
  bookingToday(env.now(), policy.timezone);
  for (const part of policy.dayparts) if (!part.id || !part.label || part.startTime >= part.endTime) throw new Error('Ongeldig dagdeel');
  const required = <T>(record: T | undefined): T => { if (!record) throw new BookingError('NOT_FOUND', 'Record niet gevonden', 404); return record; };
  function inHorizon(date: string) {
    const today = bookingToday(env.now(), policy.timezone);
    return date >= today && date < bookingAddDays(today, policy.horizonDays);
  }
  function zones() {
    if (!storage.zones().length) for (const zone of LOCAL_DEMO_ZONES) storage.saveZone({ ...zone, workspaceId: storage.workspaceId, defaultCapacity: 1, version: 1 });
    return storage.zones();
  }
  function zone(id: string) { zones(); return required(storage.zone(id)); }
  const occupied = (slotId: string, exceptId?: string) => storage.appointments().filter(a => a.id !== exceptId && a.slotId === slotId && a.status !== 'cancelled').length;
  function materialize(date: string, zoneId: string) {
    const selectedZone = zone(zoneId);
    if (!inHorizon(date)) return;
    const existing = storage.slots(date, zoneId);
    const windows = policy.dayparts.filter(part => !existing.some(slot => slot.daypartId === part.id)).map(part => {
      let startAt: string, endAt: string;
      try { startAt = bookingInstant(date, part.startTime, policy.timezone); endAt = bookingInstant(date, part.endTime, policy.timezone); }
      catch { throw new BookingError('INVALID_INPUT', 'Dit dagdeel bevat een ongeldige of dubbelzinnige lokale grens.', 400); }
      return { date, daypartId: part.id, label: part.label, startTime: part.startTime, endTime: part.endTime, timezone: policy.timezone, startAt, endAt };
    });
    // A configuration change may add a daypart but may not overlap an old promise.
    for (const window of windows) {
      if (existing.some(slot => slot.daypartId === window.daypartId)) continue;
      if ([...existing, ...windows.filter(other => other !== window && !existing.some(slot => slot.daypartId === other.daypartId))].some(other => window.startAt < other.endAt && window.endAt > other.startAt)) throw new BookingError('INVALID_INPUT', 'Dagdelen mogen niet overlappen.', 400);
      storage.insertSlot({ ...window, id: env.id(), workspaceId: storage.workspaceId, zoneId, capacity: selectedZone.defaultCapacity, version: 1 });
    }
  }
  function freeSlot(id: string, ownAppointmentId?: string) {
    const slot = required(storage.slot(id));
    if (!inHorizon(slot.date)) throw new BookingError('OUTSIDE_HORIZON', 'Dit dagdeel valt buiten de boekingshorizon.');
    if (storage.block(id)) throw new BookingError('SLOT_BLOCKED', 'Dit dagdeel is geblokkeerd.');
    if (occupied(id, ownAppointmentId) >= slot.capacity) throw new BookingError('SLOT_FULL', 'Dit dagdeel is al vol.');
    return slot;
  }
  function promised(slot: Slot): CustomerWindow {
    const { date, daypartId, label, startTime, endTime, timezone, startAt, endAt } = slot;
    return { date, daypartId, label, startTime, endTime, timezone, startAt, endAt };
  }
  function arrival(value: string | null | undefined, slot: Slot) {
    if (value == null) return null;
    const instant = Date.parse(value);
    if (!Number.isFinite(instant) || instant < Date.parse(slot.startAt) || instant >= Date.parse(slot.endAt)) throw new BookingError('INVALID_INPUT', 'De interne aankomsttijd moet binnen het klanttijdvak liggen.', 400);
    return new Date(instant).toISOString();
  }
  function event(type: 'planned' | 'moved' | 'cancelled' | 'completed', actor: string, after: Appointment, before?: Appointment) {
    storage.appendEvent({ id: env.id(), workspaceId: storage.workspaceId, appointmentId: after.id, type, actor, createdAt: env.now(),
      before: before ? { window: before.window, arrivalAt: before.arrivalAt, zoneId: before.zoneId, zoneName: before.zoneName } : null,
      after: { window: after.window, arrivalAt: after.arrivalAt, zoneId: after.zoneId, zoneName: after.zoneName },
    });
  }
  function perform(command: BookingCommand, actor: string): unknown {
    switch (command.type) {
      case 'zones.list': return zones();
      case 'zones.resolve': {
        const result=resolveDemoPostcode(command.input.postcode,postcodeAssignments);
        if (!result.ok) throw new BookingError(result.code,result.code==='AMBIGUOUS_POSTCODE'?'De fictieve postcode is dubbel toegewezen. Corrigeer de demo-indeling.':result.code==='UNKNOWN_POSTCODE'?'Geen fictief werkgebied voor deze postcode. Gebruik uitsluitend de getoonde democodes.':'Gebruik vier cijfers en twee letters.',result.code==='AMBIGUOUS_POSTCODE'?409:result.code==='UNKNOWN_POSTCODE'?404:400);
        return {postcode:result.postcode,zone:zone(result.zoneId),demonstration:true};
      }
      case 'zones.capacity': {
        const existing = zone(command.id);
        if (existing.version !== command.input.version) throw new BookingError('VERSION_CONFLICT', 'Deze zone is gewijzigd. Vernieuw en probeer opnieuw.');
        const updated = { ...existing, defaultCapacity: command.input.defaultCapacity, version: existing.version + 1 };
        storage.saveZone(updated); return updated;
      }
      case 'slots.capacity': {
        const slot = required(storage.slot(command.id));
        if (slot.version !== command.input.version) throw new BookingError('VERSION_CONFLICT', 'Deze dagdeelcapaciteit is gewijzigd. Vernieuw en probeer opnieuw.');
        if (command.input.capacity < occupied(slot.id)) throw new BookingError('CAPACITY_BELOW_OCCUPANCY', 'De capaciteit kan niet lager worden dan de bezetting.');
        storage.setSlotCapacity(slot.id, command.input.capacity); return required(storage.slot(slot.id));
      }
      case 'contacts.list': {
        const q = command.query?.q?.trim().toLocaleLowerCase('nl') ?? '';
        return storage.contacts().filter(contact => (command.query?.archived || !contact.archived) && [contact.name, contact.email, contact.phone].some(value => value?.toLocaleLowerCase('nl').includes(q))).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
      }
      case 'contacts.create': {
        const now = env.now(), contact = { ...command.input, email: command.input.email || null, phone: command.input.phone || null, id: env.id(), workspaceId: storage.workspaceId, archived: false, version: 1, createdAt: now, updatedAt: now };
        storage.saveContact(contact); return contact;
      }
      case 'contacts.update': {
        const contact = required(storage.contact(command.id));
        if (contact.version !== command.input.version) throw new BookingError('VERSION_CONFLICT', 'Deze relatie is gewijzigd. Vernieuw de klantkaart.');
        const updated = { ...contact, ...command.input, version: contact.version + 1, updatedAt: env.now() };
        storage.saveContact(updated); return updated;
      }
      case 'contacts.card': {
        const contact = required(storage.contact(command.id)), now = Date.parse(env.now());
        const appointments = storage.appointments().filter(a => a.contactId === contact.id).sort((a, b) => a.window.startAt.localeCompare(b.window.startAt));
        const upcoming = appointments.filter(a => a.status === 'planned' && Date.parse(a.window.endAt) > now);
        return { contact, upcoming, history: appointments.filter(a => !upcoming.includes(a)), events: storage.events(appointments.map(a => a.id)) };
      }
      case 'availability.list': {
        const zoneId = command.zoneId ?? DEFAULT_ZONE_ID;
        materialize(command.date, zoneId);
        const appointments = storage.appointments();
        return storage.slots(command.date, zoneId).sort((a, b) => a.startAt.localeCompare(b.startAt)).map(slot => {
          const block = storage.block(slot.id) ?? null, occupied = appointments.filter(a => a.slotId === slot.id && a.status !== 'cancelled').length;
          return { slot, block, occupied, available: inHorizon(slot.date) && !block && occupied < slot.capacity };
        });
      }
      case 'appointments.list': {
        const zoneId = command.zoneId ?? DEFAULT_ZONE_ID; zone(zoneId);
        return storage.appointments({ date: command.date, zoneId }).sort((a, b) => a.window.startAt.localeCompare(b.window.startAt));
      }
      case 'appointments.create': {
        const contact = required(storage.contact(command.input.contactId));
        if (contact.archived) throw new BookingError('CONTACT_ARCHIVED', 'Kies een actieve relatie.');
        const slot = freeSlot(command.input.slotId), now = env.now();
        const appointment: Appointment = { id: env.id(), workspaceId: storage.workspaceId, contactId: contact.id, slotId: slot.id, zoneId: slot.zoneId, zoneName: zone(slot.zoneId).name, source: env.appointmentSource ?? 'manual', status: 'planned', version: 1, window: promised(slot), arrivalAt: arrival(command.input.arrivalAt, slot), createdAt: now, updatedAt: now };
        storage.saveAppointment(appointment); event('planned', actor, appointment); return appointment;
      }
      case 'appointments.move': case 'appointments.status': {
        const before = required(storage.appointment(command.id));
        if (before.version !== command.input.version) throw new BookingError('VERSION_CONFLICT', 'Deze afspraak is gewijzigd. Vernieuw en probeer opnieuw.');
        if (before.status !== 'planned') throw new BookingError('INVALID_TRANSITION', 'Alleen een geplande afspraak kan worden gewijzigd.');
        let after: Appointment;
        if (command.type === 'appointments.move') {
          const slot = freeSlot(command.input.slotId, before.id);
          after = { ...before, slotId: slot.id, zoneId: slot.zoneId, zoneName: zone(slot.zoneId).name, window: promised(slot), arrivalAt: arrival(command.input.arrivalAt, slot), version: before.version + 1, updatedAt: env.now() };
        } else after = { ...before, status: command.input.status, version: before.version + 1, updatedAt: env.now() };
        storage.saveAppointment(after); event(command.type === 'appointments.move' ? 'moved' : command.input.status, actor, after, before); return after;
      }
      case 'blocks.create': {
        const slot = required(storage.slot(command.input.slotId));
        if (!inHorizon(slot.date)) throw new BookingError('OUTSIDE_HORIZON', 'Dit dagdeel valt buiten de boekingshorizon.');
        if (storage.block(slot.id)) throw new BookingError('SLOT_BLOCKED', 'Dit dagdeel is al geblokkeerd.');
        if (occupied(slot.id) > 0) throw new BookingError('SLOT_FULL', 'Verplaats of annuleer eerst alle afspraken in dit dagdeel.');
        const block = { ...command.input, id: env.id(), workspaceId: storage.workspaceId, actor, createdAt: env.now() };
        storage.insertBlock(block); return { ...block, slotId: slot.id };
      }
      case 'blocks.remove': required(storage.findBlock(command.id)); storage.removeBlock(command.id); return null;
    }
  }
  return {
    invoke(input: unknown, actor: { name: string }): PlannerReply {
      const parsed = bookingCommandSchema.safeParse(input);
      if (!parsed.success) return { ok: false, error: { code: 'INVALID_INPUT', status: 400, message: 'Ongeldige invoer' } };
      const command = parsed.data;
      if (command.workspaceId !== storage.workspaceId) return { ok: false, error: { code: 'WORKSPACE_NOT_FOUND', status: 404, message: 'Werkruimte niet gevonden' } };
      try {
        // Read snapshots are consistent; availability materialization uses the same lock.
        const value = storage.transaction(() => {
          if (!('key' in command)) return perform(command, actor.name);
          const hash = env.hash(JSON.stringify(canonical(command))), previous = storage.receipt(actor.name, command.type, command.key);
          if (previous) {
            if (previous.hash !== hash) throw new BookingError('IDEMPOTENCY_CONFLICT', 'Deze opdrachtsleutel is al voor andere invoer gebruikt.');
            return previous.result;
          }
          const result = perform(command, actor.name);
          storage.saveReceipt(actor.name, command.type, command.key, hash, result); return result;
        });
        return { ok: true, value };
      } catch (error) {
        if (error instanceof BookingError) return { ok: false, error: { code: error.code, status: error.status, message: error.message } };
        if (error instanceof Error && 'statusCode' in error && error.statusCode === 503) return { ok: false, error: { code: 'UNAVAILABLE', status: 503, message: error.message } };
        return { ok: false, error: { code: 'INTERNAL_ERROR', status: 500, message: 'Planner kan de opdracht niet uitvoeren.' } };
      }
    },
  };
}
export type BookingService = ReturnType<typeof createBookingService>;
