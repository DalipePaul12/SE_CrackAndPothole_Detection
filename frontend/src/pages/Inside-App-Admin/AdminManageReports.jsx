import React, { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getReports,
  getReport,
  updateReport,
  uploadReportMedia,
  addComment,
} from "../../api/reports";
import "./AdminManageReports.css";
import { REPORT_STATUS } from "../../constants/reportStatus";

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
const mediaFull  = (r, idx = 0) => {
  const att = r.media_attachments?.[idx];
  if (!att?.file_url) return null;
  return {
    url:  `${import.meta.env.VITE_API_URL || ""}${att.file_url}`,
    type: att.media_type,
  };
};

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

function StatsCards({ reports }) {
  const today = new Date().toDateString();
  const cards = [
    { label: "Total Reports",
      value: reports.length,
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

function BulkBar({ count, onComplete, onCancel, onClear }) {
  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} selected</span>
      <button className="bulk-btn b-complete" onClick={onComplete}><IcoCheck size={13} /> Complete All</button>
      {/* ═════════════════════════════════════════════════════════════════
          COMMENTED OUT: Assign All — moved to next version
      ═════════════════════════════════════════════════════════════════ */}
      {/* <button className="bulk-btn b-assign" onClick={onAssign}><IcoUsers size={13} /> Assign All</button> */}
      <button className="bulk-btn b-reject" onClick={onCancel}><IcoBan size={13} /> Cancel All</button>
      <button className="bulk-btn b-clear" onClick={onClear}><IcoX size={13} /> Clear</button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
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

function AdminManageReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

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
  const [completeReport, setCompleteReport] = useState(null);
  // ═════════════════════════════════════════════════════════════════
  // COMMENTED OUT: Assign modal state — moved to next version
  // const [assignReport,   setAssignReport]   = useState(null);
  // ═════════════════════════════════════════════════════════════════
  const [cancelReport,   setCancelReport]   = useState(null);
  const [bulkMode,       setBulkMode]       = useState(null);

  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef(null);

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
  const handleVerify  = useCallback((id) => patchStatus(id, REPORT_STATUS.VERIFIED),    [patchStatus]);
  const handleStart   = useCallback((id) => patchStatus(id, REPORT_STATUS.IN_PROGRESS), [patchStatus]);

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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCountdown(30);

    const res = await getReports({ page_size: 200 });
    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }

    const raw = res.data?.results ?? [];
    setReports(raw);
    setLoading(false);

    reverseGeocodeAll(raw).then(geocoded => {
      setReports(geocoded);
    });
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { fetchAll(); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filtered = reports
    .filter(r => {
      const dt  = damageType(r).toLowerCase();
      const sev = severity(r).toLowerCase();
      const st  = r.status?.toLowerCase() ?? "";
      const q   = search.toLowerCase();
      const bg  = barangay(r).toLowerCase();
      const id  = String(r.id).padStart(3, "0");
      if (search && !bg.includes(q) && !id.includes(q) && !street(r).toLowerCase().includes(q)) return false;
      if (filterType     !== "All" && dt  !== filterType.toLowerCase())     return false;
      if (filterSeverity !== "All" && sev !== filterSeverity.toLowerCase()) return false;
      if (filterStatus   !== "All" && st  !== filterStatus.toLowerCase())   return false;
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
      <StatsCards reports={reports} />

      <div className="manage-filters">
        <div className="filters-top-row">
          <h2 className="manage-title">Manage Reports</h2>
          <div className="refresh-area">
            <span className="refresh-countdown">Auto-refresh in {countdown}s</span>
            <button className="refresh-btn" onClick={fetchAll}>
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
          onComplete={() => bulkPatch(REPORT_STATUS.RESOLVED)}
          // ═════════════════════════════════════════════════════════
          // COMMENTED OUT: onAssign — moved to next version
          // onAssign={() => setBulkMode("assign")}
          // ═════════════════════════════════════════════════════════
          onCancel={() => bulkPatch(REPORT_STATUS.CANCELLED)}
          onClear={() => setSelected(new Set())}
        />
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
              {/* ═══════════════════════════════════════════════════════
                  COMMENTED OUT: Assigned To column — moved to next version
              ═══════════════════════════════════════════════════════ */}
              {/* <col className="col-assigned" /> */}
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
                  // ═══════════════════════════════════════════════════
                  // COMMENTED OUT: Assigned To header — moved to next version
                  // [null,        "Assigned To", false],
                  // ═══════════════════════════════════════════════════
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
                <tr><td colSpan={9} className="no-data">Loading reports…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="no-data">No reports found</td></tr>
              ) : filtered.map(r => {
                const st       = r.status?.toLowerCase();
                const pri      = getPriority(r);
                const sev      = severity(r).toLowerCase();
                const isCrit   = sev === "critical";
                const isSelec  = selected.has(r.id);
                const media    = mediaFull(r);

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
                      <div className="report-number">#{String(r.id).padStart(3, "0")}</div>
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
                    <td className="col-status"><Badge text={STATUS_LABELS[st] ?? st} className={`status-badge st-${st}`} /></td>

                    {/* ═══════════════════════════════════════════════
                        COMMENTED OUT: Assigned To cell — moved to next version
                    ═══════════════════════════════════════════════ */}
                    {/*
                    <td className="col-assigned" onClick={e => e.stopPropagation()}>
                      {r.assigned_to ? (
                        <div className="assigned-cell-wrapper">
                          <div className="worker-avatar assigned-avatar-sm">
                            {initials(r.assigned_to)}
                          </div>
                          <span className="assigned-name">{r.assigned_to}</span>
                        </div>
                      ) : (
                        <span className="unassigned">— Unassigned</span>
                      )}
                    </td>
                    */}

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
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODALS
      ═══════════════════════════════════════════════════════════════════ */}

      {viewReport && !completeReport && !cancelReport && createPortal(
        <ViewModal
          report={viewReport}
          onClose={() => setViewReport(null)}
          onMarkComplete={r => { setCompleteReport(r); setViewReport(null); }}
          // ═════════════════════════════════════════════════════════════
          // COMMENTED OUT: onAssign — moved to next version
          // onAssign={r       => { setAssignReport(r);   setViewReport(null); }}
          // ═════════════════════════════════════════════════════════════
          onCancel={r       => { setCancelReport(r);   setViewReport(null); }}
          onVerify={id      => { handleVerify(id); setViewReport(p => p ? { ...p, status: REPORT_STATUS.VERIFIED } : null); }}
          onStart={id       => { handleStart(id); setViewReport(p => p ? { ...p, status: REPORT_STATUS.IN_PROGRESS } : null); }}
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

      {/* ═════════════════════════════════════════════════════════════════
          COMMENTED OUT: AssignModal — moved to next version
      ═════════════════════════════════════════════════════════════════ */}
      {/*
      {(assignReport || bulkMode === "assign") && createPortal(
        <AssignModal
          report={assignReport}
          bulkIds={bulkMode === "assign" ? selectedIds : null}
          teams={teams}
          setTeams={setTeams}
          onClose={() => { setAssignReport(null); setBulkMode(null); }}
          onAssign={async (id, teamOrWorker) => {
            if (bulkMode === "assign") {
              await Promise.all(selectedIds.map(sid => patchStatus(sid, "assigned", { assigned_to: teamOrWorker.name })));
              setSelected(new Set());
              setBulkMode(null);
            } else {
              await handleAssign(id, teamOrWorker);
            }
          }}
        />,
        document.body
      )}
      */}

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
// REFACTORED ViewModal — Removed Assign button, added Start button
// New flow: Verify → Start → Complete
// ═══════════════════════════════════════════════════════════════════════════
function ViewModal({ report: r, onClose, onMarkComplete, onCancel, onVerify, onStart }) {
  const st    = r.status?.toLowerCase();
  const media = mediaFull(r);
  const pri   = getPriority(r);
  const sev   = severity(r).toLowerCase();

  return (
    <ModalShell onClose={onClose}>
      <CloseBtn onClose={onClose} />
      <ModalTitle>Report Details</ModalTitle>
      <StatusTimeline currentStatus={st} />

      <div className="modal-body">
        <div className="modal-left">
          <InfoBlock>
            <InfoRow label="Report ID">#{String(r.id).padStart(3, "0")}</InfoRow>
            <InfoRow label="Reporter">{r.owner?.full_name ?? "Anonymous"}</InfoRow>
            <InfoRow label="Contact">{r.owner?.phone ?? "—"}</InfoRow>
            <InfoRow label="Reported">{timeAgo(r.created_at)}</InfoRow>
          </InfoBlock>

          <div className="info-card">
            <InfoRow label="Damage Type">{damageType(r)}</InfoRow>
            <InfoRow label="Severity"><Badge text={severity(r)} className={`sev-badge sev-${sev}`} /></InfoRow>
            <InfoRow label="Priority"><Badge text={pri} className={`pri-badge pri-${pri}`} /></InfoRow>
            {/* ═══════════════════════════════════════════════════════
                COMMENTED OUT: Assigned To display — moved to next version
            ═══════════════════════════════════════════════════════ */}
            {/*
            <InfoRow label="Assigned To">
              {r.assigned_to ?? <span className="unassigned-text">Unassigned</span>}
            </InfoRow>
            */}
            {r.description && (
              <div className="description-block">
                <div className="description-label">Description</div>
                <div className="additional-info">{r.description}</div>
              </div>
            )}
          </div>

          <div className="location-info">
            <div className="location-info-wrapper">
              <IcoMapPin size={16} className="location-info-pin" />
              <div>
                <div className="location-info-barangay">{barangay(r)}</div>
                {street(r) && <div className="location-info-street">{street(r)}</div>}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            {st === REPORT_STATUS.PENDING     && (
              <button className="action-btn wide ab-verify" onClick={() => onVerify(r.id)}>
                <IcoShield size={14} /> Verify Report
              </button>
            )}
            {st === REPORT_STATUS.VERIFIED    && (
              <button className="action-btn wide ab-start" onClick={() => onStart(r.id)}>
                <IcoWrench size={14} /> Start Repair
              </button>
            )}
            {(st === REPORT_STATUS.VERIFIED || st === REPORT_STATUS.IN_PROGRESS) && (
              <button className="action-btn wide ab-complete" onClick={() => onMarkComplete(r)}>
                <IcoCheck size={14} /> Mark as Completed
              </button>
            )}
            {![REPORT_STATUS.RESOLVED, REPORT_STATUS.REJECTED, REPORT_STATUS.CANCELLED].includes(st) && (
              <button className="action-btn wide ab-reject" onClick={() => onCancel(r)}>
                <IcoBan size={14} /> Cancel Report
              </button>
            )}
          </div>
        </div>

        <div className="modal-right">
          <div className="modal-photo-label">Report Photo</div>
          <div className="modal-media">
            {media ? (
              media.type === "video"
                ? <video src={media.url} controls />
                : <img src={media.url} alt="Report" />
            ) : (
              <div className="modal-no-media">
                <IcoCamera size={36} />
                <div>No media attached</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
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

// ═══════════════════════════════════════════════════════════════════════════
// COMMENTED OUT: AssignModal — moved to next version
// ═══════════════════════════════════════════════════════════════════════════
/*
function AssignModal({ report: r, bulkIds, teams, setTeams, onClose, onAssign }) {
  const [tab,        setTab]        = useState("existing");
  const [chosenTeam, setChosenTeam] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [newName,    setNewName]    = useState("");
  const [newLeader,  setNewLeader]  = useState("");
  const [newMembers, setNewMembers] = useState(new Set());

  const isBulk = !!bulkIds;
  const title  = isBulk
    ? `Assign ${bulkIds.length} Reports`
    : `Assign Report #${String(r?.id ?? "").padStart(3, "0")}`;

  const toggleMember = name => setNewMembers(prev => {
    const n = new Set(prev);
    n.has(name) ? n.delete(name) : n.add(name);
    return n;
  });

  const handleConfirm = async () => {
    if (tab === "existing" && !chosenTeam) return;
    setSaving(true);
    if (tab === "create") {
      if (!newName.trim()) { setSaving(false); return; }
      const created = { id: Date.now(), name: newName.trim(), leader: newLeader, members: [...newMembers] };
      setTeams(prev => [...prev, created]);
      await onAssign((r ?? { id: bulkIds?.[0] }).id, created);
    } else {
      await onAssign((r ?? { id: bulkIds?.[0] }).id, chosenTeam);
    }
    setSaving(false);
  };

  return (
    <ModalShell maxWidth={520} onClose={onClose}>
      <CloseBtn onClose={onClose} />
      <ModalTitle>
        <div className="assign-modal-title">
          <IcoUsers size={20} className="assign-modal-title-icon" /> {title}
        </div>
      </ModalTitle>

      <div className="tab-container">
        <button className={`tab-btn ${tab === "existing" ? "tab-btn-active" : ""}`} onClick={() => setTab("existing")}>Existing Teams</button>
        <button className={`tab-btn ${tab === "create" ? "tab-btn-active" : ""}`}   onClick={() => setTab("create")}>
          <div className="label-with-icon">
            <IcoPlus size={14} /> Create New Team
          </div>
        </button>
      </div>

      {tab === "existing" && (
        <div className="worker-list">
          {teams.map(t => {
            const chosen = chosenTeam?.id === t.id;
            return (
              <div key={t.id} className={`worker-card ${chosen ? "selected-worker" : ""}`} onClick={() => setChosenTeam(t)}>
                <div className="worker-avatar">{initials(t.name)}</div>
                <div className="worker-name">
                  <div className="team-name-text">{t.name}</div>
                  <div className="team-meta-text">
                    Lead: {t.leader || "—"} · {t.members.length} member{t.members.length !== 1 ? "s" : ""}
                  </div>
                </div>
                {chosen && <div className="worker-check"><IcoCheck size={18} /></div>}
              </div>
            );
          })}
          {teams.length === 0 && <div className="no-data">No teams yet. Create one in the other tab.</div>}
        </div>
      )}

      {tab === "create" && (
        <div className="create-tab-container">
          <div className="completion-form">
            <label className="completion-label">Team Name <span className="required">*</span></label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Team Delta"
              className="completion-comment form-input-styled"
            />
          </div>
          <div className="completion-form custom-select">
            <label className="completion-label">
              <div className="label-with-icon">
                <IcoStar size={14} className="label-icon" /> Team Leader
              </div>
            </label>
            <select value={newLeader} onChange={e => setNewLeader(e.target.value)} className="completion-comment select-fullwidth">
              <option value="">Select a team leader…</option>
              {WORKERS.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </select>
          </div>
          <div className="completion-form">
            <label className="completion-label">
              <div className="label-with-icon">
                <IcoUsers size={14} className="label-icon" /> Team Members
              </div>
            </label>
            <div className="worker-list">
              {WORKERS.map(w => {
                const checked  = newMembers.has(w.name);
                const isLeader = w.name === newLeader;
                return (
                  <label key={w.id} className={`worker-card ${checked ? "selected-worker" : ""} ${isLeader ? "worker-card-leader" : ""}`}>
                    <input type="checkbox" className="amr-cb" checked={checked || isLeader} disabled={isLeader} onChange={() => !isLeader && toggleMember(w.name)} />
                    <div className="worker-avatar worker-avatar-xs">{initials(w.name)}</div>
                    <span className="worker-name worker-name-sm">{w.name}</span>
                    {isLeader && <Badge text="Leader" className="pri-badge pri-low" />}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="modal-actions-row">
        <button
          className="complete-btn modal-action-btn"
          disabled={saving || (tab === "existing" && !chosenTeam) || (tab === "create" && !newName.trim())}
          onClick={handleConfirm}
        >
          {saving ? "Assigning…" : tab === "create" ? "Create Team & Assign" : "Confirm Assignment"}
        </button>
        <button className="admin-decline-btn modal-action-btn modal-decline-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}
*/

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

export default AdminManageReports;