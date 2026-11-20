-- Synthetic pre-scheduling/version schema. Never copied from a user database.
CREATE TABLE tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  lane TEXT NOT NULL DEFAULT 'todo', planned_date TEXT, position REAL NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'user', priority TEXT NOT NULL DEFAULT 'normal',
  labels TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, completed_at TEXT
);
INSERT INTO tasks VALUES
('00000000-0000-4000-8000-000000000001','Fictieve inspectie','Behoud deze tekst','todo','2026-11-19',2000,'demo-agent','high','["demo","onderhoud"]','2026-11-18T10:00:00.000Z','2026-11-18T10:00:00.000Z',NULL),
('00000000-0000-4000-8000-000000000002','Zonder datum',NULL,'todo',NULL,1000,'user','normal','[]','2026-11-18T11:00:00.000Z','2026-11-18T11:00:00.000Z',NULL),
('00000000-0000-4000-8000-000000000003','Afgeronde demo',NULL,'done','2026-11-18',1000,'user','low','["historie"]','2026-11-18T09:00:00.000Z','2026-11-18T12:00:00.000Z','2026-11-18T12:00:00.000Z');
CREATE TABLE user_preferences (id TEXT PRIMARY KEY, preferences TEXT NOT NULL, updated_at TEXT NOT NULL);
INSERT INTO user_preferences VALUES ('default','{"locale":"nl","timezone":"Europe/Amsterdam","weekStart":1,"defaultView":"scheduled","savedViews":[]}','2026-11-18T10:00:00.000Z');
