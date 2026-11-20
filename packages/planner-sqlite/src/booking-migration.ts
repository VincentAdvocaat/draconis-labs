import type Database from 'better-sqlite3';

export function applyBookings(db: Database.Database) {
  db.exec(`
    CREATE TABLE planner_contacts (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL, email TEXT, phone TEXT,
      archived INTEGER NOT NULL CHECK(archived IN (0,1)), version INTEGER NOT NULL CHECK(version>0),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id)
    );
    CREATE TABLE planner_slots (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, date TEXT NOT NULL, daypart_id TEXT NOT NULL,
      label TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, timezone TEXT NOT NULL,
      start_at TEXT NOT NULL, end_at TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity=1),
      PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,date,daypart_id), CHECK(start_at<end_at)
    );
    CREATE TABLE planner_blocks (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, slot_id TEXT NOT NULL, reason TEXT NOT NULL,
      actor TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,slot_id),
      FOREIGN KEY(workspace_id,slot_id) REFERENCES planner_slots(workspace_id,id)
    );
    CREATE TABLE planner_appointments (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, contact_id TEXT NOT NULL, slot_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','cancelled','completed')), source TEXT NOT NULL CHECK(source='manual'),
      version INTEGER NOT NULL CHECK(version>0), window TEXT NOT NULL, arrival_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id),
      FOREIGN KEY(workspace_id,contact_id) REFERENCES planner_contacts(workspace_id,id),
      FOREIGN KEY(workspace_id,slot_id) REFERENCES planner_slots(workspace_id,id)
    );
    CREATE UNIQUE INDEX planner_slot_capacity_one ON planner_appointments(workspace_id,slot_id) WHERE status!='cancelled';
    CREATE INDEX planner_contact_appointments ON planner_appointments(workspace_id,contact_id);
    CREATE TABLE planner_appointment_events (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, appointment_id TEXT NOT NULL, actor TEXT NOT NULL,
      created_at TEXT NOT NULL, type TEXT NOT NULL, before TEXT, after TEXT NOT NULL,
      PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,appointment_id) REFERENCES planner_appointments(workspace_id,id)
    );
    CREATE TABLE planner_command_receipts (
      workspace_id TEXT NOT NULL, actor TEXT NOT NULL, operation TEXT NOT NULL, key TEXT NOT NULL,
      hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(workspace_id,actor,operation,key)
    );
  `);
}
