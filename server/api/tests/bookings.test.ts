import Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { createBookingService } from '@draconis/planner-core';
import { createSqliteBookingStorage, initializePlannerSqlite } from '@draconis/planner-sqlite';
import { bookingInstant, createBookingClient, createBookingHttpTransport, LOCAL_BOOKING_POLICY, type BookingCommand, type PlannerReply } from '@draconis/shared';
import { createBookingRoutes } from '../src/modules/bookings/routes.js';

const desktop = createRequire(new URL('../../../apps/desktop-probe/package.json', import.meta.url))('better-sqlite3') as typeof Database;
const environment = { now: () => '2026-11-19T10:00:00.000Z', id: randomUUID, hash: (value: string) => createHash('sha256').update(value).digest('hex') };
const cleanup: (() => void)[] = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
const code = (code: string) => expect.objectContaining({ code });

describe.each([['API12',Database], ['desktop13',desktop]] as const)('%s local bookings', (_, Constructor) => {
  function setup(path = ':memory:', workspace = 'local', policy = LOCAL_BOOKING_POLICY) {
    const db = new Constructor(path); initializePlannerSqlite(db);
    cleanup.push(() => { if (db.open) db.close(); });
    const service = createBookingService(createSqliteBookingStorage(db, workspace), environment, policy);
    const client = createBookingClient(async command => service.invoke(command, { name: 'demo-planner' }), workspace);
    return { db, service, client };
  }
  it('finds returning contacts, permits shared details and retains archived cards/history', async () => {
    const { client } = setup();
    const contact = await client.contacts.create({ name: '  Fictieve klant  ', email: 'demo@example.test', phone: '123' }, randomUUID());
    await client.contacts.create({ name: 'Tweede klant', email: 'demo@example.test' }, randomUUID());
    expect(await client.contacts.list({ q: 'FICTIEVE' })).toMatchObject([{ id: contact.id, name: 'Fictieve klant' }]);
    const [slot] = await client.availability('2026-11-20');
    const appointment = await client.appointments.create({ contactId: contact.id, slotId: slot.slot.id, arrivalAt: '2026-11-20T09:15:00+01:00' }, randomUUID());
    const changed = await client.contacts.update(contact.id, { version: 1, name: 'Gewijzigde demo', archived: true }, randomUUID());
    expect(await client.contacts.list()).toHaveLength(1);
    expect(await client.contacts.list({ archived: true })).toHaveLength(2);
    const card = await client.contacts.card(contact.id);
    expect(card.contact).toEqual(changed); expect(card.upcoming).toEqual([appointment]);
    expect(card.events).toMatchObject([{ type: 'planned', actor: 'demo-planner', before: null }]);
    expect(JSON.stringify(card.events)).not.toContain('example.test');
    await expect(client.appointments.create({ contactId: contact.id, slotId: slot.slot.id }, randomUUID())).rejects.toMatchObject(code('CONTACT_ARCHIVED'));
    await expect(client.contacts.update(contact.id, { version: 1, name: 'stale' }, randomUUID())).rejects.toMatchObject(code('VERSION_CONFLICT'));
  });

  it('plans, moves atomically, checks versions, cancels, completes and blocks capacity one', async () => {
    const { client } = setup();
    const contact = await client.contacts.create({ name: 'Demo' }, randomUUID());
    const [morning, afternoon] = await client.availability('2026-11-20');
    const a = await client.appointments.create({ contactId: contact.id, slotId: morning.slot.id, arrivalAt: '2026-11-20T09:15:00+01:00' }, randomUUID());
    expect(a.window).toMatchObject({ startTime: '08:00', endTime: '12:00', timezone: 'Europe/Amsterdam' });
    expect(a.arrivalAt).toBe('2026-11-20T08:15:00.000Z');
    const b = await client.appointments.create({ contactId: contact.id, slotId: afternoon.slot.id }, randomUUID());
    await expect(client.appointments.move(a.id, { version: 1, slotId: afternoon.slot.id }, randomUUID())).rejects.toMatchObject(code('SLOT_FULL'));
    expect(await client.appointments.list('2026-11-20')).toContainEqual(a);
    await expect(client.blocks.create({ slotId: morning.slot.id, reason: 'Demo blokkade' }, randomUUID())).rejects.toMatchObject(code('SLOT_FULL'));
    const same = await client.appointments.move(a.id, { version: 1, slotId: morning.slot.id, arrivalAt: '2026-11-20T10:00:00+01:00' }, randomUUID());
    expect(same.version).toBe(2);
    await expect(client.appointments.status(a.id, { version: 1, status: 'cancelled' }, randomUUID())).rejects.toMatchObject(code('VERSION_CONFLICT'));
    await client.appointments.status(b.id, { version: 1, status: 'cancelled' }, randomUUID());
    const moved = await client.appointments.move(a.id, { version: 2, slotId: afternoon.slot.id }, randomUUID());
    expect(moved.arrivalAt).toBeNull();
    const block = await client.blocks.create({ slotId: morning.slot.id, reason: 'Demo onderhoud' }, randomUUID());
    await expect(client.appointments.create({ contactId: contact.id, slotId: morning.slot.id }, randomUUID())).rejects.toMatchObject(code('SLOT_BLOCKED'));
    await client.blocks.remove(block.id, randomUUID());
    await client.appointments.status(a.id, { version: 3, status: 'completed' }, randomUUID());
    expect((await client.availability('2026-11-20')).find(item => item.slot.id === afternoon.slot.id)).toMatchObject({ occupied: 1, available: false });
    await expect(client.appointments.status(a.id, { version: 4, status: 'cancelled' }, randomUUID())).rejects.toMatchObject(code('INVALID_TRANSITION'));
    const card = await client.contacts.card(contact.id);
    expect(card.upcoming).toEqual([]); expect(card.history).toHaveLength(2);
    expect(card.events.filter(event => event.type === 'moved')).toHaveLength(2);
    expect(card.events.find(event => event.type === 'moved' && event.after.window.daypartId === 'afternoon')?.before?.window.daypartId).toBe('morning');
  });

  it('replays an exact command once, rejects changed payload and rolls back events/receipt on failure', async () => {
    const { client, db } = setup();
    const key = randomUUID(), input = { name: 'Own demo' };
    const contact = await client.contacts.create(input, key);
    expect(await client.contacts.create(input, key)).toEqual(contact);
    await expect(client.contacts.create({ name: 'Other payload' }, key)).rejects.toMatchObject(code('IDEMPOTENCY_CONFLICT'));
    const [availability] = await client.availability('2026-11-20');
    const bookingKey = randomUUID(), bookingInput = { contactId: contact.id, slotId: availability.slot.id };
    db.exec("CREATE TRIGGER fail_event BEFORE INSERT ON planner_appointment_events BEGIN SELECT RAISE(ABORT,'injected event failure'); END");
    await expect(client.appointments.create(bookingInput, bookingKey)).rejects.toMatchObject(code('INTERNAL_ERROR'));
    expect(await client.appointments.list('2026-11-20')).toEqual([]);
    expect(db.prepare('SELECT key FROM planner_command_receipts WHERE key=?').get(bookingKey)).toBeUndefined();
    db.exec('DROP TRIGGER fail_event');
    const appointment = await client.appointments.create(bookingInput, bookingKey);
    expect(await client.appointments.create(bookingInput, bookingKey)).toEqual(appointment);
    expect((await client.contacts.card(contact.id)).events).toHaveLength(1);
    const moveKey = randomUUID();
    db.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON planner_command_receipts BEGIN SELECT RAISE(ABORT,'injected receipt failure'); END");
    await expect(client.appointments.status(appointment.id, { version: 1, status: 'cancelled' }, moveKey)).rejects.toMatchObject(code('INTERNAL_ERROR'));
    expect(await client.appointments.list('2026-11-20')).toEqual([appointment]);
    expect((await client.contacts.card(contact.id)).events).toHaveLength(1);
  });

  it('rejects invalid dates, DST boundaries, out-of-window arrival and horizon overflow', async () => {
    const { client } = setup();
    await expect(client.availability('2026-02-30')).rejects.toMatchObject(code('INVALID_INPUT'));
    expect(await client.availability('2027-05-01')).toEqual([]);
    const contact = await client.contacts.create({ name: 'Demo' }, randomUUID()), [morning] = await client.availability('2026-11-20');
    for (const arrivalAt of ['2026-11-20T12:00:00+01:00','2026-11-20T07:59:00+01:00','2026-11-20T09:00:00']) await expect(client.appointments.create({ contactId: contact.id, slotId: morning.slot.id, arrivalAt }, randomUUID())).rejects.toMatchObject(code('INVALID_INPUT'));
    expect(() => bookingInstant('2027-03-28','02:30','Europe/Amsterdam')).toThrow();
    expect(() => bookingInstant('2027-10-31','02:30','Europe/Amsterdam')).toThrow();
    expect(bookingInstant('2027-03-28','08:00','Europe/Amsterdam')).toBe('2027-03-28T06:00:00Z');
  });

  it('keeps persisted slot promises when the configured dayparts change and survives restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'booking-restart-')); cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, 'own.sqlite'), original = setup(path);
    const contact = await original.client.contacts.create({ name: 'Demo' }, randomUUID()), slots = await original.client.availability('2026-11-20');
    const appointment = await original.client.appointments.create({ contactId: contact.id, slotId: slots[0].slot.id }, randomUUID());
    original.db.close();
    const reopened = setup(path, 'local', { ...LOCAL_BOOKING_POLICY, dayparts: [{ id: 'morning', label: 'Changed', startTime: '09:00', endTime: '11:00' }] });
    expect(await reopened.client.appointments.list('2026-11-20')).toEqual([appointment]);
    expect(await reopened.client.availability('2026-11-20')).toEqual(slots.map(item => item.slot.id === appointment.slotId ? { ...item, occupied: 1, available: false } : item));
  });

  it('isolates workspace queries and refuses cross-workspace references', async () => {
    const { client, db } = setup(), otherService = createBookingService(createSqliteBookingStorage(db, 'other'), environment);
    const other = createBookingClient(async command => otherService.invoke(command, { name: 'demo' }), 'other');
    const foreign = await other.contacts.create({ name: 'Other workspace' }, randomUUID());
    expect(await client.contacts.list()).toEqual([]);
    await expect(client.contacts.card(foreign.id)).rejects.toMatchObject(code('NOT_FOUND'));
    const [slot] = await client.availability('2026-11-20');
    await expect(client.appointments.create({ contactId: foreign.id, slotId: slot.slot.id }, randomUUID())).rejects.toMatchObject(code('NOT_FOUND'));
    const bad = otherService.invoke({ type: 'contacts.list', workspaceId: 'local' }, { name: 'demo' });
    expect(bad).toMatchObject({ ok: false, error: { status: 404, code: 'WORKSPACE_NOT_FOUND' } });
  });
});

it('uses the same raw validation, envelopes and durable results over HTTP and local commands', async () => {
  const db = new Database(':memory:'); initializePlannerSqlite(db);
  const service = createBookingService(createSqliteBookingStorage(db, 'local'), environment);
  const app = Fastify(); await app.register(createBookingRoutes(service, () => ({ kind: 'user', name: 'demo-planner' })), { prefix: '/api/v1/workspaces/:workspaceId' });
  const transport = createBookingHttpTransport('', (async (url: string, init?: RequestInit) => {
    const response = await app.inject({ url, method: init?.method as 'GET' | 'POST' | 'PATCH' | 'DELETE', payload: init?.body as string | undefined, headers: init?.headers as Record<string,string> });
    return { ok: response.statusCode < 400, status: response.statusCode, json: async () => response.json() } as Response;
  }) as typeof fetch);
  const http = createBookingClient(transport, 'local'), local = createBookingClient(async command => service.invoke(command, { name: 'demo-planner' }), 'local');
  try {
    const key = randomUUID(), input = { name: '  HTTP demo  ', email: 'demo@example.test' };
    const contact = await http.contacts.create(input, key);
    expect(await local.contacts.create(input, key)).toEqual(contact);
    const [slot] = await http.availability('2026-11-20');
    const appointment = await http.appointments.create({ contactId: contact.id, slotId: slot.slot.id }, randomUUID());
    expect(await local.appointments.list('2026-11-20')).toEqual([appointment]);
    expect(await http.contacts.card(contact.id)).toEqual(await local.contacts.card(contact.id));
    for (const command of [
      { type: 'contacts.create', workspaceId: 'local', key: randomUUID(), input: { name: 123 } },
      { type: 'availability.list', workspaceId: 'local', date: '2026-02-30' },
      { type: 'contacts.list', workspaceId: 'wrong' },
    ]) {
      const direct = service.invoke(command, { name: 'demo-planner' });
      expect(await transport(command as BookingCommand)).toEqual(direct as PlannerReply);
    }
    const malformed = await app.inject({ url: '/api/v1/workspaces/local/contacts', method: 'POST', headers: { 'content-type':'application/json' }, payload: '{' });
    expect(malformed.statusCode).toBe(400); expect(malformed.json()).toMatchObject({ ok: false, error: { code:'INVALID_INPUT' } });
  } finally { await app.close(); db.close(); }
});
