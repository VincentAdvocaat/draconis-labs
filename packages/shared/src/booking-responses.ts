import { z } from 'zod';
import { contactInputSchema } from './bookings.js';
const record = { id: z.string().uuid(), workspaceId: z.string() };
const times = { createdAt: z.string(), updatedAt: z.string() };
const window = z.object({ date: z.string(), daypartId: z.string(), label: z.string(), startTime: z.string(), endTime: z.string(), timezone: z.string(), startAt: z.string(), endAt: z.string() });
const contact = contactInputSchema.extend({ ...record, ...times, archived: z.boolean(), version: z.number().int() });
const slot = window.extend({ ...record, capacity: z.literal(1) });
const block = z.object({ ...record, slotId: z.string().uuid(), reason: z.string(), actor: z.string(), createdAt: z.string() });
const appointment = z.object({ ...record, ...times, contactId: z.string().uuid(), slotId: z.string().uuid(), status: z.enum(['planned','cancelled','completed']), source: z.literal('manual'), version: z.number().int(), window, arrivalAt: z.string().nullable() });
const eventWindow = z.object({ window, arrivalAt: z.string().nullable() });
const event = z.object({ ...record, appointmentId: z.string().uuid(), actor: z.string(), createdAt: z.string(), type: z.enum(['planned','moved','cancelled','completed']), before: eventWindow.nullable(), after: eventWindow });
export const bookingResultSchemas = {
  'contacts.list': z.array(contact), 'contacts.create': contact, 'contacts.update': contact,
  'contacts.card': z.object({ contact, upcoming: z.array(appointment), history: z.array(appointment), events: z.array(event) }),
  'availability.list': z.array(z.object({ slot, occupied: z.number().int(), block: block.nullable(), available: z.boolean() })),
  'appointments.list': z.array(appointment), 'appointments.create': appointment, 'appointments.move': appointment, 'appointments.status': appointment,
  'blocks.create': block, 'blocks.remove': z.null(),
};
