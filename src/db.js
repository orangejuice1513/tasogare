/**
 * db.js — Mission Control database layer
 * Place in: tasogare/src/db.js
 */

import Database from "@tauri-apps/plugin-sql";

async function getDb() {
  return await Database.load("sqlite:whitespace.db");
}

// ── Schema bootstrap ──────────────────────────────────────────────────────────
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
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      text          TEXT    NOT NULL,
      project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      done          INTEGER NOT NULL DEFAULT 0,
      done_at       TEXT,
      deleted       INTEGER NOT NULL DEFAULT 0,
      delete_reason TEXT,
      deleted_at    TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getProjects() {
  const db = await getDb();
  return await db.select("SELECT * FROM projects ORDER BY created_at DESC");
}

export async function createProject({ name, short_description = "", long_description = "" }) {
  if (!name.trim()) throw new Error("name is required");
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO projects (name, short_description, long_description) VALUES ($1, $2, $3)",
    [name.trim(), short_description, long_description]
  );
  const rows = await db.select("SELECT * FROM projects WHERE id = $1", [result.lastInsertId]);
  return rows[0];
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export async function getSessions(projectId = null) {
  const db = await getDb();
  if (projectId != null) {
    return await db.select(
      "SELECT * FROM sessions WHERE project_id = $1 ORDER BY timestamp DESC",
      [projectId]
    );
  }
  return await db.select("SELECT * FROM sessions ORDER BY timestamp DESC");
}

export async function createSession({
  type, project_id = null, intent = "", reality = "", notes = "", duration_seconds = 0,
}) {
  if (type !== "Routine" && type !== "Engineering") {
    throw new Error("type must be 'Routine' or 'Engineering'");
  }
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO sessions (type, project_id, intent, reality, notes, duration_seconds)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [type, project_id, intent, reality, notes, duration_seconds]
  );
  const rows = await db.select("SELECT * FROM sessions WHERE id = $1", [result.lastInsertId]);
  return rows[0];
}

export async function deleteSession(id) {
  const db = await getDb();
  const result = await db.execute("DELETE FROM sessions WHERE id = $1", [id]);
  if (result.rowsAffected === 0) throw new Error(`session ${id} not found`);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function getTasks() {
  const db = await getDb();
  return await db.select(
    "SELECT * FROM tasks WHERE deleted = 0 ORDER BY done ASC, created_at ASC"
  );
}

export async function createTask({ text, project_id = null }) {
  if (!text.trim()) throw new Error("task text is required");
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO tasks (text, project_id) VALUES ($1, $2)",
    [text.trim(), project_id]
  );
  const rows = await db.select("SELECT * FROM tasks WHERE id = $1", [result.lastInsertId]);
  return rows[0];
}

export async function completeTask(id) {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET done = 1, done_at = datetime('now') WHERE id = $1",
    [id]
  );
  const rows = await db.select("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0];
}

export async function uncompleteTask(id) {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET done = 0, done_at = NULL WHERE id = $1",
    [id]
  );
  const rows = await db.select("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0];
}

// Soft-delete — stores the mandatory reason so nothing is silently lost
export async function deleteTask(id, reason) {
  if (!reason || !reason.trim()) throw new Error("a reason is required to delete a task");
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET deleted = 1, delete_reason = $1, deleted_at = datetime('now') WHERE id = $2",
    [reason.trim(), id]
  );
}
