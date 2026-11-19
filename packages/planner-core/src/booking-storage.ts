import type { Appointment, AppointmentEvent, Block, Contact, Slot } from '@draconis/shared';
import type { PlannerEnvironment } from './storage.js';

export interface ContactStorage {
  contacts(): Contact[];
  contact(id: string): Contact | undefined;
  saveContact(contact: Contact): void;
}
export interface CapacityStorage {
  slots(date: string): Slot[];
  slot(id: string): Slot | undefined;
  insertSlot(slot: Slot): void;
  block(slotId: string): Block | undefined;
  findBlock(id: string): Block | undefined;
  insertBlock(block: Block): void;
  removeBlock(id: string): void;
}
export interface AppointmentStorage {
  appointments(): Appointment[];
  appointment(id: string): Appointment | undefined;
  saveAppointment(appointment: Appointment): void;
  appendEvent(event: AppointmentEvent): void;
  events(appointmentIds: string[]): AppointmentEvent[];
}
export interface BookingStorage extends ContactStorage, CapacityStorage, AppointmentStorage {
  readonly workspaceId: string;
  transaction<T>(operation: () => T): T;
  receipt(actor: string, operation: string, key: string): { hash: string; result: unknown } | undefined;
  saveReceipt(actor: string, operation: string, key: string, hash: string, result: unknown): void;
}
export interface BookingEnvironment extends PlannerEnvironment { hash(canonicalInput: string): string }
