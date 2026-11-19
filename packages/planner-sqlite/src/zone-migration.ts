import type Database from 'better-sqlite3';
import { LOCAL_DEMO_ZONES } from '@draconis/shared';

/** Rebuild parent and dependent tables child-first under the migration transaction.
 * Existing window/event JSON is copied verbatim; all keys and references survive.
 */
export function applyZones(db: Database.Database) {
  db.exec(`
    CREATE TABLE planner_zones (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
      default_capacity INTEGER NOT NULL CHECK(typeof(default_capacity)='integer' AND default_capacity BETWEEN 0 AND 100),
      version INTEGER NOT NULL CHECK(version>0), PRIMARY KEY(workspace_id,id)
    );
  `);
  const workspaces = db.prepare("SELECT workspace_id FROM planner_contacts UNION SELECT workspace_id FROM planner_slots UNION SELECT 'local' AS workspace_id").all() as { workspace_id: string }[];
  const insertZone = db.prepare('INSERT INTO planner_zones VALUES (?,?,?,?,?)');
  for (const { workspace_id } of workspaces) for (const zone of LOCAL_DEMO_ZONES) insertZone.run(workspace_id, zone.id, zone.name, 1, 1);
  db.exec(`
    CREATE TEMP TABLE pl21_slots AS SELECT * FROM planner_slots;
    CREATE TEMP TABLE pl21_blocks AS SELECT * FROM planner_blocks;
    CREATE TEMP TABLE pl21_appointments AS SELECT * FROM planner_appointments;
    CREATE TEMP TABLE pl21_events AS SELECT * FROM planner_appointment_events ORDER BY rowid;
    DROP TABLE planner_appointment_events;
    DROP TABLE planner_appointments;
    DROP TABLE planner_blocks;
    DROP TABLE planner_slots;
    CREATE TABLE planner_slots (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, zone_id TEXT NOT NULL, date TEXT NOT NULL, daypart_id TEXT NOT NULL,
      label TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL, timezone TEXT NOT NULL,
      start_at TEXT NOT NULL, end_at TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(typeof(capacity)='integer' AND capacity BETWEEN 0 AND 100),
      version INTEGER NOT NULL CHECK(version>0), PRIMARY KEY(workspace_id,id),
      UNIQUE(workspace_id,id,zone_id), UNIQUE(workspace_id,zone_id,date,daypart_id), CHECK(start_at<end_at),
      FOREIGN KEY(workspace_id,zone_id) REFERENCES planner_zones(workspace_id,id)
    );
    CREATE TABLE planner_blocks (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, slot_id TEXT NOT NULL, reason TEXT NOT NULL,
      actor TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id), UNIQUE(workspace_id,slot_id),
      FOREIGN KEY(workspace_id,slot_id) REFERENCES planner_slots(workspace_id,id)
    );
    CREATE TABLE planner_appointments (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, contact_id TEXT NOT NULL, slot_id TEXT NOT NULL,
      zone_id TEXT NOT NULL, zone_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('planned','cancelled','completed')), source TEXT NOT NULL CHECK(source='manual'),
      version INTEGER NOT NULL CHECK(version>0), window TEXT NOT NULL, arrival_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(workspace_id,id),
      FOREIGN KEY(workspace_id,contact_id) REFERENCES planner_contacts(workspace_id,id),
      FOREIGN KEY(workspace_id,slot_id,zone_id) REFERENCES planner_slots(workspace_id,id,zone_id)
    );
    CREATE INDEX planner_contact_appointments ON planner_appointments(workspace_id,contact_id);
    CREATE INDEX planner_slot_occupancy ON planner_appointments(workspace_id,slot_id,status);
    CREATE TABLE planner_appointment_events (
      workspace_id TEXT NOT NULL, id TEXT NOT NULL, appointment_id TEXT NOT NULL, actor TEXT NOT NULL,
      created_at TEXT NOT NULL, type TEXT NOT NULL, before TEXT, after TEXT NOT NULL,
      PRIMARY KEY(workspace_id,id), FOREIGN KEY(workspace_id,appointment_id) REFERENCES planner_appointments(workspace_id,id)
    );
    INSERT INTO planner_slots SELECT workspace_id,id,'standard',date,daypart_id,label,start_time,end_time,timezone,start_at,end_at,capacity,1 FROM pl21_slots;
    INSERT INTO planner_blocks SELECT * FROM pl21_blocks;
    INSERT INTO planner_appointments SELECT workspace_id,id,contact_id,slot_id,'standard','Standaardgebied',status,source,version,window,arrival_at,created_at,updated_at FROM pl21_appointments;
    INSERT INTO planner_appointment_events SELECT * FROM pl21_events ORDER BY rowid;
    DROP TABLE pl21_events; DROP TABLE pl21_appointments; DROP TABLE pl21_blocks; DROP TABLE pl21_slots;
    UPDATE planner_command_receipts SET result=json_set(result,'$.zoneId','standard','$.zoneName','Standaardgebied')
      WHERE operation IN ('appointments.create','appointments.move','appointments.status');
  `);
  // Defense for all SQL writers, in addition to the shared immediate transaction.
  for (const action of ['INSERT','UPDATE']) db.exec(`
    CREATE TRIGGER planner_capacity_${action.toLowerCase()} BEFORE ${action} ON planner_appointments
    WHEN NEW.status!='cancelled' BEGIN
      SELECT CASE WHEN (SELECT count(*) FROM planner_appointments WHERE workspace_id=NEW.workspace_id AND slot_id=NEW.slot_id AND id!=NEW.id AND status!='cancelled') >=
        (SELECT capacity FROM planner_slots WHERE workspace_id=NEW.workspace_id AND id=NEW.slot_id)
        THEN RAISE(ABORT,'planner slot full') END;
      SELECT CASE WHEN EXISTS(SELECT 1 FROM planner_blocks WHERE workspace_id=NEW.workspace_id AND slot_id=NEW.slot_id)
        THEN RAISE(ABORT,'planner slot blocked') END;
    END;
  `);
  db.exec(`
    CREATE TRIGGER planner_capacity_reduction BEFORE UPDATE OF capacity ON planner_slots
    WHEN NEW.capacity < (SELECT count(*) FROM planner_appointments WHERE workspace_id=NEW.workspace_id AND slot_id=NEW.id AND status!='cancelled')
    BEGIN SELECT RAISE(ABORT,'planner capacity below occupancy'); END;
    CREATE TRIGGER planner_block_occupied BEFORE INSERT ON planner_blocks
    WHEN EXISTS(SELECT 1 FROM planner_appointments WHERE workspace_id=NEW.workspace_id AND slot_id=NEW.slot_id AND status!='cancelled')
    BEGIN SELECT RAISE(ABORT,'planner slot occupied'); END;
    CREATE TRIGGER planner_block_occupied_update BEFORE UPDATE OF workspace_id,slot_id ON planner_blocks
    WHEN EXISTS(SELECT 1 FROM planner_appointments WHERE workspace_id=NEW.workspace_id AND slot_id=NEW.slot_id AND status!='cancelled')
    BEGIN SELECT RAISE(ABORT,'planner slot occupied'); END;
  `);
  if ((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Zone migration violates a foreign key');
}
