import type Database from 'better-sqlite3';
import type { BookingStorage } from '@draconis/planner-core';
import type { Appointment, AppointmentEvent, Block, Contact, Slot } from '@draconis/shared';

type Row = Record<string, unknown>;
const fields = {
  planner_contacts: ['workspaceId','id','name','email','phone','archived','version','createdAt','updatedAt'],
  planner_slots: ['workspaceId','id','date','daypartId','label','startTime','endTime','timezone','startAt','endAt','capacity'],
  planner_blocks: ['workspaceId','id','slotId','reason','actor','createdAt'],
  planner_appointments: ['workspaceId','id','contactId','slotId','status','source','version','window','arrivalAt','createdAt','updatedAt'],
  planner_appointment_events: ['workspaceId','id','appointmentId','actor','createdAt','type','before','after'],
} as const;
type Table = keyof typeof fields;
const column = (field: string) => field.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const json = new Set(['window','before','after']);
function decode<T>(row: Row | undefined): T | undefined {
  if (!row) return undefined;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), json.has(key) && value !== null ? JSON.parse(value as string) : key === 'archived' ? value === 1 : value])) as T;
}
export function createSqliteBookingStorage(db: Database.Database, workspaceId: string, busyTimeoutMs = 5000): BookingStorage {
  if (!Number.isInteger(busyTimeoutMs) || busyTimeoutMs < 0 || busyTimeoutMs > 5000) throw new Error('Invalid busy timeout');
  db.pragma(`busy_timeout = ${busyTimeoutMs}`);
  db.pragma('foreign_keys = ON');
  function all<T>(table: Table, where = '', values: unknown[] = []): T[] {
    return db.prepare(`SELECT * FROM ${table} WHERE workspace_id=? ${where} ORDER BY id`).all(workspaceId, ...values).map(row => decode<T>(row as Row)!);
  }
  function find<T>(table: Table, id: string): T | undefined {
    return decode<T>(db.prepare(`SELECT * FROM ${table} WHERE workspace_id=? AND id=?`).get(workspaceId, id) as Row | undefined);
  }
  function save(table: Table, value: object, update = false) {
    const row = value as Row;
    if (row.workspaceId !== workspaceId) throw new Error('Workspace mismatch');
    const names = fields[table], columns = names.map(column);
    const suffix = update ? ` ON CONFLICT(workspace_id,id) DO UPDATE SET ${columns.filter(name => !['id','workspace_id'].includes(name)).map(name => `${name}=excluded.${name}`).join(',')}` : '';
    db.prepare(`INSERT INTO ${table} (${columns.map(name => `"${name}"`).join(',')}) VALUES (${names.map(() => '?').join(',')})${suffix}`)
      .run(...names.map(name => json.has(name) ? row[name] === null ? null : JSON.stringify(row[name]) : name === 'archived' ? Number(row[name]) : row[name] ?? null));
  }
  return { workspaceId,
    transaction<T>(operation: () => T): T {
      try { return db.transaction(operation).immediate(); }
      catch (error) {
        if (error instanceof Error && 'code' in error && String(error.code).startsWith('SQLITE_BUSY')) throw Object.assign(new Error('Planner is bezet. Probeer dezelfde opdracht opnieuw.'), { statusCode: 503 });
        throw error;
      }
    },
    contacts: () => all<Contact>('planner_contacts'), contact: id => find<Contact>('planner_contacts', id), saveContact: value => save('planner_contacts', value, true),
    slots: date => all<Slot>('planner_slots', 'AND date=?', [date]), slot: id => find<Slot>('planner_slots', id), insertSlot: value => save('planner_slots', value),
    block: slotId => all<Block>('planner_blocks', 'AND slot_id=?', [slotId])[0], findBlock: id => find<Block>('planner_blocks', id), insertBlock: value => save('planner_blocks', value),
    removeBlock: id => { db.prepare('DELETE FROM planner_blocks WHERE workspace_id=? AND id=?').run(workspaceId, id); },
    appointments: () => all<Appointment>('planner_appointments'), appointment: id => find<Appointment>('planner_appointments', id), saveAppointment: value => save('planner_appointments', value, true),
    appendEvent: value => save('planner_appointment_events', value),
    events: ids => {
      const requested = new Set(ids);
      return db.prepare('SELECT * FROM planner_appointment_events WHERE workspace_id=? ORDER BY created_at,rowid').all(workspaceId).map(row => decode<AppointmentEvent>(row as Row)!).filter(event => requested.has(event.appointmentId));
    },
    receipt(actor, operation, key) {
      const row = db.prepare('SELECT hash,result FROM planner_command_receipts WHERE workspace_id=? AND actor=? AND operation=? AND key=?').get(workspaceId, actor, operation, key) as { hash: string; result: string } | undefined;
      return row ? { hash: row.hash, result: JSON.parse(row.result) } : undefined;
    },
    saveReceipt(actor, operation, key, hash, result) { db.prepare('INSERT INTO planner_command_receipts VALUES (?,?,?,?,?,?)').run(workspaceId, actor, operation, key, hash, JSON.stringify(result)); },
  };
}
