/**
 * App.jsx — tasogare · tiling-WM layout
 * Shell adapted from the wsm index.html design.
 * Data wired to SQLite via db.js + Rust timer via invoke().
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  initDb, getProjects, createProject, updateProject, deleteProject,
  getSessions, createSession, deleteSession,
  getTasks, createTask, updateTask, setTaskPriority, reorderTasks, completeTask, uncompleteTask, deleteTask,
  getLessons, createLesson, deleteLesson,
} from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const pad  = (n) => n.toString().padStart(2, "0");
const fmtClock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtTime  = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtDateLabel = (d) => {
  const days = ["sun","mon","tue","wed","thu","fri","sat"];
  return `${days[d.getDay()]} ${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

// Parse a UTC timestamp stored by SQLite datetime('now') — appends Z so JS converts to local
function parseTs(ts) {
  if (!ts) return new Date();
  return new Date(ts.replace(" ", "T") + "Z");
}

// Parse a local-time string stored by JS (started_at) — no Z, treat as local time directly
function parseLocalTs(ts) {
  if (!ts) return new Date();
  return new Date(ts.replace(" ", "T")); // no Z — already local
}
function fmtDur(s) {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return `${m}m ${pad(sec)}s`;
  const h = Math.floor(m / 60);
  return `${h}h${pad(m % 60)}m`;
}
function fmtHours(s) {
  if (!s) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}:${pad(m)}`;
}
function toLocalDateKey(ts) {
  const d = parseTs(ts); // parseTs appends Z → converts UTC to local
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function fmtShortDay(dateKey) {
  const d = new Date(dateKey + "T12:00:00");
  const days = ["sun","mon","tue","wed","thu","fri","sat"];
  return `${days[d.getDay()]} ${dateKey.slice(5)}`;
}

// Efficiency = focused seconds / wall-clock seconds (start→end span)
// Returns a string like "84%" or null if we can't compute it
function calcEfficiency(s) {
  if (!s.started_at || !s.duration_seconds) return null;
  const start   = parseLocalTs(s.started_at);
  const end     = parseTs(s.timestamp);
  const spanSec = (end.getTime() - start.getTime()) / 1000;
  if (spanSec <= 0) return null;
  const pct = Math.round((s.duration_seconds / spanSec) * 100);
  return `${Math.min(pct, 100)}%`;
}
const PANES = [
  { id: "session",   label: "session",          accent: "var(--rose, #F5A9BB)" },
  { id: "projects",  label: "projects",          accent: "var(--iris, #C4A7E7)" },
  { id: "tasks",     label: "tasks",             accent: "var(--iris, #C4A7E7)" },
  { id: "interview", label: "interview deck",    accent: "var(--accent, #BAADF4)" },
  { id: "history",   label: "history",           accent: "var(--iris, #C4A7E7)" },
  { id: "lessons",   label: "lessons learned",   accent: "var(--rose, #F5A9BB)" },
];

// ─── Layout constants ─────────────────────────────────────────────────────────
const SIDEBAR_W = 200;

// ─── Priority ────────────────────────────────────────────────────────────────
const PRI = {
  high: { color: "var(--rose, #F5A9BB)", label: "HI",  next: "med"  },
  med:  { color: "var(--iris, #C4A7E7)", label: "MED", next: "low"  },
  low:  { color: "var(--dim)",           label: "LO",  next: null   },
};
function cyclePriority(current) {
  if (!current) return "high";
  return PRI[current]?.next ?? null;
}
// A clickable dot that cycles through high/med/low/none
function PriorityDot({ priority, onChange, done }) {
  const meta = priority ? PRI[priority] : null;
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(cyclePriority(priority)); }}
      title={priority ? `priority: ${priority} — click to change` : "click to set priority"}
      className="shrink-0 w-2 h-2 rounded-full transition-all"
      style={{
        background: meta ? meta.color : "var(--hl)",
        opacity: done ? 0.35 : 1,
        outline: "none",
      }}
    />
  );
} // px — must match sidebar aside width exactly for border alignment
// The sidebar is 200px wide. The status bar first segment must also be 200px
// so the vertical divider lines up perfectly with the sidebar border on all tabs.
const B = { borderRight: "1px solid var(--hl)" };
const BL = { borderLeft: "1px solid var(--hl)" };
const BB = { borderBottom: "1px solid var(--hl)" };

function StatusBar({ now, running, onBreak, sessionSec, active }) {
  const h = Math.floor(sessionSec / 3600);
  const m = Math.floor((sessionSec % 3600) / 60);
  return (
    <div className="h-[36px] shrink-0 flex items-stretch text-[12px]"
      style={{ background: "var(--base)", ...BB, fontFamily: "InconsolataGo, monospace" }}>
      {/* Exactly SIDEBAR_W including the 1px right border — matches sidebar aside width exactly */}
      <div className="flex items-center px-5 shrink-0"
        style={{ width: SIDEBAR_W, borderRight: "1px solid var(--hl)", boxSizing: "border-box" }}>
        <span style={{ color: "var(--rose)" }}>tasogare</span>
      </div>
      <div className="px-5 flex items-center" style={{ ...B, color: "var(--sub)" }}>
        {active}
        <span className="ml-3" style={{ color: "var(--rose)" }}>focus</span>
      </div>
      <div className="px-5 flex items-center gap-2" style={{ ...B, color: "var(--sub)" }}>
        <span>ses</span>
        <span className="tnum" style={{ color: onBreak ? "var(--rose)" : "var(--iris)" }}>
          {pad(h)}:{pad(m)}
        </span>
        <span style={{ color: running && !onBreak ? "var(--iris)" : "var(--dim)" }}>
          {onBreak ? "⏸" : running ? "▶" : "⏸"}
        </span>
      </div>
      <div className="ml-auto px-5 flex items-center tnum" style={{ ...BL, color: "var(--sub)" }}>
        {fmtDateLabel(now)}
      </div>
      <div className="px-6 flex items-center tnum text-[14px]" style={{ ...BL, color: "var(--text)" }}>
        {fmtClock(now)}
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ active, setActive, pendingCount, theme, setTheme }) {
  const THEMES = [
    { id: "rose-pine-moon",    label: "rosé pine moon",   dot: "#eb6f92" },
    { id: "catppuccin-mocha",  label: "catppuccin mocha",  dot: "#cba6f7" },
    { id: "tokyo-night",       label: "tokyo night",        dot: "#bb9af7" },
  ];
  const [themeOpen, setThemeOpen] = useState(false);
  const current = THEMES.find(t => t.id === theme) || THEMES[0];

  return (
    <aside style={{ width: SIDEBAR_W, flexShrink: 0, borderRight: "1px solid var(--hl)", boxSizing: "border-box", display: "flex", flexDirection: "column", background: "var(--base)", fontFamily: "InconsolataGo, monospace" }}>
      <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--hl)" }}>
        <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--dim)" }}>mission control</div>
      </div>
      <div className="flex flex-col pt-1">
        {PANES.map((p) => {
          const isActive = active === p.id;
          return (
            <button key={p.id} onClick={() => setActive(p.id)}
              className="relative px-6 py-2.5 text-left flex items-center justify-between text-[12.5px]"
              style={{ background: isActive ? "var(--overlay)" : "transparent" }}>
              {isActive && (
                <span className="absolute left-0 top-0 bottom-0 w-[2px]"
                  style={{ background: "var(--rose)" }} />
              )}
              <span style={{ color: isActive ? "var(--text)" : "var(--sub)" }}>
                {p.label}
              </span>
              {p.id === "tasks" && pendingCount > 0 && (
                <span className="text-[10px] px-1.5 py-[1px] border"
                  style={{ color: "var(--iris)", borderColor: "color-mix(in srgb, var(--iris) 30%, transparent)" }}>
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-auto px-5 pb-4 pt-4" style={{ borderTop: "1px solid var(--hl)" }}>
        <div className="relative">
          <button
            onClick={() => setThemeOpen(o => !o)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-[10.5px]"
            style={{ color: "var(--sub)", border: "1px solid var(--hl)" }}>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 shrink-0" style={{ background: current.dot }} />
              <span>[THEME]</span>
            </span>
            <span style={{ color: "var(--dim)" }}>{themeOpen ? "▾" : "▴"}</span>
          </button>
          {themeOpen && (
            <div className="absolute left-0 right-0 bottom-[calc(100%+2px)] z-30"
              style={{ background: "var(--surface)", border: "1px solid var(--hl)" }}>
              {THEMES.map(t => (
                <button key={t.id}
                  onClick={() => { setTheme(t.id); setThemeOpen(false); }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-[10.5px] text-left"
                  style={{ color: theme === t.id ? "var(--text)" : "var(--sub)", background: "transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--overlay)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span className="w-2 h-2 shrink-0"
                    style={{ background: theme === t.id ? t.dot : "transparent", border: `1px solid ${t.dot}` }} />
                  <span className="truncate">{t.label}</span>
                  {theme === t.id && <span className="ml-auto" style={{ color: t.dot }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

// ─── Quick Note Modal ─────────────────────────────────────────────────────────
function QuickNoteModal({ onClose, onSaved }) {
  const [mode, setMode]         = useState("note"); // "note" | "lesson"
  const [text, setText]         = useState("");
  const [title, setTitle]       = useState("");
  const [category, setCategory] = useState("");
  const [symptom, setSymptom]   = useState("");
  const [rootCause, setRootCause] = useState("");
  const [fix, setFix]           = useState("");
  const [takeaway, setTakeaway] = useState("");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState(null);
  const taRef                   = useRef(null);

  const CATEGORIES = ["Hardware","Firmware","GNC","Software","Systems","Other"];

  useEffect(() => {
    taRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      if (mode === "lesson") {
        if (!title.trim()) { setErr("title is required"); setSaving(false); return; }
        await createLesson({ title: title.trim(), category, symptom, root_cause: rootCause, fix, takeaway });
        onClose();
      } else {
        if (!text.trim()) { setErr("note cannot be empty"); setSaving(false); return; }
        const saved = await createSession({ type: "Routine", intent: "Quick Note", notes: text.trim(), duration_seconds: 0 });
        onSaved(saved); onClose();
      }
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const inputCls = "w-full bg-base border border-hl p-2.5 text-[12.5px] outline-none";
  const labelCls = "text-[10px] uppercase tracking-[0.1em] mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="border border-hl bg-surface flex flex-col"
        style={{ width: mode === "lesson" ? 580 : 500, maxHeight: "85vh", fontFamily: "InconsolataGo, monospace" }}>
        {/* Header with mode toggle */}
        <div className="px-5 py-3 border-b border-hl flex items-center gap-3">
          <div className="flex gap-1">
            {[["note","quick note"],["lesson","lesson learned"]].map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)}
                className="px-2.5 py-1 text-[11px] border"
                style={{
                  color: mode === m ? "var(--iris)" : "var(--dim)",
                  borderColor: mode === m ? "var(--iris)" : "var(--hl)",
                  background: mode === m ? "color-mix(in srgb, var(--iris) 8%, transparent)" : "transparent",
                }}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="ml-auto" style={{ color: "var(--dim)" }}>✕</button>
        </div>

        <div className="overflow-y-auto flex-1">
          {mode === "note" ? (
            <div className="p-5">
              <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
                placeholder="jot anything — decision, blocker, loose thought"
                rows={6} className={inputCls}
                style={{ color: "var(--text)", resize: "vertical" }} />
            </div>
          ) : (
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={labelCls} style={{ color: "var(--dim)" }}>title *</div>
                  <input ref={taRef} value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="what went wrong?"
                    className={inputCls} style={{ color: "var(--text)" }} />
                </div>
                <div>
                  <div className={labelCls} style={{ color: "var(--dim)" }}>category</div>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className={inputCls} style={{ color: category ? "var(--text)" : "var(--dim)" }}>
                    <option value="">— select —</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              {[
                { label: "symptom",    value: symptom,    set: setSymptom,   ph: "what did you observe?" },
                { label: "root cause", value: rootCause,  set: setRootCause, ph: "why did it happen?" },
                { label: "fix",        value: fix,        set: setFix,       ph: "what resolved it?" },
                { label: "takeaway",   value: takeaway,   set: setTakeaway,  ph: "what will you do differently?" },
              ].map(({ label, value, set, ph }) => (
                <div key={label}>
                  <div className={labelCls} style={{ color: "var(--iris)" }}>{label}</div>
                  <textarea value={value} onChange={e => set(e.target.value)}
                    placeholder={ph} rows={2}
                    className={inputCls} style={{ color: "var(--text)", resize: "vertical" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {err && <div className="px-5 pb-2 text-[11px]" style={{ color: "var(--rose)" }}>{err}</div>}
        <div className="px-5 py-3 border-t border-hl flex items-center justify-between">
          <span className="text-[10.5px]" style={{ color: "var(--dim)" }}>
            {mode === "note" ? "⌘↵ to save · esc to close" : "esc to close"}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 border border-hl text-[12px]" style={{ color: "var(--sub)" }}>cancel</button>
            <button onClick={save} disabled={saving}
              className="px-3 py-1.5 border text-[12px] disabled:opacity-40"
              style={{ color: "var(--iris)", borderColor: "var(--iris)" }}>
              {saving ? "saving…" : mode === "lesson" ? "log lesson" : "save note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Task Modal ────────────────────────────────────────────────────────
function DeleteTaskModal({ task, onClose, onDeleted }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const ref                 = useRef(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = async () => {
    if (!reason.trim()) { setErr("reason is required"); return; }
    setSaving(true);
    try {
      await deleteTask(task.id, reason.trim());
      onDeleted(task.id); onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[480px] border border-hl bg-surface p-6" style={{ fontFamily: "InconsolataGo, monospace" }}>
        <div className="text-[11px] uppercase tracking-[0.08em] mb-3" style={{ color: "var(--dim)" }}>
          delete task · reason required
        </div>
        <div className="text-[13px] mb-1" style={{ color: "var(--text)" }}>{task.text}</div>
        <div className="text-[11px] mb-4" style={{ color: "var(--sub)" }}>why are you deleting this?</div>
        <textarea ref={ref} value={reason} onChange={e => setReason(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="e.g. no longer relevant · deferred to q4 · duplicate"
          className="w-full bg-base border border-hl p-3 text-[13px] outline-none min-h-[80px]"
          style={{ color: "var(--text)", resize: "vertical" }} />
        {err && <div className="text-[11px] mt-1" style={{ color: "var(--rose, #F5A9BB)" }}>{err}</div>}
        <div className="mt-4 flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 border border-hl text-[12px]" style={{ color: "var(--sub)" }}>cancel</button>
          <button onClick={submit} disabled={saving || !reason.trim()}
            className="px-3 py-1.5 border text-[12px] disabled:opacity-40"
            style={{ color: "var(--rose, #F5A9BB)", borderColor: "var(--rose, #F5A9BB)" }}>
            {saving ? "deleting…" : "confirm delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE 1 · SESSION
// ═══════════════════════════════════════════════════════════════════════════════

// Session timer — right rail, session pane only
function SessionLogRow({ s, meta, proj, ts, hasDetail }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b" style={{ borderColor: "var(--hl)" }}>
      <div
        className="grid text-[12px] hover:bg-surface/40 cursor-pointer"
        style={{ gridTemplateColumns: "70px 50px 1fr 80px 16px", height: 34, alignItems: "center" }}
        onClick={() => hasDetail && setOpen(o => !o)}>
        <div className="px-6 tnum" style={{ color: "var(--sub)" }}>{fmtTime(ts)}</div>
        <div className="px-2 text-[10px]" style={{ color: meta.c }}>{meta.g}</div>
        <div className="px-2 truncate flex items-center gap-2" style={{ color: "var(--text)" }}>
          {proj && (
            <span className="text-[9px] uppercase px-1 border shrink-0"
              style={{ color: "var(--accent, #BAADF4)", borderColor: "var(--hl)" }}>
              {proj.name}
            </span>
          )}
          <span className="truncate">{s.intent}</span>
        </div>
        <div className="pr-2 text-right tnum" style={{ color: "var(--dim)" }}>{fmtDur(s.duration_seconds)}</div>
        <div className="text-[10px]" style={{ color: "var(--dim)" }}>
          {hasDetail ? (open ? "▾" : "▸") : ""}
        </div>
      </div>
      {open && hasDetail && (
        <div className="px-6 pb-2.5 pt-1 space-y-1.5" style={{ background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}>
          {s.reality && (
            <div>
              <span className="text-[10px] uppercase tracking-[0.1em] mr-2" style={{ color: "var(--iris, #C4A7E7)" }}>reality</span>
              <span className="text-[12px]" style={{ color: "var(--sub)" }}>{s.reality}</span>
            </div>
          )}
          {s.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--iris, #C4A7E7)" }}>notes</div>
              <pre className="text-[11.5px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--sub)", fontFamily: "InconsolataGo, monospace" }}>
                {s.notes}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SessionPane({ projects, tasks, onSessionSaved, externalSession, running, setRunning, seconds, setSeconds, onBreak, toggleBreak, onQuickNote, onTaskComplete }) {
  const [phase, setPhase]             = useState("idle");
  const [sessionType, setSessionType] = useState("Routine");
  const [projectId, setProjectId]     = useState(null);
  const [intent, setIntent]           = useState("");
  const [reality, setReality]         = useState("");
  const [debriefNotes, setDebriefNotes] = useState("");
  const [sessions, setSessions]       = useState([]);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState(null);
  // Track when the session started (local time string for display)
  const [startedAt, setStartedAt]     = useState(null);
  // In-session progress notes
  const [progressNotes, setProgressNotes] = useState([]); // [{time, text}]
  const [noteInput, setNoteInput]     = useState("");

  // Load ALL sessions from DB on mount so the full history always shows.
  // Only seeds if sessions is empty — never overwrites an in-progress session.
  useEffect(() => {
    getSessions().then(all => {
      setSessions(prev => prev.length === 0 ? all : prev);
    }).catch(() => {});
  }, []);

  // Absorb external sessions (quick notes)
  useEffect(() => {
    if (externalSession)
      setSessions(arr => [externalSession, ...arr.filter(s => s.id !== externalSession.id)]);
  }, [externalSession]);

  // Break → pause/resume Rust timer
  useEffect(() => {
    if (phase !== "running") return;
    if (onBreak) { invoke("pause_timer"); setRunning(false); }
    else { invoke("resume_timer"); setRunning(true); }
  }, [onBreak]);

  // Poll Rust timer every second for display
  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      const elapsed = await invoke("get_elapsed");
      setSeconds(Number(elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const startSession = async () => {
    if (!intent.trim()) return;
    await invoke("start_timer");
    const now = new Date();
    setStartedAt(now);
    setPhase("running"); setSeconds(0); setRunning(true);
    setReality(""); setDebriefNotes(""); setProgressNotes([]); setNoteInput(""); setErr(null);
  };

  const stopSession = async () => {
    await invoke("pause_timer");
    setRunning(false); setPhase("logging");
  };

  const addProgressNote = () => {
    if (!noteInput.trim()) return;
    const ts = new Date();
    setProgressNotes(arr => [...arr, { time: ts, text: noteInput.trim() }]);
    setNoteInput("");
  };

  const logSession = async () => {
    setSaving(true); setErr(null);
    try {
      const finalSec = await invoke("stop_timer");
      // Merge progress notes into debrief notes
      const progressBlock = progressNotes.length > 0
        ? progressNotes.map(n => `[${fmtTime(n.time)}] ${n.text}`).join("\n")
        : "";
      const fullNotes = [progressBlock, debriefNotes.trim()].filter(Boolean).join("\n\n");
      const startedAtStr = startedAt
        ? `${startedAt.getFullYear()}-${pad(startedAt.getMonth()+1)}-${pad(startedAt.getDate())} ${pad(startedAt.getHours())}:${pad(startedAt.getMinutes())}:${pad(startedAt.getSeconds())}`
        : null;
      const saved = await createSession({
        type: sessionType,
        project_id: sessionType === "Engineering" ? projectId : null,
        intent: intent.trim(), reality: reality.trim(),
        notes: fullNotes, duration_seconds: Number(finalSec),
        started_at: startedAtStr,
      });
      setSessions(arr => [saved, ...arr]);
      onSessionSaved && onSessionSaved(saved);
      setIntent(""); setReality(""); setDebriefNotes(""); setSeconds(0);
      setStartedAt(null); setProgressNotes([]); setNoteInput(""); setPhase("idle");
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const discardSession = async () => {
    await invoke("stop_timer");
    setSeconds(0); setRunning(false); setPhase("idle");
    setReality(""); setDebriefNotes(""); setStartedAt(null); setProgressNotes([]); setNoteInput("");
  };

  const handleToggle = async () => {
    if (running && !onBreak) { await invoke("pause_timer"); setRunning(false); }
    else if (!running && phase === "running") { await invoke("resume_timer"); setRunning(true); }
  };

  const handleEnd = async () => {
    if (phase === "running") { await invoke("pause_timer"); setRunning(false); setPhase("logging"); }
  };

  const selectedProject = projects.find(p => p.id === projectId);
  // Use local date key correctly — new Date() in toLocalDateKey via parseTs
  const todayKey    = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; })();
  const todaySessions = sessions.filter(s => toLocalDateKey(s.timestamp) === todayKey);
  const focusSec      = todaySessions.reduce((a, s) => a + s.duration_seconds, 0);
  const engSessions   = todaySessions.filter(s => s.type === "Engineering").length;
  const intentsSet    = todaySessions.filter(s => s.intent && s.intent !== "Quick Note").length;
  // Daily efficiency: total focused / total wall-clock span for sessions that have started_at
  const dailyEfficiency = (() => {
    const withSpan = todaySessions.filter(s => s.started_at && s.duration_seconds > 0);
    if (withSpan.length === 0) return null;
    const totalFocus = withSpan.reduce((a, s) => a + s.duration_seconds, 0);
    const totalSpan  = withSpan.reduce((a, s) => {
      const spanSec = (parseTs(s.timestamp).getTime() - parseLocalTs(s.started_at).getTime()) / 1000;
      return a + Math.max(spanSec, s.duration_seconds);
    }, 0);
    return totalSpan > 0 ? `${Math.round(Math.min(totalFocus / totalSpan, 1) * 100)}%` : null;
  })();

  const TYPE_META = {
    Routine:     { c: "var(--rose, #F5A9BB)", g: "RTN" },
    Engineering: { c: "var(--iris, #C4A7E7)", g: "ENG" },
  };

  return (
    <div className="flex-1 min-w-0 flex min-h-0">

      {/* ── LEFT: intent + tasks + session log ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0" style={{ fontFamily: "InconsolataGo, monospace" }}>

        {/* Intent section */}
        <section className="shrink-0" style={{ borderBottom: "1px solid var(--hl)" }}>
          {/* Row 1: label + mode toggles */}
          <div className="flex items-center px-6 pt-4 pb-2 gap-3">
            <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--iris, #C4A7E7)" }}>intent</span>
            <span className="text-[10px]" style={{ color: "var(--dim)" }}>— what are you about to get done</span>
            <div className="ml-auto flex gap-1.5">
              {["Routine","Engineering"].map(t => (
                <button key={t} onClick={() => { setSessionType(t); if (t === "Routine") setProjectId(null); }}
                  disabled={phase === "running" || phase === "logging"}
                  className="px-2 py-0.5 border text-[10px] disabled:opacity-50"
                  style={{
                    color: sessionType === t ? (t === "Engineering" ? "var(--iris, #C4A7E7)" : "var(--rose, #F5A9BB)") : "var(--dim)",
                    borderColor: sessionType === t ? (t === "Engineering" ? "var(--iris, #C4A7E7)" : "var(--rose, #F5A9BB)") : "var(--hl)",
                    background: sessionType === t ? `color-mix(in srgb, ${t === "Engineering" ? "var(--iris)" : "var(--rose)"} 8%, transparent)` : "transparent",
                  }}>
                  [{t}]
                </button>
              ))}
            </div>
          </div>
          {/* Row 2: project select */}
          <div className="px-6 pb-2">
            <div className="relative inline-block">
              <select value={projectId ?? ""} onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
                disabled={phase === "running" || phase === "logging"}
                className="appearance-none bg-transparent border px-3 py-1 text-[10.5px] outline-none pr-7 disabled:opacity-50"
                style={{ color: projectId ? "var(--iris, #C4A7E7)" : "var(--dim)", minWidth: 260, borderColor: "var(--hl)" }}>
                <option value="">— link to project (optional) —</option>
                {projects.map(p => <option key={p.id} value={p.id} style={{ color: "var(--text)", background: "var(--base)" }}>→ {p.name}</option>)}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] pointer-events-none" style={{ color: "var(--dim)" }}>⇅</span>
            </div>
          </div>
          {/* Row 3: intent input */}
          <div className="mx-6 mb-4 border" style={{ borderColor: "var(--hl)" }}>
            <div className="flex items-center px-4 pt-4 pb-3">
              <div className="pr-3 text-[20px] leading-none pt-0.5" style={{ color: "var(--rose, #F5A9BB)" }}>›</div>
              <input value={intent} onChange={e => setIntent(e.target.value)}
                onKeyDown={e => e.key === "Enter" && phase === "idle" && startSession()}
                placeholder="commit an intent…"
                disabled={phase === "running" || phase === "logging"}
                className="flex-1 bg-transparent outline-none text-[18px] min-w-0 disabled:opacity-60"
                style={{ color: "var(--text)" }}
                autoFocus />
              {phase === "idle" && (
                <button onClick={startSession} disabled={!intent.trim()}
                  className="ml-3 px-3 py-1.5 border text-[11px] disabled:opacity-40 whitespace-nowrap"
                  style={{ color: "var(--iris, #C4A7E7)", borderColor: "var(--iris, #C4A7E7)" }}>
                  commit ↵
                </button>
              )}
            </div>
            <div className="flex items-center px-4 py-2 border-t text-[10.5px] gap-2" style={{ borderColor: "var(--hl)" }}>
              <span style={{ color: "var(--dim)" }}>mode →</span>
              <span style={{ color: sessionType === "Routine" ? "var(--rose, #F5A9BB)" : "var(--iris, #C4A7E7)" }}>
                [{sessionType}]{selectedProject ? ` · ${selectedProject.name}` : ""}
              </span>
              <span className="ml-auto" style={{ color: "var(--dim)" }}>↵ to start</span>
            </div>
          </div>
        </section>

        {/* Running / logging controls */}
        {(phase === "running" || phase === "logging") && (
          <section className="shrink-0 px-6 py-3" style={{ borderBottom: "1px solid var(--hl)", background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-[10px] uppercase tracking-[0.12em]"
                  style={{ color: phase === "running" ? "var(--iris, #C4A7E7)" : "var(--rose, #F5A9BB)" }}>
                  {phase === "running" ? "● in progress" : "○ log reality"}
                </span>
                <div className="text-[14px] mt-0.5" style={{ color: "var(--text)" }}>{intent}</div>
              </div>
              <div className="tnum text-[24px] font-light" style={{ color: "var(--text)" }}>{fmtDur(seconds)}</div>
            </div>
            {phase === "running" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button onClick={handleToggle} className="px-3 py-1 border text-[11px]"
                    style={{ color: running ? "var(--accent, #BAADF4)" : "var(--iris, #C4A7E7)", borderColor: running ? "var(--accent, #BAADF4)" : "var(--iris, #C4A7E7)" }}>
                    [{running ? "pause" : "resume"}]
                  </button>
                  <button onClick={stopSession} className="px-3 py-1 border text-[11px]"
                    style={{ color: "var(--rose, #F5A9BB)", borderColor: "var(--rose, #F5A9BB)" }}>
                    [stop & log]
                  </button>
                </div>
                {/* Progress notes — log timestamped updates during the session */}
                <div className="pt-1">
                  <div className="text-[10px] uppercase tracking-[0.1em] mb-1.5" style={{ color: "var(--dim)" }}>progress notes</div>
                  {progressNotes.length > 0 && (
                    <div className="mb-1.5 space-y-0.5 max-h-[80px] overflow-y-auto">
                      {progressNotes.map((n, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]">
                          <span className="tnum shrink-0" style={{ color: "var(--iris)" }}>{fmtTime(n.time)}</span>
                          <span style={{ color: "var(--sub)" }}>{n.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <input value={noteInput} onChange={e => setNoteInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addProgressNote(); }}
                      placeholder="log a progress update… (↵ to add)"
                      className="flex-1 bg-transparent border px-2.5 py-1 text-[11.5px] outline-none"
                      style={{ color: "var(--text)", borderColor: "var(--hl)" }} />
                    <button onClick={addProgressNote} disabled={!noteInput.trim()}
                      className="px-2 py-1 border text-[10.5px] disabled:opacity-30"
                      style={{ color: "var(--iris)", borderColor: "var(--iris)" }}>+</button>
                  </div>
                </div>
              </div>
            )}
            {phase === "logging" && (
              <div className="space-y-2">
                <input value={reality} onChange={e => setReality(e.target.value)}
                  placeholder="reality — what actually happened…"
                  className="w-full bg-transparent border px-3 py-1.5 text-[12px] outline-none"
                  style={{ color: "var(--text)", borderColor: "var(--hl)" }} />
                <textarea value={debriefNotes} onChange={e => setDebriefNotes(e.target.value)}
                  placeholder="debrief notes, bug logs… (optional)"
                  rows={2} className="w-full bg-transparent border px-3 py-1.5 text-[11.5px] outline-none"
                  style={{ color: "var(--text)", borderColor: "var(--hl)", resize: "vertical" }} />
                {err && <div className="text-[11px]" style={{ color: "var(--rose, #F5A9BB)" }}>{err}</div>}
                <div className="flex gap-2">
                  <button onClick={logSession} disabled={saving} className="px-3 py-1 border text-[11px] disabled:opacity-50"
                    style={{ color: "var(--iris, #C4A7E7)", borderColor: "var(--iris, #C4A7E7)" }}>
                    {saving ? "saving…" : "[save]"}
                  </button>
                  <button onClick={discardSession} className="px-3 py-1 border text-[11px]"
                    style={{ color: "var(--dim)", borderColor: "var(--hl)" }}>
                    [discard]
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Task queue */}
        {tasks && tasks.filter(t => !t.done).length > 0 && (
          <section className="shrink-0" style={{ borderBottom: "1px solid var(--hl)", maxHeight: 200, overflowY: "auto" }}>
            <div className="flex items-center px-6 py-2">
              <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--iris, #C4A7E7)" }}>
                tasks · queue
              </span>
              <span className="ml-auto text-[10.5px]" style={{ color: "var(--dim)" }}>
                {tasks.filter(t => !t.done).length} open
              </span>
            </div>
            {tasks.filter(t => !t.done).map(task => {
              const proj = projects.find(p => p.id === task.project_id);
              return (
                <div key={task.id}
                  className="flex items-center border-t hover:bg-surface/50 group"
                  style={{ height: 32, borderColor: "var(--hl)" }}>
                  <button onClick={() => onTaskComplete(task.id)}
                    className="px-6 flex items-center gap-2.5 text-left h-full flex-1 min-w-0"
                    style={{ color: "var(--text)" }}>
                    <span className="shrink-0 w-3 h-3 border"
                      style={{ borderColor: "var(--dim)" }} />
                    {task.priority && <PriorityDot priority={task.priority} onChange={() => {}} />}
                    <span className="truncate text-[12px]">{task.text}</span>
                    {proj && <span className="shrink-0 text-[10px]" style={{ color: "var(--iris, #C4A7E7)" }}>@{proj.name}</span>}
                  </button>
                </div>
              );
            })}
          </section>
        )}

        {/* Session log */}
        <section className="flex-1 min-h-0 flex flex-col">
          {/* Header — matches TASKS · QUEUE format */}
          <div className="flex items-center px-6 py-2 shrink-0" style={{ borderBottom: "1px solid var(--hl)" }}>
            <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--iris, #C4A7E7)" }}>
              sessions · completed
            </span>
            <span className="ml-auto text-[10.5px]" style={{ color: "var(--dim)" }}>
              {todaySessions.length} today
            </span>
          </div>
          {/* Column headers */}
          <div className="grid text-[10px] uppercase tracking-[0.1em] shrink-0 py-2"
            style={{ color: "var(--dim)", borderBottom: "1px solid var(--hl)", gridTemplateColumns: "70px 50px 1fr 80px 16px" }}>
            <div className="px-6">time</div>
            <div className="px-2">type</div>
            <div className="px-2">intent</div>
            <div className="pr-2 text-right">dur</div>
            <div />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="px-6 py-6 text-[12px]" style={{ color: "var(--dim)" }}>
                no sessions yet · commit an intent to start
              </div>
            ) : sessions.map((s) => {
              const meta = TYPE_META[s.type] || { c: "var(--sub)", g: "NTE" };
              const proj = projects.find(p => p.id === s.project_id);
              const ts   = parseTs(s.timestamp);
              const hasDetail = s.reality || s.notes;
              return (
                <SessionLogRow key={s.id} s={s} meta={meta} proj={proj} ts={ts} hasDetail={hasDetail} />
              );
            })}
          </div>
        </section>
      </div>

      {/* ── RIGHT: timer + stats + break/note ── */}
      <aside className="w-[220px] shrink-0 flex flex-col" style={{ borderLeft: "1px solid var(--hl)", fontFamily: "InconsolataGo, monospace", background: "var(--surface)" }}>
        {/* Timer */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: "1px solid var(--hl)" }}>
          <div className="text-[10px] uppercase tracking-[0.14em] mb-3" style={{ color: "var(--sub)" }}>
            SESSION TIMER
          </div>
          {/* Big digits — matching reference */}
          <div className="flex items-baseline gap-0.5 tnum mb-4"
            style={{ fontFamily: "InconsolataGo, monospace", fontWeight: 300, lineHeight: 1 }}>
            <span style={{ fontSize: 36, color: "var(--text)" }}>{pad(Math.floor(seconds/3600))}</span>
            <span style={{ fontSize: 28, color: "var(--dim)", margin: "0 2px" }}>:</span>
            <span style={{ fontSize: 36, color: "var(--text)" }}>{pad(Math.floor((seconds%3600)/60))}</span>
            <span style={{ fontSize: 28, color: "var(--dim)", margin: "0 2px" }}>:</span>
            <span style={{ fontSize: 36, color: "var(--rose)" }}>{pad(seconds%60)}</span>
          </div>
          {/* Animated block progress bar */}
          <div className="flex gap-[2px] mb-1" style={{ height: 10 }}>
            {Array.from({ length: 30 }).map((_, i) => {
              const filled = Math.round(Math.min(seconds / (90*60), 1) * 30);
              const isFilled = i < filled;
              return (
                <div key={i}
                  className={isFilled && running && !onBreak ? "bar-running" : ""}
                  style={{
                    flex: 1,
                    background: isFilled
                      ? (onBreak ? "var(--rose)" : "var(--iris)")
                      : "var(--overlay)",
                    opacity: isFilled ? 1 : 0.4,
                  }} />
              );
            })}
          </div>
          <div className="text-[10px] tnum mt-1" style={{ color: "var(--sub)" }}>
            {Math.round(Math.min(seconds/(90*60),1)*100)}% · 90m target
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2" style={{ borderBottom: "1px solid var(--hl)" }}>
          <button onClick={handleToggle}
            className="py-3 text-[11px] text-center"
            style={{
              color: running && !onBreak ? "var(--sub)" : "var(--iris)",
              borderRight: "1px solid var(--hl)",
              background: "transparent",
            }}>
            [{running && !onBreak ? "pause" : "start"}]
          </button>
          <button onClick={handleEnd}
            className="py-3 text-[11px] text-center"
            style={{ color: "var(--dim)", background: "transparent" }}>
            [end]
          </button>
        </div>

        {/* Today stats — matching reference layout */}
        <div className="px-5 pt-4" style={{ borderBottom: "1px solid var(--hl)" }}>
          <div className="text-[10px] uppercase tracking-[0.14em] mb-3" style={{ color: "var(--sub)" }}>TODAY</div>
          {[
            { label: "FOCUS TIME",            value: fmtHours(focusSec),        color: "var(--iris)" },
            { label: "DAILY EFFICIENCY",      value: dailyEfficiency ?? "—",    color: dailyEfficiency ? "var(--rose)" : "var(--dim)" },
            { label: "DELIVERABLES COMPLETED",value: pad(engSessions),           color: "var(--text)" },
            { label: "INTENTS SET",           value: pad(intentsSet),            color: "var(--text)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex items-start justify-between py-3"
              style={{ borderBottom: "1px solid var(--hl)" }}>
              <span className="text-[10px] uppercase tracking-[0.1em] leading-tight pr-2"
                style={{ color: "var(--sub)", maxWidth: "60%" }}>
                {label}
              </span>
              <span className="tnum text-[18px] font-light shrink-0" style={{ color, lineHeight: 1 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Break + quick note at bottom */}
        <div className="mt-auto">
          <button onClick={toggleBreak}
            className="w-full px-5 py-3 text-left text-[11px]"
            style={{
              color: onBreak ? "var(--rose)" : "var(--sub)",
              borderBottom: "1px solid var(--hl)",
              background: onBreak ? "color-mix(in srgb, var(--rose) 8%, transparent)" : "transparent",
            }}>
            {onBreak ? "▶ [resume]" : "⏸ [break]"}
          </button>
          <button onClick={onQuickNote}
            className="w-full px-5 py-3 text-left text-[11px]"
            style={{ color: "var(--dim)", background: "transparent", borderBottom: "1px solid var(--hl)" }}>
            ✎ [quick note]
          </button>
        </div>
      </aside>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE 2 · PROJECTS
// ═══════════════════════════════════════════════════════════════════════════════

const PRI_COLOR = { hi: "var(--rose, #F5A9BB)", med: "var(--iris, #C4A7E7)", low: "#7E8294" };

function ProjectsPane({ projects, setProjects }) {
  const [open, setOpen]         = useState({});
  const [forming, setForming]   = useState(false);
  const [name, setName]         = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [longDesc, setLongDesc] = useState("");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState(null);
  const [editId, setEditId]     = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const submit = async () => {
    if (!name.trim()) { setErr("name required"); return; }
    setSaving(true); setErr(null);
    try {
      if (editId) {
        const updated = await updateProject({ id: editId, name: name.trim(), short_description: shortDesc.trim(), long_description: longDesc.trim() });
        setProjects(arr => arr.map(p => p.id === editId ? updated : p));
      } else {
        const p = await createProject({ name: name.trim(), short_description: shortDesc.trim(), long_description: longDesc.trim() });
        setProjects(arr => [p, ...arr]);
      }
      setForming(false); setEditId(null); setName(""); setShortDesc(""); setLongDesc("");
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const startEdit = (p) => {
    setEditId(p.id); setName(p.name); setShortDesc(p.short_description); setLongDesc(p.long_description);
    setForming(true); setErr(null);
  };

  const handleDelete = async (id) => {
    try {
      await deleteProject(id);
      setProjects(arr => arr.filter(p => p.id !== id));
      setConfirmDel(null);
    } catch (e) { console.error(e); }
  };

  return (
    <section className="flex-1 min-h-0 flex flex-col" style={{ fontFamily: "InconsolataGo, monospace" }}>
      <div className="px-8 pt-5 pb-3 flex items-center border-b border-hl shrink-0">
        <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--dim)" }}>projects</span>
        <button onClick={() => { setForming(f => !f); setEditId(null); setName(""); setShortDesc(""); setLongDesc(""); }}
          className="ml-auto px-3 py-1 border text-[11px]"
          style={{ color: "var(--iris, #C4A7E7)", borderColor: "var(--iris, #C4A7E7)" }}>
          + new project
        </button>
      </div>

      {forming && (
        <div className="px-8 py-4 border-b border-hl bg-surface/30 shrink-0 space-y-2">
          <div className="text-[11px] uppercase tracking-[0.08em] mb-2" style={{ color: "var(--dim)" }}>
            {editId ? "edit project" : "new project"}
          </div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="project name"
            className="w-full bg-base border border-hl px-3 py-1.5 text-[13px] outline-none"
            style={{ color: "var(--text)" }} />
          <input value={shortDesc} onChange={e => setShortDesc(e.target.value)} placeholder="short description"
            className="w-full bg-base border border-hl px-3 py-1.5 text-[12px] outline-none"
            style={{ color: "var(--text)" }} />
          <textarea value={longDesc} onChange={e => setLongDesc(e.target.value)} placeholder="long description — goals, architecture, context"
            rows={3} className="w-full bg-base border border-hl px-3 py-1.5 text-[12px] outline-none"
            style={{ color: "var(--text)", resize: "vertical" }} />
          {err && <div className="text-[11px]" style={{ color: "var(--rose, #F5A9BB)" }}>{err}</div>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving || !name.trim()}
              className="px-3 py-1.5 border text-[12px] disabled:opacity-40"
              style={{ color: "var(--iris, #C4A7E7)", borderColor: "var(--iris, #C4A7E7)" }}>
              {saving ? "saving…" : (editId ? "[save changes]" : "[create project]")}
            </button>
            <button onClick={() => { setForming(false); setEditId(null); setErr(null); }}
              className="px-3 py-1.5 border border-hl text-[12px]"
              style={{ color: "var(--sub)" }}>[cancel]</button>
          </div>
        </div>
      )}

      {/* Table header */}
      <div className="grid grid-cols-[1fr_80px] text-[11px] uppercase tracking-[0.08em] border-b border-hl shrink-0"
        style={{ color: "var(--dim)" }}>
        <div className="px-8 py-2">project</div>
        <div className="px-4 py-2 text-right">created</div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {projects.length === 0 ? (
          <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)" }}>no projects yet</div>
        ) : projects.map((p) => {
          const isOpen = !!open[p.id];
          const createdAt = new Date(p.created_at);
          const dateStr = isNaN(createdAt) ? "—" : `${pad(createdAt.getMonth()+1)}-${pad(createdAt.getDate())}`;
          return (
            <div key={p.id} className="border-b" style={{ borderColor: "var(--hl)" }}>
              <div className="grid grid-cols-[1fr_80px] text-[13px] hover:bg-surface/40 group"
                style={{ height: 38, alignItems: "center" }}>
                <button onClick={() => setOpen(o => ({ ...o, [p.id]: !o[p.id] }))}
                  className="px-8 flex items-center gap-2 text-left h-full"
                  style={{ color: "var(--text)" }}>
                  <span style={{ color: "var(--dim)", fontSize: 10 }}>{isOpen ? "▾" : "▸"}</span>
                  {p.name}
                  {p.short_description && (
                    <span className="text-[11px] truncate" style={{ color: "var(--sub)" }}>· {p.short_description}</span>
                  )}
                </button>
                <div className="px-4 flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100">
                  <button onClick={() => startEdit(p)} className="text-[10.5px] px-1.5 py-0.5 border border-hl hover:text-text" style={{ color: "var(--sub)" }}>edit</button>
                  <button onClick={() => setConfirmDel(p.id)}
                    className="text-[10.5px] px-1.5 py-0.5 border"
                    style={{ color: "var(--rose, #F5A9BB)", borderColor: "#F5A9BB66" }}>del</button>
                </div>
              </div>
              {isOpen && p.long_description && (
                <div className="px-8 py-3 bg-surface/20 border-t text-[12px]" style={{ borderColor: "var(--hl)", color: "var(--sub)" }}>
                  <pre className="whitespace-pre-wrap" style={{ fontFamily: "InconsolataGo, monospace" }}>{p.long_description}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setConfirmDel(null)}>
          <div onClick={e => e.stopPropagation()} className="border border-hl bg-surface p-6 w-[380px]">
            <div className="text-[11px] uppercase tracking-[0.08em] mb-3" style={{ color: "var(--dim)" }}>confirm delete</div>
            <div className="text-[13px] mb-4" style={{ color: "var(--text)" }}>
              delete <span style={{ color: "var(--rose, #F5A9BB)" }}>{projects.find(p=>p.id===confirmDel)?.name}</span>?
              <div className="text-[11px] mt-1" style={{ color: "var(--sub)" }}>linked sessions and tasks will be unlinked, not deleted.</div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)} className="px-3 py-1.5 border border-hl text-[12px]" style={{ color: "var(--sub)" }}>cancel</button>
              <button onClick={() => handleDelete(confirmDel)}
                className="px-3 py-1.5 border text-[12px]"
                style={{ color: "var(--rose, #F5A9BB)", borderColor: "var(--rose, #F5A9BB)" }}>confirm delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE 3 · TASKS (two-column: todo | done)
// ═══════════════════════════════════════════════════════════════════════════════

// Mouse-event drag — HTML drag API is unreliable in Tauri's WebKit.
// We track which item is being dragged and which slot it's hovering over
// purely via onMouseEnter on the target rows.
function DraggableTaskRow({ task, idx, proj, isDragging, isOver, dragIdx, onMouseDown, onMouseEnter, onComplete, onEdit, onDelete, onPriority }) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      className="grid border-b border-hl/30 group"
      style={{
        gridTemplateColumns: "20px 1fr 36px 80px 60px",
        height: 36, alignItems: "center",
        opacity: isDragging ? 0.35 : 1,
        outline: isOver && dragIdx !== null && dragIdx !== idx ? "2px solid var(--iris)" : undefined,
        outlineOffset: "-1px",
        background: isDragging ? "color-mix(in srgb, var(--surface) 80%, transparent)" : undefined,
        transition: "opacity 0.1s",
      }}>
      {/* Drag handle */}
      <div
        className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--dim)", fontSize: 12, cursor: "grab", userSelect: "none" }}
        onMouseDown={onMouseDown}>
        ⠿
      </div>
      <button onClick={onComplete}
        className="flex items-center gap-2.5 text-left h-full text-[13px] min-w-0 pl-1"
        style={{ color: "var(--text)" }}>
        <span className="shrink-0 border border-hl w-3.5 h-3.5" style={{ color: "var(--dim)" }} />
        <span className="truncate">{task.text}</span>
      </button>
      <div className="flex items-center justify-center">
        <PriorityDot priority={task.priority} onChange={onPriority} />
      </div>
      <div className="px-2 text-[10.5px] truncate" style={{ color: "var(--iris, #C4A7E7)" }}>
        {proj ? `@${proj.name}` : ""}
      </div>
      <div className="px-2 flex gap-1 opacity-0 group-hover:opacity-100">
        <button onClick={onEdit} className="text-[10px] px-1 border border-hl" style={{ color: "var(--sub)" }}>e</button>
        <button onClick={onDelete} className="text-[10px] px-1 border" style={{ color: "var(--rose, #F5A9BB)", borderColor: "#F5A9BB66" }}>x</button>
      </div>
    </div>
  );
}

function TasksPane({ tasks, setTasks, projects }) {
  const [newText, setNewText]       = useState("");
  const [newProjectId, setNewProjectId] = useState(null);
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editText, setEditText]     = useState("");
  const [editProj, setEditProj]     = useState(null);
  const inputRef                    = useRef(null);

  const pending   = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);

  const addTask = async () => {
    if (!newText.trim()) return;
    setSaving(true);
    try {
      const t = await createTask({ text: newText.trim(), project_id: newProjectId });
      setTasks(arr => [t, ...arr]);
      setNewText(""); setNewProjectId(null);
      inputRef.current?.focus();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleComplete = async (id) => {
    const updated = await completeTask(id);
    setTasks(arr => arr.map(t => t.id === id ? updated : t));
  };

  const handleUncomplete = async (id) => {
    const updated = await uncompleteTask(id);
    setTasks(arr => arr.map(t => t.id === id ? updated : t));
  };

  const handleDeleted = (id) => setTasks(arr => arr.filter(t => t.id !== id));

  const startEdit = (task) => {
    setEditTarget(task); setEditText(task.text); setEditProj(task.project_id);
  };

  const saveEdit = async () => {
    if (!editText.trim() || !editTarget) return;
    const updated = await updateTask(editTarget.id, { text: editText.trim(), project_id: editProj });
    setTasks(arr => arr.map(t => t.id === updated.id ? updated : t));
    setEditTarget(null);
  };

  const [dragIdx, setDragIdx]   = useState(null);
  const [overIdx, setOverIdx]   = useState(null);
  const draggingRef             = useRef(false);
  const dragIdxRef              = useRef(null);
  const overIdxRef              = useRef(null);

  // Keep refs in sync with state so mouseup closure always sees current values
  const setDragIdxBoth = (v) => { dragIdxRef.current = v; setDragIdx(v); };
  const setOverIdxBoth = (v) => { overIdxRef.current = v; setOverIdx(v); };

  const startDrag = (idx) => {
    draggingRef.current = true;
    setDragIdxBoth(idx);

    const onMouseUp = async () => {
      const from = dragIdxRef.current;
      const to   = overIdxRef.current;
      if (draggingRef.current && from !== null && to !== null && from !== to) {
        await handleReorder(from, to);
      }
      draggingRef.current = false;
      setDragIdxBoth(null);
      setOverIdxBoth(null);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleReorder = async (fromIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const newPending = [...pending];
    const [moved] = newPending.splice(fromIdx, 1);
    newPending.splice(toIdx, 0, moved);
    const completed = tasks.filter(t => t.done);
    setTasks([...newPending, ...completed]);
    await reorderTasks(newPending.map(t => t.id));
  };

  const handlePriority = async (id, priority) => {
    const updated = await setTaskPriority(id, priority);
    setTasks(arr => arr.map(t => t.id === id ? updated : t));
  };

  return (
    <section className="flex-1 min-h-0 flex flex-col" style={{ fontFamily: "InconsolataGo, monospace" }}>
      {/* Add task bar */}
      <div className="px-8 py-3 border-b border-hl flex items-center gap-3 shrink-0">
        <span className="text-[11px] uppercase tracking-[0.08em] shrink-0" style={{ color: "var(--dim)" }}>add task</span>
        <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") addTask(); }}
          placeholder="> what needs to get done?"
          className="flex-1 bg-transparent outline-none text-[13px]"
          style={{ color: "var(--text)" }} />
        <select value={newProjectId ?? ""} onChange={e => setNewProjectId(e.target.value ? Number(e.target.value) : null)}
          className="appearance-none bg-base border border-hl px-2 py-1 text-[11px] outline-none"
          style={{ color: newProjectId ? "var(--iris, #C4A7E7)" : "var(--dim)" }}>
          <option value="">no project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={addTask} disabled={saving || !newText.trim()}
          className="px-3 py-1 border text-[11px] disabled:opacity-40"
          style={{ color: "var(--iris, #C4A7E7)", borderColor: "var(--iris, #C4A7E7)" }}>
          {saving ? "…" : "[add]"}
        </button>
      </div>

      {/* Two-column board */}
      <div className="flex-1 min-h-0 flex divide-x" style={{ borderColor: "var(--hl)" }}>
        {/* ── Pending column ── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid text-[11px] uppercase tracking-[0.08em] border-b border-hl shrink-0"
            style={{ color: "var(--dim)", gridTemplateColumns: "20px 1fr 36px 80px 60px" }}>
            <div className="py-2" />
            <div className="py-2 flex items-center gap-2">
              todo
              <span className="px-1.5 py-[1px] border text-[10px]" style={{ color: "var(--accent, #BAADF4)", borderColor: "var(--accent, #BAADF4)33" }}>
                {pending.length}
              </span>
            </div>
            <div className="px-1 py-2 text-center">pri</div>
            <div className="px-2 py-2">project</div>
            <div className="px-2 py-2">‥</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {pending.length === 0 ? (
              <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)" }}>no pending tasks</div>
            ) : pending.map((task, idx) => {
              const proj = projects.find(p => p.id === task.project_id);
              const isEditing = editTarget?.id === task.id;
              const isDragging = dragIdx === idx;
              const isOver = overIdx === idx;

              if (isEditing) return (
                <div key={task.id} className="border-b border-hl/30 px-8 py-2 space-y-1.5 bg-surface/30">
                  <input value={editText} onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditTarget(null); }}
                    autoFocus className="w-full bg-base border border-hl px-2 py-1 text-[13px] outline-none"
                    style={{ color: "var(--text)" }} />
                  <div className="flex items-center gap-2">
                    <select value={editProj ?? ""} onChange={e => setEditProj(e.target.value ? Number(e.target.value) : null)}
                      className="bg-base border border-hl px-2 py-0.5 text-[11px] outline-none"
                      style={{ color: editProj ? "var(--iris, #C4A7E7)" : "var(--dim)" }}>
                      <option value="">no project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={saveEdit} className="px-2 py-0.5 border text-[11px]" style={{ color: "var(--iris, #C4A7E7)", borderColor: "var(--iris, #C4A7E7)" }}>✓</button>
                    <button onClick={() => setEditTarget(null)} className="px-2 py-0.5 border border-hl text-[11px]" style={{ color: "var(--dim)" }}>✕</button>
                  </div>
                </div>
              );

              return (
                <DraggableTaskRow
                  key={task.id}
                  task={task} idx={idx} proj={proj}
                  isDragging={isDragging} isOver={isOver} dragIdx={dragIdx}
                  onMouseDown={() => startDrag(idx)}
                  onMouseEnter={() => { if (draggingRef.current) setOverIdxBoth(idx); }}
                  onComplete={() => handleComplete(task.id)}
                  onEdit={() => startEdit(task)}
                  onDelete={() => setDeleteTarget(task)}
                  onPriority={p => handlePriority(task.id, p)}
                />
              );
            })}
          </div>
        </div>

        {/* ── Completed column ── */}
        <div className="flex-1 flex flex-col min-h-0">
          <div className="grid grid-cols-[1fr_100px] text-[11px] uppercase tracking-[0.08em] border-b border-hl shrink-0"
            style={{ color: "var(--dim)" }}>
            <div className="px-8 py-2 flex items-center gap-2">
              done
              <span className="px-1.5 py-[1px] border text-[10px]" style={{ color: "var(--iris, #C4A7E7)", borderColor: "#C4A7E733" }}>
                {completed.length}
              </span>
            </div>
            <div className="px-2 py-2">completed</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {completed.length === 0 ? (
              <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)" }}>nothing done yet</div>
            ) : completed.map(task => {
              const proj = projects.find(p => p.id === task.project_id);
              const doneAt = task.done_at ? new Date(task.done_at) : null;
              return (
                <div key={task.id}
                  className="grid grid-cols-[1fr_100px] border-b border-hl/30 hover:bg-surface/40 group"
                  style={{ height: 36, alignItems: "center" }}>
                  <button onClick={() => handleUncomplete(task.id)}
                    className="px-8 flex items-center gap-2.5 text-left h-full text-[13px] min-w-0"
                    style={{ color: "var(--dim)" }}>
                    <span className="shrink-0 text-[11px] border w-3.5 h-3.5 flex items-center justify-center"
                      style={{ borderColor: "var(--iris, #C4A7E7)", color: "var(--iris, #C4A7E7)", fontSize: 9 }}>✓</span>
                    <PriorityDot priority={task.priority} onChange={() => {}} done />
                    <span className="truncate line-through">{task.text}</span>
                    {proj && <span className="text-[10.5px] shrink-0" style={{ color: "var(--iris, #C4A7E7)" }}>@{proj.name}</span>}
                  </button>
                  <div className="px-2 text-[10.5px] tnum flex items-center justify-between" style={{ color: "var(--dim)" }}>
                    {doneAt ? `${pad(doneAt.getMonth()+1)}-${pad(doneAt.getDate())}` : "—"}
                    <button onClick={() => setDeleteTarget(task)}
                      className="opacity-0 group-hover:opacity-100 px-1 border text-[10px]"
                      style={{ color: "var(--rose, #F5A9BB)", borderColor: "#F5A9BB66" }}>x</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {deleteTarget && (
        <DeleteTaskModal task={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleDeleted} />
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE 4 · INTERVIEW DECK
// ═══════════════════════════════════════════════════════════════════════════════

function InterviewPane({ projects }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [open, setOpen]         = useState({});

  useEffect(() => {
    getSessions().then(s => { setSessions(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    await deleteSession(id);
    setSessions(arr => arr.filter(s => s.id !== id));
  };

  const grouped = useMemo(() => {
    const byProject = {};
    for (const s of sessions) {
      if (!s.project_id) continue;
      if (!byProject[s.project_id]) byProject[s.project_id] = [];
      byProject[s.project_id].push(s);
    }
    return projects.filter(p => byProject[p.id]).map(p => ({
      project: p,
      sessions: byProject[p.id],
      totalSec: byProject[p.id].reduce((a,s)=>a+s.duration_seconds,0),
    }));
  }, [projects, sessions]);

  if (loading) return <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)", fontFamily: "InconsolataGo, monospace" }}>loading…</div>;

  return (
    <section className="flex-1 min-h-0 flex flex-col" style={{ fontFamily: "InconsolataGo, monospace" }}>
      <div className="px-8 py-3 border-b border-hl flex items-center shrink-0">
        <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--dim)" }}>interview deck · engineering sessions by project</span>
        <span className="ml-auto text-[11px]" style={{ color: "var(--sub)" }}>{grouped.length} projects</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {grouped.length === 0 ? (
          <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)" }}>no engineering sessions yet</div>
        ) : grouped.map(({ project, sessions, totalSec }) => {
          const isOpen = open[project.id] !== false; // default open
          return (
            <div key={project.id} className="border-b" style={{ borderColor: "var(--hl)" }}>
              <button onClick={() => setOpen(o => ({ ...o, [project.id]: !isOpen }))}
                className="w-full flex items-center gap-3 px-8 py-3 hover:bg-surface/40 text-left"
                style={{ height: 38 }}>
                <span style={{ color: "var(--dim)", fontSize: 10 }}>{isOpen ? "▾" : "▸"}</span>
                <span className="text-[13px]" style={{ color: "var(--text)" }}>{project.name}</span>
                <span className="text-[11px] px-1.5 py-[1px] border ml-1"
                  style={{ color: "var(--iris, #C4A7E7)", borderColor: "#C4A7E733" }}>
                  {sessions.length} sessions
                </span>
                <span className="ml-auto tnum text-[12px]" style={{ color: "var(--sub)" }}>{fmtHours(totalSec)}</span>
              </button>
              {isOpen && (
                <div className="bg-surface/20 border-t" style={{ borderColor: "var(--hl)" }}>
                  {project.long_description && (
                    <div className="px-8 py-3 border-b text-[12px]" style={{ borderColor: "var(--hl)", color: "var(--sub)" }}>
                      <pre className="whitespace-pre-wrap">{project.long_description}</pre>
                    </div>
                  )}
                  <div className="grid grid-cols-[80px_1fr_90px_50px] text-[11px] uppercase tracking-[0.08em] border-b"
                    style={{ color: "var(--dim)", borderColor: "var(--hl)" }}>
                    <div className="px-8 py-1.5">time</div>
                    <div className="px-2 py-1.5">intent</div>
                    <div className="px-2 py-1.5 text-right">duration</div>
                    <div className="px-2 py-1.5" />
                  </div>
                  {sessions.map(s => (
                    <div key={s.id} className="grid grid-cols-[80px_1fr_90px_50px] border-b border-hl/20 hover:bg-surface/40 group"
                      style={{ minHeight: 32, alignItems: "center" }}>
                      <div className="px-8 text-[11px] tnum" style={{ color: "var(--sub)" }}>{fmtTime(parseTs(s.timestamp))}</div>
                      <div className="px-2 text-[12.5px] truncate" style={{ color: "var(--text)" }}>
                        {s.intent}
                        {s.reality && <span className="ml-2 text-[11px]" style={{ color: "var(--sub)" }}>↳ {s.reality}</span>}
                      </div>
                      <div className="px-2 text-right tnum text-[12px]" style={{ color: "var(--sub)" }}>{fmtDur(s.duration_seconds)}</div>
                      <div className="px-2 opacity-0 group-hover:opacity-100">
                        <button onClick={() => handleDelete(s.id)}
                          className="text-[10px] px-1 border"
                          style={{ color: "var(--rose, #F5A9BB)", borderColor: "#F5A9BB66" }}>x</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE 5 · HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

function HistoryPane() {
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [weekOffset, setWeekOffset]   = useState(0);
  const [hoverIdx, setHoverIdx]       = useState(null);

  useEffect(() => {
    getSessions().then(s => { setAllSessions(s); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const days = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i - weekOffset * 7);
      result.push(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
    }
    return result;
  }, [weekOffset]);

  const dayData = useMemo(() => days.map(dateKey => {
    const day = allSessions.filter(s => toLocalDateKey(s.timestamp) === dateKey);
    const routine     = day.filter(s => s.type === "Routine").reduce((a,s) => a+s.duration_seconds, 0);
    const engineering = day.filter(s => s.type === "Engineering").reduce((a,s) => a+s.duration_seconds, 0);
    return { dateKey, routine, engineering, sessions: day };
  }), [days, allSessions]);

  const weekTotal = dayData.reduce((a,d)=>a+d.routine+d.engineering, 0);
  const weekRtn   = dayData.reduce((a,d)=>a+d.routine, 0);
  const weekEng   = dayData.reduce((a,d)=>a+d.engineering, 0);
  const weekSes   = dayData.reduce((a,d)=>a+d.sessions.length, 0);
  // Weekly average efficiency across all sessions that have started_at
  const weekEfficiency = (() => {
    const withSpan = dayData.flatMap(d => d.sessions).filter(s => s.started_at && s.duration_seconds > 0);
    if (withSpan.length === 0) return null;
    const totalFocus = withSpan.reduce((a, s) => a + s.duration_seconds, 0);
    const totalSpan  = withSpan.reduce((a, s) => {
      const span = (parseTs(s.timestamp).getTime() - parseLocalTs(s.started_at).getTime()) / 1000;
      return a + Math.max(span, s.duration_seconds);
    }, 0);
    return totalSpan > 0 ? `${Math.round(Math.min(totalFocus / totalSpan, 1) * 100)}%` : null;
  })();
  const maxSec    = Math.max(...dayData.map(d=>d.routine+d.engineering), 3600);
  const maxH      = 140;
  const todayKey  = toLocalDateKey(new Date().toISOString());

  const weekLabel = weekOffset === 0 ? "this week" : weekOffset === 1 ? "last week"
    : `${days[0].slice(5)} – ${days[6].slice(5)}`;

  if (loading) return <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)", fontFamily: "InconsolataGo, monospace" }}>loading…</div>;

  const hovered = hoverIdx !== null ? dayData[hoverIdx] : null;

  return (
    <section className="flex-1 min-h-0 flex flex-col" style={{ fontFamily: "InconsolataGo, monospace" }}>
      {/* Header */}
      <div className="border-b border-hl shrink-0">
        <div className="px-8 pt-5 pb-3 flex items-baseline">
          <span className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "var(--dim)" }}>
            history · focus time / day
          </span>
          <span className="ml-auto text-[11px] tnum" style={{ color: "var(--dim)" }}>
            avg {fmtHours(Math.round(weekTotal/7))} · {weekLabel}
          </span>
        </div>

        {/* Bar chart */}
        <div className="px-8 pb-6 flex items-end gap-5" style={{ height: maxH + 80 }}>
          {dayData.map((d, i) => {
            const totalSec = d.routine + d.engineering;
            const totalH   = Math.round((totalSec / maxSec) * maxH);
            const engH     = Math.round((d.engineering / maxSec) * maxH);
            const rtnH     = totalH - engH;
            const hh       = Math.floor(totalSec / 3600);
            const mm       = Math.floor((totalSec % 3600) / 60);
            const isHov    = hoverIdx === i;
            const isToday  = d.dateKey === todayKey;
            return (
              <div key={d.dateKey}
                className="flex-1 flex flex-col items-center justify-end gap-2 cursor-default"
                style={{ height: "100%" }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}>
                {/* Time label above bar */}
                <div className="text-[11px] tnum" style={{ color: isHov ? "var(--text)" : "var(--sub)" }}>
                  {totalSec > 0 ? `${hh}:${pad(mm)}` : "—"}
                </div>
                {/* Stacked bar */}
                <div className="w-full flex flex-col justify-end" style={{ height: maxH }}>
                  {/* Routine segment */}
                  {rtnH > 0 && (
                    <div style={{ height: rtnH, background: isHov ? "var(--rose, #F5A9BB)" : "color-mix(in srgb, var(--rose, #F5A9BB) 33%, transparent)", minHeight: 2, transition: "background 0.15s" }} />
                  )}
                  {/* Engineering segment */}
                  {engH > 0 && (
                    <div style={{ height: engH, background: isHov ? "var(--iris, #C4A7E7)" : "color-mix(in srgb, var(--iris, #C4A7E7) 33%, transparent)", minHeight: 2, transition: "background 0.15s" }} />
                  )}
                  {totalSec === 0 && (
                    <div style={{ height: 2, background: "var(--hl)" }} />
                  )}
                </div>
                {/* Day label */}
                <div className="flex flex-col items-center">
                  <div className="text-[11px] uppercase tracking-[0.08em]"
                    style={{ color: isToday ? "var(--rose, #F5A9BB)" : isHov ? "var(--text)" : "var(--sub)" }}>
                    {d.dateKey.slice(5, 7) === new Date().toISOString().slice(5,7) ? d.dateKey.slice(8) : d.dateKey.slice(5)}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--dim)" }}>
                    {fmtShortDay(d.dateKey).split(" ")[0]}
                  </div>
                </div>

                {/* Hover tooltip */}
                {isHov && totalSec > 0 && (
                  <div className="absolute z-20 bg-overlay border border-hl px-3 py-2 text-[11px] whitespace-nowrap pointer-events-none"
                    style={{ bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)" }}>
                    <div className="tnum mb-1" style={{ color: "var(--dim)" }}>{d.dateKey}</div>
                    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                      <span style={{ color: "var(--dim)" }}>routine</span>
                      <span className="tnum text-right" style={{ color: "var(--rose, #F5A9BB)" }}>{fmtHours(d.routine)}</span>
                      <span style={{ color: "var(--dim)" }}>engineering</span>
                      <span className="tnum text-right" style={{ color: "var(--iris, #C4A7E7)" }}>{fmtHours(d.engineering)}</span>
                      <span style={{ color: "var(--dim)" }}>sessions</span>
                      <span className="tnum text-right" style={{ color: "var(--text)" }}>{d.sessions.length}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary row + week nav */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] border-t border-hl text-[12px]">
          <div className="px-8 py-2.5 border-r border-hl">
            <span style={{ color: "var(--dim)" }}>total </span>
            <span className="tnum" style={{ color: "var(--text)" }}>{fmtHours(weekTotal)}</span>
          </div>
          <div className="px-4 py-2.5 border-r border-hl">
            <span style={{ color: "var(--dim)" }}>routine </span>
            <span className="tnum" style={{ color: "var(--rose, #F5A9BB)" }}>{fmtHours(weekRtn)}</span>
          </div>
          <div className="px-4 py-2.5 border-r border-hl">
            <span style={{ color: "var(--dim)" }}>eng </span>
            <span className="tnum" style={{ color: "var(--iris, #C4A7E7)" }}>{fmtHours(weekEng)}</span>
          </div>
          <div className="px-4 py-2.5 border-r border-hl">
            <span style={{ color: "var(--dim)" }}>sessions </span>
            <span className="tnum" style={{ color: "var(--text)" }}>{weekSes}</span>
          </div>
          <div className="px-4 py-2.5 border-r border-hl">
            <span style={{ color: "var(--dim)" }}>eff </span>
            <span className="tnum" style={{ color: weekEfficiency ? "var(--rose)" : "var(--dim)" }}>
              {weekEfficiency ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-0 text-[11px]">
            <button onClick={() => setWeekOffset(w => w+1)}
              className="px-4 py-2.5 border-r border-hl hover:bg-surface"
              style={{ color: "var(--sub)" }}>← older</button>
            <button onClick={() => setWeekOffset(w => Math.max(0,w-1))} disabled={weekOffset === 0}
              className="px-4 py-2.5 hover:bg-surface disabled:opacity-30"
              style={{ color: "var(--sub)" }}>newer →</button>
          </div>
        </div>
      </div>

      {/* Session log for the window */}
      <div className="grid text-[11px] uppercase tracking-[0.08em] border-b border-hl shrink-0"
        style={{ color: "var(--dim)", gridTemplateColumns: "140px 55px 1fr 55px 70px 20px" }}>
        <div className="px-8 py-2">start → end</div>
        <div className="px-2 py-2">type</div>
        <div className="px-2 py-2">intent</div>
        <div className="px-2 py-2 text-right">dur</div>
        <div className="px-2 py-2 text-right">eff</div>
        <div className="py-2" />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {weekSes === 0 ? (
          <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)" }}>no sessions in this window</div>
        ) : [...dayData].reverse().map(({ dateKey, sessions }) => sessions.length === 0 ? null : (
          <div key={dateKey}>
            <div className="px-8 py-1.5 flex items-center justify-between border-b border-hl/30"
              style={{ background: "var(--surface)" }}>
              <span className="text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "var(--sub)" }}>{fmtShortDay(dateKey)}</span>
              <span className="text-[10.5px] tnum" style={{ color: "var(--dim)" }}>
                {fmtHours(sessions.reduce((a,s)=>a+s.duration_seconds,0))}
              </span>
            </div>
            {sessions.map(s => <HistorySessionRow key={s.id} s={s} />)}
          </div>
        ))}
      </div>
    </section>
  );
}

function HistorySessionRow({ s }) {
  const [open, setOpen] = useState(false);
  const hasDetail = s.reality || s.notes;
  const endTime   = parseTs(s.timestamp);
  const startTime = s.started_at
    ? parseLocalTs(s.started_at)
    : new Date(endTime.getTime() - s.duration_seconds * 1000);
  const timeStr  = `${fmtTime(startTime)} → ${fmtTime(endTime)}`;
  const efficiency = calcEfficiency(s);
  // Color-code efficiency: ≥85% green-ish, 60-84% iris, <60% rose
  const effColor = !efficiency ? "var(--dim)"
    : parseInt(efficiency) >= 85 ? "var(--iris)"
    : parseInt(efficiency) >= 60 ? "var(--accent)"
    : "var(--rose)";

  return (
    <div className="border-b" style={{ borderColor: "var(--hl)" }}>
      <div
        className="grid text-[12px] hover:bg-surface/40 cursor-pointer"
        style={{ gridTemplateColumns: "140px 55px 1fr 55px 70px 20px", height: 34, alignItems: "center" }}
        onClick={() => hasDetail && setOpen(o => !o)}>
        <div className="px-8 tnum text-[11px]" style={{ color: "var(--sub)" }}>{timeStr}</div>
        <div className="px-2 text-[11px]" style={{ color: s.type === "Engineering" ? "var(--iris, #C4A7E7)" : "var(--rose, #F5A9BB)" }}>
          {s.type === "Engineering" ? "ENG" : "RTN"}
        </div>
        <div className="px-2 truncate" style={{ color: "var(--text)" }}>{s.intent}</div>
        <div className="px-2 text-right tnum text-[11px]" style={{ color: "var(--sub)" }}>{fmtDur(s.duration_seconds)}</div>
        <div className="px-2 text-right tnum text-[11px] font-light" style={{ color: effColor }}>
          {efficiency ?? "—"}
        </div>
        <div className="text-[10px]" style={{ color: "var(--dim)" }}>
          {hasDetail ? (open ? "▾" : "▸") : ""}
        </div>
      </div>
      {/* Expanded detail */}
      {open && hasDetail && (
        <div className="px-8 pb-3 pt-1 space-y-1.5" style={{ background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}>
          {s.reality && (
            <div>
              <span className="text-[10px] uppercase tracking-[0.1em] mr-2" style={{ color: "var(--iris, #C4A7E7)" }}>reality</span>
              <span className="text-[12px]" style={{ color: "var(--sub)" }}>{s.reality}</span>
            </div>
          )}
          {s.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.1em] mb-1" style={{ color: "var(--iris, #C4A7E7)" }}>notes</div>
              <pre className="text-[11.5px] whitespace-pre-wrap leading-relaxed" style={{ color: "var(--sub)", fontFamily: "InconsolataGo, monospace" }}>
                {s.notes}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANE 6 · LESSONS LEARNED
// ═══════════════════════════════════════════════════════════════════════════════

const LESSON_CATEGORIES = ["Hardware","Firmware","GNC","Software","Systems","Other"];
const CAT_COLORS = {
  Hardware: "var(--rose)",   Firmware: "var(--iris)",
  GNC:      "var(--accent)", Software: "var(--iris)",
  Systems:  "var(--rose)",   Other:    "var(--dim)",
};

function LessonsPane() {
  const [lessons, setLessons]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [open, setOpen]           = useState({});
  const [adding, setAdding]       = useState(false);
  const [title, setTitle]         = useState("");
  const [category, setCategory]   = useState("");
  const [symptom, setSymptom]     = useState("");
  const [rootCause, setRootCause] = useState("");
  const [fix, setFix]             = useState("");
  const [takeaway, setTakeaway]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  useEffect(() => {
    getLessons().then(l => { setLessons(l); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const submit = async () => {
    if (!title.trim()) { setErr("title is required"); return; }
    setSaving(true); setErr(null);
    try {
      const l = await createLesson({ title: title.trim(), category, symptom, root_cause: rootCause, fix, takeaway });
      setLessons(arr => [l, ...arr]);
      setAdding(false); setTitle(""); setCategory(""); setSymptom(""); setRootCause(""); setFix(""); setTakeaway("");
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    await deleteLesson(id);
    setLessons(arr => arr.filter(l => l.id !== id));
    setConfirmDel(null);
  };

  const inputCls = "w-full bg-overlay border border-hl px-3 py-2 text-[12.5px] outline-none";
  const fieldLabel = (label, color) => (
    <div className="text-[10px] uppercase tracking-[0.12em] mb-1" style={{ color: color || "var(--dim)" }}>{label}</div>
  );

  if (loading) return <div className="px-8 py-8 text-[12px]" style={{ color: "var(--dim)", fontFamily: "InconsolataGo, monospace" }}>loading…</div>;

  return (
    <section className="flex-1 min-h-0 flex flex-col" style={{ fontFamily: "InconsolataGo, monospace" }}>
      {/* Header */}
      <div className="px-8 py-3 flex items-center shrink-0" style={{ borderBottom: "1px solid var(--hl)" }}>
        <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--dim)" }}>
          lessons learned · engineering mistake tracker
        </span>
        <span className="ml-4 text-[11px]" style={{ color: "var(--sub)" }}>{lessons.length} logged</span>
        <button onClick={() => setAdding(a => !a)} className="ml-auto px-3 py-1 border text-[11px]"
          style={{ color: "var(--rose)", borderColor: "var(--rose)" }}>
          + log lesson
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="px-8 py-4 shrink-0 space-y-3" style={{ borderBottom: "1px solid var(--hl)", background: "color-mix(in srgb, var(--surface) 60%, transparent)" }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {fieldLabel("title *")}
              <input value={title} onChange={e => setTitle(e.target.value)}
                placeholder="what went wrong?"
                className={inputCls} style={{ color: "var(--text)" }} autoFocus />
            </div>
            <div>
              {fieldLabel("category")}
              <select value={category} onChange={e => setCategory(e.target.value)}
                className={inputCls} style={{ color: category ? "var(--text)" : "var(--dim)" }}>
                <option value="">— select —</option>
                {LESSON_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {fieldLabel("symptom", "var(--rose)")}
              <textarea value={symptom} onChange={e => setSymptom(e.target.value)}
                placeholder="what did you observe?" rows={2}
                className={inputCls} style={{ color: "var(--text)", resize: "vertical" }} />
            </div>
            <div>
              {fieldLabel("root cause", "var(--rose)")}
              <textarea value={rootCause} onChange={e => setRootCause(e.target.value)}
                placeholder="why did it happen?" rows={2}
                className={inputCls} style={{ color: "var(--text)", resize: "vertical" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {fieldLabel("fix", "var(--iris)")}
              <textarea value={fix} onChange={e => setFix(e.target.value)}
                placeholder="what resolved it?" rows={2}
                className={inputCls} style={{ color: "var(--text)", resize: "vertical" }} />
            </div>
            <div>
              {fieldLabel("takeaway", "var(--iris)")}
              <textarea value={takeaway} onChange={e => setTakeaway(e.target.value)}
                placeholder="what will you do differently?" rows={2}
                className={inputCls} style={{ color: "var(--text)", resize: "vertical" }} />
            </div>
          </div>
          {err && <div className="text-[11px]" style={{ color: "var(--rose)" }}>{err}</div>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving || !title.trim()}
              className="px-3 py-1.5 border text-[12px] disabled:opacity-40"
              style={{ color: "var(--iris)", borderColor: "var(--iris)" }}>
              {saving ? "saving…" : "[save lesson]"}
            </button>
            <button onClick={() => { setAdding(false); setErr(null); }}
              className="px-3 py-1.5 border border-hl text-[12px]"
              style={{ color: "var(--sub)" }}>[cancel]</button>
          </div>
        </div>
      )}

      {/* Lesson list */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {lessons.length === 0 ? (
          <div className="px-8 py-12 text-center">
            <div className="text-[12px] mb-1" style={{ color: "var(--dim)" }}>no lessons logged yet</div>
            <div className="text-[11px]" style={{ color: "var(--dim)" }}>click + log lesson to capture a mistake</div>
          </div>
        ) : lessons.map(lesson => {
          const isOpen = !!open[lesson.id];
          const catColor = CAT_COLORS[lesson.category] || "var(--dim)";
          const createdAt = parseTs(lesson.created_at);
          const dateStr = `${createdAt.getFullYear()}-${pad(createdAt.getMonth()+1)}-${pad(createdAt.getDate())}`;
          return (
            <div key={lesson.id} className="border-b" style={{ borderColor: "var(--hl)" }}>
              {/* Row header */}
              <div className="flex items-center gap-3 px-8 hover:bg-surface/40 group" style={{ height: 42 }}>
                <button onClick={() => setOpen(o => ({ ...o, [lesson.id]: !isOpen }))}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left h-full">
                  <span className="text-[10px]" style={{ color: "var(--dim)" }}>{isOpen ? "▾" : "▸"}</span>
                  <span className="text-[13px] truncate" style={{ color: "var(--text)" }}>{lesson.title}</span>
                  {lesson.category && (
                    <span className="text-[10px] px-1.5 py-[1px] border shrink-0"
                      style={{ color: catColor, borderColor: "color-mix(in srgb, " + catColor + " 30%, transparent)" }}>
                      {lesson.category}
                    </span>
                  )}
                </button>
                <span className="text-[10.5px] tnum" style={{ color: "var(--dim)" }}>{dateStr}</span>
                <button onClick={() => setConfirmDel(lesson.id)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 border transition-opacity"
                  style={{ color: "var(--rose)", borderColor: "color-mix(in srgb, var(--rose) 40%, transparent)" }}>
                  x
                </button>
              </div>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-8 pb-5 pt-2 grid grid-cols-2 gap-x-8 gap-y-4"
                  style={{ background: "color-mix(in srgb, var(--surface) 50%, transparent)" }}>
                  {[
                    { label: "symptom",    value: lesson.symptom,    color: "var(--rose)" },
                    { label: "root cause", value: lesson.root_cause,  color: "var(--rose)" },
                    { label: "fix",        value: lesson.fix,         color: "var(--iris)" },
                    { label: "takeaway",   value: lesson.takeaway,    color: "var(--iris)" },
                  ].map(({ label, value, color }) => value ? (
                    <div key={label}>
                      <div className="text-[10px] uppercase tracking-[0.12em] mb-1.5" style={{ color }}>{label}</div>
                      <div className="text-[12.5px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--sub)" }}>{value}</div>
                    </div>
                  ) : null)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => setConfirmDel(null)}>
          <div onClick={e => e.stopPropagation()} className="border border-hl bg-surface p-6 w-[380px]">
            <div className="text-[11px] uppercase tracking-[0.08em] mb-3" style={{ color: "var(--dim)" }}>confirm delete</div>
            <div className="text-[13px] mb-4" style={{ color: "var(--text)" }}>
              delete <span style={{ color: "var(--rose)" }}>{lessons.find(l=>l.id===confirmDel)?.title}</span>?
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDel(null)} className="px-3 py-1.5 border border-hl text-[12px]" style={{ color: "var(--sub)" }}>cancel</button>
              <button onClick={() => handleDelete(confirmDel)}
                className="px-3 py-1.5 border text-[12px]"
                style={{ color: "var(--rose)", borderColor: "var(--rose)" }}>delete</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [active, setActive]               = useState("session");
  const [now, setNow]                     = useState(new Date());
  const [projects, setProjects]           = useState([]);
  const [tasks, setTasks]                 = useState([]);
  const [dbReady, setDbReady]             = useState(false);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [externalSession, setExternalSession] = useState(null);
  const [onBreak, setOnBreak]             = useState(false);
  const toggleBreak                       = () => setOnBreak(b => !b);
  const [theme, setTheme]                 = useState(
    () => localStorage.getItem("tasogare-theme") || "rose-pine-moon"
  );

  // Apply theme to <html> — updates all CSS vars instantly
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.background = "var(--base)";
    localStorage.setItem("tasogare-theme", theme);
  }, [theme]);

  // Timer state — lifted so StatusBar can see it regardless of active pane
  const [seconds, setSeconds]             = useState(0);
  const [running, setRunning]             = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState(null);

  // Init DB
  useEffect(() => {
    initDb().then(() => setDbReady(true)).catch(err => console.error("DB init:", err));
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    getProjects().then(setProjects).catch(() => {});
    getTasks().then(setTasks).catch(() => {});
  }, [dbReady]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const panes = ["session","projects","tasks","interview","history","lessons"];
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && ["1","2","3","4","5","6"].includes(e.key)) {
        e.preventDefault(); setActive(panes[parseInt(e.key)-1]);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "N") {
        e.preventDefault(); setQuickNoteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Task helpers
  const handleTaskComplete   = async (id) => { const u = await completeTask(id);   setTasks(arr => arr.map(t => t.id === id ? u : t)); };
  const handleTaskUncomplete = async (id) => { const u = await uncompleteTask(id); setTasks(arr => arr.map(t => t.id === id ? u : t)); };
  const handleTaskDeleted    = (id)        => setTasks(arr => arr.filter(t => t.id !== id));
  const pendingCount         = tasks.filter(t => !t.done).length;

  if (!dbReady) {
    return (
      <div className="h-full flex items-center justify-center bg-base">
        <div style={{ color: "var(--dim)", fontFamily: "InconsolataGo, monospace", fontSize: 12 }}>
          initialising database…
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--base)", color: "var(--text)" }}>
      <StatusBar now={now} running={running} onBreak={onBreak} sessionSec={seconds} active={active} />
      <div className="flex-1 min-h-0 flex">
        <Sidebar active={active} setActive={setActive} pendingCount={pendingCount} theme={theme} setTheme={setTheme} />
        <main className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
          {/* Session pane — always mounted so timer keeps running */}
          <div className={`flex-1 min-h-0 flex-col ${active === "session" ? "flex" : "hidden"}`}>
            <SessionPane
              projects={projects}
              tasks={tasks}
              onSessionSaved={s => setExternalSession(s)}
              externalSession={externalSession}
              running={running} setRunning={setRunning}
              seconds={seconds} setSeconds={setSeconds}
              onBreak={onBreak}
              toggleBreak={toggleBreak}
              onQuickNote={() => setQuickNoteOpen(true)}
              onTaskComplete={handleTaskComplete}
            />
          </div>
          {active === "projects"  && <ProjectsPane projects={projects} setProjects={setProjects} />}
          {active === "tasks"     && <TasksPane tasks={tasks} setTasks={setTasks} projects={projects} />}
          {active === "interview" && <InterviewPane projects={projects} />}
          {active === "history"   && <HistoryPane />}
          {active === "lessons"   && <LessonsPane />}
        </main>

        {/* Right rail — ONLY visible on session pane, now just break/quicknote since timer is in SessionPane */}
        {active === "session" && (
          <div style={{ display: "none" }} />
        )}
      </div>

      {quickNoteOpen && (
        <QuickNoteModal
          onClose={() => setQuickNoteOpen(false)}
          onSaved={(saved) => { setExternalSession(saved); setActive("session"); }}
        />
      )}
      {deleteTarget && (
        <DeleteTaskModal task={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleTaskDeleted} />
      )}
    </div>
  );
}
