import type { PublicBookingStorage, PublicChannel, PublicRequest } from '@draconis/planner-core';
import type { Appointment, AppointmentEvent, Block, Contact, PublicConfirmation, Slot, Zone } from '@draconis/shared';

interface Receipt {
  actor: string;
  operation: string;
  key: string;
  hash: string;
  result: unknown;
}

interface PublicReceipt {
  channelId: string;
  key: string;
  hash: string;
  result: PublicConfirmation;
}

export function emptyBookingState() {
  return {
    zones: [] as Zone[], contacts: [] as Contact[], slots: [] as Slot[],
    blocks: [] as Block[], appointments: [] as Appointment[], events: [] as AppointmentEvent[],
    receipts: [] as Receipt[], channels: [] as PublicChannel[], requests: [] as PublicRequest[],
    publicReceipts: [] as PublicReceipt[],
  };
}

export type BookingState = ReturnType<typeof emptyBookingState>;

export function bookingStateStorage(workspaceId: string, state: BookingState) {
  let dirty = false;
  const byId = <T extends { id: string }>(items: T[], id: string) => items.find(item => item.id === id);
  const sorted = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  function save<T extends { id: string; workspaceId: string }>(items: T[], item: T, replace = false) {
    if (item.workspaceId !== workspaceId) throw new Error('Booking record belongs to another workspace.');
    const index = items.findIndex(existing => existing.id === item.id);
    if (index === -1) items.push(item);
    else if (replace) items[index] = item;
    else throw new Error('Duplicate booking record.');
    dirty = true;
  }
  const storage: PublicBookingStorage = {
    workspaceId,
    // The enclosing PostgreSQL transaction owns this command-local copy.
    transaction: operation => operation(),
    zones: () => sorted(state.zones),
    zone: id => byId(state.zones, id),
    saveZone: item => save(state.zones, item, true),
    contacts: () => sorted(state.contacts),
    contact: id => byId(state.contacts, id),
    saveContact: item => save(state.contacts, item, true),
    slots: (date, zoneId) => sorted(state.slots.filter(slot => slot.date === date && slot.zoneId === zoneId)),
    slot: id => byId(state.slots, id),
    insertSlot: item => save(state.slots, item),
    setSlotCapacity(id, capacity) {
      const slot = byId(state.slots, id);
      if (!slot) throw new Error('Unknown booking slot.');
      save(state.slots, { ...slot, capacity, version: slot.version + 1 }, true);
    },
    block: slotId => state.blocks.find(block => block.slotId === slotId),
    findBlock: id => byId(state.blocks, id),
    insertBlock: item => save(state.blocks, item),
    removeBlock(id) {
      state.blocks = state.blocks.filter(block => block.id !== id);
      dirty = true;
    },
    appointments: query => sorted(state.appointments.filter(appointment =>
      (query?.date === undefined || appointment.window.date === query.date) &&
      (query?.zoneId === undefined || appointment.zoneId === query.zoneId))),
    appointment: id => byId(state.appointments, id),
    saveAppointment: item => save(state.appointments, item, true),
    appendEvent: event => save(state.events, event),
    events: ids => state.events.filter(event => ids.includes(event.appointmentId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    receipt: (actor, operation, key) => state.receipts.find(receipt =>
      receipt.actor === actor && receipt.operation === operation && receipt.key === key),
    saveReceipt(actor, operation, key, hash, result) {
      state.receipts.push({ actor, operation, key, hash, result });
      dirty = true;
    },
    channel: id => byId(state.channels, id),
    insertChannel: channel => save(state.channels, channel),
    publicReceipt: (channelId, key) => state.publicReceipts.find(receipt =>
      receipt.channelId === channelId && receipt.key === key),
    savePublicReceipt(channelId, key, hash, result) {
      state.publicReceipts.push({ channelId, key, hash, result });
      dirty = true;
    },
    insertPublicRequest: request => save(state.requests, request),
  };
  return { storage, changed: () => dirty };
}
