-- Apply after legacy.sql to produce a synthetic current-schema fixture.
ALTER TABLE tasks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tasks ADD COLUMN due_date TEXT;
ALTER TABLE tasks ADD COLUMN due_time TEXT;
ALTER TABLE tasks ADD COLUMN timezone TEXT;
ALTER TABLE tasks ADD COLUMN recurrence TEXT;
ALTER TABLE tasks ADD COLUMN recurrence_parent_id TEXT;
UPDATE tasks SET version=7, due_date='2026-11-20', due_time='09:15',
  timezone='Europe/Amsterdam', recurrence='{"frequency":"weekly","interval":2}'
  WHERE id='00000000-0000-4000-8000-000000000001';
UPDATE tasks SET recurrence_parent_id='00000000-0000-4000-8000-000000000001'
  WHERE id='00000000-0000-4000-8000-000000000003';
