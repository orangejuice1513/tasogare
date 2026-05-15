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
      started_at       TEXT,
      timestamp        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try { await db.execute("ALTER TABLE sessions ADD COLUMN started_at TEXT"); } catch (_) {}
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      text          TEXT    NOT NULL,
      project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      priority      TEXT    CHECK(priority IN ('high','med','low')) DEFAULT NULL,
      order_idx     INTEGER NOT NULL DEFAULT 0,
      done          INTEGER NOT NULL DEFAULT 0,
      done_at       TEXT,
      deleted       INTEGER NOT NULL DEFAULT 0,
      delete_reason TEXT,
      deleted_at    TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try { await db.execute("ALTER TABLE tasks ADD COLUMN priority TEXT CHECK(priority IN ('high','med','low')) DEFAULT NULL"); } catch (_) {}
  try { await db.execute("ALTER TABLE tasks ADD COLUMN order_idx INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS lessons (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT '',
      symptom     TEXT NOT NULL DEFAULT '',
      root_cause  TEXT NOT NULL DEFAULT '',
      fix         TEXT NOT NULL DEFAULT '',
      takeaway    TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

// ── Lessons ───────────────────────────────────────────────────────────────────

export async function getLessons() {
  const db = await getDb();
  return await db.select("SELECT * FROM lessons ORDER BY created_at DESC");
}

export async function createLesson({ title, category, symptom, root_cause, fix, takeaway }) {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO lessons (title, category, symptom, root_cause, fix, takeaway)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [title, category, symptom, root_cause, fix, takeaway]
  );
  const rows = await db.select("SELECT * FROM lessons WHERE id = $1", [result.lastInsertId]);
  return rows[0];
}

export async function deleteLesson(id) {
  const db = await getDb();
  await db.execute("DELETE FROM lessons WHERE id = $1", [id]);
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

export async function updateProject({ id, name, short_description, long_description }) {
  if (!name.trim()) throw new Error("name is required");
  const db = await getDb();
  await db.execute(
    "UPDATE projects SET name = $1, short_description = $2, long_description = $3 WHERE id = $4",
    [name.trim(), short_description, long_description, id]
  );
  const rows = await db.select("SELECT * FROM projects WHERE id = $1", [id]);
  return rows[0];
}

// Hard delete — sessions and tasks with this project_id become unlinked (SET NULL)
export async function deleteProject(id) {
  const db = await getDb();
  const result = await db.execute("DELETE FROM projects WHERE id = $1", [id]);
  if (result.rowsAffected === 0) throw new Error(`project ${id} not found`);
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
  type, project_id = null, intent = "", reality = "", notes = "", duration_seconds = 0, started_at = null,
}) {
  if (type !== "Routine" && type !== "Engineering") {
    throw new Error("type must be 'Routine' or 'Engineering'");
  }
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO sessions (type, project_id, intent, reality, notes, duration_seconds, started_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [type, project_id, intent, reality, notes, duration_seconds, started_at]
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
    "SELECT * FROM tasks WHERE deleted = 0 ORDER BY done ASC, order_idx ASC, created_at ASC"
  );
}

export async function createTask({ text, project_id = null }) {
  if (!text.trim()) throw new Error("task text is required");
  const db = await getDb();
  // Place new task at the top (order_idx = 0, shift others down)
  await db.execute("UPDATE tasks SET order_idx = order_idx + 1 WHERE deleted = 0 AND done = 0");
  const result = await db.execute(
    "INSERT INTO tasks (text, project_id, order_idx) VALUES ($1, $2, 0)",
    [text.trim(), project_id]
  );
  const rows = await db.select("SELECT * FROM tasks WHERE id = $1", [result.lastInsertId]);
  return rows[0];
}

// Saves the new order of pending task ids to the database
export async function reorderTasks(orderedIds) {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.execute("UPDATE tasks SET order_idx = $1 WHERE id = $2", [i, orderedIds[i]]);
  }
}

export async function updateTask(id, { text, project_id }) {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET text = $1, project_id = $2 WHERE id = $3",
    [text, project_id, id]
  );
  const rows = await db.select("SELECT * FROM tasks WHERE id = $1", [id]);
  return rows[0];
}

// Cycles priority: null → high → med → low → null
export async function setTaskPriority(id, priority) {
  const db = await getDb();
  await db.execute(
    "UPDATE tasks SET priority = $1 WHERE id = $2",
    [priority, id]
  );
  const rows = await db.select("SELECT * FROM tasks WHERE id = $1", [id]);
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
