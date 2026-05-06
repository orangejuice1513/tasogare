/**
 * App.jsx — Mission Control (Tauri v2)
 * Place in: tasogare/src/App.jsx
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  initDb, getProjects, createProject, updateProject, deleteProject,
  getSessions, createSession, deleteSession,
  getTasks, createTask, updateTask, completeTask, uncompleteTask, deleteTask,
} from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pad(n) { return n.toString().padStart(2, "0"); }
function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDur(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return `${m}m ${pad(sec)}s`;
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
}
function fmtHours(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}
function fmtDate(str) {
  if (!str) return "—";
  const d = new Date(str);
  return isNaN(d) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const I = {
  clock:    <Icon d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  hangar:   <Icon d={<><rect x="2" y="7" width="20" height="13" rx="1"/><path d="M2 10h20M8 7V4M16 7V4"/></>} />,
  deck:     <Icon d={<><path d="M4 4h16v4H4zM4 12h10v4H4zM4 20h7"/></>} />,
  tasks:    <Icon d={<><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>} />,
  flag:     <Icon d={<><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></>} />,
  note:     <Icon d={<><path d="M5 4h11l3 3v13H5z"/><path d="M9 9h7M9 13h7M9 17h4"/></>} />,
  play:     <Icon d={<><path d="M7 5l12 7-12 7V5z"/></>} />,
  pause:    <Icon d={<><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></>} />,
  stop:     <Icon d={<><rect x="6" y="6" width="12" height="12" rx="1"/></>} />,
  check:    <Icon d={<><path d="M4 12l5 5L20 6"/></>} />,
  plus:     <Icon d={<><path d="M12 5v14M5 12h14"/></>} />,
  expand:   <Icon d={<><path d="M6 9l6 6 6-6"/></>} />,
  collapse: <Icon d={<><path d="M18 15l-6-6-6 6"/></>} />,
  trash:    <Icon d={<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></>} />,
  undo:     <Icon d={<><path d="M3 7v6h6"/><path d="M3 13a9 9 0 1 0 2.83-6.36L3 13"/></>} />,
  edit:     <Icon d={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></>} />,
  history:  <Icon d={<><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></>} />,
};

// ─── NAV ─────────────────────────────────────────────────────────────────────
const NAV = [
  { id: "daily",     label: "daily log",     icon: I.clock,  accent: "#F5A9BB" },
  { id: "hangar",    label: "projects",       icon: I.hangar, accent: "#C4A7E7" },
  { id: "interview", label: "interview deck", icon: I.deck,   accent: "#BAADF4" },
  { id: "tasks",     label: "tasks",          icon: I.tasks,  accent: "#BAADF4" },
  { id: "history",   label: "history",         icon: I.history, accent: "#C4A7E7" },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ active, setActive, pendingCount }) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-border/70 bg-base flex flex-col">
      <div className="px-5 pt-6 pb-7">
        <div className="flex items-center gap-2.5">
          <img src="/icon.png" alt="tasogare" className="w-8 h-8 rounded-[6px] shrink-0" />
          <div className="leading-tight">
            <div className="text-[12.5px] font-medium text-text tracking-tight font-display">tasogare</div>
            <div className="label">mission control</div>
          </div>
        </div>
      </div>
      <div className="px-5 pb-2"><div className="label">workspaces</div></div>
      <nav className="px-2 flex flex-col gap-0.5">
        {NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)}
              className={`group relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-[6px] text-left transition-colors ${isActive ? "bg-surface" : "hover:bg-surface/50"}`}>
              {isActive && <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r" style={{ background: item.accent }} />}
              <span className="shrink-0" style={{ color: isActive ? item.accent : "#7E8294" }}>{item.icon}</span>
              <span className={`flex-1 text-[13px] tracking-tight ${isActive ? "text-text" : "text-sub group-hover:text-text"}`}>{item.label}</span>
              {/* Pending task badge */}
              {item.id === "tasks" && pendingCount > 0 && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ background: "#BAADF422", color: "#BAADF4" }}>
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto px-5 pb-5 pt-6 border-t border-border/50 mx-3">
        <div className="label mb-1.5">keyboard</div>
        {[["⌘ 1","daily log"],["⌘ 2","projects"],["⌘ 3","interview deck"],["⌘ 4","tasks"],["⌘ 5","history"]].map(([k,v]) => (
          <div key={k} className="flex items-center justify-between mt-1">
            <span className="label">{v}</span>
            <span className="font-mono text-[10px] text-dim bg-overlay px-1.5 py-0.5 rounded">{k}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar({ now, active, onQuickNote, onBreak, onBreakActive }) {
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  const tab = NAV.find(n => n.id === active);
  return (
    <header className="h-[52px] shrink-0 border-b border-border/70 flex items-center px-7 gap-6">
      <div className="flex items-center gap-2">
        <span style={{ color: tab?.accent }} className="shrink-0">{tab?.icon}</span>
        <span className="text-[12.5px] text-text tracking-tight">{tab?.label}</span>
      </div>
      <div className="h-4 w-px bg-border/70" />
      <div className="flex items-center gap-3 text-[12px] text-sub">
        <span className="font-mono tnum">{dateStr.toLowerCase()}</span>
        <span className="text-dim">·</span>
        <span className="font-mono tnum text-text">{timeStr}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={onQuickNote}
          className="px-3 py-1.5 rounded-[6px] border border-border text-[12px] text-sub hover:text-text hover:border-border/80 flex items-center gap-2 transition-colors">
          {I.note}<span>quick note</span>
          <span className="font-mono text-[10px] text-dim ml-0.5">⌘⇧N</span>
        </button>
        <button onClick={onBreak}
          className="px-3 py-1.5 rounded-[6px] border text-[12px] flex items-center gap-2 transition-colors"
          style={onBreakActive
            ? { borderColor: "#F5A9BB", color: "#F5A9BB", background: "#F5A9BB18" }
            : { borderColor: "#3D4251", color: "#F5A9BB" }}>
          {onBreakActive ? I.play : I.flag}
          <span>{onBreakActive ? "resume" : "break"}</span>
        </button>
      </div>
    </header>
  );
}

// ─── Timer ring ───────────────────────────────────────────────────────────────
function TimerRing({ seconds, running, onBreak }) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const target = 90 * 60, progress = Math.min(seconds / target, 1), C = 2 * Math.PI * 78;
  const statusDot  = onBreak ? "bg-rose animate-pulse" : running ? "bg-rose animate-pulse" : "bg-blue";
  const statusLabel = onBreak ? "on break" : running ? "running" : "paused";
  return (
    <div className="rounded-[10px] border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="label label-up">session timer</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className="label">{statusLabel}</span>
        </div>
      </div>
      <div className="relative aspect-square w-full max-w-[240px] mx-auto">
        <svg viewBox="0 0 180 180" className="absolute inset-0 -rotate-90">
          <circle cx="90" cy="90" r="78" fill="none" stroke="#2A2D3E" strokeWidth="2" />
          <circle cx="90" cy="90" r="78" fill="none"
            stroke={onBreak ? "#F5A9BB" : "#F5A9BB"} strokeWidth="2"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            style={{ transition: "stroke-dashoffset 0.4s linear, stroke 0.3s ease" }} />
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * Math.PI * 2;
            const x1 = 90 + Math.cos(a) * 84, y1 = 90 + Math.sin(a) * 84;
            const x2 = 90 + Math.cos(a) * (i % 5 === 0 ? 88 : 86), y2 = 90 + Math.sin(a) * (i % 5 === 0 ? 88 : 86);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={i % 5 === 0 ? "#3D4251" : "#2A2D3E"} strokeWidth={i % 5 === 0 ? 1.2 : 0.6} />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="label mb-1.5">{onBreak ? "paused · on break" : "elapsed"}</div>
          <div className="flex items-baseline gap-1 tnum" style={{ fontFamily: "InconsolataGo, ui-monospace, monospace" }}>
            <span className="text-[40px] font-light tracking-tight text-text leading-none">{pad(h)}</span>
            <span className="text-[24px] text-dim leading-none">:</span>
            <span className="text-[40px] font-light tracking-tight text-text leading-none">{pad(m)}</span>
            <span className="text-[24px] text-dim leading-none">:</span>
            <span className="text-[40px] font-light tracking-tight leading-none"
              style={{ color: running && !onBreak ? "#F5A9BB" : "#7E8294" }}>{pad(s)}</span>
          </div>
          <div className="mt-2 label">target · 90m deep block</div>
          <div className="mt-1 font-mono text-[10.5px] text-sub tnum">{Math.round(progress * 100)}% complete</div>
        </div>
      </div>
    </div>
  );
}

// ─── Quick Note Modal ─────────────────────────────────────────────────────────
function QuickNoteModal({ onClose, onSaved }) {
  const [text, setText]     = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const taRef               = useRef(null);

  useEffect(() => {
    taRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = async () => {
    if (!text.trim()) { setErr("note cannot be empty"); return; }
    setSaving(true); setErr(null);
    try {
      const saved = await createSession({ type: "Routine", intent: "Quick Note", notes: text.trim(), duration_seconds: 0 });
      onSaved(saved); onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(24,28,43,0.82)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[520px] mx-4 rounded-[12px] border border-border bg-surface flex flex-col"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.55)" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <span className="text-sub">{I.note}</span>
            <span className="text-[13px] text-text font-medium tracking-tight">quick note</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-dim bg-overlay px-1.5 py-0.5 rounded">esc to close</span>
            <button onClick={onClose} className="text-dim hover:text-sub transition-colors leading-none text-[16px]">✕</button>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="label mb-2">note — saved as a Routine session</div>
          <textarea ref={taRef} value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
            placeholder={"jot anything — a decision, a blocker, a loose thought"}
            rows={7}
            className="w-full bg-overlay border border-border rounded-[8px] px-4 py-3 text-[13px] text-text font-mono leading-relaxed outline-none focus:border-rose/50 resize-none transition-colors" />
          {err && <div className="mt-1.5 font-mono text-[11px] text-rose/70">{err}</div>}
        </div>
        <div className="px-5 pb-5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-dim">⌘↵ to save</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-[6px] border border-border text-[12px] text-sub font-mono hover:text-text transition-colors">cancel</button>
            <button onClick={save} disabled={saving || !text.trim()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-[6px] border border-rose/50 text-rose text-[12px] font-mono hover:border-rose disabled:opacity-40 transition-colors">
              {I.check}{saving ? "saving…" : "save note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete session button ────────────────────────────────────────────────────
function DeleteBtn({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy]             = useState(false);
  const handleClick = async (e) => {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); await onDelete(); setBusy(false);
  };
  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(id);
  }, [confirming]);
  return (
    <button onClick={handleClick} disabled={busy}
      className="flex items-center gap-1 px-1.5 py-1 rounded-[5px] font-mono text-[10px] transition-all disabled:opacity-40 opacity-0 group-hover:opacity-100"
      style={confirming
        ? { color: "#F5A9BB", border: "1px solid #F5A9BB55", background: "#F5A9BB11" }
        : { color: "#7E8294", border: "1px solid transparent" }}>
      {busy ? "…" : confirming ? <>! confirm</> : I.trash}
    </button>
  );
}

// ─── Delete Task Modal (requires a written reason) ────────────────────────────
function DeleteTaskModal({ task, onClose, onDeleted }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);
  const inputRef            = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = async () => {
    if (!reason.trim()) { setErr("you must write a reason before deleting"); return; }
    setSaving(true); setErr(null);
    try {
      await deleteTask(task.id, reason.trim());
      onDeleted(task.id);
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(24,28,43,0.88)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[480px] mx-4 rounded-[12px] border border-rose/30 bg-surface flex flex-col"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.6)" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <span style={{ color: "#F5A9BB" }}>{I.trash}</span>
            <span className="text-[13px] text-text font-medium tracking-tight">delete task</span>
          </div>
          <button onClick={onClose} className="text-dim hover:text-sub transition-colors text-[16px]">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Show the task being deleted */}
          <div className="bg-overlay rounded-[6px] px-3 py-2.5 border border-border/50">
            <div className="font-mono text-[10px] text-dim mb-1">task to delete</div>
            <div className="text-[13px] text-sub line-through">{task.text}</div>
          </div>
          {/* Mandatory reason */}
          <div>
            <div className="label mb-1.5">
              why are you deleting this?
              <span className="text-rose ml-1">*</span>
              <span className="text-dim ml-2">(required — no reason, no delete)</span>
            </div>
            <textarea ref={inputRef} value={reason} onChange={e => setReason(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
              placeholder={"e.g. no longer relevant after the meeting\ne.g. decided to defer this to next sprint\ne.g. actually a duplicate of another task"}
              rows={4}
              className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2.5 text-[12.5px] text-text font-mono leading-relaxed outline-none focus:border-rose/60 resize-none transition-colors" />
            {err && <div className="mt-1 font-mono text-[11px] text-rose/70">{err}</div>}
          </div>
        </div>
        <div className="px-5 pb-5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-dim">⌘↵ to confirm</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 rounded-[6px] border border-border text-[12px] text-sub font-mono hover:text-text transition-colors">cancel</button>
            <button onClick={submit} disabled={saving || !reason.trim()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-[6px] border border-rose/50 text-rose text-[12px] font-mono hover:border-rose disabled:opacity-40 transition-colors">
              {I.trash}{saving ? "deleting…" : "delete task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Mini task list (shown above intent in Daily Log) ─────────────────────────
function MiniTaskList({ tasks, projects, onComplete, onUncomplete, onRequestDelete }) {
  const pending   = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);
  const [showDone, setShowDone] = useState(false);

  if (tasks.length === 0) return null;

  return (
    <div className="px-7 pt-5 pb-1">
      <div className="rounded-[10px] border border-border/60 bg-surface overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span style={{ color: "#BAADF4" }}>{I.tasks}</span>
            <span className="label label-up">backlog</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: "#BAADF422", color: "#BAADF4" }}>
              {pending.length} pending
            </span>
          </div>
          {completed.length > 0 && (
            <button onClick={() => setShowDone(s => !s)}
              className="font-mono text-[10px] text-dim hover:text-sub transition-colors flex items-center gap-1">
              {showDone ? I.collapse : I.expand}
              {showDone ? "hide" : `${completed.length} done`}
            </button>
          )}
        </div>

        {/* Pending tasks */}
        {pending.length === 0 ? (
          <div className="px-4 py-3 label">all tasks complete ✓</div>
        ) : (
          <div className="divide-y divide-border/30 max-h-[200px] overflow-y-auto">
            {pending.map(task => {
              const proj = projects.find(p => p.id === task.project_id);
              return (
                <div key={task.id} className="group flex items-start gap-3 px-4 py-2.5 hover:bg-overlay/40 transition-colors">
                  {/* Checkbox */}
                  <button onClick={() => onComplete(task.id)}
                    className="mt-0.5 w-4 h-4 shrink-0 rounded border border-border hover:border-blue transition-colors flex items-center justify-center">
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-text">{task.text}</div>
                    {proj && <div className="font-mono text-[10px] text-purple">↳ {proj.name}</div>}
                  </div>
                  <button onClick={() => onRequestDelete(task)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-dim hover:text-rose"
                    title="delete task">
                    {I.trash}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Completed tasks — collapsed by default */}
        {showDone && completed.length > 0 && (
          <div className="border-t border-border/40 divide-y divide-border/20 max-h-[160px] overflow-y-auto bg-overlay/20">
            {completed.map(task => (
              <div key={task.id} className="group flex items-start gap-3 px-4 py-2.5">
                <button onClick={() => onUncomplete(task.id)}
                  className="mt-0.5 w-4 h-4 shrink-0 rounded border border-purple/50 bg-purple/10 flex items-center justify-center"
                  title="mark incomplete">
                  <span style={{ color: "#C4A7E7", transform: "scale(0.7)" }}>{I.check}</span>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-dim line-through">{task.text}</div>
                  {task.done_at && (
                    <div className="font-mono text-[10px] text-dim">done {fmtDate(task.done_at)}</div>
                  )}
                </div>
                <button onClick={() => onRequestDelete(task)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-dim hover:text-rose"
                  title="delete task">
                  {I.trash}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 · DAILY LOG
// ═══════════════════════════════════════════════════════════════════════════════

const HINTS = [
  "ship the v2 onboarding tooltip copy",
  "review the auth refactor PR end-to-end",
  "draft the q3 platform retro doc",
  "reproduce the duplicate-event bug locally",
];

function DailyLog({ projects, onSessionSaved, externalSession, breakActive, tasks, onTaskComplete, onTaskUncomplete, onTaskRequestDelete }) {
  const [phase, setPhase]             = useState("idle");
  const [sessionType, setSessionType] = useState("Routine");
  const [projectId, setProjectId]     = useState(null);
  const [intent, setIntent]           = useState("");
  const [reality, setReality]         = useState("");
  const [debriefNotes, setDebriefNotes] = useState("");
  const [seconds, setSeconds]         = useState(0);
  const [running, setRunning]         = useState(false);
  const [sessions, setSessions]       = useState([]);
  const [hint, setHint]               = useState(0);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState(null);

  useEffect(() => {
    if (externalSession)
      setSessions(arr => [externalSession, ...arr.filter(s => s.id !== externalSession.id)]);
  }, [externalSession]);

  useEffect(() => {
    const id = setInterval(() => setHint(h => (h + 1) % HINTS.length), 4500);
    return () => clearInterval(id);
  }, []);

  // Poll Rust for the true elapsed seconds every second (display only).
  // The actual clock lives in Rust and is never throttled by macOS.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      const elapsed = await invoke("get_elapsed");
      setSeconds(Number(elapsed));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Break: pause or resume the Rust timer when the global break toggle changes
  useEffect(() => {
    if (phase !== "running") return;
    if (breakActive) {
      invoke("pause_timer");
      setRunning(false);
    } else {
      invoke("resume_timer");
      setRunning(true);
    }
  }, [breakActive]);

  const startSession = async () => {
    if (!intent.trim()) return;
    await invoke("start_timer");
    setPhase("running"); setSeconds(0); setRunning(true);
    setReality(""); setDebriefNotes(""); setErr(null);
  };

  const stopSession = async () => {
    await invoke("pause_timer"); // freeze display while user types reality
    setRunning(false);
    setPhase("logging");
  };

  const logSession = async () => {
    setSaving(true); setErr(null);
    try {
      // stop_timer resets Rust state and gives us the authoritative duration
      const finalSeconds = await invoke("stop_timer");
      const saved = await createSession({
        type: sessionType,
        project_id: sessionType === "Engineering" ? projectId : null,
        intent: intent.trim(), reality: reality.trim(),
        notes: debriefNotes.trim(), duration_seconds: Number(finalSeconds),
      });
      setSessions(arr => [saved, ...arr]);
      onSessionSaved && onSessionSaved(saved);
      setIntent(""); setReality(""); setDebriefNotes(""); setSeconds(0); setPhase("idle");
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const discardSession = async () => {
    await invoke("stop_timer"); // reset Rust state
    setSeconds(0); setRunning(false); setPhase("idle"); setReality(""); setDebriefNotes("");
  };

  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">

        {/* ── Mini task list above intent ── */}
        <MiniTaskList
          tasks={tasks}
          projects={projects}
          onComplete={onTaskComplete}
          onUncomplete={onTaskUncomplete}
          onRequestDelete={onTaskRequestDelete}
        />

        {/* ── Intent section ── */}
        <section className="px-7 pt-5 pb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="label label-up">intent</span>
              <span className="text-dim text-[11px] font-mono">— what are you about to get done, in one line</span>
            </div>
            <div className="flex items-center gap-1">
              {["Routine", "Engineering"].map(t => (
                <button key={t} onClick={() => { setSessionType(t); if (t === "Routine") setProjectId(null); }}
                  disabled={phase === "running" || phase === "logging"}
                  className="px-2.5 py-1 rounded-[6px] border font-mono text-[10.5px] tracking-wider transition-colors disabled:opacity-50"
                  style={sessionType === t
                    ? { borderColor: t === "Engineering" ? "#C4A7E7" : "#F5A9BB", color: t === "Engineering" ? "#C4A7E7" : "#F5A9BB", background: t === "Engineering" ? "#C4A7E722" : "#F5A9BB22" }
                    : { borderColor: "#3D4251", color: "#7E8294" }}>
                  [{t}]
                </button>
              ))}
            </div>
          </div>

          {sessionType === "Engineering" && (
            <div className="mb-3">
              <select value={projectId ?? ""}
                onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
                disabled={phase === "running" || phase === "logging"}
                className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text font-mono disabled:opacity-50 outline-none focus:border-purple/70"
                style={{ color: projectId ? "#DBDEE9" : "#7E8294" }}>
                <option value="">— link to project (optional) —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {selectedProject && (
                <div className="mt-1 font-mono text-[10.5px] text-sub">↳ {selectedProject.short_description || "no short description"}</div>
              )}
            </div>
          )}

          <div className="relative rounded-[10px] border border-border bg-surface focus-within:border-rose/60 transition-colors">
            <div className="flex items-center pl-5 pr-3 py-4 gap-4">
              <span className="text-sub text-[15px] font-mono leading-none mt-0.5">›</span>
              <input value={intent} onChange={e => setIntent(e.target.value)}
                onKeyDown={e => e.key === "Enter" && phase === "idle" && startSession()}
                placeholder={HINTS[hint]}
                disabled={phase === "running" || phase === "logging"}
                className="flex-1 bg-transparent outline-none text-[19px] tracking-tight text-text font-light placeholder:text-dim disabled:opacity-60"
                style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }} />
              {phase === "idle" && (
                <button onClick={startSession} disabled={!intent.trim()}
                  className="px-3 py-1.5 rounded-[6px] border text-[12px] flex items-center gap-2 disabled:opacity-40 transition-colors"
                  style={{ borderColor: intent.trim() ? "#F5A9BB" : "#3D4251", color: intent.trim() ? "#F5A9BB" : "#7E8294" }}>
                  <span>commit + start</span><span className="font-mono text-[10.5px]">⏎</span>
                </button>
              )}
            </div>
            {phase === "idle" && (
              <div className="px-5 pb-3 pt-1 flex items-center gap-4 border-t border-border/50">
                <span className="label">mode →</span>
                <span className="font-mono text-[10.5px]" style={{ color: sessionType === "Engineering" ? "#C4A7E7" : "#F5A9BB" }}>
                  [{sessionType}]{selectedProject ? ` · ${selectedProject.name}` : ""}
                </span>
                <span className="ml-auto label">⏎ to commit and start timer</span>
              </div>
            )}
          </div>
        </section>

        {/* ── Running / logging controls ── */}
        {(phase === "running" || phase === "logging") && (
          <section className="px-7 pb-5">
            <div className="rounded-[10px] border bg-surface p-5 space-y-4"
              style={{ borderColor: phase === "running" ? "#F5A9BB33" : "#C4A7E733" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="label label-up mb-1">{phase === "running" ? "in progress" : "log reality"}</div>
                  <div className="text-[14px] text-text" style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }}>{intent}</div>
                  {selectedProject && <div className="font-mono text-[10.5px] text-purple mt-0.5">↳ {selectedProject.name}</div>}
                </div>
                <div className="font-mono text-[28px] text-text tnum" style={{ fontFamily: "InconsolataGo, ui-monospace, monospace" }}>{fmtDur(seconds)}</div>
              </div>
              {phase === "running" && (
                <div className="flex gap-2">
                  <button onClick={async () => {
                      if (running) { await invoke("pause_timer"); setRunning(false); }
                      else { await invoke("resume_timer"); setRunning(true); }
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border text-[12px] font-mono"
                    style={{ borderColor: running ? "#BAADF4" : "#C4A7E7", color: running ? "#BAADF4" : "#C4A7E7" }}>
                    {running ? I.pause : I.play}{running ? "pause" : "resume"}
                  </button>
                  <button onClick={stopSession}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-rose/50 text-rose text-[12px] font-mono">
                    {I.stop} stop & log
                  </button>
                </div>
              )}
              {phase === "logging" && (
                <div className="space-y-3">
                  <div>
                    <div className="label mb-1.5">reality — what actually happened?</div>
                    <input value={reality} onChange={e => setReality(e.target.value)}
                      placeholder="shipped 6/9 tooltips, blocked on copy review…"
                      className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none focus:border-rose/50"
                      style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }} />
                  </div>
                  <div>
                    <div className="label mb-1.5">debrief notes / bug log <span className="text-dim">(optional)</span></div>
                    <textarea value={debriefNotes} onChange={e => setDebriefNotes(e.target.value)}
                      placeholder={"- p95 latency spiked during deploy\n- next: open issue + tag @ravi"}
                      rows={4}
                      className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[12.5px] text-text font-mono outline-none focus:border-rose/50 resize-y leading-relaxed" />
                  </div>
                  {err && <div className="font-mono text-[11px] text-rose/70">{err}</div>}
                  <div className="flex gap-2">
                    <button onClick={logSession} disabled={saving}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-purple/60 text-purple text-[12px] font-mono disabled:opacity-50">
                      {I.check} {saving ? "saving…" : "save session"}
                    </button>
                    <button onClick={discardSession}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-border text-sub text-[12px] font-mono hover:text-text">
                      discard
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Session log ── */}
        <section className="flex-1 min-h-0 flex flex-col">
          <div className="px-7 py-2 flex items-center justify-between border-y border-border/70 bg-surface/40">
            <span className="label label-up">session log</span>
            <span className="label">{sessions.length} logged today</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="px-7 py-10 text-center"><div className="label">no sessions yet · commit an intent to start</div></div>
            ) : (
              sessions.map((s) => (
                <SessionRow key={s.id} session={s} projects={projects}
                  onDelete={async () => { await deleteSession(s.id); setSessions(arr => arr.filter(x => x.id !== s.id)); }} />
              ))
            )}
            <div className="px-7 py-5 border-t border-border/40 flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-purple animate-pulse" />
              <span className="label">captured live</span>
              <span className="ml-auto label">end of log</span>
            </div>
          </div>
        </section>
      </div>

      {/* ── Timer ring sidebar ── */}
      <aside className="w-[300px] shrink-0 border-l border-border/70 bg-base/60 p-4 overflow-y-auto">
        <TimerRing seconds={seconds} running={running} onBreak={breakActive} />
        <div className="mt-4 rounded-[10px] border border-border bg-surface p-4">
          <div className="label label-up mb-3">today's tally</div>
          <div className="space-y-2">
            <TallyRow label="sessions"    value={sessions.length.toString().padStart(2,"0")} color="#DBDEE9" />
            <TallyRow label="engineering" value={sessions.filter(s=>s.type==="Engineering").length.toString().padStart(2,"0")} color="#C4A7E7" />
            <TallyRow label="total focus" value={fmtHours(sessions.reduce((a,s)=>a+s.duration_seconds,0))} color="#C4A7E7" />
          </div>
        </div>
      </aside>
    </div>
  );
}

function TallyRow({ label, value, color }) {
  return (
    <div className="flex items-center justify-between">
      <span className="label">{label}</span>
      <span className="font-mono text-[18px] font-light tnum" style={{ color, fontFamily: "InconsolataGo, ui-monospace, monospace" }}>{value}</span>
    </div>
  );
}

function SessionRow({ session, projects, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const project = projects.find(p => p.id === session.project_id);
  const ts = new Date(session.timestamp);
  const timeStr = isNaN(ts) ? "—" : fmtTime(ts);
  return (
    <div className="group px-7 py-4 border-b border-border/40 hover:bg-surface/30 transition-colors">
      <div className="flex items-start gap-4">
        <div className="font-mono text-[11px] tnum text-sub pt-0.5 w-12 shrink-0">{timeStr}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[10.5px] px-1.5 py-[2px] rounded border"
              style={{ color: session.type === "Engineering" ? "#C4A7E7" : "#F5A9BB", borderColor: session.type === "Engineering" ? "#C4A7E733" : "#F5A9BB33" }}>
              {session.type}
            </span>
            {project && <span className="font-mono text-[10.5px] text-purple">↳ {project.name}</span>}
            <span className="ml-auto font-mono text-[11px] text-sub tnum">{fmtDur(session.duration_seconds)}</span>
          </div>
          <div className="text-[13px] text-text" style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }}>{session.intent}</div>
          {session.reality && <div className="mt-1 text-[12px] text-sub">↳ {session.reality}</div>}
          {session.notes && (
            <div className="mt-2">
              <button onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-1.5 font-mono text-[10.5px] text-dim hover:text-sub transition-colors">
                {expanded ? I.collapse : I.expand}{expanded ? "collapse notes" : "expand notes"}
              </button>
              {expanded && (
                <pre className="mt-2 text-[11.5px] text-sub font-mono leading-relaxed bg-overlay rounded-[6px] px-3 py-2.5 whitespace-pre-wrap border border-border/50">
                  {session.notes}
                </pre>
              )}
            </div>
          )}
        </div>
        {onDelete && <DeleteBtn onDelete={onDelete} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 · PROJECT HANGAR
// ═══════════════════════════════════════════════════════════════════════════════

function ProjectHangar({ projects, setProjects }) {
  const [name, setName]           = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [longDesc, setLongDesc]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState(null);
  const [sortMode, setSortMode]   = useState("date");
  const [formOpen, setFormOpen]   = useState(false);

  const sorted = useMemo(() => [...projects].sort((a,b) =>
    sortMode === "alpha" ? a.name.localeCompare(b.name) : new Date(b.created_at) - new Date(a.created_at)
  ), [projects, sortMode]);

  const submit = async () => {
    if (!name.trim()) { setErr("project name is required"); return; }
    setSaving(true); setErr(null);
    try {
      const p = await createProject({ name: name.trim(), short_description: shortDesc.trim(), long_description: longDesc.trim() });
      setProjects(arr => [p, ...arr]);
      setName(""); setShortDesc(""); setLongDesc(""); setFormOpen(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] text-text font-medium tracking-tight">project hangar</div>
          <div className="label mt-0.5">{projects.length} long-running engineering projects</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border rounded-[6px] p-0.5">
            {[["date","by date"],["alpha","a → z"]].map(([k,v]) => (
              <button key={k} onClick={() => setSortMode(k)}
                className="px-2.5 py-1 rounded-[5px] font-mono text-[10.5px] transition-colors"
                style={sortMode === k ? { background: "#232535", color: "#DBDEE9" } : { color: "#7E8294" }}>{v}</button>
            ))}
          </div>
          <button onClick={() => setFormOpen(f => !f)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-purple/50 text-purple text-[12px] font-mono hover:border-purple">
            {I.plus} new project
          </button>
        </div>
      </div>

      {formOpen && (
        <div className="rounded-[10px] border border-purple/30 bg-surface p-5 space-y-3">
          <div className="label label-up">new project</div>
          <div className="space-y-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="project name"
              className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none focus:border-purple/60"
              style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }} />
            <input value={shortDesc} onChange={e => setShortDesc(e.target.value)}
              placeholder="short description — one line summary for dropdowns"
              className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text font-mono outline-none focus:border-rose/50" />
            <textarea value={longDesc} onChange={e => setLongDesc(e.target.value)}
              placeholder={"long description — architecture goals, context, open questions"}
              rows={6}
              className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[12.5px] text-text font-mono outline-none focus:border-rose/50 resize-y leading-relaxed" />
          </div>
          {err && <div className="font-mono text-[11px] text-rose/70">{err}</div>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-purple/60 text-purple text-[12px] font-mono disabled:opacity-50">
              {I.check} {saving ? "saving…" : "create project"}
            </button>
            <button onClick={() => { setFormOpen(false); setErr(null); }}
              className="px-3 py-1.5 rounded-[6px] border border-border text-sub text-[12px] font-mono hover:text-text">cancel</button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="rounded-[10px] border border-border/50 bg-surface/40 p-10 text-center">
          <div className="label">no projects yet — create one above</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(p => (
            <ProjectCard key={p.id} project={p}
              onUpdate={(updated) => setProjects(arr => arr.map(x => x.id === updated.id ? updated : x))}
              onDelete={(id) => setProjects(arr => arr.filter(x => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, onUpdate, onDelete }) {
  const [open, setOpen]           = useState(false);
  const [editing, setEditing]     = useState(false);
  const [confirming, setConfirming] = useState(false); // delete confirm state
  const [name, setName]           = useState(project.name);
  const [shortDesc, setShortDesc] = useState(project.short_description);
  const [longDesc, setLongDesc]   = useState(project.long_description);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [err, setErr]             = useState(null);

  const createdAt = new Date(project.created_at);
  const dateStr = isNaN(createdAt) ? "—" : createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const startEditing = (e) => {
    e.stopPropagation();
    setName(project.name);
    setShortDesc(project.short_description);
    setLongDesc(project.long_description);
    setErr(null);
    setEditing(true);
    setOpen(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setErr(null);
  };

  const saveEdits = async () => {
    if (!name.trim()) { setErr("name cannot be empty"); return; }
    setSaving(true); setErr(null);
    try {
      const updated = await updateProject({
        id: project.id,
        name: name.trim(),
        short_description: shortDesc.trim(),
        long_description: longDesc.trim(),
      });
      onUpdate(updated);
      setEditing(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      // Auto-cancel confirm after 3s if user doesn't follow through
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await deleteProject(project.id);
      onDelete(project.id);
    } catch (e) {
      setErr(e.message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div className={`rounded-[10px] border bg-surface transition-colors ${confirming ? "border-rose/50" : "border-border hover:border-border/80"}`}>
      {/* ── Card header ── */}
      <div className="flex items-start gap-4 p-4">
        {/* Expand toggle area */}
        <div className="w-2 h-2 rounded-full bg-purple/70 mt-1.5 shrink-0 cursor-pointer"
          onClick={() => !editing && setOpen(o => !o)} />

        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => !editing && setOpen(o => !o)}>
          <div className="text-[14px] text-text font-medium tracking-tight">{project.name}</div>
          {project.short_description && (
            <div className="font-mono text-[11px] text-sub mt-0.5">{project.short_description}</div>
          )}
        </div>

        {/* Action buttons — always visible on hover */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="label">{dateStr}</span>

          {/* Edit button */}
          {!editing && (
            <button onClick={startEditing} title="edit project"
              className="p-1.5 rounded-[5px] text-dim hover:text-rose transition-colors">
              {I.edit}
            </button>
          )}

          {/* Delete button — two-click confirm */}
          {!editing && (
            <button onClick={handleDelete} disabled={deleting}
              title={confirming ? "click again to confirm delete" : "delete project"}
              className="p-1.5 rounded-[5px] font-mono text-[10px] transition-all disabled:opacity-40"
              style={confirming
                ? { color: "#F5A9BB", background: "#F5A9BB11", border: "1px solid #F5A9BB55", borderRadius: "5px", padding: "4px 8px" }
                : { color: "#7E8294" }}>
              {deleting ? "…" : confirming ? "! confirm delete" : I.trash}
            </button>
          )}

          {/* Expand chevron */}
          {!editing && (
            <span className="text-dim cursor-pointer" onClick={() => setOpen(o => !o)}>
              {open ? I.collapse : I.expand}
            </span>
          )}
        </div>
      </div>

      {/* ── Edit form (shown when editing) ── */}
      {editing && (
        <div className="px-4 pb-4 border-t border-border/40 space-y-2.5 pt-3">
          <div className="label label-up mb-2">editing project</div>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="project name"
            className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none focus:border-rose/50 transition-colors" />
          <input value={shortDesc} onChange={e => setShortDesc(e.target.value)}
            placeholder="short description — one line summary for dropdowns"
            className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text font-mono outline-none focus:border-rose/50 transition-colors" />
          <textarea value={longDesc} onChange={e => setLongDesc(e.target.value)}
            placeholder="long description — architecture goals, context, open questions"
            rows={5}
            className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[12.5px] text-text font-mono outline-none focus:border-rose/50 resize-y leading-relaxed transition-colors" />
          {err && <div className="font-mono text-[11px] text-rose/70">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={saveEdits} disabled={saving || !name.trim()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-purple/60 text-purple text-[12px] font-mono disabled:opacity-50 transition-colors">
              {I.check} {saving ? "saving…" : "save changes"}
            </button>
            <button onClick={cancelEditing}
              className="px-3 py-1.5 rounded-[6px] border border-border text-sub text-[12px] font-mono hover:text-text transition-colors">
              cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Expanded long description (shown when open and not editing) ── */}
      {open && !editing && project.long_description && (
        <div className="px-4 pb-4 pt-0 border-t border-border/40">
          <div className="label label-up mb-2 pt-3">description</div>
          <pre className="text-[12.5px] text-sub font-mono leading-relaxed whitespace-pre-wrap bg-overlay rounded-[6px] p-3 border border-border/40">
            {project.long_description}
          </pre>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 · INTERVIEW DECK
// ═══════════════════════════════════════════════════════════════════════════════

function InterviewDeck({ projects }) {
  const [sessions, setSessions]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sortAlpha, setSortAlpha] = useState(false);

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
      const key = s.project_id ?? "__none__";
      if (!byProject[key]) byProject[key] = [];
      byProject[key].push(s);
    }
    let result = projects.filter(p => byProject[p.id]).map(p => ({ project: p, sessions: byProject[p.id] }));
    if (sortAlpha) result.sort((a,b) => a.project.name.localeCompare(b.project.name));
    else result.sort((a,b) => new Date(b.sessions[0].timestamp) - new Date(a.sessions[0].timestamp));
    return result;
  }, [projects, sessions, sortAlpha]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><div className="label animate-pulse">loading sessions…</div></div>;

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] text-text font-medium tracking-tight">interview deck</div>
          <div className="label mt-0.5">engineering projects · {grouped.length} with sessions</div>
        </div>
        <div className="flex items-center gap-1 border border-border rounded-[6px] p-0.5">
          {[["recent","most recent"],["alpha","a → z"]].map(([k,v]) => (
            <button key={k} onClick={() => setSortAlpha(k === "alpha")}
              className="px-2.5 py-1 rounded-[5px] font-mono text-[10.5px] transition-colors"
              style={(k === "alpha") === sortAlpha ? { background: "#232535", color: "#DBDEE9" } : { color: "#7E8294" }}>{v}</button>
          ))}
        </div>
      </div>
      {grouped.length === 0 ? (
        <div className="rounded-[10px] border border-border/50 bg-surface/40 p-10 text-center">
          <div className="label">no engineering sessions yet</div>
          <div className="label mt-1">start an [Engineering] session in the daily log and link it to a project</div>
        </div>
      ) : grouped.map(({ project, sessions }) => (
        <InterviewProjectSection key={project.id} project={project} sessions={sessions} onDelete={handleDelete} />
      ))}
    </div>
  );
}

function InterviewProjectSection({ project, sessions, onDelete }) {
  const [open, setOpen] = useState(true);
  const totalSec = sessions.reduce((a,s) => a + s.duration_seconds, 0);
  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-start gap-4 p-5 border-b border-border/50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="text-[15px] text-text font-medium tracking-tight" style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }}>{project.name}</div>
            <span className="font-mono text-[10.5px] px-1.5 py-[2px] rounded border border-purple/30 text-purple">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
            <span className="font-mono text-[10.5px] text-sub">{fmtHours(totalSec)} total</span>
          </div>
          {project.short_description && <div className="font-mono text-[11px] text-sub">{project.short_description}</div>}
        </div>
        <button onClick={() => setOpen(o => !o)} className="text-dim hover:text-sub transition-colors shrink-0 mt-1">
          {open ? I.collapse : I.expand}
        </button>
      </div>
      {open && (
        <>
          {project.long_description && (
            <div className="px-5 py-4 border-b border-border/40 bg-overlay/40">
              <div className="label label-up mb-2">context & architecture</div>
              <pre className="text-[12px] text-sub font-mono leading-relaxed whitespace-pre-wrap">{project.long_description}</pre>
            </div>
          )}
          <div className="divide-y divide-border/30">
            {sessions.map(s => <InterviewSessionRow key={s.id} session={s} onDelete={() => onDelete(s.id)} />)}
          </div>
        </>
      )}
    </div>
  );
}

function InterviewSessionRow({ session, onDelete }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const ts = new Date(session.timestamp);
  const dateStr = isNaN(ts) ? "—" : ts.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + fmtTime(ts);
  return (
    <div className="group px-5 py-3.5 hover:bg-surface/60 transition-colors">
      <div className="flex items-start gap-4">
        <div className="font-mono text-[10.5px] text-dim tnum pt-0.5 w-20 shrink-0">{dateStr}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-text" style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }}>
            {session.intent || <span className="text-dim italic">no intent logged</span>}
          </div>
          {session.reality && (
            <div className="mt-1 flex items-start gap-2">
              <span className="font-mono text-[10px] text-purple mt-[3px]">↳</span>
              <span className="text-[12px] text-sub">{session.reality}</span>
            </div>
          )}
          {session.notes && (
            <div className="mt-2">
              <button onClick={() => setNotesOpen(n => !n)}
                className="flex items-center gap-1.5 font-mono text-[10.5px] text-dim hover:text-rose/80 transition-colors">
                {notesOpen ? I.collapse : I.expand}{notesOpen ? "hide notes" : "expand notes"}
              </button>
              {notesOpen && (
                <pre className="mt-2 text-[11px] text-sub font-mono leading-relaxed bg-overlay rounded-[6px] px-3 py-2.5 whitespace-pre-wrap border border-border/40">
                  {session.notes}
                </pre>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="font-mono text-[11px] text-sub tnum">{fmtHours(session.duration_seconds)}</div>
          {onDelete && <DeleteBtn onDelete={onDelete} />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4 · TASKS
// ═══════════════════════════════════════════════════════════════════════════════

function TasksTab({ tasks, setTasks, projects }) {
  const [newText, setNewText]         = useState("");
  const [newProjectId, setNewProjectId] = useState(null);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // task to delete
  const inputRef                      = useRef(null);

  const pending   = tasks.filter(t => !t.done);
  const completed = tasks.filter(t => t.done);

  const addTask = async () => {
    if (!newText.trim()) return;
    setSaving(true); setErr(null);
    try {
      const t = await createTask({ text: newText.trim(), project_id: newProjectId });
      setTasks(arr => [t, ...arr]);
      setNewText(""); setNewProjectId(null);
      inputRef.current?.focus();
    } catch (e) { setErr(e.message); }
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

  const handleDeleted = (id) => {
    setTasks(arr => arr.filter(t => t.id !== id));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* ── Add task bar ── */}
      <div className="px-7 pt-6 pb-4 border-b border-border/60">
        <div className="label label-up mb-3">add task</div>
        <div className="flex gap-2">
          <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addTask(); }}
            placeholder="what needs to get done?"
            className="flex-1 bg-surface border border-border rounded-[6px] px-4 py-2.5 text-[13px] text-text outline-none focus:border-blue/60 transition-colors"
            style={{ fontFamily: "Lilex, ui-sans-serif, sans-serif" }} />
          <select value={newProjectId ?? ""}
            onChange={e => setNewProjectId(e.target.value ? Number(e.target.value) : null)}
            className="bg-surface border border-border rounded-[6px] px-3 py-2 text-[12px] text-sub font-mono outline-none focus:border-purple/60"
            style={{ color: newProjectId ? "#DBDEE9" : "#7E8294" }}>
            <option value="">no project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={addTask} disabled={saving || !newText.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-[6px] border border-blue/50 font-mono text-[12px] disabled:opacity-40 transition-colors"
            style={{ color: "#BAADF4" }}>
            {I.plus}{saving ? "adding…" : "add"}
          </button>
        </div>
        {err && <div className="mt-1.5 font-mono text-[11px] text-rose/70">{err}</div>}
      </div>

      {/* ── Two-column board ── */}
      <div className="flex-1 min-h-0 flex divide-x divide-border/60 overflow-hidden">

        {/* Pending column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-border/40 flex items-center gap-2 bg-surface/30">
            <span style={{ color: "#BAADF4" }}>{I.tasks}</span>
            <span className="label label-up">pending</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-1"
              style={{ background: "#BAADF422", color: "#BAADF4" }}>
              {pending.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {pending.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="label">no pending tasks</div>
                <div className="label mt-1">add one above ↑</div>
              </div>
            ) : pending.map(task => (
              <TaskRow key={task.id} task={task} projects={projects}
                onComplete={() => handleComplete(task.id)}
                onRequestDelete={() => setDeleteTarget(task)}
                onUpdated={(updated) => setTasks(arr => arr.map(t => t.id === updated.id ? updated : t))} />
            ))}
          </div>
        </div>

        {/* Completed column */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b border-border/40 flex items-center gap-2 bg-surface/30">
            <span style={{ color: "#C4A7E7" }}>{I.check}</span>
            <span className="label label-up">completed</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full ml-1"
              style={{ background: "#C4A7E722", color: "#C4A7E7" }}>
              {completed.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {completed.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <div className="label">nothing completed yet</div>
                <div className="label mt-1">check off a task to see it here</div>
              </div>
            ) : completed.map(task => (
              <TaskRow key={task.id} task={task} projects={projects} done
                onUncomplete={() => handleUncomplete(task.id)}
                onRequestDelete={() => setDeleteTarget(task)}
                onUpdated={(updated) => setTasks(arr => arr.map(t => t.id === updated.id ? updated : t))} />
            ))}
          </div>
        </div>
      </div>

      {/* Delete-with-reason modal */}
      {deleteTarget && (
        <DeleteTaskModal
          task={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}

function TaskRow({ task, projects, done, onComplete, onUncomplete, onRequestDelete, onUpdated }) {
  const [editing, setEditing]       = useState(false);
  const [editText, setEditText]     = useState(task.text);
  const [editProject, setEditProject] = useState(task.project_id);
  const [saving, setSaving]         = useState(false);
  const inputRef                    = useRef(null);
  const project = projects.find(p => p.id === task.project_id);

  const startEdit = (e) => {
    e.stopPropagation();
    setEditText(task.text);
    setEditProject(task.project_id);
    setEditing(true);
    // Focus the text input on next tick after render
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    if (!editText.trim()) return;
    setSaving(true);
    try {
      const updated = await updateTask(task.id, {
        text: editText.trim(),
        project_id: editProject,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <div className="group flex items-start gap-3 px-6 py-3.5 border-b border-border/30 hover:bg-surface/40 transition-colors">
      {/* Checkbox */}
      <button
        onClick={done ? onUncomplete : onComplete}
        title={done ? "mark incomplete" : "mark complete"}
        className="mt-[3px] w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors"
        style={done
          ? { borderColor: "#C4A7E7", background: "#C4A7E722" }
          : { borderColor: "#3D4251" }}>
        {done && <span style={{ color: "#C4A7E7", transform: "scale(0.7)", display: "block" }}>{I.check}</span>}
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          /* ── Inline edit form ── */
          <div className="space-y-2 py-0.5">
            <input
              ref={inputRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
              className="w-full bg-overlay border border-border rounded-[5px] px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-rose/50 transition-colors"
            />
            <div className="flex items-center gap-2">
              <select
                value={editProject ?? ""}
                onChange={e => setEditProject(e.target.value ? Number(e.target.value) : null)}
                className="flex-1 bg-overlay border border-border rounded-[5px] px-2.5 py-1.5 text-[12px] font-mono outline-none focus:border-purple/50 transition-colors"
                style={{ color: editProject ? "#DBDEE9" : "#7E8294" }}>
                <option value="">no project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={saveEdit} disabled={saving || !editText.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[5px] border border-purple/50 text-purple font-mono text-[11px] disabled:opacity-40 transition-colors hover:border-purple shrink-0">
                {I.check}{saving ? "…" : "save"}
              </button>
              <button onClick={cancelEdit}
                className="px-2.5 py-1.5 rounded-[5px] border border-border text-sub font-mono text-[11px] hover:text-text transition-colors shrink-0">
                cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── Display mode ── */
          <div>
            <div className={`text-[13px] ${done ? "text-dim line-through" : "text-text"}`}>{task.text}</div>
            <div className="flex items-center gap-3 mt-0.5">
              {project
                ? <span className="font-mono text-[10px] text-purple">↳ {project.name}</span>
                : <span className="font-mono text-[10px] text-dim">no project</span>
              }
              {done && task.done_at && (
                <span className="font-mono text-[10px] text-dim">done {fmtDate(task.done_at)}</span>
              )}
              {!done && (
                <span className="font-mono text-[10px] text-dim">added {fmtDate(task.created_at)}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Actions — only visible on hover, hidden while editing */}
      {!editing && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={startEdit} title="edit task"
            className="p-1 rounded text-dim hover:text-rose transition-colors">
            {I.edit}
          </button>
          {done && (
            <button onClick={onUncomplete} title="move back to pending"
              className="p-1 rounded text-dim hover:text-sub transition-colors">
              {I.undo}
            </button>
          )}
          <button onClick={onRequestDelete} title="delete task"
            className="p-1 rounded text-dim hover:text-rose transition-colors">
            {I.trash}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5 · HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

// Returns "Mon 5", "Tue 6" etc for a date
function fmtDayLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

// Given an ISO timestamp string, return "YYYY-MM-DD" in local time
function toLocalDateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// Generate last N days as "YYYY-MM-DD" keys, newest last
function lastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
  }
  return days;
}

function HistoryTab() {
  const [allSessions, setAllSessions] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [weekOffset, setWeekOffset]   = useState(0); // 0 = this week, 1 = last week, etc.
  const [hoveredDay, setHoveredDay]   = useState(null);

  useEffect(() => {
    getSessions()
      .then(s => { setAllSessions(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Build the 7-day window for the current weekOffset
  const days = useMemo(() => {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i - weekOffset * 7);
      result.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`);
    }
    return result;
  }, [weekOffset]);

  // Aggregate sessions by day for this window
  const dayData = useMemo(() => {
    return days.map(dateKey => {
      const daySessions = allSessions.filter(s => toLocalDateKey(s.timestamp) === dateKey);
      const routine    = daySessions.filter(s => s.type === "Routine").reduce((a,s)=>a+s.duration_seconds,0);
      const engineering = daySessions.filter(s => s.type === "Engineering").reduce((a,s)=>a+s.duration_seconds,0);
      return { dateKey, routine, engineering, sessions: daySessions };
    });
  }, [days, allSessions]);

  // Summary stats for the current week window
  const weekTotal    = dayData.reduce((a,d)=>a+d.routine+d.engineering, 0);
  const weekRoutine  = dayData.reduce((a,d)=>a+d.routine, 0);
  const weekEng      = dayData.reduce((a,d)=>a+d.engineering, 0);
  const weekSessions = dayData.reduce((a,d)=>a+d.sessions.length, 0);

  // Chart dimensions
  const maxSec = Math.max(...dayData.map(d => d.routine + d.engineering), 3600); // at least 1h scale
  const chartH = 180;
  const barW   = 48;
  const gap    = 16;
  const chartW = days.length * (barW + gap) - gap;

  // Week label
  const weekStart = new Date(days[0]);
  const weekEnd   = new Date(days[6]);
  const weekLabel = weekOffset === 0 ? "this week"
    : weekOffset === 1 ? "last week"
    : `${weekStart.toLocaleDateString(undefined,{month:"short",day:"numeric"})} – ${weekEnd.toLocaleDateString(undefined,{month:"short",day:"numeric"})}`;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="label animate-pulse">loading history…</div></div>;
  }

  const hovered = hoveredDay !== null ? dayData[hoveredDay] : null;

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] text-text font-medium tracking-tight">focus history</div>
          <div className="label mt-0.5">daily breakdown · routine vs engineering</div>
        </div>
        {/* Week navigator */}
        <div className="flex items-center gap-2">
          <button onClick={() => setWeekOffset(w => w + 1)}
            className="px-3 py-1.5 rounded-[6px] border border-border text-sub font-mono text-[11px] hover:text-text hover:border-border/80 transition-colors">
            ← older
          </button>
          <span className="font-mono text-[11px] text-sub px-3">{weekLabel}</span>
          <button onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            className="px-3 py-1.5 rounded-[6px] border border-border text-sub font-mono text-[11px] hover:text-text hover:border-border/80 transition-colors disabled:opacity-30">
            newer →
          </button>
        </div>
      </div>

      {/* ── Week summary cards ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "total focus",   value: fmtHours(weekTotal),    color: "#DBDEE9" },
          { label: "sessions",      value: weekSessions.toString(), color: "#DBDEE9" },
          { label: "routine",       value: fmtHours(weekRoutine),   color: "#F5A9BB" },
          { label: "engineering",   value: fmtHours(weekEng),       color: "#C4A7E7" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-[10px] border border-border bg-surface px-4 py-3.5">
            <div className="label mb-1.5">{label}</div>
            <div className="font-mono text-[22px] font-light tnum" style={{ color, fontFamily: "InconsolataGo, monospace" }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Bar chart ── */}
      <div className="rounded-[10px] border border-border bg-surface p-5">
        <div className="flex items-center justify-between mb-5">
          <span className="label label-up">daily breakdown</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#F5A9BB" }} />
              <span className="label">routine</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#C4A7E7" }} />
              <span className="label">engineering</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <svg width={chartW + 48} height={chartH + 52} style={{ display: "block" }}>
            {/* Hour guide lines */}
            {[1,2,3,4].map(h => {
              const y = chartH - (h * 3600 / maxSec) * chartH;
              if (y < 0) return null;
              return (
                <g key={h}>
                  <line x1={40} y1={y} x2={chartW + 44} y2={y}
                    stroke="#3D4251" strokeWidth="1" strokeDasharray="3,4" />
                  <text x={36} y={y + 4} textAnchor="end"
                    style={{ fontSize: 9, fill: "#7E8294", fontFamily: "InconsolataGo, monospace" }}>
                    {h}h
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {dayData.map((d, i) => {
              const x    = 44 + i * (barW + gap);
              const engH = Math.round((d.engineering / maxSec) * chartH);
              const rotH = Math.round((d.routine / maxSec) * chartH);
              const totalH = engH + rotH;
              const isHovered = hoveredDay === i;
              const isToday = d.dateKey === lastNDays(1)[0];

              return (
                <g key={d.dateKey}
                  onMouseEnter={() => setHoveredDay(i)}
                  onMouseLeave={() => setHoveredDay(null)}
                  style={{ cursor: "default" }}>
                  {/* Hover background */}
                  {isHovered && (
                    <rect x={x - 4} y={0} width={barW + 8} height={chartH}
                      fill="#FFFFFF08" rx={4} />
                  )}
                  {/* Engineering segment (bottom) */}
                  {engH > 0 && (
                    <rect x={x} y={chartH - totalH} width={barW} height={engH}
                      fill={isHovered ? "#C4A7E7" : "#C4A7E755"}
                      rx={engH === totalH ? 3 : 0}
                      style={{ transition: "fill 0.15s" }} />
                  )}
                  {/* Routine segment (top) */}
                  {rotH > 0 && (
                    <rect x={x} y={chartH - totalH + engH} width={barW} height={rotH}
                      fill={isHovered ? "#F5A9BB" : "#F5A9BB55"}
                      rx={engH === 0 ? 3 : 0}
                      style={{ transition: "fill 0.15s" }} />
                  )}
                  {/* Empty bar ghost */}
                  {totalH === 0 && (
                    <rect x={x} y={chartH - 3} width={barW} height={3}
                      fill="#2A2D3E" rx={1.5} />
                  )}
                  {/* Rounded top cap */}
                  {totalH > 3 && (
                    <rect x={x} y={chartH - totalH} width={barW} height={4}
                      fill={rotH > 0 ? (isHovered ? "#F5A9BB" : "#F5A9BB55") : (isHovered ? "#C4A7E7" : "#C4A7E755")}
                      rx={3}
                      style={{ transition: "fill 0.15s" }} />
                  )}
                  {/* Day label */}
                  <text x={x + barW / 2} y={chartH + 18} textAnchor="middle"
                    style={{
                      fontSize: 10, fontFamily: "InconsolataGo, monospace",
                      fill: isToday ? "#F5A9BB" : isHovered ? "#DBDEE9" : "#7E8294",
                      fontWeight: isToday ? "bold" : "normal",
                    }}>
                    {fmtDayLabel(d.dateKey)}
                  </text>
                  {/* Today dot */}
                  {isToday && (
                    <circle cx={x + barW / 2} cy={chartH + 30} r={2} fill="#F5A9BB" />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Hover tooltip */}
        {hovered && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center gap-6">
            <span className="font-mono text-[11px] text-sub">{fmtDayLabel(hovered.dateKey)}</span>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#F5A9BB" }} />
              <span className="label">routine</span>
              <span className="font-mono text-[12px] text-text ml-1">{fmtHours(hovered.routine)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: "#C4A7E7" }} />
              <span className="label">engineering</span>
              <span className="font-mono text-[12px] text-text ml-1">{fmtHours(hovered.engineering)}</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="label">total</span>
              <span className="font-mono text-[13px] text-text">{fmtHours(hovered.routine + hovered.engineering)}</span>
            </div>
            <span className="font-mono text-[11px] text-dim">{hovered.sessions.length} session{hovered.sessions.length !== 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* ── Session list for the week ── */}
      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-3">
          <span className="label label-up">sessions this window</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: "#C4A7E722", color: "#C4A7E7" }}>
            {weekSessions}
          </span>
        </div>
        {weekSessions === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="label">no sessions logged in this window</div>
          </div>
        ) : (
          <div className="divide-y divide-border/30 max-h-[360px] overflow-y-auto">
            {[...dayData].reverse().map(({ dateKey, sessions }) =>
              sessions.length === 0 ? null : (
                <div key={dateKey}>
                  {/* Day header */}
                  <div className="px-5 py-2 bg-overlay/30 flex items-center justify-between">
                    <span className="font-mono text-[10.5px] text-sub">{fmtDayLabel(dateKey)}</span>
                    <span className="font-mono text-[10.5px] text-dim">
                      {fmtHours(sessions.reduce((a,s)=>a+s.duration_seconds,0))}
                    </span>
                  </div>
                  {/* Sessions */}
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-start gap-4 px-5 py-3 hover:bg-surface/60 transition-colors">
                      <span className="font-mono text-[10px] text-dim tnum pt-0.5 w-12 shrink-0">{fmtTime(new Date(s.timestamp))}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] text-text">{s.intent || <span className="text-dim italic">no intent</span>}</div>
                        {s.reality && <div className="font-mono text-[10.5px] text-sub mt-0.5">↳ {s.reality}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] px-1.5 py-[2px] rounded"
                          style={{
                            color: s.type === "Engineering" ? "#C4A7E7" : "#F5A9BB",
                            background: s.type === "Engineering" ? "#C4A7E711" : "#F5A9BB11",
                          }}>
                          {s.type === "Engineering" ? "eng" : "rtn"}
                        </span>
                        <span className="font-mono text-[10.5px] text-dim tnum">{fmtDur(s.duration_seconds)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [active, setActive]               = useState("daily");
  const [now, setNow]                     = useState(new Date());
  const [projects, setProjects]           = useState([]);
  const [tasks, setTasks]                 = useState([]);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [externalSession, setExternalSession] = useState(null);
  const [dbReady, setDbReady]             = useState(false);
  const [onBreak, setOnBreak]             = useState(false);
  const toggleBreak                       = () => setOnBreak(b => !b);
  // Task delete modal state — lifted so MiniTaskList and TasksTab both use it
  const [deleteTarget, setDeleteTarget]   = useState(null);

  useEffect(() => {
    initDb().then(() => setDbReady(true)).catch(err => console.error("DB init:", err));
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    getProjects().then(setProjects).catch(() => {});
    getTasks().then(setTasks).catch(() => {});
  }, [dbReady]);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const tabs = ["daily", "hangar", "interview", "tasks", "history"];
    const onKey = (e) => {
      // ⌘1–4 to switch tabs (⌥/Alt is intercepted by Tauri before reaching the webview)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && ["1","2","3","4","5"].includes(e.key)) {
        e.preventDefault(); setActive(tabs[parseInt(e.key) - 1]);
      }
      // ⌘⇧N for quick note
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "N") {
        e.preventDefault(); setQuickNoteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Shared task action handlers — used by both MiniTaskList and TasksTab
  const handleTaskComplete = async (id) => {
    const updated = await completeTask(id);
    setTasks(arr => arr.map(t => t.id === id ? updated : t));
  };
  const handleTaskUncomplete = async (id) => {
    const updated = await uncompleteTask(id);
    setTasks(arr => arr.map(t => t.id === id ? updated : t));
  };
  const handleTaskDeleted = (id) => {
    setTasks(arr => arr.filter(t => t.id !== id));
  };

  const pendingCount = tasks.filter(t => !t.done).length;

  if (!dbReady) {
    return (
      <div className="h-full flex items-center justify-center bg-base">
        <div className="label animate-pulse">initialising database…</div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-base text-text">
      <Sidebar active={active} setActive={setActive} pendingCount={pendingCount} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TopBar now={now} active={active} onQuickNote={() => setQuickNoteOpen(true)}
          onBreak={toggleBreak} onBreakActive={onBreak} />
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* DailyLog is always mounted so the timer keeps running when switching tabs.
              Other tabs are hidden/shown with display:none via the hidden class. */}
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${active === "daily" ? "" : "hidden"}`}>
            <DailyLog
              projects={projects}
              onSessionSaved={s => setExternalSession(s)}
              externalSession={externalSession}
              breakActive={onBreak}
              tasks={tasks}
              onTaskComplete={handleTaskComplete}
              onTaskUncomplete={handleTaskUncomplete}
              onTaskRequestDelete={setDeleteTarget}
            />
          </div>
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${active === "hangar" ? "" : "hidden"}`}>
            <ProjectHangar projects={projects} setProjects={setProjects} />
          </div>
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${active === "interview" ? "" : "hidden"}`}>
            <InterviewDeck projects={projects} />
          </div>
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${active === "tasks" ? "" : "hidden"}`}>
            <TasksTab
              tasks={tasks}
              setTasks={setTasks}
              projects={projects}
            />
          </div>
          <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${active === "history" ? "" : "hidden"}`}>
            <HistoryTab />
          </div>
        </div>
      </main>

      {quickNoteOpen && (
        <QuickNoteModal
          onClose={() => setQuickNoteOpen(false)}
          onSaved={(saved) => { setExternalSession(saved); setActive("daily"); }}
        />
      )}

      {/* Global delete-task modal — triggered from anywhere */}
      {deleteTarget && (
        <DeleteTaskModal
          task={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleTaskDeleted}
        />
      )}
    </div>
  );
}
