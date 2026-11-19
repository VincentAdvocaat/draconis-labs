import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';
import { PlannerClientError, type PlannerReply } from './planner-client.js';

export const bookingDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  try { return Temporal.PlainDate.from(value).toString() === value; } catch { return false; }
}, 'Ongeldige kalenderdatum');
export const contactInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.union([z.email().max(254), z.literal('')]).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
});
const version = z.number().int().positive();
export const contactUpdateSchema = contactInputSchema.partial().extend({ version, archived: z.boolean().optional() });
const arrival = z.iso.datetime({ offset: true }).nullable().optional();
const key = { key: z.string().uuid() }, workspace = { workspaceId: z.string().min(1).max(120) }, id = z.string().uuid();
export const appointmentInputSchema = z.object({ contactId: id, slotId: id, arrivalAt: arrival });
export const appointmentMoveSchema = z.object({ version, slotId: id, arrivalAt: arrival });
export const appointmentStatusSchema = z.object({ version, status: z.enum(['cancelled', 'completed']) });
export const bookingCommandSchema = z.discriminatedUnion('type', [
  z.object({ ...workspace, type: z.literal('contacts.list'), query: z.object({ q: z.string().max(160).optional(), archived: z.boolean().optional() }).optional() }),
  z.object({ ...workspace, ...key, type: z.literal('contacts.create'), input: contactInputSchema }),
  z.object({ ...workspace, ...key, type: z.literal('contacts.update'), id, input: contactUpdateSchema }),
  z.object({ ...workspace, type: z.literal('contacts.card'), id }),
  z.object({ ...workspace, type: z.literal('availability.list'), date: bookingDateSchema }),
  z.object({ ...workspace, type: z.literal('appointments.list'), date: bookingDateSchema }),
  z.object({ ...workspace, ...key, type: z.literal('appointments.create'), input: appointmentInputSchema }),
  z.object({ ...workspace, ...key, type: z.literal('appointments.move'), id, input: appointmentMoveSchema }),
  z.object({ ...workspace, ...key, type: z.literal('appointments.status'), id, input: appointmentStatusSchema }),
  z.object({ ...workspace, ...key, type: z.literal('blocks.create'), input: z.object({ slotId: id, reason: z.string().trim().min(1).max(240) }) }),
  z.object({ ...workspace, ...key, type: z.literal('blocks.remove'), id }),
]);
export type BookingCommand = z.infer<typeof bookingCommandSchema>;
export type ContactInput = z.infer<typeof contactInputSchema>;
export interface Contact extends ContactInput { id: string; workspaceId: string; archived: boolean; version: number; createdAt: string; updatedAt: string }
export interface CustomerWindow { date: string; daypartId: string; label: string; startTime: string; endTime: string; timezone: string; startAt: string; endAt: string }
export interface Slot extends CustomerWindow { id: string; workspaceId: string; capacity: 1 }
export interface Block { id: string; workspaceId: string; slotId: string; reason: string; actor: string; createdAt: string }
export interface Availability { slot: Slot; occupied: number; block: Block | null; available: boolean }
export interface Appointment { id: string; workspaceId: string; contactId: string; slotId: string; status: 'planned' | 'cancelled' | 'completed'; source: 'manual'; version: number; window: CustomerWindow; arrivalAt: string | null; createdAt: string; updatedAt: string }
export interface AppointmentEvent { id: string; workspaceId: string; appointmentId: string; actor: string; createdAt: string; type: 'planned' | 'moved' | 'cancelled' | 'completed'; before: { window: CustomerWindow; arrivalAt: string | null } | null; after: { window: CustomerWindow; arrivalAt: string | null } }
export interface ContactCard { contact: Contact; upcoming: Appointment[]; history: Appointment[]; events: AppointmentEvent[] }
export interface BookingPolicy { timezone: string; horizonDays: number; dayparts: { id: string; label: string; startTime: string; endTime: string }[] }
export const LOCAL_BOOKING_POLICY: BookingPolicy = { timezone: 'Europe/Amsterdam', horizonDays: 90, dayparts: [
  { id: 'morning', label: 'Ochtend', startTime: '08:00', endTime: '12:00' },
  { id: 'afternoon', label: 'Middag', startTime: '13:00', endTime: '17:00' },
] };

/** Reject both skipped and ambiguous local times; never silently shift a promise. */
export function bookingInstant(date: string, time: string, timezone: string): string {
  bookingDateSchema.parse(date);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Ongeldige tijd');
  return Temporal.ZonedDateTime.from(`${date}T${time}[${timezone}]`, { disambiguation: 'reject' }).toInstant().toString();
}
export const bookingToday = (instant: string, timezone: string) => Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString();
export const bookingAddDays = (date: string, days: number) => Temporal.PlainDate.from(date).add({ days }).toString();

export type BookingTransport = (command: BookingCommand) => Promise<PlannerReply>;
type WithoutContext<T> = T extends unknown ? Omit<T, 'workspaceId'> : never;
export function createBookingClient(transport: BookingTransport, workspaceId: string) {
  async function send<T>(command: WithoutContext<BookingCommand>): Promise<T> {
    const reply = await transport({ ...command, workspaceId });
    if (!reply.ok) throw new PlannerClientError(reply.error);
    return reply.value as T;
  }
  return { workspaceId,
    contacts: {
      list: (query?: { q?: string; archived?: boolean }) => send<Contact[]>({ type: 'contacts.list', query }),
      create: (input: ContactInput, key: string) => send<Contact>({ type: 'contacts.create', input, key }),
      update: (id: string, input: z.infer<typeof contactUpdateSchema>, key: string) => send<Contact>({ type: 'contacts.update', id, input, key }),
      card: (id: string) => send<ContactCard>({ type: 'contacts.card', id }),
    },
    availability: (date: string) => send<Availability[]>({ type: 'availability.list', date }),
    appointments: {
      list: (date: string) => send<Appointment[]>({ type: 'appointments.list', date }),
      create: (input: z.infer<typeof appointmentInputSchema>, key: string) => send<Appointment>({ type: 'appointments.create', input, key }),
      move: (id: string, input: z.infer<typeof appointmentMoveSchema>, key: string) => send<Appointment>({ type: 'appointments.move', id, input, key }),
      status: (id: string, input: z.infer<typeof appointmentStatusSchema>, key: string) => send<Appointment>({ type: 'appointments.status', id, input, key }),
    },
    blocks: {
      create: (input: { slotId: string; reason: string }, key: string) => send<Block>({ type: 'blocks.create', input, key }),
      remove: (id: string, key: string) => send<null>({ type: 'blocks.remove', id, key }),
    },
  };
}
export type BookingClient = ReturnType<typeof createBookingClient>;
