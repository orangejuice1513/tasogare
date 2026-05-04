/**
 * App.jsx — Mission Control (Tauri v2 edition)
 *
 * Drop into src/ alongside db.js.
 * All fetch() calls have been replaced with direct SQLite queries
 * via the functions exported from db.js.
 *
 * Nothing else has changed: UI, layout, logic, Rosé Pine Moon
 * styling, keyboard shortcuts, modals — all identical.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import {
  initDb,
  getProjects,
  createProject,
  getSessions,
  createSession,
  deleteSession,
} from "./db";

// ─── Helpers ────────────────────────────────────────────────────────────────
function pad(n) { return n.toString().padStart(2, "0"); }
function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDur(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return `${m}m ${pad(sec)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${pad(m % 60)}m`;
}
function fmtHours(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`;
}

// ─── Icons ──────────────────────────────────────────────────────────────────
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
  flag:     <Icon d={<><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></>} />,
  note:     <Icon d={<><path d="M5 4h11l3 3v13H5z"/><path d="M9 9h7M9 13h7M9 17h4"/></>} />,
  play:     <Icon d={<><path d="M7 5l12 7-12 7V5z"/></>} />,
  pause:    <Icon d={<><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></>} />,
  stop:     <Icon d={<><rect x="6" y="6" width="12" height="12" rx="1"/></>} />,
  check:    <Icon d={<><path d="M4 12l5 5L20 6"/></>} />,
  plus:     <Icon d={<><path d="M12 5v14M5 12h14"/></>} />,
  sort:     <Icon d={<><path d="M4 6h16M4 12h10M4 18h6"/></>} />,
  expand:   <Icon d={<><path d="M6 9l6 6 6-6"/></>} />,
  collapse: <Icon d={<><path d="M18 15l-6-6-6 6"/></>} />,
  gear:     <Icon d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />,
  trash:    <Icon d={<><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></>} />,
};

// ─── NAV definition ──────────────────────────────────────────────────────────
const NAV = [
  { id: "daily",     label: "daily log",      icon: I.clock,  accent: "#BAADF4" },
  { id: "hangar",    label: "projects",        icon: I.hangar, accent: "#26E0A6" },
  { id: "interview", label: "interview deck",  icon: I.deck,   accent: "#F5A9BB" },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ active, setActive }) {
  return (
    <aside className="w-[220px] shrink-0 border-r border-border/70 bg-base flex flex-col">
      <div className="px-5 pt-6 pb-7">
        <div className="flex items-center gap-2.5">
          <div className="relative w-6 h-6">
            <div className="absolute inset-0 rounded-[3px] border border-rose/70" />
            <div className="absolute inset-[3px] rounded-[1.5px] bg-rose/20 stripes" />
          </div>
          <div className="leading-tight">
            {/* ↙ APP TITLE — edit here */}
            <div className="text-[12.5px] font-medium text-text tracking-tight">Mission Control</div>
            <div className="label">manager</div>
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
              <span className={`text-[13px] tracking-tight ${isActive ? "text-text" : "text-sub group-hover:text-text"}`}>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto px-5 pb-5 pt-6 border-t border-border/50 mx-3">
        <div className="label mb-1.5">keyboard</div>
        {[["⌥ 1","daily log"],["⌥ 2","projects"],["⌥ 3","interview deck"]].map(([k,v]) => (
          <div key={k} className="flex items-center justify-between mt-1">
            <span className="label">{v}</span>
            <span className="font-mono text-[10px] text-dim bg-overlay px-1.5 py-0.5 rounded">{k}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────
function TopBar({ now, active, onQuickNote }) {
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
        <button
          onClick={onQuickNote}
          className="px-3 py-1.5 rounded-[6px] border border-border text-[12px] text-sub hover:text-text hover:border-border/80 flex items-center gap-2 transition-colors">
          {I.note}<span>quick note</span>
          <span className="font-mono text-[10px] text-dim ml-0.5">⌘⇧N</span>
        </button>
        <button className="px-3 py-1.5 rounded-[6px] border border-border text-[12px] flex items-center gap-2" style={{ color: "#F5A9BB" }}>
          {I.flag}<span>break</span>
        </button>
      </div>
    </header>
  );
}

// ─── Timer ring ──────────────────────────────────────────────────────────────
function TimerRing({ seconds, running }) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const target = 90 * 60, progress = Math.min(seconds / target, 1), C = 2 * Math.PI * 78;
  return (
    <div className="rounded-[10px] border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="label label-up">session timer</span>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${running ? "bg-teal animate-pulse" : "bg-yellow"}`} />
          <span className="label">{running ? "running" : "paused"}</span>
        </div>
      </div>
      <div className="relative aspect-square w-full max-w-[240px] mx-auto">
        <svg viewBox="0 0 180 180" className="absolute inset-0 -rotate-90">
          <circle cx="90" cy="90" r="78" fill="none" stroke="#2A2D3E" strokeWidth="2" />
          <circle cx="90" cy="90" r="78" fill="none" stroke="#BAADF4" strokeWidth="2"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            style={{ transition: "stroke-dashoffset 0.4s linear" }} />
          {Array.from({ length: 60 }).map((_, i) => {
            const a = (i / 60) * Math.PI * 2;
            const x1 = 90 + Math.cos(a) * 84, y1 = 90 + Math.sin(a) * 84;
            const x2 = 90 + Math.cos(a) * (i % 5 === 0 ? 88 : 86), y2 = 90 + Math.sin(a) * (i % 5 === 0 ? 88 : 86);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={i % 5 === 0 ? "#3D4251" : "#2A2D3E"} strokeWidth={i % 5 === 0 ? 1.2 : 0.6} />;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="label mb-1.5">elapsed</div>
          <div className="flex items-baseline gap-1 tnum" style={{ fontFamily: "Geist Mono, monospace" }}>
            <span className="text-[40px] font-light tracking-tight text-text leading-none">{pad(h)}</span>
            <span className="text-[24px] text-dim leading-none">:</span>
            <span className="text-[40px] font-light tracking-tight text-text leading-none">{pad(m)}</span>
            <span className="text-[24px] text-dim leading-none">:</span>
            <span className="text-[40px] font-light tracking-tight text-blue leading-none">{pad(s)}</span>
          </div>
          <div className="mt-2 label">target · 90m deep block</div>
          <div className="mt-1 font-mono text-[10.5px] text-sub tnum">{Math.round(progress * 100)}% complete</div>
        </div>
      </div>
    </div>
  );
}

// ─── TYPE chip ───────────────────────────────────────────────────────────────
const TYPE_META = {
  intent:  { color: "#BAADF4", label: "intent" },
  reality: { color: "#26E0A6", label: "reality" },
  break:   { color: "#F5A9BB", label: "break" },
  note:    { color: "#9CD9F0", label: "note" },
  context: { color: "#E0C189", label: "context" },
  blocker: { color: "#F6A487", label: "blocker" },
};
function TypeChip({ type }) {
  const meta = TYPE_META[type] || TYPE_META.note;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-[4px] font-mono text-[10.5px] tracking-wider"
      style={{ color: meta.color, border: `1px solid ${meta.color}33` }}>
      <span className="w-1 h-1 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
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
      // ── was: API.postSession(...)
      const saved = await createSession({
        type: "Routine",
        intent: "Quick Note",
        notes: text.trim(),
        duration_seconds: 0,
      });
      onSaved(saved);
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(24,28,43,0.82)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[520px] mx-4 rounded-[12px] border border-border bg-surface shadow-2xl flex flex-col"
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
          <div className="label mb-2">note — will be saved as a Routine session</div>
          <textarea
            ref={taRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
            placeholder={"jot anything — a decision, a blocker, a loose thought\n\ne.g. decided to defer the cache layer to Q4\nbug: token refresh fails on safari 17"}
            rows={7}
            className="w-full bg-overlay border border-border rounded-[8px] px-4 py-3 text-[13px] text-text font-mono leading-relaxed outline-none focus:border-blue/60 resize-none transition-colors"
          />
          {err && <div className="mt-1.5 font-mono text-[11px] text-orange">{err}</div>}
        </div>
        <div className="px-5 pb-5 flex items-center justify-between">
          <span className="font-mono text-[10px] text-dim">⌘↵ to save</span>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-3 py-1.5 rounded-[6px] border border-border text-[12px] text-sub font-mono hover:text-text transition-colors">
              cancel
            </button>
            <button onClick={save} disabled={saving || !text.trim()}
              className="flex items-center gap-2 px-4 py-1.5 rounded-[6px] border border-blue/50 text-blue text-[12px] font-mono hover:border-blue disabled:opacity-40 transition-colors">
              {I.check}{saving ? "saving…" : "save note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete button (shared) ───────────────────────────────────────────────────
function DeleteBtn({ onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy]             = useState(false);

  const handleClick = async (e) => {
    e.stopPropagation();
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    await onDelete();
    setBusy(false);
  };

  useEffect(() => {
    if (!confirming) return;
    const id = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(id);
  }, [confirming]);

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title={confirming ? "click again to confirm delete" : "delete session"}
      className="flex items-center gap-1 px-1.5 py-1 rounded-[5px] font-mono text-[10px] transition-all disabled:opacity-40 opacity-0 group-hover:opacity-100"
      style={confirming
        ? { color: "#F5A9BB", border: "1px solid #F5A9BB55", background: "#F5A9BB11" }
        : { color: "#7E8294", border: "1px solid transparent" }}>
      {busy ? "…" : confirming ? <>! confirm</> : I.trash}
    </button>
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

function DailyLog({ projects, onSessionSaved, externalSession }) {
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

  // Absorb sessions saved externally (e.g. quick note modal)
  useEffect(() => {
    if (externalSession)
      setSessions(arr => [externalSession, ...arr.filter(s => s.id !== externalSession.id)]);
  }, [externalSession]);

  // Rotate placeholder hints
  useEffect(() => {
    const id = setInterval(() => setHint(h => (h + 1) % HINTS.length), 4500);
    return () => clearInterval(id);
  }, []);

  // Timer tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const startSession = () => {
    if (!intent.trim()) return;
    setPhase("running");
    setSeconds(0);
    setRunning(true);
    setReality("");
    setDebriefNotes("");
    setErr(null);
  };

  const stopSession = () => {
    setRunning(false);
    setPhase("logging");
  };

  const logSession = async () => {
    setSaving(true);
    setErr(null);
    try {
      // ── was: API.postSession(...)
      const saved = await createSession({
        type: sessionType,
        project_id: sessionType === "Engineering" ? projectId : null,
        intent: intent.trim(),
        reality: reality.trim(),
        notes: debriefNotes.trim(),
        duration_seconds: seconds,
      });
      setSessions(arr => [saved, ...arr]);
      onSessionSaved && onSessionSaved(saved);
      setIntent("");
      setReality("");
      setDebriefNotes("");
      setSeconds(0);
      setPhase("idle");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const discardSession = () => {
    setSeconds(0);
    setRunning(false);
    setPhase("idle");
    setReality("");
    setDebriefNotes("");
  };

  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-y-auto">

        {/* Intent + session type strip */}
        <section className="px-7 pt-7 pb-5">
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
                    ? { borderColor: t === "Engineering" ? "#26E0A6" : "#BAADF4", color: t === "Engineering" ? "#26E0A6" : "#BAADF4", background: t === "Engineering" ? "#26E0A622" : "#BAADF422" }
                    : { borderColor: "#3D4251", color: "#7E8294" }}>
                  [{t}]
                </button>
              ))}
            </div>
          </div>

          {/* Project dropdown — Engineering only */}
          {sessionType === "Engineering" && (
            <div className="mb-3">
              <select
                value={projectId ?? ""}
                onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
                disabled={phase === "running" || phase === "logging"}
                className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text font-mono disabled:opacity-50 outline-none focus:border-teal/70"
                style={{ color: projectId ? "#DBDEE9" : "#7E8294" }}>
                <option value="">— link to project (optional) —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {selectedProject && (
                <div className="mt-1 font-mono text-[10.5px] text-sub">
                  ↳ {selectedProject.short_description || "no short description"}
                </div>
              )}
            </div>
          )}

          {/* Intent input */}
          <div className="relative rounded-[10px] border border-border bg-surface focus-within:border-blue/70 transition-colors">
            <div className="flex items-center pl-5 pr-3 py-4 gap-4">
              <span className="text-blue text-[15px] font-mono leading-none mt-0.5">›</span>
              <input
                value={intent}
                onChange={e => setIntent(e.target.value)}
                onKeyDown={e => e.key === "Enter" && phase === "idle" && startSession()}
                placeholder={HINTS[hint]}
                disabled={phase === "running" || phase === "logging"}
                className="flex-1 bg-transparent outline-none text-[19px] tracking-tight text-text font-light placeholder:text-dim disabled:opacity-60"
                style={{ fontFamily: "Fraunces, ui-serif, serif" }}
              />
              {phase === "idle" && (
                <button onClick={startSession} disabled={!intent.trim()}
                  className="px-3 py-1.5 rounded-[6px] border text-[12px] flex items-center gap-2 disabled:opacity-40 transition-colors"
                  style={{ borderColor: intent.trim() ? "#BAADF4" : "#3D4251", color: intent.trim() ? "#BAADF4" : "#7E8294" }}>
                  <span>commit + start</span><span className="font-mono text-[10.5px]">⏎</span>
                </button>
              )}
            </div>
            {phase === "idle" && (
              <div className="px-5 pb-3 pt-1 flex items-center gap-4 border-t border-border/50">
                <span className="label">mode →</span>
                <span className="font-mono text-[10.5px]" style={{ color: sessionType === "Engineering" ? "#26E0A6" : "#BAADF4" }}>
                  [{sessionType}]{selectedProject ? ` · ${selectedProject.name}` : ""}
                </span>
                <span className="ml-auto label">⏎ to commit and start timer</span>
              </div>
            )}
          </div>
        </section>

        {/* Running / logging controls */}
        {(phase === "running" || phase === "logging") && (
          <section className="px-7 pb-5">
            <div className="rounded-[10px] border bg-surface p-5 space-y-4"
              style={{ borderColor: phase === "running" ? "#BAADF433" : "#26E0A633" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="label label-up mb-1">{phase === "running" ? "in progress" : "log reality"}</div>
                  <div className="text-[14px] text-text" style={{ fontFamily: "Fraunces, serif" }}>{intent}</div>
                  {selectedProject && <div className="font-mono text-[10.5px] text-teal mt-0.5">↳ {selectedProject.name}</div>}
                </div>
                <div className="font-mono text-[28px] text-text tnum" style={{ fontFamily: "Geist Mono, monospace" }}>
                  {fmtDur(seconds)}
                </div>
              </div>

              {phase === "running" && (
                <div className="flex gap-2">
                  <button onClick={() => setRunning(r => !r)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border text-[12px] font-mono"
                    style={{ borderColor: running ? "#E0C189" : "#26E0A6", color: running ? "#E0C189" : "#26E0A6" }}>
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
                      className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none focus:border-blue/60"
                      style={{ fontFamily: "Fraunces, serif" }} />
                  </div>
                  <div>
                    <div className="label mb-1.5">debrief notes / bug log <span className="text-dim">(optional · multiline)</span></div>
                    <textarea
                      value={debriefNotes}
                      onChange={e => setDebriefNotes(e.target.value)}
                      placeholder={"- p95 latency spiked during deploy\n- reproduced locally with sqlite WAL mode\n- next: open issue + tag @ravi"}
                      rows={4}
                      className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[12.5px] text-text font-mono outline-none focus:border-blue/60 resize-y leading-relaxed"
                    />
                  </div>
                  {err && <div className="font-mono text-[11px] text-orange">{err}</div>}
                  <div className="flex gap-2">
                    <button onClick={logSession} disabled={saving}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-teal/60 text-teal text-[12px] font-mono disabled:opacity-50">
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

        {/* Session log */}
        <section className="flex-1 min-h-0 flex flex-col">
          <div className="px-7 py-2 flex items-center justify-between border-y border-border/70 bg-surface/40">
            <span className="label label-up">session log</span>
            <span className="label">{sessions.length} logged today</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="px-7 py-10 text-center">
                <div className="label">no sessions logged yet · commit an intent to start</div>
              </div>
            ) : (
              sessions.map((s) => (
                <SessionRow key={s.id} session={s} projects={projects}
                  onDelete={async () => {
                    // ── was: API.deleteSession(s.id)
                    await deleteSession(s.id);
                    setSessions(arr => arr.filter(x => x.id !== s.id));
                  }} />
              ))
            )}
            <div className="px-7 py-5 border-t border-border/40 flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-teal animate-pulse" />
              <span className="label">in progress · captured live</span>
              <span className="ml-auto label">end of log</span>
            </div>
          </div>
        </section>
      </div>

      {/* Timer ring sidebar */}
      <aside className="w-[300px] shrink-0 border-l border-border/70 bg-base/60 p-4 overflow-y-auto">
        <TimerRing seconds={seconds} running={running} />
        <div className="mt-4 rounded-[10px] border border-border bg-surface p-4">
          <div className="label label-up mb-3">today's tally</div>
          <div className="space-y-2">
            <TallyRow label="sessions"    value={sessions.length.toString().padStart(2,"0")} color="#BAADF4" />
            <TallyRow label="engineering" value={sessions.filter(s=>s.type==="Engineering").length.toString().padStart(2,"0")} color="#26E0A6" />
            <TallyRow label="total focus" value={fmtHours(sessions.reduce((a,s)=>a+s.duration_seconds,0))} color="#9CD9F0" />
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
      <span className="font-mono text-[18px] font-light tnum" style={{ color, fontFamily: "Geist Mono" }}>{value}</span>
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
              style={{ color: session.type === "Engineering" ? "#26E0A6" : "#BAADF4", borderColor: session.type === "Engineering" ? "#26E0A633" : "#BAADF433" }}>
              {session.type}
            </span>
            {project && <span className="font-mono text-[10.5px] text-teal">↳ {project.name}</span>}
            <span className="ml-auto font-mono text-[11px] text-sub tnum">{fmtDur(session.duration_seconds)}</span>
          </div>
          <div className="text-[13px] text-text" style={{ fontFamily: "Fraunces, serif" }}>{session.intent}</div>
          {session.reality && (
            <div className="mt-1 text-[12px] text-sub">↳ {session.reality}</div>
          )}
          {session.notes && (
            <div className="mt-2">
              <button onClick={() => setExpanded(e => !e)}
                className="flex items-center gap-1.5 font-mono text-[10.5px] text-dim hover:text-sub transition-colors">
                {expanded ? I.collapse : I.expand}
                {expanded ? "collapse notes" : "expand notes"}
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

  const sorted = useMemo(() => {
    return [...projects].sort((a, b) =>
      sortMode === "alpha"
        ? a.name.localeCompare(b.name)
        : new Date(b.created_at) - new Date(a.created_at)
    );
  }, [projects, sortMode]);

  const submit = async () => {
    if (!name.trim()) { setErr("project name is required"); return; }
    setSaving(true); setErr(null);
    try {
      // ── was: API.postProject(...)
      const p = await createProject({
        name: name.trim(),
        short_description: shortDesc.trim(),
        long_description: longDesc.trim(),
      });
      setProjects(arr => [p, ...arr]);
      setName(""); setShortDesc(""); setLongDesc("");
      setFormOpen(false);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
      {/* Header */}
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
                style={sortMode === k ? { background: "#232535", color: "#DBDEE9" } : { color: "#7E8294" }}>
                {v}
              </button>
            ))}
          </div>
          <button onClick={() => setFormOpen(f => !f)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-teal/50 text-teal text-[12px] font-mono hover:border-teal">
            {I.plus} new project
          </button>
        </div>
      </div>

      {/* Add form */}
      {formOpen && (
        <div className="rounded-[10px] border border-teal/30 bg-surface p-5 space-y-3">
          <div className="label label-up">new project</div>
          <div className="space-y-2">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="project name"
              className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text outline-none focus:border-teal/60"
              style={{ fontFamily: "Fraunces, serif" }} />
            <input value={shortDesc} onChange={e => setShortDesc(e.target.value)}
              placeholder="short description — one line summary for dropdowns"
              className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[13px] text-text font-mono outline-none focus:border-blue/60" />
            <textarea value={longDesc} onChange={e => setLongDesc(e.target.value)}
              placeholder={"long description — architecture goals, context, open questions\n\ne.g. Migrating auth service from session cookies to JWTs.\nBlocking: need sec sign-off. Target: Q3."}
              rows={6}
              className="w-full bg-overlay border border-border rounded-[6px] px-3 py-2 text-[12.5px] text-text font-mono outline-none focus:border-blue/60 resize-y leading-relaxed" />
          </div>
          {err && <div className="font-mono text-[11px] text-orange">{err}</div>}
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving}
              className="flex items-center gap-2 px-3 py-1.5 rounded-[6px] border border-teal/60 text-teal text-[12px] font-mono disabled:opacity-50">
              {I.check} {saving ? "saving…" : "create project"}
            </button>
            <button onClick={() => { setFormOpen(false); setErr(null); }}
              className="px-3 py-1.5 rounded-[6px] border border-border text-sub text-[12px] font-mono hover:text-text">
              cancel
            </button>
          </div>
        </div>
      )}

      {/* Project list */}
      {sorted.length === 0 ? (
        <div className="rounded-[10px] border border-border/50 bg-surface/40 p-10 text-center">
          <div className="label">no projects yet — create one above</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(p => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project }) {
  const [open, setOpen] = useState(false);
  const createdAt = new Date(project.created_at);
  const dateStr = isNaN(createdAt) ? "—" : createdAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <div className="rounded-[10px] border border-border bg-surface hover:border-border/80 transition-colors">
      <div className="flex items-start gap-4 p-4 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <div className="w-2 h-2 rounded-full bg-teal/70 mt-1.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[14px] text-text font-medium tracking-tight">{project.name}</div>
          {project.short_description && (
            <div className="font-mono text-[11px] text-sub mt-0.5">{project.short_description}</div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="label">{dateStr}</span>
          <span className="text-dim">{open ? I.collapse : I.expand}</span>
        </div>
      </div>
      {open && project.long_description && (
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
    // ── was: API.getSessions()
    getSessions()
      .then(s => { setSessions(s); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (id) => {
    // ── was: API.deleteSession(id)
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
    let result = projects
      .filter(p => byProject[p.id])
      .map(p => ({ project: p, sessions: byProject[p.id] }));

    if (sortAlpha) result.sort((a,b) => a.project.name.localeCompare(b.project.name));
    else result.sort((a,b) => new Date(b.sessions[0].timestamp) - new Date(a.sessions[0].timestamp));

    return result;
  }, [projects, sessions, sortAlpha]);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="label animate-pulse">loading sessions…</div></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto px-7 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] text-text font-medium tracking-tight">interview deck</div>
          <div className="label mt-0.5">engineering projects with logged sessions · {grouped.length} projects</div>
        </div>
        <div className="flex items-center gap-1 border border-border rounded-[6px] p-0.5">
          {[["recent","most recent"],["alpha","a → z"]].map(([k,v]) => (
            <button key={k} onClick={() => setSortAlpha(k === "alpha")}
              className="px-2.5 py-1 rounded-[5px] font-mono text-[10.5px] transition-colors"
              style={(k === "alpha") === sortAlpha ? { background: "#232535", color: "#DBDEE9" } : { color: "#7E8294" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-[10px] border border-border/50 bg-surface/40 p-10 text-center">
          <div className="label">no engineering sessions logged yet</div>
          <div className="label mt-1">start an [Engineering] session in the daily log and link it to a project</div>
        </div>
      ) : (
        grouped.map(({ project, sessions }) => (
          <InterviewProjectSection key={project.id} project={project} sessions={sessions} onDelete={handleDelete} />
        ))
      )}
    </div>
  );
}

function InterviewProjectSection({ project, sessions, onDelete }) {
  const [open, setOpen] = useState(true);
  const totalSec = sessions.reduce((a, s) => a + s.duration_seconds, 0);

  return (
    <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
      <div className="flex items-start gap-4 p-5 border-b border-border/50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="text-[15px] text-text font-medium tracking-tight" style={{ fontFamily: "Fraunces, serif" }}>
              {project.name}
            </div>
            <span className="font-mono text-[10.5px] px-1.5 py-[2px] rounded border border-teal/30 text-teal">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
            <span className="font-mono text-[10.5px] text-sub">{fmtHours(totalSec)} total</span>
          </div>
          {project.short_description && (
            <div className="font-mono text-[11px] text-sub">{project.short_description}</div>
          )}
        </div>
        <button onClick={() => setOpen(o => !o)}
          className="text-dim hover:text-sub transition-colors shrink-0 mt-1">
          {open ? I.collapse : I.expand}
        </button>
      </div>

      {open && (
        <>
          {project.long_description && (
            <div className="px-5 py-4 border-b border-border/40 bg-overlay/40">
              <div className="label label-up mb-2">context & architecture</div>
              <pre className="text-[12px] text-sub font-mono leading-relaxed whitespace-pre-wrap">
                {project.long_description}
              </pre>
            </div>
          )}
          <div className="divide-y divide-border/30">
            {sessions.map(s => (
              <InterviewSessionRow key={s.id} session={s} onDelete={() => onDelete(s.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InterviewSessionRow({ session, onDelete }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const ts = new Date(session.timestamp);
  const dateStr = isNaN(ts)
    ? "—"
    : ts.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + fmtTime(ts);

  return (
    <div className="group px-5 py-3.5 hover:bg-surface/60 transition-colors">
      <div className="flex items-start gap-4">
        <div className="font-mono text-[10.5px] text-dim tnum pt-0.5 w-20 shrink-0">{dateStr}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-text" style={{ fontFamily: "Fraunces, serif" }}>
            {session.intent || <span className="text-dim italic">no intent logged</span>}
          </div>
          {session.reality && (
            <div className="mt-1 flex items-start gap-2">
              <span className="font-mono text-[10px] text-teal mt-[3px]">↳</span>
              <span className="text-[12px] text-sub">{session.reality}</span>
            </div>
          )}
          {session.notes && (
            <div className="mt-2">
              <button onClick={() => setNotesOpen(n => !n)}
                className="flex items-center gap-1.5 font-mono text-[10.5px] text-dim hover:text-rose/80 transition-colors">
                {notesOpen ? I.collapse : I.expand}
                {notesOpen ? "hide notes" : "expand notes"}
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
// ROOT APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [active, setActive]               = useState("daily");
  const [now, setNow]                     = useState(new Date());
  const [projects, setProjects]           = useState([]);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [externalSession, setExternalSession] = useState(null);
  // Track whether the SQLite schema has been initialised this session
  const [dbReady, setDbReady]             = useState(false);

  // ── 1. Initialise the database on first mount ─────────────────────────────
  // initDb() is idempotent — safe to call every launch.
  useEffect(() => {
    initDb()
      .then(() => setDbReady(true))
      .catch(err => console.error("DB init failed:", err));
  }, []);

  // ── 2. Load projects once the DB is ready ────────────────────────────────
  useEffect(() => {
    if (!dbReady) return;
    // ── was: API.getProjects()
    getProjects().then(setProjects).catch(() => {});
  }, [dbReady]);

  // ── 3. Clock ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── 4. Keyboard shortcuts ─────────────────────────────────────────────────
  useEffect(() => {
    const tabs = ["daily", "hangar", "interview"];
    const onKey = (e) => {
      if (e.altKey && ["1","2","3"].includes(e.key)) {
        e.preventDefault();
        setActive(tabs[parseInt(e.key) - 1]);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "N") {
        e.preventDefault();
        setQuickNoteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Show nothing until the DB is bootstrapped — avoids a flash of broken state
  if (!dbReady) {
    return (
      <div className="h-full flex items-center justify-center bg-base">
        <div className="label animate-pulse">initialising database…</div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-base text-text">
      <Sidebar active={active} setActive={setActive} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <TopBar now={now} active={active} onQuickNote={() => setQuickNoteOpen(true)} />
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {active === "daily" && (
            <DailyLog
              projects={projects}
              onSessionSaved={(s) => setExternalSession(s)}
              externalSession={externalSession}
            />
          )}
          {active === "hangar"    && <ProjectHangar projects={projects} setProjects={setProjects} />}
          {active === "interview" && <InterviewDeck projects={projects} />}
        </div>
      </main>
      {quickNoteOpen && (
        <QuickNoteModal
          onClose={() => setQuickNoteOpen(false)}
          onSaved={(saved) => {
            setExternalSession(saved);
            setActive("daily");
          }}
        />
      )}
    </div>
  );
}
