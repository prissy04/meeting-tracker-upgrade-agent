import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "meeting-tracker-v2";

const colors = {
  bg: "#0a0e17", surface: "#111827", surfaceHover: "#1a2332", border: "#1e2d3d",
  accent: "#00d4aa", accentDim: "#00d4aa22", warn: "#f59e0b", warnDim: "#f59e0b18",
  danger: "#ef4444", dangerDim: "#ef444418", success: "#22c55e", successDim: "#22c55e18",
  text: "#e2e8f0", textDim: "#64748b", textMuted: "#475569", cardBg: "#0f1623",
};
const fonts = { display: "'JetBrains Mono', monospace", body: "'DM Sans', sans-serif" };

const PROJECT_COLORS = ["#00d4aa", "#6366f1", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316", "#14b8a6"];

const sampleMeeting = `Sprint 14 Standup - April 7, 2026
Attendees: Prisca Manokore, James Liu, Sarah Chen (external - Acme Corp), Dev Patel

Discussion:
- API migration is behind schedule by 2 days. James mentioned this was flagged last week as well.
- Sarah from Acme Corp raised concerns about the data export timeline — they need it by April 18.
- Dev is blocked on the authentication module, waiting on security review from InfoSec team.
- Decision: We will fast-track the security review by escalating to VP Engineering.
- Decision: Data export MVP will be delivered by April 15, full version by April 22.

Action Items:
- James: Complete API migration endpoint testing by April 10
- Prisca: Escalate security review to VP Engineering by EOD today
- Dev: Prepare auth module for review, document all dependencies
- Sarah: Send updated data schema requirements by April 9
- Prisca: Send weekly status update to Acme Corp stakeholders every Friday`;

function parseDeadline(dl) { if (!dl) return null; const d = new Date(dl); return isNaN(d.getTime()) ? null : d; }
function isOverdue(item) { if (item.status === "done") return false; const d = parseDeadline(item.deadline); return d ? d < new Date() : false; }
function formatDate(ts) { if (!ts) return ""; return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }

function generateReminder(item) {
  return `Hi ${item.owner},\n\nFollowing up on an action item from our meeting "${item.meetingTitle}" (${item.date}):\n\n  → ${item.title}${item.deadline ? `\n  📅 Due: ${item.deadline}` : ""}\n\nCould you provide a status update on this? Let me know if you need anything to move forward.\n\nThanks!`;
}

function exportToCSV(actionItems, projects) {
  const headers = ["Project", "Action Item", "Owner", "Deadline", "Priority", "Status", "Meeting", "Meeting Date", "Completed At"];
  const rows = actionItems.map(i => {
    const proj = projects.find(p => p.id === i.projectId);
    const status = isOverdue(i) && i.status !== "done" ? "overdue" : i.status;
    return [
      proj?.name || "Unknown",
      `"${(i.title || "").replace(/"/g, '""')}"`,
      i.owner || "",
      i.deadline || "",
      i.priority || "",
      status,
      `"${(i.meetingTitle || "").replace(/"/g, '""')}"`,
      i.date || "",
      i.completedAt ? formatDate(i.completedAt) : ""
    ].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `action-items-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleFileUpload(file, setNotes, showToast) {
  if (!file) return;
  const validTypes = [".txt", ".vtt", ".csv", ".md"];
  const ext = "." + file.name.split(".").pop().toLowerCase();
  if (!validTypes.includes(ext)) {
    showToast("⚠ Unsupported file type. Use .txt, .vtt, .csv, or .md");
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    let content = e.target.result;
    // Clean VTT format — strip timestamps and metadata
    if (ext === ".vtt") {
      content = content
        .replace(/^WEBVTT.*$/m, "")
        .replace(/^\d+$/gm, "")
        .replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}.*/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    setNotes(content);
    showToast(`✅ Loaded "${file.name}"`);
  };
  reader.readAsText(file);
}

function generateWeeklyDigest(actionItems, meetings, projects, projectId) {
  const items = projectId === "all" ? actionItems : actionItems.filter(i => i.projectId === projectId);
  const mtgs = projectId === "all" ? meetings : meetings.filter(m => m.projectId === projectId);
  const projName = projectId === "all" ? "All Projects" : projects.find(p => p.id === projectId)?.name || "Unknown";
  const open = items.filter(i => i.status !== "done");
  const overdue = open.filter(i => isOverdue(i));
  const done7 = items.filter(i => i.status === "done" && i.completedAt && (Date.now() - i.completedAt < 7 * 86400000));
  let d = `# Weekly Action Item Digest — ${projName}\n📅 ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}\n\n`;
  d += `## Summary\n- ${open.length} open · ${overdue.length} overdue · ${done7.length} completed this week · ${mtgs.length} meetings tracked\n\n`;
  if (overdue.length) d += `## ⚠️ OVERDUE\n${overdue.map(i => `- ${i.title} — ${i.owner} — Due: ${i.deadline} — ${i.meetingTitle}`).join("\n")}\n\n`;
  if (open.filter(i => !isOverdue(i)).length) d += `## 📋 Open\n${open.filter(i => !isOverdue(i)).map(i => `- [ ] ${i.title} — ${i.owner}${i.deadline ? ` — Due: ${i.deadline}` : ""}`).join("\n")}\n\n`;
  if (done7.length) d += `## ✅ Completed This Week\n${done7.map(i => `- [x] ${i.title} — ${i.owner} — ${formatDate(i.completedAt)}`).join("\n")}\n`;
  return d;
}

function generateReport(meeting, allItems, projectName) {
  const mi = allItems.filter(i => i.meetingId === meeting.id);
  const ext = meeting.attendees?.filter(a => a.role === "external") || [];
  let r = `# Meeting Follow-Up: ${meeting.title}\n📅 ${meeting.date} · Project: ${projectName}\n\n`;
  r += `## Attendees\n${meeting.attendees?.map(a => `- ${a.name}${a.org ? ` (${a.org})` : ""}`).join("\n") || "N/A"}\n\n`;
  r += `## Decisions\n${meeting.decisions?.map(d => `- ${d.description}`).join("\n") || "None"}\n\n`;
  r += `## Action Items\n${mi.map(i => `- [${i.status === "done" ? "x" : " "}] ${i.title} — ${i.owner}${i.deadline ? ` — Due: ${i.deadline}` : ""}${i.completedAt ? ` ✅ ${formatDate(i.completedAt)}` : ""}`).join("\n") || "None"}\n\n`;
  if (ext.length) r += `## External Items\n${mi.filter(i => ext.some(e => e.name === i.owner)).map(i => `- ${i.title} (${i.owner})`).join("\n") || "None"}\n`;
  return r;
}

async function analyzeWithClaude(notes, existingItems) {
  const ctx = existingItems.length ? `\n\nEXISTING ITEMS:\n${JSON.stringify(existingItems.map(i => ({ title: i.title, owner: i.owner, status: i.status, meeting: i.meetingTitle })), null, 2)}` : "";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 4096,
      system: `You are a PM meeting analysis agent. Return ONLY valid JSON (no markdown, no backticks):
{"meetingTitle":"string","date":"string","attendees":[{"name":"string","role":"internal|external","org":"string or null"}],"actionItems":[{"title":"string","owner":"string","deadline":"string or null","priority":"high|medium|low"}],"decisions":[{"description":"string","madeBy":"string or null"}],"risks":[{"description":"string","severity":"high|medium|low"}],"recurringIssues":["string"]}
For recurringIssues, compare against existing items and flag repeats.`,
      messages: [{ role: "user", content: `Analyze:${ctx}\n\nNEW NOTES:\n${notes}` }],
    }),
  });
  const data = await res.json();
  return JSON.parse((data.content?.map(b => b.text || "").join("") || "").replace(/```json|```/g, "").trim());
}

// --- Components ---
function Badge({ children, color = colors.accent }) {
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontFamily: fonts.display, fontWeight: 600, color, background: color + "18", letterSpacing: 0.5 }}>{children}</span>;
}

function ProjectBadge({ project }) {
  if (!project) return null;
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 10, fontFamily: fonts.display, fontWeight: 700, color: project.color, background: project.color + "18", letterSpacing: 0.5, textTransform: "uppercase" }}>{project.name}</span>;
}

function StatCard({ label, value, icon, color = colors.accent, onClick }) {
  return (
    <div onClick={onClick} style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 110, position: "relative", overflow: "hidden", cursor: onClick ? "pointer" : "default", transition: "border-color .15s" }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.borderColor = color; }} onMouseLeave={e => e.currentTarget.style.borderColor = colors.border}>
      <div style={{ position: "absolute", top: 10, right: 14, fontSize: 20, opacity: 0.3 }}>{icon}</div>
      <div style={{ fontSize: 26, fontFamily: fonts.display, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2, fontFamily: fonts.display, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function ActionItemRow({ item, onToggle, onRemind, project }) {
  const overdue = isOverdue(item);
  const es = overdue && item.status !== "done" ? "overdue" : item.status;
  const sc = { open: colors.accent, overdue: colors.danger, done: colors.textMuted };
  const cl = sc[es] || colors.accent;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: overdue ? colors.dangerDim : colors.cardBg, border: `1px solid ${overdue ? colors.danger + "44" : colors.border}`, borderRadius: 8, marginBottom: 6 }}>
      <div onClick={() => onToggle(item.id)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${cl}`, background: item.status === "done" ? cl : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: colors.bg, cursor: "pointer" }}>{item.status === "done" ? "✓" : ""}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: item.status === "done" ? colors.textMuted : colors.text, textDecoration: item.status === "done" ? "line-through" : "none", fontFamily: fonts.body }}>{item.title}</div>
        <div style={{ fontSize: 11, color: colors.textDim, marginTop: 2, fontFamily: fonts.display, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
          {item.owner}{item.deadline ? ` · Due: ${item.deadline}` : ""} · {item.meetingTitle}
          {project && <ProjectBadge project={project} />}
          {item.status === "done" && item.completedAt && <span style={{ color: colors.success }}> ✅ {formatDate(item.completedAt)}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {item.status !== "done" && <button onClick={(e) => { e.stopPropagation(); onRemind(generateReminder(item)); }} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textDim, padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600, whiteSpace: "nowrap" }}>📋 Remind</button>}
        <Badge color={cl}>{es}</Badge>
        {item.priority === "high" && <Badge color={colors.danger}>HIGH</Badge>}
      </div>
    </div>
  );
}

// --- Main ---
export default function MeetingTracker() {
  const [projects, setProjects] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [actionItems, setActionItems] = useState([]);
  const [view, setView] = useState("dashboard");
  const [activeProject, setActiveProject] = useState("all");
  const [notes, setNotes] = useState("");
  const [meetingProject, setMeetingProject] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [itemFilter, setItemFilter] = useState("all");
  const [toast, setToast] = useState(null);
  const [newProjName, setNewProjName] = useState("");
  const [showProjForm, setShowProjForm] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const getProject = (id) => projects.find(p => p.id === id);

  useEffect(() => { (async () => { try { const r = await window.storage.get(STORAGE_KEY); if (r?.value) { const p = JSON.parse(r.value); setProjects(p.projects || []); setMeetings(p.meetings || []); setActionItems(p.actionItems || []); } } catch {} })(); }, []);

  const persist = useCallback(async (pr, m, a) => {
    try { await window.storage.set(STORAGE_KEY, JSON.stringify({ projects: pr, meetings: m, actionItems: a })); } catch {}
  }, []);

  const addProject = async () => {
    if (!newProjName.trim()) return;
    const np = { id: Date.now().toString(36), name: newProjName.trim(), color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length] };
    const up = [...projects, np]; setProjects(up); setNewProjName(""); setShowProjForm(false);
    await persist(up, meetings, actionItems); showToast(`✅ Project "${np.name}" created`);
    return np;
  };

  const deleteProject = async (id) => {
    if (!confirm("Delete this project and all its meetings and action items?")) return;
    const up = projects.filter(p => p.id !== id);
    const um = meetings.filter(m => m.projectId !== id);
    const ua = actionItems.filter(a => a.projectId !== id);
    setProjects(up); setMeetings(um); setActionItems(ua);
    if (activeProject === id) setActiveProject("all");
    await persist(up, um, ua);
  };

  const handleAnalyze = async () => {
    if (!notes.trim() || !meetingProject) return;
    setLoading(true); setError(null);
    try {
      const result = await analyzeWithClaude(notes, actionItems.filter(a => a.projectId === meetingProject));
      const mid = Date.now().toString(36);
      const nm = { id: mid, projectId: meetingProject, title: result.meetingTitle, date: result.date, attendees: result.attendees, decisions: result.decisions, risks: result.risks, recurringIssues: result.recurringIssues, rawNotes: notes };
      const ni = (result.actionItems || []).map((ai, idx) => ({ id: `${mid}-${idx}`, meetingId: mid, projectId: meetingProject, meetingTitle: result.meetingTitle, title: ai.title, owner: ai.owner, deadline: ai.deadline, priority: ai.priority, status: "open", date: result.date, completedAt: null }));
      const um = [nm, ...meetings]; const ua = [...ni, ...actionItems];
      setMeetings(um); setActionItems(ua); await persist(projects, um, ua);
      setNotes(""); setView("dashboard"); setActiveProject(meetingProject);
      showToast(`✅ ${ni.length} items extracted from "${result.meetingTitle}"`);
    } catch (e) { setError("Analysis failed: " + e.message); }
    setLoading(false);
  };

  const toggleItem = async (id) => {
    const now = Date.now();
    const ua = actionItems.map(i => i.id !== id ? i : { ...i, status: i.status === "done" ? "open" : "done", completedAt: i.status === "done" ? null : now });
    setActionItems(ua); await persist(projects, meetings, ua);
    const it = ua.find(i => i.id === id);
    if (it?.status === "done") showToast(`✅ "${it.title}" complete`);
  };

  const clearAll = async () => {
    if (confirm("Clear ALL data? This cannot be undone.")) {
      setProjects([]); setMeetings([]); setActionItems([]); setSelectedMeeting(null); setActiveProject("all");
      try { await window.storage.delete(STORAGE_KEY); } catch {}
    }
  };

  // Filtered data
  const fMeetings = activeProject === "all" ? meetings : meetings.filter(m => m.projectId === activeProject);
  const fItems = activeProject === "all" ? actionItems : actionItems.filter(a => a.projectId === activeProject);
  const overdueList = fItems.filter(i => isOverdue(i));
  const openCount = fItems.filter(i => i.status !== "done").length;
  const doneCount = fItems.filter(i => i.status === "done").length;
  const totalRisks = fMeetings.reduce((s, m) => s + (m.risks?.length || 0), 0);
  const recentDone = fItems.filter(i => i.status === "done" && i.completedAt && (Date.now() - i.completedAt < 7 * 86400000));

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: "◈" },
    { key: "add", label: "Add Meeting", icon: "+" },
    { key: "items", label: "Action Items", icon: "☰" },
    { key: "meetings", label: "Meetings", icon: "▦" },
    { key: "projects", label: "Projects", icon: "◫" },
  ];

  return (
    <div style={{ fontFamily: fonts.body, background: colors.bg, color: colors.text, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {toast && <div style={{ position: "fixed", top: 20, right: 20, zIndex: 1000, background: colors.surface, border: `1px solid ${colors.accent}44`, borderRadius: 10, padding: "12px 20px", fontSize: 13, fontFamily: fonts.display, color: colors.accent, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>{toast}</div>}

      {/* Header */}
      <header style={{ padding: "16px 24px", borderBottom: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: colors.surface, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(135deg, ${colors.accent}, #0088ff)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: colors.bg }}>M</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: fonts.display, letterSpacing: -0.5 }}>Meeting Tracker <span style={{ color: colors.accent }}>Upgrade Agent</span></div>
            <div style={{ fontSize: 10, color: colors.textDim, fontFamily: fonts.display, textTransform: "uppercase", letterSpacing: 1.5 }}>Cross-Meeting Intelligence for PMs</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setModal(generateWeeklyDigest(actionItems, meetings, projects, activeProject))} style={{ background: colors.accentDim, border: `1px solid ${colors.accent}44`, color: colors.accent, padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600 }}>📊 Digest</button>
          <button onClick={() => { if (actionItems.length === 0) { showToast("No items to export"); return; } exportToCSV(activeProject === "all" ? actionItems : actionItems.filter(a => a.projectId === activeProject), projects); showToast("✅ CSV exported"); }} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textDim, padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display }}>⬇ CSV</button>
          <button onClick={clearAll} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textDim, padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display }}>Clear All Data</button>
        </div>
      </header>

      {/* Nav */}
      <nav style={{ display: "flex", gap: 2, padding: "8px 24px", background: colors.surface, borderBottom: `1px solid ${colors.border}`, flexWrap: "wrap" }}>
        {navItems.map(n => (
          <button key={n.key} onClick={() => { setView(n.key); setSelectedMeeting(null); setItemFilter("all"); }}
            style={{ background: view === n.key ? colors.accentDim : "transparent", border: view === n.key ? `1px solid ${colors.accent}44` : "1px solid transparent", color: view === n.key ? colors.accent : colors.textDim, padding: "8px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>{n.icon}</span> {n.label}
          </button>
        ))}
      </nav>

      {/* Project Filter Bar */}
      {view !== "projects" && view !== "add" && projects.length > 0 && (
        <div style={{ padding: "8px 24px", background: colors.bg, borderBottom: `1px solid ${colors.border}`, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: colors.textMuted, fontFamily: fonts.display, marginRight: 4 }}>PROJECT:</span>
          <button onClick={() => setActiveProject("all")} style={{
            background: activeProject === "all" ? colors.accentDim : "transparent", border: activeProject === "all" ? `1px solid ${colors.accent}44` : "1px solid transparent",
            color: activeProject === "all" ? colors.accent : colors.textDim, padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600
          }}>All</button>
          {projects.map(p => (
            <button key={p.id} onClick={() => setActiveProject(p.id)} style={{
              background: activeProject === p.id ? p.color + "22" : "transparent", border: activeProject === p.id ? `1px solid ${p.color}44` : "1px solid transparent",
              color: activeProject === p.id ? p.color : colors.textDim, padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600
            }}>{p.name}</button>
          ))}
        </div>
      )}

      <main style={{ flex: 1, padding: 24, maxWidth: 960, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>

        {/* ===== DASHBOARD ===== */}
        {view === "dashboard" && (
          <div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard label="Meetings" value={fMeetings.length} icon="📋" onClick={() => { setView("meetings"); setSelectedMeeting(null); }} />
              <StatCard label="Open" value={openCount} icon="⚡" onClick={() => { setItemFilter("open"); setView("items"); }} />
              <StatCard label="Overdue" value={overdueList.length} icon="🔥" color={colors.danger} onClick={() => { setItemFilter("overdue"); setView("items"); }} />
              <StatCard label="Done" value={doneCount} icon="✓" color={colors.success} onClick={() => { setItemFilter("done"); setView("items"); }} />
              <StatCard label="Risks" value={totalRisks} icon="⚠" color={colors.warn} onClick={() => { setItemFilter("risks"); setView("items"); }} />
            </div>

            {projects.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: colors.textDim }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>◫</div>
                <div style={{ fontFamily: fonts.display, fontSize: 16, marginBottom: 8 }}>Create your first project to get started</div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>Projects let you group meetings, action items, and risks by workstream.</div>
                <button onClick={() => setView("projects")} style={{ background: colors.accent, color: colors.bg, border: "none", padding: "10px 24px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: fonts.display }}>+ Create Project</button>
              </div>
            ) : (
              <>
                {/* Project Overview Cards */}
                {activeProject === "all" && projects.length > 1 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 13, color: colors.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Project Overview</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {projects.map(p => {
                        const pItems = actionItems.filter(a => a.projectId === p.id);
                        const pOpen = pItems.filter(i => i.status !== "done").length;
                        const pOverdue = pItems.filter(i => isOverdue(i)).length;
                        const pDone = pItems.filter(i => i.status === "done").length;
                        const pMtgs = meetings.filter(m => m.projectId === p.id).length;
                        return (
                          <div key={p.id} onClick={() => setActiveProject(p.id)} style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, minWidth: 200, flex: 1, cursor: "pointer", borderLeft: `4px solid ${p.color}`, transition: "border-color .15s" }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = p.color} onMouseLeave={e => e.currentTarget.style.borderColor = colors.border}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: p.color, fontFamily: fonts.display, marginBottom: 8 }}>{p.name}</div>
                            <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.display, lineHeight: 1.8 }}>
                              {pMtgs} meetings · {pOpen} open · {pOverdue > 0 ? <span style={{ color: colors.danger }}>{pOverdue} overdue</span> : "0 overdue"} · {pDone} done
                            </div>
                            {pItems.length > 0 && (
                              <div style={{ background: colors.border, borderRadius: 999, height: 4, marginTop: 8, overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 999, width: `${(pDone / pItems.length) * 100}%`, background: p.color, transition: "width .3s" }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Overdue */}
                {overdueList.length > 0 && (
                  <div style={{ background: colors.dangerDim, border: `1px solid ${colors.danger}33`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
                    <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 13, color: colors.danger, marginBottom: 10 }}>🔥 {overdueList.length} OVERDUE</div>
                    {overdueList.map(it => <ActionItemRow key={it.id} item={it} onToggle={toggleItem} onRemind={setModal} project={getProject(it.projectId)} />)}
                  </div>
                )}

                {/* Open */}
                {fItems.filter(i => i.status !== "done" && !isOverdue(i)).length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 13, color: colors.textDim, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Open Action Items</div>
                    {fItems.filter(i => i.status !== "done" && !isOverdue(i)).slice(0, 10).map(it => <ActionItemRow key={it.id} item={it} onToggle={toggleItem} onRemind={setModal} project={activeProject === "all" ? getProject(it.projectId) : null} />)}
                  </div>
                )}

                {/* Recently Completed */}
                {recentDone.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontFamily: fonts.display, fontSize: 13, color: colors.success, marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>✅ Completed This Week ({recentDone.length})</div>
                    {recentDone.map(it => <ActionItemRow key={it.id} item={it} onToggle={toggleItem} onRemind={setModal} project={activeProject === "all" ? getProject(it.projectId) : null} />)}
                  </div>
                )}

                {/* Progress */}
                {fItems.length > 0 && (
                  <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: fonts.display, fontSize: 12, color: colors.textDim, textTransform: "uppercase", letterSpacing: 1 }}>Progress</span>
                      <span style={{ fontFamily: fonts.display, fontSize: 13, color: colors.accent, fontWeight: 700 }}>{doneCount} / {fItems.length}</span>
                    </div>
                    <div style={{ background: colors.border, borderRadius: 999, height: 8, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 999, width: `${fItems.length ? (doneCount / fItems.length) * 100 : 0}%`, background: `linear-gradient(90deg, ${colors.accent}, ${colors.success})`, transition: "width .4s" }} />
                    </div>
                  </div>
                )}

                {fMeetings.length === 0 && fItems.length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: colors.textDim }}>
                    <div style={{ fontSize: 13, marginBottom: 12 }}>No meetings for {activeProject === "all" ? "any project" : getProject(activeProject)?.name} yet.</div>
                    <button onClick={() => setView("add")} style={{ background: colors.accent, color: colors.bg, border: "none", padding: "10px 24px", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontFamily: fonts.display }}>+ Add Meeting</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ===== ADD MEETING ===== */}
        {view === "add" && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Add Meeting Notes</div>
            <div style={{ fontSize: 13, color: colors.textDim, marginBottom: 16 }}>Select a project, then paste notes, upload a transcript file, or drag and drop. The AI agent will extract action items, decisions, and risks.</div>

            {projects.length === 0 ? (
              <div style={{ background: colors.warnDim, border: `1px solid ${colors.warn}33`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: colors.warn, fontFamily: fonts.display }}>⚠ Create a project first before adding meetings.</div>
                <button onClick={() => setView("projects")} style={{ marginTop: 10, background: colors.warn, color: colors.bg, border: "none", padding: "8px 20px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontFamily: fonts.display, fontSize: 13 }}>Go to Projects</button>
              </div>
            ) : (
              <>
                {/* Project Selector */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: 12, color: colors.textDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Select Project</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {projects.map(p => (
                      <button key={p.id} onClick={() => setMeetingProject(p.id)} style={{
                        background: meetingProject === p.id ? p.color + "22" : colors.cardBg,
                        border: `2px solid ${meetingProject === p.id ? p.color : colors.border}`,
                        color: meetingProject === p.id ? p.color : colors.textDim,
                        padding: "8px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600
                      }}>{p.name}</button>
                    ))}
                  </div>
                </div>

                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Paste meeting notes here..."
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = colors.accent; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = colors.border; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = colors.border; const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f, setNotes, showToast); }}
                  style={{ width: "100%", minHeight: 250, background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 10, color: colors.text, padding: 16, fontSize: 14, fontFamily: fonts.body, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  <button onClick={handleAnalyze} disabled={loading || !notes.trim() || !meetingProject}
                    style={{ background: loading ? colors.textMuted : colors.accent, color: colors.bg, border: "none", padding: "12px 28px", borderRadius: 8, fontWeight: 700, cursor: loading ? "wait" : "pointer", fontFamily: fonts.display, fontSize: 14, opacity: (!notes.trim() || !meetingProject) ? 0.4 : 1 }}>
                    {loading ? "⟳ Analyzing..." : "⚡ Analyze with AI"}</button>
                  <label style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textDim, padding: "12px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: fonts.display, display: "flex", alignItems: "center", gap: 6 }}>
                    📄 Upload File
                    <input type="file" accept=".txt,.vtt,.csv,.md" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) handleFileUpload(f, setNotes, showToast); e.target.value = ""; }} />
                  </label>
                  <button onClick={() => setNotes(sampleMeeting)} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textDim, padding: "12px 20px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: fonts.display }}>Load Sample</button>
                </div>
                <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8, fontFamily: fonts.display }}>Supports .txt, .vtt (Teams/Zoom transcripts), .csv, and .md files. Or drag and drop onto the text area.</div>
                {error && <div style={{ color: colors.danger, marginTop: 12, fontSize: 13 }}>{error}</div>}
              </>
            )}
          </div>
        )}

        {/* ===== ACTION ITEMS ===== */}
        {view === "items" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700 }}>{itemFilter === "risks" ? "Risks" : "Action Items"}</div>
                {itemFilter !== "risks" && fItems.length > 0 && (
                  <button onClick={() => exportToCSV(fItems, projects)} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textDim, padding: "4px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600 }}>⬇ Export CSV</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {["all", "open", "overdue", "done", "risks"].map(f => (
                  <button key={f} onClick={() => setItemFilter(f)} style={{ background: itemFilter === f ? colors.accentDim : "transparent", border: itemFilter === f ? `1px solid ${colors.accent}44` : "1px solid transparent", color: itemFilter === f ? colors.accent : colors.textDim, padding: "5px 12px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600, textTransform: "uppercase" }}>{f}</button>
                ))}
              </div>
            </div>
            {itemFilter === "risks" ? (() => {
              const risks = fMeetings.flatMap(m => (m.risks || []).map((r, i) => ({ ...r, mt: m.title, pid: m.projectId, key: `${m.id}-r${i}` })));
              return risks.length === 0 ? <div style={{ color: colors.textDim, textAlign: "center", padding: 40 }}>No risks.</div>
                : risks.map(r => (
                  <div key={r.key} style={{ padding: "12px 16px", background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${r.severity === "high" ? colors.danger : colors.warn}` }}>
                    <div style={{ fontSize: 14, color: colors.text }}>{r.description}</div>
                    <div style={{ fontSize: 11, color: colors.textDim, fontFamily: fonts.display, marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                      {r.mt} <ProjectBadge project={getProject(r.pid)} /> <Badge color={r.severity === "high" ? colors.danger : colors.warn}>{r.severity}</Badge>
                    </div>
                  </div>
                ));
            })() : (() => {
              const filtered = itemFilter === "all" ? fItems : itemFilter === "overdue" ? fItems.filter(i => isOverdue(i)) : fItems.filter(i => i.status === itemFilter);
              return filtered.length === 0 ? <div style={{ color: colors.textDim, textAlign: "center", padding: 40 }}>No {itemFilter} items.</div>
                : filtered.map(it => <ActionItemRow key={it.id} item={it} onToggle={toggleItem} onRemind={setModal} project={activeProject === "all" ? getProject(it.projectId) : null} />);
            })()}
          </div>
        )}

        {/* ===== MEETINGS ===== */}
        {view === "meetings" && !selectedMeeting && (
          <div>
            <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Meeting Log</div>
            {fMeetings.length === 0 ? <div style={{ color: colors.textDim, textAlign: "center", padding: 40 }}>No meetings.</div>
              : fMeetings.map(m => {
                const proj = getProject(m.projectId);
                return (
                  <div key={m.id} onClick={() => setSelectedMeeting(m)} style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 8, cursor: "pointer", borderLeft: `4px solid ${proj?.color || colors.accent}`, transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover} onMouseLeave={e => e.currentTarget.style.background = colors.cardBg}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{m.title}</div>
                        <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.display, marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                          {m.date} · {m.attendees?.length || 0} attendees <ProjectBadge project={proj} />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(m.risks?.length || 0) > 0 && <Badge color={colors.warn}>{m.risks.length} risks</Badge>}
                        <Badge>{actionItems.filter(i => i.meetingId === m.id).length} items</Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}

        {/* ===== MEETING DETAIL ===== */}
        {view === "meetings" && selectedMeeting && (() => {
          const proj = getProject(selectedMeeting.projectId);
          return (
            <div>
              <button onClick={() => setSelectedMeeting(null)} style={{ background: "transparent", border: "none", color: colors.accent, cursor: "pointer", fontFamily: fonts.display, fontSize: 13, padding: 0, marginBottom: 16 }}>← Back</button>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: fonts.display, fontSize: 20, fontWeight: 700 }}>{selectedMeeting.title}</div>
                  <div style={{ fontSize: 13, color: colors.textDim, marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}>{selectedMeeting.date} <ProjectBadge project={proj} /></div>
                </div>
                <button onClick={() => setModal(generateReport(selectedMeeting, actionItems, proj?.name || "Unknown"))} style={{ background: colors.accentDim, border: `1px solid ${colors.accent}44`, color: colors.accent, padding: "8px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600 }}>📄 Report</button>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: fonts.display, fontSize: 12, color: colors.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Attendees</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {selectedMeeting.attendees?.map((a, i) => <Badge key={i} color={a.role === "external" ? colors.warn : colors.accent}>{a.name}{a.org ? ` (${a.org})` : ""}{a.role === "external" ? " ↗" : ""}</Badge>)}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontFamily: fonts.display, fontSize: 12, color: colors.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Decisions</div>
                {(selectedMeeting.decisions?.length || 0) === 0 ? <div style={{ fontSize: 13, color: colors.textMuted }}>None</div>
                  : selectedMeeting.decisions.map((d, i) => <div key={i} style={{ padding: "8px 12px", background: colors.accentDim, borderRadius: 6, marginBottom: 4, fontSize: 13, borderLeft: `3px solid ${colors.accent}` }}>{d.description}</div>)}
              </div>
              {(selectedMeeting.risks?.length || 0) > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontFamily: fonts.display, fontSize: 12, color: colors.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Risks</div>
                  {selectedMeeting.risks.map((r, i) => <div key={i} style={{ padding: "8px 12px", background: r.severity === "high" ? colors.dangerDim : colors.warnDim, borderRadius: 6, marginBottom: 4, fontSize: 13, borderLeft: `3px solid ${r.severity === "high" ? colors.danger : colors.warn}` }}>{r.description} <Badge color={r.severity === "high" ? colors.danger : colors.warn}>{r.severity}</Badge></div>)}
                </div>
              )}
              <div>
                <div style={{ fontFamily: fonts.display, fontSize: 12, color: colors.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Action Items</div>
                {actionItems.filter(i => i.meetingId === selectedMeeting.id).map(it => <ActionItemRow key={it.id} item={it} onToggle={toggleItem} onRemind={setModal} />)}
              </div>
            </div>
          );
        })()}

        {/* ===== PROJECTS ===== */}
        {view === "projects" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 700 }}>Projects</div>
              <button onClick={() => setShowProjForm(!showProjForm)} style={{ background: colors.accent, color: colors.bg, border: "none", padding: "8px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: fonts.display, fontWeight: 700 }}>+ New Project</button>
            </div>
            {showProjForm && (
              <div style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
                <input value={newProjName} onChange={e => setNewProjName(e.target.value)} placeholder="Project name (e.g. API Migration, Client Onboarding)"
                  onKeyDown={e => e.key === "Enter" && addProject()}
                  style={{ flex: 1, background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6, color: colors.text, padding: "10px 14px", fontSize: 14, fontFamily: fonts.body, outline: "none" }} />
                <button onClick={addProject} disabled={!newProjName.trim()} style={{ background: colors.accent, color: colors.bg, border: "none", padding: "10px 20px", borderRadius: 6, fontWeight: 700, cursor: "pointer", fontFamily: fonts.display, fontSize: 13, opacity: newProjName.trim() ? 1 : 0.4 }}>Create</button>
              </div>
            )}
            {projects.length === 0 ? (
              <div style={{ color: colors.textDim, textAlign: "center", padding: 40, fontSize: 13 }}>No projects yet. Create one to start tracking meetings.</div>
            ) : projects.map(p => {
              const pItems = actionItems.filter(a => a.projectId === p.id);
              const pMtgs = meetings.filter(m => m.projectId === p.id).length;
              const pOpen = pItems.filter(i => i.status !== "done").length;
              const pDone = pItems.filter(i => i.status === "done").length;
              const pOverdue = pItems.filter(i => isOverdue(i)).length;
              return (
                <div key={p.id} style={{ background: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16, marginBottom: 8, borderLeft: `4px solid ${p.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: p.color, fontFamily: fonts.display }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: colors.textDim, fontFamily: fonts.display, marginTop: 4 }}>
                        {pMtgs} meetings · {pOpen} open · {pOverdue > 0 ? <span style={{ color: colors.danger }}>{pOverdue} overdue</span> : "0 overdue"} · {pDone} done
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => { setActiveProject(p.id); setView("dashboard"); }} style={{ background: colors.accentDim, border: `1px solid ${colors.accent}44`, color: colors.accent, padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display, fontWeight: 600 }}>View</button>
                      <button onClick={() => deleteProject(p.id)} style={{ background: "transparent", border: `1px solid ${colors.danger}33`, color: colors.danger, padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: fonts.display }}>Delete</button>
                    </div>
                  </div>
                  {pItems.length > 0 && (
                    <div style={{ background: colors.border, borderRadius: 999, height: 4, marginTop: 10, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 999, width: `${(pDone / pItems.length) * 100}%`, background: p.color, transition: "width .3s" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 20 }} onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 14, padding: 24, maxWidth: 600, width: "100%", maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 16 }}>
                {modal.includes("Weekly Action Item Digest") ? "📊 Weekly Digest" : modal.includes("Following up") ? "📋 Reminder" : "📄 Report"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { const ta = document.getElementById("modal-ta"); if (ta) { ta.select(); document.execCommand("copy"); showToast("✓ Copied"); } }} style={{ background: colors.accent, color: colors.bg, border: "none", padding: "6px 16px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 700, fontFamily: fonts.display }}>Copy</button>
                <button onClick={() => setModal(null)} style={{ background: "transparent", border: `1px solid ${colors.border}`, color: colors.textDim, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            </div>
            <textarea id="modal-ta" readOnly value={modal} style={{ width: "100%", minHeight: 200, background: colors.cardBg, padding: 16, borderRadius: 8, fontSize: 13, lineHeight: 1.6, fontFamily: fonts.display, color: colors.text, border: `1px solid ${colors.border}`, resize: "vertical", outline: "none", boxSizing: "border-box" }} onFocus={e => e.target.select()} />
          </div>
        </div>
      )}

      <footer style={{ padding: "10px 24px", borderTop: `1px solid ${colors.border}`, textAlign: "center", fontSize: 11, color: colors.textMuted, fontFamily: fonts.display }}>Meeting Tracker Upgrade Agent · Built by Prisca Manokore · Portfolio Project</footer>
    </div>
  );
}
