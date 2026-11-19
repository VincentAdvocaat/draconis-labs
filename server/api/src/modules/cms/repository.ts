import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { CmsError, type Attempt, type Page, type ReleaseInput, type Values } from './model.js';

interface PageRow { revision_id: string; version: number; values_json: string }
interface AttemptRow {
  id: string; website_id: string; revision_id: string; expected_active_version: number;
  status: Attempt['status']; error_code: string | null;
}

export class CmsRepository {
  readonly db: Database.Database;
  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    // Module migration 1. Separate fixture database, never the Planner connection.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cms_migrations (version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS cms_sites (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS cms_revisions (
        id TEXT PRIMARY KEY, website_id TEXT NOT NULL REFERENCES cms_sites(id),
        parent_id TEXT REFERENCES cms_revisions(id), values_json TEXT NOT NULL,
        actor_id TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cms_pages (
        website_id TEXT PRIMARY KEY REFERENCES cms_sites(id),
        revision_id TEXT NOT NULL REFERENCES cms_revisions(id), version INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS cms_attempts (
        id TEXT PRIMARY KEY, website_id TEXT NOT NULL REFERENCES cms_sites(id),
        revision_id TEXT NOT NULL REFERENCES cms_revisions(id), expected_active_version INTEGER NOT NULL,
        idempotency_key TEXT NOT NULL, payload TEXT NOT NULL, actor_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('building','published','failed','conflict')),
        error_code TEXT, created_at TEXT NOT NULL, UNIQUE(website_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS cms_active (
        website_id TEXT PRIMARY KEY REFERENCES cms_sites(id),
        release_id TEXT NOT NULL REFERENCES cms_attempts(id), version INTEGER NOT NULL
      );
      INSERT OR IGNORE INTO cms_migrations VALUES (1);
    `);
  }

  seed(): void {
    this.db.transaction(() => {
      for (const websiteId of ['demo-cms', 'demo-other']) {
        const inserted = this.db.prepare('INSERT OR IGNORE INTO cms_sites VALUES (?)').run(websiteId);
        if (!inserted.changes) continue;
        const id = this.insertRevision(websiteId, null, {
          title: 'Welkom bij de proeftuin',
          intro: 'Dit is fictieve inhoud voor een lokale CMS-proef.',
        }, 'fixture-seed');
        this.db.prepare('INSERT INTO cms_pages VALUES (?, ?, 1)').run(websiteId, id);
      }
    })();
  }

  private insertRevision(websiteId: string, parent: string | null, values: Values, actor: string): string {
    const id = randomUUID();
    this.db.prepare('INSERT INTO cms_revisions VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, websiteId, parent, JSON.stringify(values), actor, new Date().toISOString());
    return id;
  }

  active(websiteId: string): { activeReleaseId: string | null; activeVersion: number } {
    const row = this.db.prepare('SELECT release_id, version FROM cms_active WHERE website_id = ?')
      .get(websiteId) as { release_id: string; version: number } | undefined;
    return { activeReleaseId: row?.release_id ?? null, activeVersion: row?.version ?? 0 };
  }

  page(websiteId: string): Page {
    const row = this.db.prepare(`SELECT p.revision_id, p.version, r.values_json
      FROM cms_pages p JOIN cms_revisions r ON r.id = p.revision_id WHERE p.website_id = ?`)
      .get(websiteId) as PageRow | undefined;
    if (!row) throw new CmsError(404, 'Website niet gevonden');
    return { revisionId: row.revision_id, pageVersion: row.version,
      values: JSON.parse(row.values_json) as Values, ...this.active(websiteId) };
  }

  revision(websiteId: string, revisionId: string): Values {
    const row = this.db.prepare('SELECT values_json FROM cms_revisions WHERE id = ? AND website_id = ?')
      .get(revisionId, websiteId) as { values_json: string } | undefined;
    if (!row) throw new CmsError(404, 'Revisie niet gevonden');
    return JSON.parse(row.values_json) as Values;
  }

  save(websiteId: string, expectedVersion: number, values: Values, actor: string): Page {
    return this.db.transaction(() => {
      const current = this.page(websiteId);
      if (current.pageVersion !== expectedVersion) throw new CmsError(409, 'Concept gewijzigd. Vergelijk met de nieuwste versie.');
      const revisionId = this.insertRevision(websiteId, current.revisionId, values, actor);
      const changed = this.db.prepare(`UPDATE cms_pages SET revision_id = ?, version = version + 1
        WHERE website_id = ? AND version = ?`).run(revisionId, websiteId, expectedVersion);
      if (!changed.changes) throw new CmsError(409, 'Concept gewijzigd');
      return this.page(websiteId);
    }).immediate();
  }

  private map(row: AttemptRow): Attempt {
    return { releaseId: row.id, websiteId: row.website_id, revisionId: row.revision_id,
      expectedActiveVersion: row.expected_active_version, status: row.status, errorCode: row.error_code,
      publicUrl: row.status === 'published' ? `/sites/${row.website_id}/index.html` : null };
  }

  attempt(websiteId: string, releaseId: string): Attempt {
    const row = this.db.prepare('SELECT * FROM cms_attempts WHERE website_id = ? AND id = ?')
      .get(websiteId, releaseId) as AttemptRow | undefined;
    if (!row) throw new CmsError(404, 'Publicatie niet gevonden');
    return this.map(row);
  }

  begin(websiteId: string, input: ReleaseInput, key: string, actor: string): { attempt: Attempt; created: boolean } {
    return this.db.transaction(() => {
      const payload = JSON.stringify(input);
      const existing = this.db.prepare('SELECT * FROM cms_attempts WHERE website_id = ? AND idempotency_key = ?')
        .get(websiteId, key) as (AttemptRow & { payload: string }) | undefined;
      if (existing) {
        if (existing.payload !== payload) throw new CmsError(409, 'Deze publicatiesleutel hoort bij een andere keuze');
        return { attempt: this.map(existing), created: false };
      }
      this.revision(websiteId, input.revisionId);
      const conflict = this.active(websiteId).activeVersion !== input.expectedActiveVersion;
      const id = randomUUID();
      this.db.prepare('INSERT INTO cms_attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, websiteId, input.revisionId, input.expectedActiveVersion, key, payload, actor,
          conflict ? 'conflict' : 'building', conflict ? 'active_version_changed' : null, new Date().toISOString());
      return { attempt: this.attempt(websiteId, id), created: !conflict };
    }).immediate();
  }

  activate(attempt: Attempt): Attempt {
    return this.db.transaction(() => {
      const current = this.attempt(attempt.websiteId, attempt.releaseId);
      if (current.status !== 'building') return current;
      if (this.active(attempt.websiteId).activeVersion !== attempt.expectedActiveVersion) {
        this.finish(attempt, 'conflict', 'active_version_changed');
      } else {
        this.db.prepare(`INSERT INTO cms_active VALUES (?, ?, ?)
          ON CONFLICT(website_id) DO UPDATE SET release_id = excluded.release_id, version = excluded.version`)
          .run(attempt.websiteId, attempt.releaseId, attempt.expectedActiveVersion + 1);
        this.finish(attempt, 'published', null);
      }
      return this.attempt(attempt.websiteId, attempt.releaseId);
    }).immediate();
  }

  finish(attempt: Attempt, status: Attempt['status'], error: string | null): void {
    this.db.prepare("UPDATE cms_attempts SET status = ?, error_code = ? WHERE id = ? AND website_id = ? AND status = 'building'")
      .run(status, error, attempt.releaseId, attempt.websiteId);
  }

  reconcile(): void {
    this.db.prepare("UPDATE cms_attempts SET status = 'failed', error_code = 'interrupted' WHERE status = 'building'").run();
  }

  close(): void { this.db.close(); }
}
