import { z } from 'zod';
import { contactInputSchema } from './bookings.js';
const record = { id: z.string().uuid(), workspaceId: z.string() };
const times = { createdAt: z.string(), updatedAt: z.string() };
const window = z.object({ date: z.string(), daypartId: z.string(), label: z.string(), startTime: z.string(), endTime: z.string(), timezone: z.string(), startAt: z.string(), endAt: z.string() });
const contact = contactInputSchema.extend({ ...record, ...times, archived: z.boolean(), version: z.number().int() });
const slot = window.extend({ ...record, zoneId: z.string(), capacity: z.number().int(), version: z.number().int() });
const zone = z.object({ id: z.string(), workspaceId: z.string(), name: z.string(), defaultCapacity: z.number().int(), version: z.number().int() });
const block = z.object({ ...record, slotId: z.string().uuid(), reason: z.string(), actor: z.string(), createdAt: z.string() });
const appointment = z.object({ ...record, ...times, contactId: z.string().uuid(), slotId: z.string().uuid(), zoneId: z.string(), zoneName: z.string(), status: z.enum(['planned','cancelled','completed']), source: z.enum(['manual','public']), version: z.number().int(), window, arrivalAt: z.string().nullable() });
const eventWindow = z.object({ window, arrivalAt: z.string().nullable(), zoneId: z.string().optional(), zoneName: z.string().optional() });
const event = z.object({ ...record, appointmentId: z.string().uuid(), actor: z.string(), createdAt: z.string(), type: z.enum(['planned','moved','cancelled','completed']), before: eventWindow.nullable(), after: eventWindow });
export const bookingResultSchemas = {
  'zones.list': z.array(zone), 'zones.capacity': zone, 'slots.capacity': slot,
  'zones.resolve': z.object({postcode:z.string(),zone,demonstration:z.literal(true)}),
  'contacts.list': z.array(contact), 'contacts.create': contact, 'contacts.update': contact,
  'contacts.card': z.object({ contact, upcoming: z.array(appointment), history: z.array(appointment), events: z.array(event) }),
  'availability.list': z.array(z.object({ slot, occupied: z.number().int(), block: block.nullable(), available: z.boolean() })),
  'appointments.list': z.array(appointment), 'appointments.create': appointment, 'appointments.move': appointment, 'appointments.status': appointment,
  'blocks.create': block, 'blocks.remove': z.null(),
};
