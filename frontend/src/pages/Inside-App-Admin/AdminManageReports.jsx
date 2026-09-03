import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getReports,
  getReport,
  updateReport,
  uploadReportMedia,
  addComment,
  getComments,
} from "../../api/reports";
import { getAvailableContractors, assignContractor, createProject, getProjects, getProjectCompletion } from "../../api/projects";
import "./AdminManageReports.css";
import { REPORT_STATUS } from "../../constants/reportStatus";
import { resolveMediaUrl } from "../../utils/mediaUrl";
function isCoordinateString(str) {
  if (!str) return false;
  return /^-?\d{1,3}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(str.trim());
}

// ═══════════════════════════════════════════════════════════════════════════
// REFACTORED STATUS FLOW — Removed "assigned" status
// Old: pending → verified → assigned → in_progress → resolved
// New: pending → verified → in_progress → resolved
// ═══════════════════════════════════════════════════════════════════════════
const STATUS_FLOW   = [REPORT_STATUS.PENDING, REPORT_STATUS.VERIFIED, REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.RESOLVED, REPORT_STATUS.REJECTED, REPORT_STATUS.CANCELLED];
const STATUS_LABELS = {
  [REPORT_STATUS.PENDING]:     "Pending",
  [REPORT_STATUS.VERIFIED]:    "Verified",
  [REPORT_STATUS.IN_PROGRESS]: "In Progress",
  [REPORT_STATUS.RESOLVED]:    "Resolved",
  [REPORT_STATUS.REJECTED]:    "Rejected",
  [REPORT_STATUS.CANCELLED]:   "Cancelled",
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTED OUT: Workers and Teams — moved to next version
// ═══════════════════════════════════════════════════════════════════════════
/*
const WORKERS = [
  { id: 1, name: "Juan dela Cruz"    },
  { id: 2, name: "Maria Santos"      },
  { id: 3, name: "Pedro Reyes"       },
  { id: 4, name: "Ana Garcia"        },
  { id: 5, name: "Marco Villanueva"  },
  { id: 6, name: "Liza Mendoza"      },
];
const TEAMS_DEFAULT = [
  { id: 1, name: "Team Alpha", leader: "Juan dela Cruz",    members: ["Pedro Reyes", "Ana Garcia"]          },
  { id: 2, name: "Team Beta",  leader: "Maria Santos",      members: ["Marco Villanueva"]                   },
  { id: 3, name: "Team Gamma", leader: "Marco Villanueva", members: ["Liza Mendoza", "Pedro Reyes"]         },
];
*/

const ASSIGN_STATUS_LABELS = {
  scheduled:   "Assigned",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
};

// ─── Icons (unchanged) ────────────────────────────────────────────────────
function IcoClipboard({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>;
}
function IcoAlert({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m10.29 3.86-8.29 14.28A1 1 0 0 0 3 19.71h18a1 1 0 0 0 .86-1.57l-8.29-14.28a1 1 0 0 0-1.72 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function IcoClock({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IcoWrench({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
}
function IcoCheck({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
function IcoSearch({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IcoRefresh({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}
function IcoMapPin({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
function IcoUsers({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IcoX({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function IcoPlus({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function IcoBan({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
}
function IcoCamera({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}
function IcoShield({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function IcoStar({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
}
function IcoSort({ size = 14, active, dir }) {
  return (
    <svg width={size} height={size} className="ico-sort" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      {active
        ? dir === "asc"
          ? <polyline points="18 15 12 9 6 15" />
          : <polyline points="6 9 12 15 18 9" />
        : <><polyline points="18 15 12 9 6 15" opacity=".35" /><polyline points="6 9 12 15 18 9" opacity=".35" /></>
      }
    </svg>
  );
}
function IcoChevronDown({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="6 9 12 15 18 9"/></svg>;
}
function IcoSliders({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>;
}
function IcoDownload({ size = 16, ...p }) {
  return <svg width={size} height={size} className="ico-flex-shrink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
}

// ─── CSV Export ────────────────────────────────────────────────────────────
function exportCSV(rows, label = "page") {
  const headers = ["ID", "Status", "Type", "Severity", "Location", "Barangay", "Street", "Reporter", "Contractor", "Date"];
  const escape  = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines   = [
    headers.map(escape).join(","),
    ...rows.map((r) => [
      `RPT-${String(r.id).padStart(5, "0")}`,
      r.status ?? "",
      r.ai_damage_type ?? r.damage_type ?? "",
      r.ai_severity    ?? r.severity    ?? "",
      r.location_address ?? r.barangay ?? "",
      r.barangay ?? "",
      r.street_name ?? "",
      r.owner?.full_name ?? "Anonymous",
      r.assigned_to ?? "",
      r.created_at ? new Date(r.created_at).toLocaleDateString() : "",
    ].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `manage_reports_${label}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function timeAgo(dateStr) {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function getPriority(r) {
  const sev  = (r.ai_severity ?? r.severity ?? "").toLowerCase();
  const ageH = r.created_at ? (Date.now() - new Date(r.created_at)) / 3600000 : 0;
  if (sev === "critical" || ageH > 72) return "high";
  if (sev === "moderate" || ageH > 24) return "medium";
  return "low";
}

function initials(name) {
  return (name || "?")
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
const barangay   = (r) => r.barangay ?? r.location_address?.split(",")[0] ?? "—";
const street     = (r) => r.exact_address || r.street_name || r.location_address || "";
const mediaFull = (r, idx = 0) => {
  const att = r.media_attachments?.[idx];
  if (!att?.file_url) return null;
  return { url: resolveMediaUrl(att.file_url), type: att.media_type };
};

// ═══════════════════════════════════════════════════════════════════════════
// NOTES / COMMENTS NOTIFICATION HELPERS
// NOTE: adjust these field names if getReports() uses different keys for
// the aggregate comment count on each report.
// ═══════════════════════════════════════════════════════════════════════════
const commentCount = (r) =>
  r.comment_count ?? r.comments_count ?? r.notes_count ?? r.total_comments ?? 0;

const NOTES_SEEN_KEY = "amr_notes_seen";

function loadNotesSeen() {
  try { return JSON.parse(localStorage.getItem(NOTES_SEEN_KEY) || "{}"); }
  catch { return {}; }
}
function saveNotesSeen(map) {
  try { localStorage.setItem(NOTES_SEEN_KEY, JSON.stringify(map)); }
  catch { }
}

// Unread = total comments on the report minus how many the admin had
// already seen the last time they opened the Notes tab for it.
function unreadNotesCount(r, seenMap) {
  if (!r) return 0;
  const total = commentCount(r);
  if (!total) return 0;
  const seen = seenMap[r.id] ?? 0;
  return Math.max(0, total - seen);
}

const GEO_CACHE_KEY = "amr_geo_cache";

function loadGeoCache() {
  try { return JSON.parse(sessionStorage.getItem(GEO_CACHE_KEY) || "{}"); }
  catch { return {}; }
}
function saveGeoCache(cache) {
  try { sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache)); }
  catch { }
}

async function reverseGeocodeAll(reports) {
  const cache    = loadGeoCache();
  const CONCURRENCY = 5;

  const needsGeo = reports
    .map((r, i) => ({ r, i, addr: r.exact_address || r.street_name || r.location_address || "" }))
    .filter(({ addr }) => isCoordinateString(addr));

  if (!needsGeo.length) return reports;

  const updated = [...reports];

  for (let batch = 0; batch < needsGeo.length; batch += CONCURRENCY) {
    const chunk = needsGeo.slice(batch, batch + CONCURRENCY);
    await Promise.all(chunk.map(async ({ r, i, addr }) => {
      const [lat, lon] = addr.split(",").map(s => s.trim());
      const key = `${lat},${lon}`;

      if (!cache[key]) {
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`
          );
          const data = await resp.json();
          const road = [
            data.address?.road,
            data.address?.neighbourhood,
            data.address?.suburb,
          ].find(Boolean) || "Unnamed Road";
          cache[key] = data.address?.house_number
            ? `${road} ${data.address.house_number}`
            : road;
        } catch {
          cache[key] = "Unknown Road";
        }
      }

      updated[i] = {
        ...r,
        exact_address:    cache[key],
        street_name:      cache[key],
        location_address: cache[key],
      };
    }));
  }

  saveGeoCache(cache);
  return updated;
}

function Badge({ text, className }) {
  return <span className={`badge ${className || ""}`}>{text}</span>;
}

function StatsCards({ reports, totalCount }) {
  const today = new Date().toDateString();
  const cards = [
    { label: "Total Reports",
      value: totalCount,
      icon:  <IcoClipboard size={18} />, className: "sc-total"      },
    { label: "Critical",
      value: reports.filter(r => (r.ai_severity ?? r.severity ?? "").toLowerCase() === "critical").length,
      icon:  <IcoAlert size={18} />,     className: "sc-critical"   },
    { label: "Pending",
      value: reports.filter(r => r.status?.toLowerCase() === REPORT_STATUS.PENDING).length,
      icon:  <IcoClock size={18} />,     className: "sc-pending"    },
    { label: "In Progress",
      value: reports.filter(r => r.status?.toLowerCase() === REPORT_STATUS.IN_PROGRESS).length,
      icon:  <IcoWrench size={18} />,    className: "sc-inprogress" },
    { label: "Resolved Today",
      value: reports.filter(r =>
        r.status?.toLowerCase() === REPORT_STATUS.RESOLVED &&
        r.updated_at &&
        new Date(r.updated_at).toDateString() === today
      ).length,
      icon:  <IcoCheck size={18} />,     className: "sc-completed"  },
  ];

  return (
    <div className="stats-row">
      {cards.map(c => (
        <div key={c.label} className={`stat-card ${c.className}`}>
          <div className="stat-icon-wrapper">{c.icon}</div>
          <div className="stat-content">
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// REFACTORED TIMELINE — Removed "assigned" step
// ═══════════════════════════════════════════════════════════════════════════
function StatusTimeline({ currentStatus }) {
  const steps = [REPORT_STATUS.PENDING, REPORT_STATUS.VERIFIED, REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.RESOLVED];
  const isRej = currentStatus === REPORT_STATUS.REJECTED || currentStatus === REPORT_STATUS.CANCELLED;
  const idx   = steps.indexOf(currentStatus);

  return (
    <div className="timeline-wrap">
      {steps.map((s, i) => {
        const done   = !isRej && i <= idx;
        const active = !isRej && i === idx;
        return (
          <React.Fragment key={s}>
            <div className={`tl-step ${done ? "done" : ""} ${active ? "active-step" : ""}`}>
              <div className="tl-dot">{done ? <IcoCheck size={11} /> : i + 1}</div>
              <span className="tl-label">{STATUS_LABELS[s]}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`tl-line ${!isRej && i < idx ? "done" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
      {isRej && (
        <span className="tl-rejected-badge">
          {currentStatus === REPORT_STATUS.CANCELLED ? "Cancelled" : "Rejected"}
        </span>
      )}
    </div>
  );
}

function BulkBar({ count, onComplete, onAssign, onCancel, onClear }) {
  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} selected</span>
      <button className="bulk-btn b-complete" onClick={onComplete}><IcoCheck size={13} /> Complete All</button>
      <button className="bulk-btn b-assign"   onClick={onAssign}><IcoUsers size={13} /> Assign All</button>
      <button className="bulk-btn b-reject"   onClick={onCancel}><IcoBan size={13} /> Cancel All</button>
      <button className="bulk-btn b-clear"    onClick={onClear}><IcoX size={13} /> Clear</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// ASSIGN CONTRACTOR SECTION — used inside ViewModal
// ═══════════════════════════════════════════════════════════════════════════
function AssignContractorSection({ report, initialProject, onAssigned }) {
  const [contractors, setContractors] = React.useState([]);
  const [project,     setProject]     = React.useState(initialProject || null);
  const [selectedId,  setSelectedId]  = React.useState(
    initialProject?.contractor?.id ?? initialProject?.contractor_id ?? null
  );
  const [loading,   setLoading]   = React.useState(true);
  const [assigning, setAssigning] = React.useState(false);
  const [error,     setError]     = React.useState(null);
  const [success,   setSuccess]   = React.useState(null);

  React.useEffect(() => {
    getAvailableContractors().then(res => {
      if (res.success) setContractors(res.data || []);
      setLoading(false);
    });
  }, []);

  const handleAssign = async () => {
    if (!selectedId) return;
    setAssigning(true); setError(null); setSuccess(null);

    let projectId = project?.id;

    if (!projectId) {
      const res = await createProject({ report_id: report.id });
      if (!res.success) {
        setError(res.error || "Failed to create project");
        setAssigning(false);
        return;
      }
      projectId = res.data?.id;
      setProject(res.data);
    }

    const res = await assignContractor(projectId, selectedId);
    if (!res.success) {
      setError(res.error || "Failed to assign contractor");
      setAssigning(false);
      return;
    }
    setProject(res.data);
    const found = contractors.find(c => c.id === selectedId);
    setSuccess(`Assigned to ${found?.full_name || "contractor"}`);
    setAssigning(false);
    onAssigned?.(res.data);
  };

  const projStatus        = project?.status?.toLowerCase();
  const assignedName      = project?.contractor?.full_name
                         ?? project?.contractor?.email
                         ?? contractors.find(c => c.id === project?.contractor_id)?.full_name
                         ?? null;

  const s = {
    wrap:    { borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 16 },
    title:   { display: "flex", alignItems: "center", gap: 7, fontSize: "0.83rem", fontWeight: 700,
               textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--subtext)", marginBottom: 12 },
    current: { display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 12px",
               background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, flexWrap: "wrap" },
    row:     { display: "flex", gap: 8, alignItems: "center", marginTop: 8 },
    select:  { flex: 1, background: "var(--input-bg,var(--card))", border: "1px solid var(--input-border,var(--border))",
               borderRadius: 8, padding: "8px 12px", fontSize: "0.88rem", color: "var(--text)",
               fontFamily: "inherit", outline: "none" },
    statBadge: (st) => {
      const colors = { scheduled: "#7b1fa2", in_progress: "#1e88e5", completed: "#43a047", cancelled: "#9e9e9e" };
      const c = colors[st] || "#aaa";
      return { fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 10,
               background: c + "22", color: c };
    },
    btn: (disabled) => ({
      display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      background: disabled ? "var(--border)" : "var(--primary)",
      color: disabled ? "var(--subtext)" : "#fff",
      border: "none", borderRadius: 8, padding: "8px 16px",
      fontSize: "0.83rem", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer",
    }),
    err: { fontSize: "0.78rem", color: "var(--danger,#ef4444)", fontWeight: 600, marginTop: 6 },
    ok:  { fontSize: "0.78rem", color: "#16a34a",               fontWeight: 600, marginTop: 6 },
  };

  return (
    <div style={s.wrap}>
      <div style={s.title}><IcoUsers size={13} /> Assign Contractor</div>

      <div style={s.current}>
        <span style={{ fontSize: "0.82rem", color: "var(--subtext)" }}>Current:</span>
        {project
          ? <>
              <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>
                {assignedName || "No contractor yet"}
              </span>
              {projStatus && (
                <span style={s.statBadge(projStatus)}>
                  {ASSIGN_STATUS_LABELS[projStatus] ?? projStatus}
                </span>
              )}
            </>
          : <span style={{ fontSize: "0.85rem", color: "var(--subtext)", fontStyle: "italic" }}>
              Unassigned — no project created yet
            </span>
        }
      </div>

      {loading
        ? <p style={{ fontSize: "0.85rem", color: "var(--subtext)" }}>Loading contractors…</p>
        : (
          <div style={s.row}>
            <select
              style={s.select}
              value={selectedId ?? ""}
              onChange={e => setSelectedId(Number(e.target.value) || null)}
            >
              <option value="">Select a contractor…</option>
              {contractors.map(c => (
                <option key={c.id} value={c.id}>
                  {c.full_name || c.email}
                  {" · "}{c.active_project_count} active
                  {" · "}{c.is_available ? "✓ Available" : "✗ Busy"}
                </option>
              ))}
            </select>
            <button
              style={s.btn(!selectedId || assigning)}
              disabled={!selectedId || assigning}
              onClick={handleAssign}
            >
              {assigning ? "Assigning…" : project?.contractor_id ? "Reassign" : "Assign"}
            </button>
          </div>
        )
      }
      {error   && <div style={s.err}>{error}</div>}
      {success && <div style={s.ok}>✓ {success}</div>}
    </div>
  );
}

// REFACTORED ACTION BUTTONS — Removed Assign button
// New flow: pending → Verify → verified → Start → in_progress → Complete → resolved
// ═══════════════════════════════════════════════════════════════════════════
function ActionButtons({ r, onVerify, onStart, onComplete, onCancel, isPatching }) {
  const st = r.status?.toLowerCase();
  return (
    <div className="action-btns">
      {st === REPORT_STATUS.PENDING  && (
        <button disabled={isPatching} className="action-btn ab-verify" onClick={e => { e.stopPropagation(); onVerify(); }}>
          <IcoShield size={11}/> Verify
        </button>
      )}
      {st === REPORT_STATUS.VERIFIED && (
        <button disabled={isPatching} className="action-btn ab-start" onClick={e => { e.stopPropagation(); onStart(); }}>
          <IcoWrench size={11}/> Start
        </button>
      )}
      {(st === REPORT_STATUS.VERIFIED || st === REPORT_STATUS.IN_PROGRESS) && (
        <button disabled={isPatching} className="action-btn ab-complete" onClick={e => { e.stopPropagation(); onComplete(); }}>
          <IcoCheck size={11}/> Complete
        </button>
      )}
      {![REPORT_STATUS.RESOLVED, REPORT_STATUS.REJECTED, REPORT_STATUS.CANCELLED].includes(st) && (
        <button disabled={isPatching} className="action-btn ab-reject" onClick={e => { e.stopPropagation(); onCancel(); }}>
          <IcoBan size={11}/> Cancel
        </button>
      )}
    </div>
  );
}

const PAGE_SIZE = 25;

function AdminManageReports() {
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [page,       setPage]       = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [search,         setSearch]         = useState("");
  const [filterType,     setFilterType]     = useState("All");
  const [filterSeverity, setFilterSeverity] = useState("All");
  const [filterStatus,   setFilterStatus]   = useState("All");
  const [filterDate,     setFilterDate]     = useState("All");
  const [filtersOpen,    setFiltersOpen]    = useState(false);

  const [sortCol, setSortCol] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  const [selected, setSelected] = useState(new Set());

  const [viewReport,     setViewReport]     = useState(null);
  const [viewOpenAssign, setViewOpenAssign] = useState(false);
  const [completeReport, setCompleteReport] = useState(null);
  const [cancelReport,   setCancelReport]   = useState(null);

  // Project map: report_id → project (for Assigned To column + ViewModal)
  const [projectByReportId, setProjectByReportId] = useState({});

  // How many comments the admin has already seen per report_id, so we can
  // compute an "unread notes" badge (table row + ViewModal Notes tab).
  const [seenCounts, setSeenCounts] = useState(() => loadNotesSeen());
  const [bulkMode,       setBulkMode]       = useState(null);
  const [bulkConfirm,    setBulkConfirm]    = useState(null); // { status, label, verb, danger }
  const [exportAllLoading, setExportAllLoading] = useState(false);


  // ═════════════════════════════════════════════════════════════════
  // COMMENTED OUT: Teams state — moved to next version
  // const [teams, setTeams] = useState(TEAMS_DEFAULT);
  // ═════════════════════════════════════════════════════════════════

  const [patching, setPatching] = useState(new Set());

  // ═════════════════════════════════════════════════════════════════
  // CRITICAL FIX: patchStatus uses functional updates to avoid stale closures
  // ═════════════════════════════════════════════════════════════════
  const patchStatus = useCallback(async (id, status, extra = {}) => {
    let shouldAbort = false;
    setPatching(prev => {
      if (prev.has(id)) {
        shouldAbort = true;
        return prev;
      }
      return new Set(prev).add(id);
    });

    if (shouldAbort) return false;

    setError(null);

    const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : status;

    const res = await updateReport(id, { status: normalizedStatus, ...extra });

    if (res.success) {
      setReports(prev =>
        prev.map(r =>
          r.id === id ? { ...r, status: normalizedStatus, ...extra } : r
        )
      );
    } else {
      setError(res.error || `Failed to update report #${String(id).padStart(3, '0')}. Please try again.`);
    }

    setPatching(prev => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });

    return res.success;
  }, []);

  // ═════════════════════════════════════════════════════════════════
  // REFACTORED STATUS HANDLERS — No more assign handler
  // ═════════════════════════════════════════════════════════════════
  const handleVerify  = useCallback((id) => patchStatus(id, REPORT_STATUS.VERIFIED), [patchStatus]);
  // "Start" no longer patches status — it opens ViewModal with the assignment section revealed.
  // The IN_PROGRESS transition now only happens via the contractor-accept endpoint.
  const handleStart = useCallback((id) => {
    setViewReport(prev => {
      // If the modal is already open for this report, just reveal the assign section.
      if (prev?.id === id) return prev;
      return reports.find(r => r.id === id) ?? null;
    });
    setViewOpenAssign(true);
  }, [reports]);

  // ═════════════════════════════════════════════════════════════════
  // COMMENTED OUT: handleAssign — moved to next version
  /*
  const handleAssign = useCallback(async (id, teamOrWorker) => {
    const success = await patchStatus(id, "assigned", { assigned_to: teamOrWorker.name });
    if (success) {
      setAssignReport(null);
      const refreshed = await getReport(id);
      if (refreshed.success) {
        setReports(prev => prev.map(r => r.id === id ? refreshed.data : r));
      }
    }
    return success;
  }, [patchStatus]);
  */
  // ═════════════════════════════════════════════════════════════════

  const handleCancel = useCallback(async (id, reason) => {
    const success = await patchStatus(id, REPORT_STATUS.CANCELLED, { decline_reason: reason });
    if (success) setCancelReport(null);
    return success;
  }, [patchStatus]);

  const handleCompleteSuccess = useCallback((id) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: REPORT_STATUS.RESOLVED } : r));
    setCompleteReport(null);
  }, []);

  const selectedIds = [...selected];

  const bulkPatch = useCallback(async (statusValue) => {
    setSelected(prev => {
      const ids = [...prev];
      Promise.all(ids.map(id => patchStatus(id, statusValue))).then(() => {
        setSelected(new Set());
        setBulkMode(null);
      });
      return prev;
    });
  }, [patchStatus]);

  const exportAll = useCallback(async () => {
    setExportAllLoading(true);
    try {
      const params = {};
      if (filterType     !== "All") params.damage_type = filterType.toLowerCase();
      if (filterSeverity !== "All") params.severity    = filterSeverity;
      if (filterStatus   !== "All") params.status      = filterStatus;

      const first = await getReports({ ...params, page: 1, page_size: 100 });
      if (!first.success) { setExportAllLoading(false); return; }

      const serverTotal = first.data?.total ?? 0;
      const allRows = [...(first.data?.results ?? [])];

      if (serverTotal > 100) {
        const pageCount = Math.ceil(serverTotal / 100);
        const pages = await Promise.all(
          Array.from({ length: pageCount - 1 }, (_, i) =>
            getReports({ ...params, page: i + 2, page_size: 100 })
          )
        );
        pages.forEach(r => { if (r.success) allRows.push(...(r.data?.results ?? [])); });
      }

      let rows = allRows;
      if (search) {
        const q = search.toLowerCase();
        rows = rows.filter(r =>
          String(r.id).includes(q) ||
          (r.barangay ?? "").toLowerCase().includes(q) ||
          (r.street_name ?? "").toLowerCase().includes(q) ||
          (r.owner?.full_name ?? "").toLowerCase().includes(q)
        );
      }

      exportCSV(rows, "all");
    } catch {
      // silently swallow — export is best-effort
    } finally {
      setExportAllLoading(false);
    }
  }, [filterType, filterSeverity, filterStatus, search]);

  // fetchProjects — builds a report_id → project map for assignment display.
  const fetchProjects = useCallback(async () => {
    const res = await getProjects();
    if (res.success && Array.isArray(res.data)) {
      const map = {};
      res.data.forEach(p => { if (p.report_id) map[p.report_id] = p; });
      setProjectByReportId(map);
    }
  }, []);

  // handleAssigned — called by AssignContractorSection when assignment succeeds.
  const handleAssigned = useCallback((project) => {
    if (project?.report_id) {
      setProjectByReportId(prev => ({ ...prev, [project.report_id]: project }));
    }
  }, []);

  // markNotesSeen — called by ViewModal when the admin views the Notes tab,
  // so the unread badge (row + tab) clears for that report.
  const markNotesSeen = useCallback((reportId, count) => {
    setSeenCounts(prev => {
      if (prev[reportId] === count) return prev;
      const next = { ...prev, [reportId]: count };
      saveNotesSeen(next);
      return next;
    });
  }, []);

  // fetchPage — always uses the current server-side filter state via closure.
  // Call with a page number; server filters (status/damage_type/severity) are
  // applied here so the backend returns only matching rows before pagination.
  const fetchPage = useCallback(async (pg = 1) => {
    setLoading(true);
    setError(null);

    const res = await getReports({
      page:        pg,
      page_size:   PAGE_SIZE,
      // "All" is stripped by cleanParams inside getReports → buildQS
      status:      filterStatus   !== "All" ? filterStatus   : undefined,
      damage_type: filterType     !== "All" ? filterType     : undefined,
      severity:    filterSeverity !== "All" ? filterSeverity : undefined,
    });

    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }

    const raw = res.data?.results ?? [];
    console.log("SAMPLE REPORT OBJECT:", raw[0]); // TEMP — remove after checking
    setReports(raw);
    setTotalCount(res.data?.total ?? 0);
    setPage(pg);
    setSelected(new Set()); // clear row selections on page change
    setLoading(false);

    reverseGeocodeAll(raw).then(geocoded => setReports(geocoded));
  }, [filterStatus, filterType, filterSeverity]); // re-created when server filters change

  // Re-fetch from page 1 whenever the server-side filter callback changes.
  useEffect(() => { fetchPage(1); fetchProjects(); }, [fetchPage, fetchProjects]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filtered = reports
    .filter(r => {
      // status, damage_type, severity are already filtered server-side.
      // Only apply client-side predicates that the backend doesn't support.
      const q  = search.toLowerCase();
      const bg = barangay(r).toLowerCase();
      const id = String(r.id).padStart(3, "0");
      if (search && !bg.includes(q) && !id.includes(q) && !street(r).toLowerCase().includes(q)) return false;
      if (filterDate !== "All" && r.created_at) {
        const d = new Date(r.created_at), now = new Date();
        if (filterDate === "Today" && d.toDateString() !== now.toDateString()) return false;
        if (filterDate === "Week"  && d < new Date(now - 7 * 86400000))        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortCol === "created_at") return mul * (new Date(a.created_at ?? 0) - new Date(b.created_at ?? 0));
      if (sortCol === "severity")   return mul * (severity(a) > severity(b) ? 1 : -1);
      if (sortCol === "status")     return mul * ((a.status ?? "") > (b.status ?? "") ? 1 : -1);
      if (sortCol === "priority") {
        const o = { high: 0, medium: 1, low: 2 };
        return mul * (o[getPriority(a)] - o[getPriority(b)]);
      }
      return 0;
    });

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id));
  const toggleAll   = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map(r => r.id)));
  const toggleOne   = (id) =>
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const hasActiveFilters = filterType !== "All" || filterSeverity !== "All" || filterStatus !== "All" || filterDate !== "All";

  return (
    <div className="manage-container">
      <StatsCards reports={reports} totalCount={totalCount} />
      <div className="manage-filters">
        <div className="filters-top-row">
          <h2 className="manage-title">Manage Reports</h2>
          <div className="refresh-area">
            <button className="refresh-btn" onClick={() => fetchPage(page)}>
              <IcoRefresh size={12} /> Refresh
            </button>
          </div>
        </div>

        <div className="search-row">
          <div className="search-box">
            <IcoSearch size={14} className="search-icon" />
            <input
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ID, barangay or street…"
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch("")}>
                <IcoX size={12} />
              </button>
            )}
          </div>

          <div className="filters-trigger-wrap">
            <button
              className={`filters-trigger ${filtersOpen ? "open" : ""} ${hasActiveFilters ? "active" : ""}`}
              onClick={() => setFiltersOpen(o => !o)}
            >
              <IcoSliders size={14} />
              <span>Filters</span>
              {hasActiveFilters && <span className="filters-dot" />}
              <IcoChevronDown size={14} className="filters-chevron" />
            </button>
          </div>

          <div className="export-btns-wrap">
            <button className="btn-export" onClick={() => exportCSV(reports, "page")}>
              <IcoDownload size={14} /> Export Page
            </button>
            <button
              className="btn-export btn-export--all"
              onClick={exportAll}
              disabled={exportAllLoading}
            >
              {exportAllLoading
                ? <><IcoRefresh size={14} className="spin" /> Exporting…</>
                : <><IcoDownload size={14} /> Export All</>}
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="filters-drawer">
            <div className="filters-row">
              <div className="filter-group">
                <label>Damage Type</label>
                <div className="filter-buttons">
                  {["All", "Crack", "Pothole"].map(t => (
                    <button
                      key={t}
                      className={filterType === t ? "active" : ""}
                      onClick={() => setFilterType(t)}
                    >{t}</button>
                  ))}
                </div>
              </div>

              <div className="filter-group custom-select">
                <label>Severity</label>
                <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
                  <option value="All">All Severity</option>
                  <option value="non_critical">Non-Critical</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="filter-group custom-select">
                <label>Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="All">All Status</option>
                  {STATUS_FLOW.map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group custom-select">
                <label>Date</label>
                <select value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                  <option value="All">All Time</option>
                  <option value="Today">Today</option>
                  <option value="Week">This Week</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="filters-footer">
                <button className="filters-clear" onClick={() => { setFilterType("All"); setFilterSeverity("All"); setFilterStatus("All"); setFilterDate("All"); }}>
                  <IcoX size={12} /> Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <div className="admin-error-banner">{error}</div>}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onComplete={() => setBulkConfirm({ status: REPORT_STATUS.RESOLVED,  label: "Mark as Resolved", verb: "resolve",  danger: false })}
          onAssign={() => setBulkMode("assign")}
          onCancel={() => setBulkConfirm({ status: REPORT_STATUS.CANCELLED, label: "Cancel",           verb: "cancel",   danger: true  })}
          onClear={() => setSelected(new Set())}
        />
      )}

      {/* ── Bulk action confirmation dialog ──────────────────────────────── */}
      {bulkConfirm && (
        <div
          className="bmr-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setBulkConfirm(null); }}
        >
          <div className="bmr-box" role="dialog" aria-modal="true" aria-labelledby="bmr-title">
            <div className="bmr-header">
              {bulkConfirm.danger ? <IcoBan size={20} className="bmr-icon bmr-icon--danger" /> : <IcoCheck size={20} className="bmr-icon bmr-icon--success" />}
              <h3 id="bmr-title" className="bmr-title">
                {bulkConfirm.label} {selected.size} report{selected.size !== 1 ? "s" : ""}?
              </h3>
            </div>
            <p className="bmr-desc">
              This will {bulkConfirm.verb}{" "}
              <strong>{selected.size} report{selected.size !== 1 ? "s" : ""}</strong> at once.
              This action cannot be undone.
            </p>
            <div className="bmr-footer">
              <button className="bmr-cancel-btn" onClick={() => setBulkConfirm(null)}>
                Go back
              </button>
              <button
                className={`bmr-confirm-btn${bulkConfirm.danger ? " bmr-confirm-btn--danger" : ""}`}
                onClick={() => { setBulkConfirm(null); bulkPatch(bulkConfirm.status); }}
              >
                {bulkConfirm.label}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="manage-table-container">
        <div className="table-responsive">
          <table className="manage-table">
            <colgroup>
              <col className="col-check" />
              <col className="col-report" />
              <col className="col-reported" />
              <col className="col-damage" />
              <col className="col-photo" />
              <col className="col-severity" />
              <col className="col-priority" />
              <col className="col-status" />
              <col className="col-assigned" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                {[
                  [null,        <input type="checkbox" checked={allSelected} onChange={toggleAll} className="amr-cb" />, false],
                  [null,        "Report",      false],
                  ["created_at","Reported",    true ],
                  [null,        "Damage Type", false],
                  [null,        "Photo",       false],
                  ["severity",  "Severity",    true ],
                  ["priority",  "Priority",    true ],
                  ["status",    "Status",      true ],
                  [null,        "Assigned To", false],
                  [null,        "Actions",     false],
                ].map(([col, label, sortable], i) => (
                  <th
                    key={i}
                    onClick={sortable ? () => handleSort(col) : undefined}
                    className={sortable ? "sortable" : ""}
                  >
                    <div className="th-content">
                      {label}
                      {sortable && <IcoSort size={12} active={sortCol === col} dir={sortDir} />}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="no-data">Loading reports…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="no-data">No reports found</td></tr>
              ) : filtered.map(r => {
                const st       = r.status?.toLowerCase();
                const pri      = getPriority(r);
                const sev      = severity(r).toLowerCase();
                const isCrit   = sev === "critical";
                const isSelec  = selected.has(r.id);
                const media    = mediaFull(r);
                const unread   = unreadNotesCount(r, seenCounts);

                return (
                  <tr
                    key={r.id}
                    className={`clickable-row ${isSelec ? "selected-row" : ""} ${isCrit ? "critical-row" : ""}`}
                    onClick={() => setViewReport(r)}
                  >
                    <td className="col-check" onClick={e => { e.stopPropagation(); toggleOne(r.id); }}>
                      <input type="checkbox" checked={isSelec} onChange={() => toggleOne(r.id)} className="amr-cb" />
                    </td>

                    <td className="col-report">
                      <div className="report-number-row">
                        <span className="report-number">#{String(r.id).padStart(3, "0")}</span>
                        {unread > 0 && (
                          <span className="notes-dot" title={`${unread} new note${unread !== 1 ? "s" : ""}`}>
                            {unread > 9 ? "9+" : unread}
                          </span>
                        )}
                      </div>
                      <div className="report-location">
                        <span className="report-loc-barangay">{barangay(r)}</span>
                        {street(r) && (
                          <span className="report-loc-street">
                            {isCoordinateString(street(r)) ? "Translating…" : street(r)}
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="col-reported time-ago-cell">{timeAgo(r.created_at)}</td>

                    <td>
                      <span className="damage-type-text">
                        {damageType(r)}
                      </span>
                    </td>

                    <td className="col-photo" onClick={e => e.stopPropagation()}>
                      {media?.url ? (
                        <img
                          src={media.url}
                          alt=""
                          className="photo-thumb"
                          onClick={e => { e.stopPropagation(); setViewReport(r); }}
                          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <div className="photo-fallback" style={{ display: media?.url ? 'none' : 'flex' }}>
                        <IcoCamera size={16} className="photo-placeholder-icon" />
                      </div>
                    </td>

                    <td className="col-severity"><Badge text={severity(r)} className={`sev-badge sev-${sev}`} /></td>
                    <td className="col-priority"><Badge text={pri}          className={`pri-badge pri-${pri}`} /></td>
                    <td className="col-status">
                      <Badge text={STATUS_LABELS[st] ?? st} className={`status-badge st-${st}`} />
                      {r.sla_status === "overdue" && (
                        <span style={{ display:"inline-block", marginLeft:4, padding:"1px 6px", borderRadius:10, fontSize:"0.68rem", fontWeight:600, background:"#f59e0b", color:"#fff", verticalAlign:"middle" }}>Overdue</span>
                      )}
                      {r.sla_status === "escalated" && (
                        <span style={{ display:"inline-block", marginLeft:4, padding:"1px 6px", borderRadius:10, fontSize:"0.68rem", fontWeight:600, background:"#ef4444", color:"#fff", verticalAlign:"middle" }}>Escalated</span>
                      )}
                      {r.requires_admin_review && (
                        <span
                          title={r.review_reason ?? "Flagged for manual review"}
                          style={{ display:"inline-block", marginLeft:4, padding:"1px 6px", borderRadius:10, fontSize:"0.68rem", fontWeight:600, background:"#1565c0", color:"#fff", verticalAlign:"middle", cursor:"help" }}
                        >Review</span>
                      )}
                    </td>

                    <td className="col-assigned" onClick={e => e.stopPropagation()}>
                      {(() => {
                        const proj = projectByReportId[r.id];
                        if (!proj) return <span className="unassigned">— Unassigned</span>;
                        const pst  = proj.status?.toLowerCase();
                        const name = proj.contractor?.full_name
                                  ?? proj.contractor?.email
                                  ?? "—";
                        return (
                          <div className="assigned-cell-wrapper">
                            <span className="assigned-name" style={{ fontSize: "0.78rem" }}>{name}</span>
                            <Badge
                              text={ASSIGN_STATUS_LABELS[pst] ?? pst}
                              className={`status-badge st-${pst}`}
                            />
                          </div>
                        );
                      })()}
                    </td>

                    <td className="col-actions" onClick={e => e.stopPropagation()}>
                      <ActionButtons
                        r={r}
                        onVerify={()   => handleVerify(r.id)}
                        // ═══════════════════════════════════════════
                        // COMMENTED OUT: onAssign — moved to next version
                        // onAssign={()   => setAssignReport(r)}
                        // ═══════════════════════════════════════════
                        onStart={()    => handleStart(r.id)}
                        onComplete={() => setCompleteReport(r)}
                        onCancel={()   => setCancelReport(r)}
                        isPatching={patching.has(r.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Pagination bar ────────────────────────────────────────────── */}
        {(() => {
          const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
          const start      = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
          const end        = Math.min(page * PAGE_SIZE, totalCount);
          return (
            <div className="amr-pagination">
              <span className="amr-page-info">
                {totalCount === 0
                  ? "No reports"
                  : `Showing ${start}–${end} of ${totalCount} report${totalCount !== 1 ? "s" : ""}`}
              </span>
              <div className="amr-page-controls">
                <button
                  className="amr-page-btn"
                  disabled={page <= 1 || loading}
                  onClick={() => fetchPage(page - 1)}
                >
                  ← Previous
                </button>
                <span className="amr-page-numbers">
                  Page {page} of {totalPages}
                </span>
                <button
                  className="amr-page-btn"
                  disabled={page >= totalPages || loading}
                  onClick={() => fetchPage(page + 1)}
                >
                  Next →
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════ */}

      {viewReport && !completeReport && !cancelReport && createPortal(
        <ViewModal
          report={viewReport}
          project={projectByReportId[viewReport.id] ?? null}
          openAssign={viewOpenAssign}
          unreadNotes={unreadNotesCount(viewReport, seenCounts)}
          onClose={() => { setViewReport(null); setViewOpenAssign(false); }}
          onMarkComplete={r => { setCompleteReport(r); setViewReport(null); setViewOpenAssign(false); }}
          onCancel={r       => { setCancelReport(r);   setViewReport(null); setViewOpenAssign(false); }}
          onVerify={id      => { handleVerify(id); setViewReport(p => p ? { ...p, status: REPORT_STATUS.VERIFIED } : null); }}
          onAssigned={handleAssigned}
          onNotesSeen={markNotesSeen}
        />,
        document.body
      )}

      {completeReport && createPortal(
        <CompleteModal
          report={completeReport}
          onClose={() => setCompleteReport(null)}
          onSuccess={handleCompleteSuccess}
        />,
        document.body
      )}

      {bulkMode === "assign" && (
        <BulkAssignModal
          count={selectedIds.length}
          projectByReportId={projectByReportId}
          selectedIds={selectedIds}
          onClose={() => setBulkMode(null)}
          onDone={() => {
            setSelected(new Set());
            setBulkMode(null);
            fetchProjects();
          }}
        />
      )}

      {cancelReport && createPortal(
        <CancelModal
          report={cancelReport}
          onClose={() => setCancelReport(null)}
          onCancel={handleCancel}
        />,
        document.body
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL COMPONENTS (mostly unchanged, except ViewModal)
// ═══════════════════════════════════════════════════════════════════════════

function ModalShell({ maxWidth = 860, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content modal-content-${maxWidth <= 520 ? 'sm' : maxWidth <= 640 ? 'md' : 'lg'}`} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
function ModalTitle({ children, colorClass }) {
  return <h3 className={`modal-title ${colorClass || ""}`}>{children}</h3>;
}
function CloseBtn({ onClose }) {
  return <button className="modal-close-btn" onClick={onClose}><IcoX size={20} /></button>;
}
function InfoBlock({ children }) {
  return <div className="reporter-info">{children}</div>;
}
function InfoRow({ label, children }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-value">{children}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMENT SECTION — used inside ViewModal
// ═══════════════════════════════════════════════════════════════════════════
function CommentSection({ reportId }) {
  const [comments,  setComments]  = React.useState([]);
  const [cLoading,  setCLoading]  = React.useState(true);
  const [cText,     setCText]     = React.useState("");
  const [cSending,  setCSending]  = React.useState(false);
  const [cErr,      setCErr]      = React.useState(null);
  const [cSent,     setCSent]     = React.useState(false);
  const endRef = React.useRef(null);

  const loadComments = React.useCallback(async () => {
    setCLoading(true);
    const res = await getComments(reportId);
    setCLoading(false);
    if (res.success) setComments(Array.isArray(res.data) ? res.data : []);
  }, [reportId]);

  React.useEffect(() => { loadComments(); }, [loadComments]);

  const handleSend = async () => {
    const trimmed = cText.trim();
    if (!trimmed) return;
    setCSending(true); setCErr(null);
    const res = await addComment(reportId, trimmed);
    setCSending(false);
    if (!res.success) { setCErr(res.error || "Failed to send."); return; }
    setCText(""); setCSent(true);
    setTimeout(() => setCSent(false), 3000);
    await loadComments();
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  const initials = (name = "") =>
    (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const fmtMini = (iso) =>
    iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "";

  const roleColor = (role) => {
    if (role === "admin" || role === "superadmin") return "#4338ca";
    if (role === "contractor") return "#0d9488";
    return "#6b7280";
  };

  const s = {
    wrap:  { borderTop: "1px solid var(--border)", marginTop: 20, paddingTop: 16 },
    title: { display:"flex", alignItems:"center", gap:7, fontSize:"0.83rem", fontWeight:700,
              textTransform:"uppercase", letterSpacing:"0.05em", color:"var(--subtext)", marginBottom:12 },
    list:  { display:"flex", flexDirection:"column", gap:10,
              maxHeight:260, overflowY:"auto", marginBottom:14, paddingRight:4 },
    row:   { display:"flex", gap:9, alignItems:"flex-start" },
    ava:   (role) => ({ width:30, height:30, borderRadius:"50%", flexShrink:0,
              background: role==="admin"||role==="superadmin" ? "rgba(99,102,241,0.14)" : "rgba(13,148,136,0.14)",
              color: roleColor(role), display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:"0.68rem", fontWeight:700 }),
    body:  { display:"flex", flexDirection:"column", gap:3 },
    meta:  { display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" },
    name:  { fontSize:"0.78rem", fontWeight:700, color:"var(--text)" },
    role:  (role) => ({ fontSize:"0.68rem", fontWeight:600, padding:"1px 6px", borderRadius:10,
              background: roleColor(role)+"22", color: roleColor(role) }),
    time:  { fontSize:"0.7rem", color:"var(--subtext)" },
    bubble:{ fontSize:"0.86rem", color:"var(--text)", background:"var(--bg)",
              border:"1px solid var(--border)", borderRadius:10, padding:"7px 11px", margin:0,
              lineHeight:1.5 },
    del:   { fontSize:"0.8rem", color:"var(--subtext)", fontStyle:"italic", margin:0 },
    empty: { textAlign:"center", color:"var(--subtext)", fontSize:"0.86rem", padding:"10px 0" },
    ta:    { width:"100%", boxSizing:"border-box", background:"var(--input-bg,var(--card))",
              border:"1px solid var(--input-border,var(--border))", borderRadius:8,
              padding:"9px 12px", fontSize:"0.88rem", color:"var(--text)", resize:"none",
              fontFamily:"inherit", outline:"none" },
    foot:  { display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:6 },
    char:  { fontSize:"0.75rem", color:"var(--subtext)" },
    right: { display:"flex", alignItems:"center", gap:8 },
    err:   { fontSize:"0.78rem", color:"var(--danger,#ef4444)", fontWeight:600 },
    ok:    { fontSize:"0.78rem", color:"#16a34a", fontWeight:600 },
    send:  { display:"inline-flex", alignItems:"center", gap:5, background:"var(--primary)",
              color:"#fff", border:"none", borderRadius:8, padding:"7px 14px",
              fontSize:"0.82rem", fontWeight:700, cursor:"pointer", opacity:1 },
  };

  const roleLabel = (role) => {
    if (role === "admin" || role === "superadmin") return "Admin";
    if (role === "contractor") return "Contractor";
    return "Citizen";
  };

  return (
    <div style={s.wrap}>
      <div style={s.title}>
        <IcoUsers size={13} /> Discussion Thread
        {comments.length > 0 && (
          <span style={{ background:"var(--primary)", color:"#fff", borderRadius:20,
            fontSize:"0.68rem", fontWeight:700, padding:"1px 7px" }}>
            {comments.length}
          </span>
        )}
      </div>

      {cLoading ? (
        <p style={s.empty}>Loading…</p>
      ) : comments.length === 0 ? (
        <p style={s.empty}>No messages yet.</p>
      ) : (
        <div style={s.list}>
          {comments.map((c) => (
            <div key={c.id} style={s.row}>
              <div style={s.ava(c.user?.role)}>{initials(c.user?.full_name)}</div>
              <div style={s.body}>
                <div style={s.meta}>
                  <span style={s.name}>{c.user?.full_name ?? "Unknown"}</span>
                  <span style={s.role(c.user?.role)}>{roleLabel(c.user?.role)}</span>
                  <span style={s.time}>{fmtMini(c.created_at)}</span>
                </div>
                {c.is_deleted
                  ? <p style={s.del}>[Message removed]</p>
                  : <p style={s.bubble}>{c.content}</p>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      <textarea
        style={s.ta}
        rows={3}
        maxLength={1000}
        placeholder="Add a note or reply to this report thread…"
        value={cText}
        onChange={(e) => setCText(e.target.value)}
        disabled={cSending}
      />
      <div style={s.foot}>
        <span style={s.char}>{cText.length}/1000</span>
        <div style={s.right}>
          {cErr  && <span style={s.err}>{cErr}</span>}
          {cSent && <span style={s.ok}>✓ Sent!</span>}
          <button
            style={{ ...s.send, opacity: (cSending || !cText.trim()) ? 0.45 : 1,
              cursor: (cSending || !cText.trim()) ? "not-allowed" : "pointer" }}
            onClick={handleSend}
            disabled={cSending || !cText.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TABBED ViewModal — matches AdminManageRequests popup design
// ═══════════════════════════════════════════════════════════════════════════
function ViewModal({ report: r, project, openAssign = false, unreadNotes = 0, onClose, onMarkComplete, onCancel, onVerify, onAssigned, onNotesSeen }) {
  const st     = r.status?.toLowerCase();
  const sev    = severity(r).toLowerCase();
  const pri    = getPriority(r);
  const conf   = r.ai_confidence ?? r.confidence ?? null;
  const mCount = r.media_attachments?.length ?? 0;

  const isTerminal = [REPORT_STATUS.RESOLVED, REPORT_STATUS.REJECTED, REPORT_STATUS.CANCELLED].includes(st);

  const [activeTab,   setActiveTab]   = useState("details");
  const [completion,  setCompletion]  = useState(null);
  const [compLoading, setCompLoading] = useState(false);
  const [showAssign,  setShowAssign]  = useState(openAssign);

  useEffect(() => {
    if (st !== REPORT_STATUS.RESOLVED || !project?.id) return;
    let cancelled = false;
    setCompLoading(true);
    setCompletion(null);
    getProjectCompletion(project.id)
      .then(res => { if (!cancelled) setCompletion(res.data ?? null); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCompLoading(false); });
    return () => { cancelled = true; };
  }, [st, project?.id]);

  // Mark notes as seen (clears the unread badge) once the admin actually
  // opens the Notes tab for this report.
  useEffect(() => {
    if (activeTab === "notes") {
      onNotesSeen?.(r.id, commentCount(r));
    }
  }, [activeTab, r.id]);

  const statusLabel = STATUS_LABELS[st] ?? (st ? st.charAt(0).toUpperCase() + st.slice(1) : "Unknown");

  const dateStr = (iso) => iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  const tabs = [
    { id: "details",    label: "Details",    icon: IcoClipboard },
    { id: "media",      label: "Media",      icon: IcoCamera,  badge: mCount > 0 ? mCount : null },
    { id: "notes",      label: "Notes",      icon: IcoUsers,   badge: unreadNotes > 0 ? unreadNotes : null, alertBadge: unreadNotes > 0 },
    { id: "actions",    label: "Actions",    icon: IcoShield,  badge: isTerminal ? null : 3 },
    { id: "updates",    label: "Updates",    icon: IcoClock },
    ...(st === REPORT_STATUS.RESOLVED
      ? [{ id: "completion", label: "Completion", icon: IcoCheck }]
      : []),
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content vmr-tabbed-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}><IcoX size={18} /></button>

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="vmr-header">
          <div className="vmr-header-id">
            <span className="vmr-id-code">RPT-{String(r.id).padStart(5, "0")}</span>
            <span className={`vmr-status-badge vmr-st-${st}`}>{statusLabel}</span>
            {conf !== null && (
              <span className="vmr-ai-badge">AI {Math.round(conf * 100)}%</span>
            )}
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div className="vmr-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`vmr-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.badge != null && (
                <span className={`vmr-tab-badge ${tab.alertBadge ? "vmr-tab-badge--alert" : ""}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Body ───────────────────────────────────────────── */}
        <div className="vmr-body">

          {/* DETAILS */}
          {activeTab === "details" && (
            <div className="vmr-grid">
              <div className="vmr-card">
                <div className="vmr-card-hdr"><IcoUsers size={14}/><span>REPORTER</span></div>
                <div className="vmr-card-body">
                  <div className="vmr-row"><span className="vmr-lbl">Name</span><span className="vmr-val">{r.owner?.full_name ?? "Anonymous"}</span></div>
                  <div className="vmr-row"><span className="vmr-lbl">Contact</span><span className="vmr-val">{r.owner?.phone ?? "—"}</span></div>
                  <div className="vmr-row"><span className="vmr-lbl">Email</span><span className="vmr-val">{r.owner?.email ?? "—"}</span></div>
                </div>
              </div>

              <div className="vmr-card">
                <div className="vmr-card-hdr"><IcoAlert size={14}/><span>DAMAGE INFO</span></div>
                <div className="vmr-card-body">
                  <div className="vmr-row"><span className="vmr-lbl">Type</span><span className="vmr-val">{damageType(r)}</span></div>
                  <div className="vmr-row"><span className="vmr-lbl">Severity</span><span className={`vmr-val sev-badge sev-${sev}`}>{severity(r)}</span></div>
                  <div className="vmr-row"><span className="vmr-lbl">Priority</span><span className={`vmr-val pri-badge pri-${pri}`}>{pri}</span></div>
                  {conf !== null && (
                    <div className="vmr-row"><span className="vmr-lbl">AI Confidence</span><span className="vmr-val">{Math.round(conf * 100)}%</span></div>
                  )}
                </div>
              </div>

              <div className="vmr-card">
                <div className="vmr-card-hdr"><IcoMapPin size={14}/><span>LOCATION</span></div>
                <div className="vmr-card-body">
                  <div className="vmr-row"><span className="vmr-lbl">Barangay</span><span className="vmr-val">{barangay(r)}</span></div>
                  <div className="vmr-row"><span className="vmr-lbl">Street</span><span className="vmr-val">{street(r) || "—"}</span></div>
                </div>
              </div>

              <div className="vmr-card">
                <div className="vmr-card-hdr"><IcoClock size={14}/><span>TIMELINE</span></div>
                <div className="vmr-card-body">
                  <div className="vmr-row"><span className="vmr-lbl">Submitted</span><span className="vmr-val">{dateStr(r.created_at)}</span></div>
                  <div className="vmr-row"><span className="vmr-lbl">Updated</span><span className="vmr-val">{dateStr(r.updated_at ?? r.created_at)}</span></div>
                  <div className="vmr-row"><span className="vmr-lbl">Age</span><span className="vmr-val">{timeAgo(r.created_at)}</span></div>
                </div>
              </div>

              {project && (
                <div className="vmr-card vmr-card--full">
                  <div className="vmr-card-hdr"><IcoWrench size={14}/><span>ASSIGNED CONTRACTOR</span></div>
                  <div className="vmr-card-body">
                    <div className="vmr-row"><span className="vmr-lbl">Name</span><span className="vmr-val">{project.contractor?.business_name ?? project.contractor?.full_name ?? "—"}</span></div>
                    <div className="vmr-row"><span className="vmr-lbl">Project Status</span><span className="vmr-val">{ASSIGN_STATUS_LABELS[project.status] ?? project.status ?? "—"}</span></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MEDIA */}
          {activeTab === "media" && (
            <div className="vmr-media-tab">
              {mCount > 0 ? (
                <>
                  {r.media_attachments.map((att, i) => {
                    const url = resolveMediaUrl(att.file_url);
                    return att.media_type === "video"
                      ? <video key={i} src={url} controls className="vmr-media-main" />
                      : <img key={i} src={url} alt={`Media ${i + 1}`} className="vmr-media-main" />;
                  })}
                </>
              ) : (
                <div className="vmr-media-empty"><IcoCamera size={48}/><p>No media attached</p></div>
              )}
            </div>
          )}

          {/* NOTES */}
          {activeTab === "notes" && (
            <div className="vmr-notes-tab">
              {r.description && (
                <div className="vmr-note-card">
                  <div className="vmr-note-label">Reporter Description</div>
                  <p className="vmr-note-text">{r.description}</p>
                </div>
              )}
              <CommentSection reportId={r.id} />
            </div>
          )}

          {/* ACTIONS */}
          {activeTab === "actions" && (
            <div className="vmr-actions-tab">
              {st === REPORT_STATUS.PENDING && (
                <div className="vmr-action-card">
                  <div className="vmr-action-hdr">
                    <IcoShield size={20} className="vmr-action-ico vmr-ico-verify"/>
                    <div><h4>Verify Report</h4><p>Mark this report as verified and move to queue</p></div>
                  </div>
                  <button className="action-btn ab-verify" onClick={() => onVerify(r.id)}>
                    <IcoShield size={14}/> Verify Report
                  </button>
                </div>
              )}

              {(st === REPORT_STATUS.VERIFIED || st === REPORT_STATUS.IN_PROGRESS) && (
                <div className="vmr-action-card">
                  <div className="vmr-action-hdr">
                    <IcoWrench size={20} className="vmr-action-ico vmr-ico-start"/>
                    <div><h4>Assign Contractor</h4><p>Assign and track a contractor for this report</p></div>
                  </div>
                  <AssignContractorSection
                    report={r}
                    initialProject={project}
                    onAssigned={onAssigned}
                  />
                </div>
              )}

              {(st === REPORT_STATUS.VERIFIED || st === REPORT_STATUS.IN_PROGRESS) && (
                <div className="vmr-action-card">
                  <div className="vmr-action-hdr">
                    <IcoCheck size={20} className="vmr-action-ico vmr-ico-complete"/>
                    <div><h4>Mark as Completed</h4><p>Record completion details and close this report</p></div>
                  </div>
                  <button className="action-btn ab-complete" onClick={() => onMarkComplete(r)}>
                    <IcoCheck size={14}/> Mark as Completed
                  </button>
                </div>
              )}

              {!isTerminal && (
                <div className="vmr-action-card">
                  <div className="vmr-action-hdr">
                    <IcoBan size={20} className="vmr-action-ico vmr-ico-cancel"/>
                    <div><h4>Cancel Report</h4><p>Cancel this report with a reason</p></div>
                  </div>
                  <button className="action-btn ab-reject" onClick={() => onCancel(r)}>
                    <IcoBan size={14}/> Cancel Report
                  </button>
                </div>
              )}

              {isTerminal && (
                <div className="vmr-terminal-note">
                  <IcoCheck size={16}/>
                  This report is <strong>{statusLabel}</strong> — no further actions available.
                </div>
              )}

              {st === REPORT_STATUS.PENDING && (
                <div className="vmr-terminal-note">
                  <IcoShield size={16}/>
                  Verify this report first before assigning a contractor.
                </div>
              )}
            </div>
          )}

          {/* UPDATES */}
          {activeTab === "updates" && (
            <div className="vmr-updates-tab">
              <div className="vmr-update-item">
                <div className="vmr-update-dot"/>
                <div className="vmr-update-content">
                  <p>Report submitted</p>
                  <span>{dateStr(r.created_at)} · {timeAgo(r.created_at)}</span>
                </div>
              </div>
              {r.updated_at && r.updated_at !== r.created_at && (
                <div className="vmr-update-item">
                  <div className="vmr-update-dot vmr-dot-updated"/>
                  <div className="vmr-update-content">
                    <p>Status updated to <strong>{statusLabel}</strong></p>
                    <span>{dateStr(r.updated_at)}</span>
                  </div>
                </div>
              )}
              {project && (
                <div className="vmr-update-item">
                  <div className="vmr-update-dot vmr-dot-assign"/>
                  <div className="vmr-update-content">
                    <p>Contractor assigned — {project.contractor?.business_name ?? project.contractor?.full_name ?? "Unknown"}</p>
                    <span>{dateStr(project.created_at ?? r.updated_at)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* COMPLETION (resolved only) */}
          {activeTab === "completion" && st === REPORT_STATUS.RESOLVED && (
            <div className="vmr-completion-tab">
              {compLoading ? (
                <p className="vmr-compl-loading">Loading completion data…</p>
              ) : !completion ? (
                <p className="vmr-compl-empty">No completion details recorded for this project.</p>
              ) : (
                <>
                  <div className="vmr-grid">
                    {completion.notes && (
                      <div className="vmr-card vmr-card--full">
                        <div className="vmr-card-hdr"><IcoClipboard size={14}/><span>NOTES</span></div>
                        <div className="vmr-card-body">
                          <p className="vmr-compl-notes">{completion.notes}</p>
                        </div>
                      </div>
                    )}

                    {completion.actual_cost != null && (
                      <div className="vmr-card">
                        <div className="vmr-card-hdr"><IcoStar size={14}/><span>ACTUAL COST</span></div>
                        <div className="vmr-card-body">
                          <div className="vmr-row">
                            <span className="vmr-lbl">Total</span>
                            <span className="vmr-val vmr-cost">
                              ₱{Number(completion.actual_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {completion.completed_at && (
                      <div className="vmr-card">
                        <div className="vmr-card-hdr"><IcoClock size={14}/><span>COMPLETED ON</span></div>
                        <div className="vmr-card-body">
                          <div className="vmr-row">
                            <span className="vmr-lbl">Date</span>
                            <span className="vmr-val">{dateStr(completion.completed_at)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {completion.materials_used && Array.isArray(completion.materials_used) && completion.materials_used.length > 0 && (
                      <div className="vmr-card vmr-card--full">
                        <div className="vmr-card-hdr"><IcoWrench size={14}/><span>MATERIALS USED</span></div>
                        <div className="vmr-card-body">
                          <table className="vmr-materials-table">
                            <thead>
                              <tr><th>Material</th><th>Qty</th><th>Unit Cost</th></tr>
                            </thead>
                            <tbody>
                              {completion.materials_used.map((m, i) => (
                                <tr key={i}>
                                  <td>{m.name ?? "—"}</td>
                                  <td>{m.quantity ?? "—"}</td>
                                  <td>{m.unit_cost != null ? `₱${Number(m.unit_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {completion.completion_photos?.length > 0 && (
                    <div className="vmr-compl-photos">
                      <div className="vmr-compl-photos-lbl">Completion Photos</div>
                      <div className="vmr-compl-photos-row">
                        {completion.completion_photos.map(ph => (
                          <img
                            key={ph.id}
                            src={resolveMediaUrl(ph.file_url)}
                            alt={ph.file_name ?? "Completion photo"}
                            className="vmr-compl-photo"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompleteModal({ report: r, onClose, onSuccess }) {
  const [proofFile, setProofFile] = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [comment,   setComment]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState(null);
  const fileRef = useRef(null);
  const media   = mediaFull(r);

  const previewUrlRef = useRef(null);

  const handleFileChange = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    const url = URL.createObjectURL(f);
    previewUrlRef.current = url;
    setProofFile(f);
    setPreview(url);
  };

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleSubmit = async () => {
    setSaving(true); setErr(null);
    if (proofFile) {
      const up = await uploadReportMedia(r.id, proofFile);
      if (!up.success) { setErr("Upload failed: " + (up.error ?? "Unknown")); setSaving(false); return; }
    }
    if (comment.trim()) {
      const cm = await addComment(r.id, comment.trim());
      if (!cm.success) { setErr("Comment failed: " + (cm.error ?? "Unknown")); setSaving(false); return; }
    }
    const res = await updateReport(r.id, { status: REPORT_STATUS.RESOLVED });
    if (!res.success) { setErr("Could not resolve: " + (res.error ?? "Unknown")); setSaving(false); return; }
    setSaving(false);
    onSuccess(r.id);
  };

  return (
    <ModalShell onClose={onClose}>
      <CloseBtn onClose={onClose} />
      <ModalTitle>Mark as Completed</ModalTitle>
      <div className="modal-body">
        <div className="modal-left">
          <InfoBlock>
            <InfoRow label="Report">#{String(r.id).padStart(3, "0")}</InfoRow>
            <InfoRow label="Reporter">{r.owner?.full_name ?? "Anonymous"}</InfoRow>
            <InfoRow label="Location"><span className="info-row-highlight">{barangay(r)}</span></InfoRow>
            {/* ═══════════════════════════════════════════════════════
                COMMENTED OUT: Assigned To — moved to next version
            ═══════════════════════════════════════════════════════ */}
            {/*
            <InfoRow label="Assigned To">{r.assigned_to ?? "—"}</InfoRow>
            */}
          </InfoBlock>

          <div className="completion-form">
            <div className="completion-label">Proof of Completion <span className="optional">(optional)</span></div>
            <div className="proof-upload-area" onClick={() => fileRef.current?.click()}>
              {preview
                ? <img src={preview} className="proof-preview" alt="Proof" />
                : <div className="proof-placeholder"><IcoCamera size={28} /><p>Click to upload repair photo</p></div>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="proof-file-input" onChange={handleFileChange} />
          </div>

          <div className="completion-form completion-form-gap">
            <div className="completion-label">Admin Note <span className="optional">(optional)</span></div>
            <textarea
              className="completion-comment"
              rows={3}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Add a note about the completed repair…"
            />
          </div>

          {err && <div className="admin-error-banner">{err}</div>}

          <div className="modal-actions-row">
            <button className="complete-btn modal-action-btn" disabled={saving} onClick={handleSubmit}>
              {saving ? "Saving…" : "Confirm Completion"}
            </button>
            <button className="admin-decline-btn modal-action-btn" disabled={saving} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>

        <div className="modal-right">
          <div className="modal-photo-label">Original Report Photo</div>
          <div className="modal-media">
            {media ? (
              media.type === "video"
                ? <video src={media.url} controls />
                : <img src={media.url} alt="Original" />
            ) : (
              <div className="modal-no-media"><IcoCamera size={36} /><div>No media attached</div></div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}


function CancelModal({ report: r, onClose, onCancel }) {
  const [step,   setStep]   = useState(1);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFinal = async () => {
    setSaving(true);
    await onCancel(r.id, reason);
    setSaving(false);
  };

  return (
    <ModalShell maxWidth={440} onClose={onClose}>
      <CloseBtn onClose={onClose} />

      {step === 1 ? (
        <>
          <div className="cancel-modal-center">
            <div className="cancel-icon-wrapper">
              <IcoBan size={28} className="cancel-icon" />
            </div>
            <h3 className="cancel-modal-title">
              Cancel Report #{String(r.id).padStart(3, "0")}?
            </h3>
            <p className="cancel-modal-desc">
              This action marks the report as cancelled. It cannot be easily undone.
            </p>
          </div>

          <div className="info-card cancel-info-card">
            <div className="cancel-location-row">
              <IcoMapPin size={16} className="cancel-location-pin" />
              <span className="cancel-barangay">{barangay(r)}</span>
            </div>
            <div className="cancel-badges-row">
              <Badge text={damageType(r)} className="sev-badge" />
              <Badge text={severity(r)}   className={`sev-badge sev-${severity(r).toLowerCase()}`} />
            </div>
          </div>

          <div className="modal-actions-row">
            <button className="admin-decline-btn modal-action-btn modal-decline-btn" onClick={onClose}>Go Back</button>
            <button className="complete-btn modal-action-btn cancel-confirm-btn" onClick={() => setStep(2)}>Yes, Cancel</button>
          </div>
        </>
      ) : (
        <>
          <ModalTitle colorClass="modal-title-danger">
            <div className="assign-modal-title">
              <IcoBan size={20} /> Confirm Cancellation
            </div>
          </ModalTitle>

          <div className="completion-form cancel-reason-form">
            <label className="completion-label">Reason for cancellation <span className="optional">(optional)</span></label>
            <textarea
              className="completion-comment cancel-reason-textarea"
              rows={4}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Duplicate report, incorrect location…"
            />
          </div>

          <div className="modal-actions-row">
            <button className="admin-decline-btn modal-action-btn modal-decline-btn" onClick={() => setStep(1)}>Go Back</button>
            <button className="complete-btn modal-action-btn cancel-confirm-btn" disabled={saving} onClick={handleFinal}>
              {saving ? "Cancelling…" : "Confirm Cancellation"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

function BulkAssignModal({ count, projectByReportId, selectedIds, onClose, onDone }) {
  const [contractors,   setContractors]   = React.useState([]);
  const [contractorId,  setContractorId]  = React.useState(null);
  const [loadingList,   setLoadingList]   = React.useState(true);
  const [saving,        setSaving]        = React.useState(false);
  const [error,         setError]         = React.useState(null);

  React.useEffect(() => {
    getAvailableContractors().then(res => {
      if (res.success) setContractors(res.data || []);
      setLoadingList(false);
    });
  }, []);

  const handleConfirm = async () => {
    if (!contractorId) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all(selectedIds.map(async (id) => {
        const existing = projectByReportId[id];
        let projectId  = existing?.id;
        if (!projectId) {
          const res = await createProject({ report_id: id });
          if (!res.success) throw new Error(res.error || "Failed to create project");
          projectId = res.data?.id;
        }
        const res = await assignContractor(projectId, contractorId);
        if (!res.success) throw new Error(res.error || "Failed to assign contractor");
      }));
      onDone();
    } catch (err) {
      setError(err.message || "Assignment failed for one or more reports");
      setSaving(false);
    }
  };

  return createPortal(
    <ModalShell maxWidth={480} onClose={onClose}>
      <CloseBtn onClose={onClose} />
      <ModalTitle>
        <div className="assign-modal-title">
          <IcoUsers size={20} className="assign-modal-title-icon" />
          Assign Contractor — {count} report{count !== 1 ? "s" : ""}
        </div>
      </ModalTitle>

      {loadingList ? (
        <p style={{ fontSize: "0.85rem", color: "var(--subtext)", padding: "12px 0" }}>
          Loading contractors…
        </p>
      ) : (
        <div style={{ marginTop: 12 }}>
          <label className="completion-label">Select Contractor</label>
          <select
            className="completion-comment select-fullwidth"
            style={{ marginTop: 6 }}
            value={contractorId ?? ""}
            onChange={e => setContractorId(Number(e.target.value) || null)}
          >
            <option value="">Choose a contractor…</option>
            {contractors.map(c => (
              <option key={c.id} value={c.id}>
                {c.full_name || c.email}
                {" · "}{c.active_project_count} active
                {" · "}{c.is_available ? "✓ Available" : "✗ Busy"}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div style={{ fontSize: "0.8rem", color: "var(--danger,#ef4444)", marginTop: 8, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div className="modal-actions-row" style={{ marginTop: 20 }}>
        <button
          className="complete-btn modal-action-btn"
          disabled={!contractorId || saving || loadingList}
          onClick={handleConfirm}
        >
          {saving ? "Assigning…" : "Confirm Assignment"}
        </button>
        <button className="admin-decline-btn modal-action-btn modal-decline-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ModalShell>,
    document.body
  );
}

export default AdminManageReports;