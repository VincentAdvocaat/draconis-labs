import type Database from 'better-sqlite3';

export function applyPublicBooking(db:Database.Database){
  // Widen appointment provenance without rewriting any previous window/event JSON.
  db.exec(`
    CREATE TEMP TABLE pl31_appointments AS SELECT * FROM planner_appointments;
    CREATE TEMP TABLE pl31_events AS SELECT * FROM planner_appointment_events ORDER BY rowid;
    DROP TABLE planner_appointment_events;
    DROP TABLE planner_appointments;
    CREATE TABLE planner_appointments (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, contact_id TEXT NOT NULL, slot_id TEXT NOT NULL,
      zone_id TEXT NOT NULL, zone_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','cancelled','completed')), source TEXT NOT NULL CHECK(source IN ('manual','public')),
      version INTEGER NOT NULL CHECK(version>0), window TEXT NOT NULL, arrival_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,id,contact_id),
      FOREIGN KEY(workspace_id,contact_id) REFERENCES planner_contacts(workspace_id,id),
      FOREIGN KEY(workspace_id,slot_id,zone_id) REFERENCES planner_slots(workspace_id,id,zone_id)
    );
    CREATE INDEX planner_contact_appointments ON planner_appointments(workspace_id,contact_id);
    CREATE INDEX planner_slot_occupancy ON planner_appointments(workspace_id,slot_id,status);
    CREATE TABLE planner_appointment_events (
      workspace_id TEXT NOT NULL,id TEXT NOT NULL,appointment_id TEXT NOT NULL,actor TEXT NOT NULL,
      created_at TEXT NOT NULL,type TEXT NOT NULL,before TEXT,after TEXT NOT NULL,
      PRIMARY KEY(workspace_id,id),FOREIGN KEY(workspace_id,appointment_id) REFERENCES planner_appointments(workspace_id,id)
    );
    INSERT INTO planner_appointments SELECT * FROM pl31_appointments;
    INSERT INTO planner_appointment_events SELECT * FROM pl31_events ORDER BY rowid;
    DROP TABLE pl31_events; DROP TABLE pl31_appointments;
    CREATE TABLE planner_public_channels (
      workspace_id TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,site_origin TEXT NOT NULL,
      active INTEGER NOT NULL CHECK(active IN (0,1)),PRIMARY KEY(workspace_id,id),UNIQUE(id)
    );
    CREATE UNIQUE INDEX planner_one_active_channel ON planner_public_channels(workspace_id) WHERE active=1;
    CREATE TABLE planner_public_requests (
      workspace_id TEXT NOT NULL,id TEXT NOT NULL,channel_id TEXT NOT NULL,contact_id TEXT NOT NULL,
      appointment_id TEXT NOT NULL,reference TEXT NOT NULL,created_at TEXT NOT NULL,
      PRIMARY KEY(workspace_id,id),UNIQUE(workspace_id,reference),
      FOREIGN KEY(workspace_id,channel_id) REFERENCES planner_public_channels(workspace_id,id),
      FOREIGN KEY(workspace_id,appointment_id,contact_id) REFERENCES planner_appointments(workspace_id,id,contact_id)
    );
    CREATE TABLE planner_public_receipts (
      workspace_id TEXT NOT NULL,channel_id TEXT NOT NULL,key TEXT NOT NULL,hash TEXT NOT NULL,result TEXT NOT NULL CHECK(json_valid(result)),
      PRIMARY KEY(workspace_id,channel_id,key),FOREIGN KEY(workspace_id,channel_id) REFERENCES planner_public_channels(workspace_id,id)
    );
  `);
  for(const action of ['INSERT','UPDATE'])db.exec(`
    CREATE TRIGGER planner_capacity_${action.toLowerCase()} BEFORE ${action} ON planner_appointments
    WHEN NEW.status!='cancelled' BEGIN
      SELECT CASE WHEN (SELECT count(*) FROM planner_appointments WHERE workspace_id=NEW.workspace_id AND slot_id=NEW.slot_id AND id!=NEW.id AND status!='cancelled') >=
        (SELECT capacity FROM planner_slots WHERE workspace_id=NEW.workspace_id AND id=NEW.slot_id)
        THEN RAISE(ABORT,'planner slot full') END;
      SELECT CASE WHEN EXISTS(SELECT 1 FROM planner_blocks WHERE workspace_id=NEW.workspace_id AND slot_id=NEW.slot_id)
        THEN RAISE(ABORT,'planner slot blocked') END;
    END;
  `);
  if((db.pragma('foreign_key_check') as unknown[]).length)throw new Error('Public booking migration violates a foreign key');
}
