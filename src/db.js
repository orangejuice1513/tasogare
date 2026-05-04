/**
 * db.js — Mission Control database layer
 *
 * Replaces the old fetch()-based API object with direct SQLite queries
 * via @tauri-apps/plugin-sql.  Drop this file into src/ alongside App.jsx.
 *
 * The plugin opens a single SQLite file at:
 *   macOS  → ~/Library/Application Support/<bundle-id>/whitespace.db
 *   Linux  → ~/.local/share/<bundle-id>/whitespace.db
 *   Windows → %APPDATA%\<bundle-id>\whitespace.db
 */

import Database from "@tauri-apps/plugin-sql";

// ── Connection singleton ──────────────────────────────────────────────────────
// load() is cheap after the first call — the plugin caches the connection.
async function getDb() {
  return await Database.load("sqlite:whitespace.db");
}

// ── Schema bootstrap ─────────────────────────────────────────────────────────
// Called once from App on mount.  Every statement is idempotent (IF NOT EXISTS)
// so running it on every launch is completely safe.
export async function initDb() {
  const db = await getDb();
  await db.execute(`PRAGMA foreign_keys = ON`);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT    NOT NULL,
      short_description TEXT    NOT NULL DEFAULT '',
      long_description  TEXT    NOT NULL DEFAULT '',
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      type             TEXT    NOT NULL CHECK(type IN ('Routine','Engineering')),
      project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      intent           TEXT    NOT NULL DEFAULT '',
      reality          TEXT    NOT NULL DEFAULT '',
      notes            TEXT    NOT NULL DEFAULT '',
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      timestamp        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects() {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM projects ORDER BY created_at DESC"
  );
}

/**
 * @param {{ name: string, short_description?: string, long_description?: string }} body
 * @returns {Promise<object>} the newly-created project row
 */
export async function createProject(body) {
  const { name, short_description = "", long_description = "" } = body;
  if (!name.trim()) throw new Error("name is required");

  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO projects (name, short_description, long_description)
     VALUES ($1, $2, $3)`,
    [name.trim(), short_description, long_description]
  );

  // Fetch the newly-inserted row by its lastInsertId
  const rows = await db.select(
    "SELECT * FROM projects WHERE id = $1",
    [result.lastInsertId]
  );
  return rows[0];
}

// ── Sessions ──────────────────────────────────────────────────────────────────

/**
 * @param {number|null} projectId  — pass null to fetch all sessions
 */
export async function getSessions(projectId = null) {
  const db = await getDb();
  if (projectId != null) {
    return await db.select(
      "SELECT * FROM sessions WHERE project_id = $1 ORDER BY timestamp DESC",
      [projectId]
    );
  }
  return await db.select(
    "SELECT * FROM sessions ORDER BY timestamp DESC"
  );
}

/**
 * @param {{
 *   type: 'Routine'|'Engineering',
 *   project_id?: number|null,
 *   intent?: string,
 *   reality?: string,
 *   notes?: string,
 *   duration_seconds?: number
 * }} body
 * @returns {Promise<object>} the newly-created session row
 */
export async function createSession(body) {
  const {
    type,
    project_id = null,
    intent = "",
    reality = "",
    notes = "",
    duration_seconds = 0,
  } = body;

  if (type !== "Routine" && type !== "Engineering") {
    throw new Error("type must be 'Routine' or 'Engineering'");
  }

  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO sessions
       (type, project_id, intent, reality, notes, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, project_id, intent, reality, notes, duration_seconds]
  );

  const rows = await db.select(
    "SELECT * FROM sessions WHERE id = $1",
    [result.lastInsertId]
  );
  return rows[0];
}

/**
 * @param {number} id
 */
export async function deleteSession(id) {
  const db = await getDb();
  const result = await db.execute(
    "DELETE FROM sessions WHERE id = $1",
    [id]
  );
  if (result.rowsAffected === 0) {
    throw new Error(`session ${id} not found`);
  }
}
