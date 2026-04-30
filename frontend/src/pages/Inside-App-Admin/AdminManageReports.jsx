import React, { useEffect, useState, useCallback, useRef } from "react";
import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader  from "../../components/AdminHeader.jsx";
import { getReports, updateReport, uploadReportMedia, addComment } from "../../api/reports";
import "./AdminManageReports.css";

const STATUS_FLOW = ["pending","verified","assigned","in_progress","completed","rejected"];
const STATUS_LABELS = {
  pending:"Pending", verified:"Verified", assigned:"Assigned",
  in_progress:"In Progress", completed:"Completed",
  rejected:"Rejected", cancelled:"Cancelled",
};
const WORKERS = [
  { id:1, name:"Juan dela Cruz" }, { id:2, name:"Maria Santos" },
  { id:3, name:"Pedro Reyes" },   { id:4, name:"Ana Garcia" },
  { id:5, name:"Marco Villanueva" },{ id:6, name:"Liza Mendoza" },
];
const TEAMS_DEFAULT = [
  { id:1, name:"Team Alpha", leader:"Juan dela Cruz",    members:["Pedro Reyes","Ana Garcia"] },
  { id:2, name:"Team Beta",  leader:"Maria Santos",     members:["Marco Villanueva"] },
  { id:3, name:"Team Gamma", leader:"Marco Villanueva", members:["Liza Mendoza","Pedro Reyes"] },
];

const C = {
  bg:        "#f7fdf9",
  surface:   "#ffffff",
  border:    "#e5ede8",
  borderMid: "#c6dbc9",
  green50:   "#f0fdf4",
  green100:  "#dcfce7",
  green200:  "#bbf7d0",
  green600:  "#16a34a",
  green700:  "#15803d",
  green800:  "#166534",
  green900:  "#14532d",
  text:      "#111827",
  textMid:   "#374151",
  textSub:   "#6b7280",
  textMuted: "#9ca3af",
  red50:     "#fef2f2",
  red600:    "#dc2626",
  amber50:   "#fffbeb",
  amber600:  "#d97706",
};

function IcoClipboard({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>;
}
function IcoAlert({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m10.29 3.86-8.29 14.28A1 1 0 0 0 3 19.71h18a1 1 0 0 0 .86-1.57l-8.29-14.28a1 1 0 0 0-1.72 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
}
function IcoClock({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
}
function IcoWrench({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>;
}
function IcoCheck({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
function IcoSearch({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function IcoRefresh({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
}
function IcoMapPin({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}
function IcoUser({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function IcoUsers({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function IcoX({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
}
function IcoPlus({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function IcoBan({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
}
function IcoCamera({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
}
function IcoSort({ size=14, active, dir }) {
  return (
    <svg width={size} height={size} style={{flexShrink:0, color: active ? C.green600 : C.textMuted}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      {active
        ? dir === "asc"
          ? <polyline points="18 15 12 9 6 15"/>
          : <polyline points="6 9 12 15 18 9"/>
        : <><polyline points="18 15 12 9 6 15" opacity=".35"/><polyline points="6 9 12 15 18 9" opacity=".35"/></>
      }
    </svg>
  );
}
function IcoShield({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
}
function IcoStar({ size=16, ...p }) {
  return <svg width={size} height={size} style={{flexShrink:0}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
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

const damageType = r => r.ai_damage_type ?? r.damage_type ?? "—";
const severity   = r => r.ai_severity    ?? r.severity     ?? "—";
const barangay   = r => r.barangay ?? r.location_address?.split(",")[0] ?? "—";
const street     = r => r.location_address ?? "";

const mediaFull  = (r, idx=0) => {
  const att = r.media_attachments?.[idx];
  if (!att?.file_url) return null;
  return { url: `${import.meta.env.VITE_API_URL || ""}${att.file_url}`, type: att.media_type };
};

function initials(name) {
  return name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
}

function Badge({ text, className }) {
  return (
    <span className={`badge ${className || ""}`}>
      {text}
    </span>
  );
}

function StatsCards({ reports }) {
  const today = new Date().toDateString();
  const cards = [
    { label:"Total Reports",   value: reports.length,
      icon: <IcoClipboard size={18}/>, className: "sc-total" },
    { label:"Critical",
      value: reports.filter(r=>(r.ai_severity??r.severity??"").toLowerCase()==="critical").length,
      icon: <IcoAlert size={18}/>, className: "sc-critical" },
    { label:"Pending",
      value: reports.filter(r=>r.status?.toLowerCase()==="pending").length,
      icon: <IcoClock size={18}/>, className: "sc-pending" },
    { label:"In Progress",
      value: reports.filter(r=>r.status?.toLowerCase()==="in_progress").length,
      icon: <IcoWrench size={18}/>, className: "sc-inprogress" },
    { label:"Completed Today",
      value: reports.filter(r=>r.status?.toLowerCase()==="completed" && r.updated_at && new Date(r.updated_at).toDateString()===today).length,
      icon: <IcoCheck size={18}/>, className: "sc-completed" },
  ];

  return (
    <div className="stats-row">
      {cards.map(c => (
        <div key={c.label} className={`stat-card ${c.className}`}>
          <div className="stat-icon-wrapper">
            {c.icon}
          </div>
          <div className="stat-content">
            <div className="stat-value">{c.value}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatusTimeline({ currentStatus }) {
  const steps = ["pending","verified","assigned","in_progress","completed"];
  const isRej = currentStatus === "rejected" || currentStatus === "cancelled";
  const idx   = steps.indexOf(currentStatus);
  return (
    <div className="timeline-wrap">
      {steps.map((s,i) => {
        const done   = !isRej && i <= idx;
        const active = !isRej && i === idx;
        return (
          <React.Fragment key={s}>
            <div className={`tl-step ${done ? "done" : ""} ${active ? "active-step" : ""}`}>
              <div className="tl-dot">
                {done ? <IcoCheck size={11}/> : i+1}
              </div>
              <span className="tl-label">
                {STATUS_LABELS[s]}
              </span>
            </div>
            {i < steps.length-1 && (
              <div className={`tl-line ${!isRej && i < idx ? "done" : ""}`}/>
            )}
          </React.Fragment>
        );
      })}
      {isRej && (
        <span className="tl-rejected-badge">
          {currentStatus === "cancelled" ? "Cancelled" : "Rejected"}
        </span>
      )}
    </div>
  );
}

function BulkBar({ count, onComplete, onAssign, onCancel, onClear }) {
  return (
    <div className="bulk-bar">
      <span className="bulk-count">{count} selected</span>
      <button className="bulk-btn b-complete" onClick={onComplete}>
        <IcoCheck size={13}/> Complete All
      </button>
      <button className="bulk-btn b-assign" onClick={onAssign}>
        <IcoUsers size={13}/> Assign All
      </button>
      <button className="bulk-btn b-reject" onClick={onCancel}>
        <IcoBan size={13}/> Cancel All
      </button>
      <button className="bulk-btn b-clear" onClick={onClear}>
        <IcoX size={13}/> Clear
      </button>
    </div>
  );
}

function ActionButtons({ r, onVerify, onAssign, onStart, onComplete, onCancel }) {
  const st = r.status?.toLowerCase();
  return (
    <div className="action-btns">
      {st==="pending"     && <button className="action-btn ab-verify" onClick={e=>{e.stopPropagation();onVerify();}}><IcoShield size={11}/>Verify</button>}
      {st==="verified"    && <button className="action-btn ab-assign" onClick={e=>{e.stopPropagation();onAssign();}}><IcoUsers size={11}/>Assign</button>}
      {st==="assigned"    && <button className="action-btn ab-start" onClick={e=>{e.stopPropagation();onStart();}}><IcoWrench size={11}/>Start</button>}
      {st==="in_progress" && <button className="action-btn ab-complete" onClick={e=>{e.stopPropagation();onComplete();}}><IcoCheck size={11}/>Done</button>}
      {!["completed","rejected","cancelled"].includes(st) && (
        <button className="action-btn ab-reject" onClick={e=>{e.stopPropagation();onCancel();}}><IcoBan size={11}/>Cancel</button>
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

  const [sortCol, setSortCol] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  const [selected, setSelected] = useState(new Set());

  const [viewReport,     setViewReport]     = useState(null);
  const [completeReport, setCompleteReport] = useState(null);
  const [assignReport,   setAssignReport]   = useState(null);
  const [cancelReport,   setCancelReport]   = useState(null);
  const [bulkMode,       setBulkMode]       = useState(null);

  const [countdown, setCountdown] = useState(30);
  const timerRef = useRef(null);
  const [teams, setTeams] = useState(TEAMS_DEFAULT);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError(null);
    const res = await getReports({ page_size:200 });
    if (!res.success) { setError(res.error); setLoading(false); return; }
    setReports(res.data?.results ?? []);
    setLoading(false); setCountdown(30);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => { if (c<=1) { fetchAll(); return 30; } return c-1; });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  const handleSort = col => {
    if (sortCol===col) setSortDir(d => d==="asc"?"desc":"asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const filtered = reports
    .filter(r => {
      const dt  = damageType(r).toLowerCase();
      const sev = severity(r).toLowerCase();
      const st  = r.status?.toLowerCase()??"";
      const q   = search.toLowerCase();
      const bg  = barangay(r).toLowerCase();
      const id  = String(r.id).padStart(3,"0");
      if (search && !bg.includes(q) && !id.includes(q) && !street(r).toLowerCase().includes(q)) return false;
      if (filterType!=="All" && dt!==filterType.toLowerCase())     return false;
      if (filterSeverity!=="All" && sev!==filterSeverity.toLowerCase()) return false;
      if (filterStatus!=="All" && st!==filterStatus.toLowerCase()) return false;
      if (filterDate!=="All" && r.created_at) {
        const d=new Date(r.created_at), now=new Date();
        if (filterDate==="Today" && d.toDateString()!==now.toDateString()) return false;
        if (filterDate==="Week"  && d<new Date(now-7*86400000))              return false;
      }
      return true;
    })
    .sort((a,b) => {
      const mul = sortDir==="asc"?1:-1;
      if (sortCol==="created_at") return mul*(new Date(a.created_at??0)-new Date(b.created_at??0));
      if (sortCol==="severity")   return mul*(severity(a)>severity(b)?1:-1);
      if (sortCol === "status")   return mul * ((a.status ?? "") > (b.status ?? "") ? 1 : -1);
      if (sortCol==="priority")   { const o={high:0,medium:1,low:2}; return mul*(o[getPriority(a)]-o[getPriority(b)]); }
      return 0;
    });

  const allSelected = filtered.length>0 && filtered.every(r=>selected.has(r.id));
  const toggleAll   = () => setSelected(allSelected ? new Set() : new Set(filtered.map(r=>r.id)));
  const toggleOne = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) {
        n.delete(id);
      } else {
        n.add(id);
      }
      return n;
    });
  };

  const patchStatus = async (id, status, extra={}) => {
    const res = await updateReport(id, { status, ...extra });
    if (res.success) setReports(prev => prev.map(r => r.id===id ? {...r, status:status.toLowerCase(),...extra} : r));
    return res.success;
  };

  const handleVerify   = id => patchStatus(id,"VERIFIED");
  const handleStart    = id => patchStatus(id,"IN_PROGRESS");
  const handleAssign   = async (id, teamOrWorker) => { await patchStatus(id,"ASSIGNED",{assigned_to:teamOrWorker.name}); setAssignReport(null); };
  const handleCancel   = async (id, reason) => { await patchStatus(id,"REJECTED",{rejection_reason:reason}); setCancelReport(null); };
  const handleCompleteSuccess = id => { setReports(prev=>prev.map(r=>r.id===id?{...r,status:"completed"}:r)); setCompleteReport(null); };

  const selectedIds = [...selected];
  const bulkPatch   = async (status) => { await Promise.all(selectedIds.map(id=>patchStatus(id,status))); setSelected(new Set()); setBulkMode(null); };

  return (
    <>
      <AdminHeader/>
      <AdminSidebar/>

      <div className="manage-container">
        <StatsCards reports={reports}/>

        <div className="manage-filters">
          <div className="filters-top-row">
            <h2 className="manage-title">Manage Reports</h2>
            <div className="refresh-area">
              <span className="refresh-countdown">Auto-refresh in {countdown}s</span>
              <button className="refresh-btn" onClick={fetchAll}>
                <IcoRefresh size={12}/> Refresh
              </button>
            </div>
          </div>

          <div className="search-row">
            <div className="search-box">
              <IcoSearch size={14} className="search-icon"/>
              <input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by ID, barangay or street…"/>
              {search && (
                <button className="search-clear" onClick={()=>setSearch("")}>
                  <IcoX size={12}/>
                </button>
              )}
            </div>
          </div>

          <div className="filters-row">
            <div className="filter-group">
              <label>Damage Type</label>
              <div className="filter-buttons">
                {["All","Crack","Pothole"].map(t => (
                  <button key={t} className={filterType===t ? "active" : ""} onClick={()=>setFilterType(t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group custom-select">
              <label>Severity</label>
              <select value={filterSeverity} onChange={e=>setFilterSeverity(e.target.value)}>
                <option value="All">All Severity</option>
                <option value="critical">Critical</option>
                <option value="moderate">Moderate</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="filter-group custom-select">
              <label>Status</label>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
                <option value="All">All Status</option>
                {STATUS_FLOW.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>

            <div className="filter-group custom-select">
              <label>Date</label>
              <select value={filterDate} onChange={e=>setFilterDate(e.target.value)}>
                <option value="All">All Time</option>
                <option value="Today">Today</option>
                <option value="Week">This Week</option>
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="admin-error-banner">
            {error}
          </div>
        )}

        {selected.size > 0 && (
          <BulkBar
            count={selected.size}
            onComplete={()=>bulkPatch("COMPLETED")}
            onAssign={()=>setBulkMode("assign")}
            onCancel={()=>bulkPatch("REJECTED")}
            onClear={()=>setSelected(new Set())}
          />
        )}

        <div className="manage-table-container">
          <div className="table-responsive">
            <table className="manage-table">
              <colgroup>
                <col className="col-check"/>
                <col style={{width:"8%"}}/>
                <col style={{width:"14%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"10%"}}/>
                <col style={{width:"12%"}}/>
                <col style={{width:"20%"}}/>
              </colgroup>
              <thead>
                <tr>
                  {[
                    [null, <input type="checkbox" checked={allSelected} onChange={toggleAll} className="amr-cb"/>, false],
                    [null, "Report", false],
                    ["created_at", "Reported", true],
                    [null, "Damage Type", false],
                    ["severity", "Severity", true],
                    ["priority", "Priority", true],
                    ["status", "Status", true],
                    [null, "Assigned To", false],
                    [null, "Actions", false],
                  ].map(([col, label, sortable], i) => (
                    <th key={i} onClick={sortable ? ()=>handleSort(col) : undefined} className={sortable ? "sortable" : ""}>
                      <div style={{ display:"flex", alignItems:"center", gap:3 }}>
                        {label}
                        {sortable && <IcoSort size={12} active={sortCol===col} dir={sortDir}/>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="no-data">Loading reports…</td>
                  </tr>
                ) : filtered.length===0 ? (
                  <tr>
                    <td colSpan={9} className="no-data">No reports found</td>
                  </tr>
                ) : filtered.map(r => {
                  const st  = r.status?.toLowerCase();
                  const pri = getPriority(r);
                  const sev = severity(r).toLowerCase();
                  const isCrit   = sev==="critical";
                  const isSelec  = selected.has(r.id);

                  return (
                    <tr key={r.id} className={`clickable-row ${isSelec ? "selected-row" : ""} ${isCrit ? "critical-row" : ""}`} onClick={()=>setViewReport(r)}>
                      <td className="col-check" onClick={e=>{e.stopPropagation();toggleOne(r.id);}}>
                        <input type="checkbox" checked={isSelec} onChange={()=>toggleOne(r.id)} className="amr-cb"/>
                      </td>

                      <td>
                        <div className="report-number">#{String(r.id).padStart(3,"0")}</div>
                      </td>

                      <td>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <IcoMapPin size={14} style={{ color:C.green600, flexShrink:0 }}/>
                          <div className="report-cell">
                            <span className="report-name" style={{fontSize:"0.8rem", fontWeight:600}}>{barangay(r)}</span>
                            {street(r) && <span className="report-location">{street(r)}</span>}
                          </div>
                        </div>
                      </td>

                      <td className="time-ago-cell">{timeAgo(r.created_at)}</td>

                      <td>
                        <span style={{ fontSize:"0.8rem", fontWeight:600, color:C.textMid, textTransform:"capitalize" }}>
                          {damageType(r)}
                        </span>
                      </td>

                      <td><Badge text={severity(r)} className={`sev-badge sev-${sev}`} /></td>

                      <td><Badge text={pri} className={`pri-badge pri-${pri}`} /></td>

                      <td><Badge text={STATUS_LABELS[st]??st} className={`status-badge st-${st}`} /></td>

                      <td onClick={e=>e.stopPropagation()}>
                        {r.assigned_to ? (
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <div className="worker-avatar" style={{width:22, height:22, fontSize:"0.6rem"}}>{initials(r.assigned_to)}</div>
                            <span className="assigned-name">{r.assigned_to}</span>
                          </div>
                        ) : (
                          <span className="unassigned">Unassigned</span>
                        )}
                      </td>

                      <td onClick={e=>e.stopPropagation()}>
                        <ActionButtons r={r}
                          onVerify={()=>handleVerify(r.id)}
                          onAssign={()=>setAssignReport(r)}
                          onStart={()=>handleStart(r.id)}
                          onComplete={()=>setCompleteReport(r)}
                          onCancel={()=>setCancelReport(r)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {viewReport && !completeReport && !assignReport && !cancelReport && (
          <ViewModal
            report={viewReport}
            onClose={()=>setViewReport(null)}
            onMarkComplete={r=>{setCompleteReport(r);setViewReport(null);}}
            onAssign={r=>{setAssignReport(r);setViewReport(null);}}
            onCancel={r=>{setCancelReport(r);setViewReport(null);}}
            onVerify={id=>{handleVerify(id);setViewReport(p=>({...p,status:"verified"}));}}
            onStart={id=>{handleStart(id);setViewReport(p=>({...p,status:"in_progress"}));}}
          />
        )}

        {completeReport && (
          <CompleteModal report={completeReport} onClose={()=>setCompleteReport(null)} onSuccess={handleCompleteSuccess}/>
        )}

        {(assignReport || bulkMode==="assign") && (
          <AssignModal
            report={assignReport}
            bulkIds={bulkMode==="assign" ? selectedIds : null}
            teams={teams}
            setTeams={setTeams}
            onClose={()=>{setAssignReport(null);setBulkMode(null);}}
            onAssign={async (id,teamOrWorker)=>{
              if (bulkMode==="assign") {
                await Promise.all(selectedIds.map(sid=>patchStatus(sid,"ASSIGNED",{assigned_to:teamOrWorker.name})));
                setSelected(new Set()); setBulkMode(null);
              } else {
                await handleAssign(id,teamOrWorker);
              }
            }}
          />
        )}

        {cancelReport && (
          <CancelModal report={cancelReport} onClose={()=>setCancelReport(null)} onCancel={handleCancel}/>
        )}
      </div>
    </>
  );
}

function ModalShell({ maxWidth=860, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{maxWidth}} onClick={e=>e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalTitle({ children, color }) {
  return <h3 className="modal-title" style={{color: color || C.green800}}>{children}</h3>;
}

function CloseBtn({ onClose }) {
  return (
    <button className="modal-close-btn" onClick={onClose}>
      <IcoX size={20}/>
    </button>
  );
}

function InfoBlock({ children }) {
  return <div className="reporter-info">{children}</div>;
}

function InfoRow({ label, children }) {
  return (
    <div className="info-row">
      <span style={{fontWeight:700, color:"#888"}}>{label}</span>
      <span style={{fontWeight:600}}>{children}</span>
    </div>
  );
}

function ViewModal({ report:r, onClose, onMarkComplete, onAssign, onCancel, onVerify, onStart }) {
  const st    = r.status?.toLowerCase();
  const media = mediaFull(r);
  const pri   = getPriority(r);
  const sev   = severity(r).toLowerCase();

  return (
    <ModalShell onClose={onClose}>
      <CloseBtn onClose={onClose}/>
      <ModalTitle>Report Details</ModalTitle>
      <StatusTimeline currentStatus={st}/>

      <div className="modal-body">
        <div className="modal-left">
          <InfoBlock>
            <InfoRow label="Report ID">#{String(r.id).padStart(3,"0")}</InfoRow>
            <InfoRow label="Reporter">{r.owner?.full_name ?? "Anonymous"}</InfoRow>
            <InfoRow label="Contact">{r.owner?.phone ?? "—"}</InfoRow>
            <InfoRow label="Reported">{timeAgo(r.created_at)}</InfoRow>
          </InfoBlock>

          <div className="info-card">
            <InfoRow label="Damage Type">{damageType(r)}</InfoRow>
            <InfoRow label="Severity">
              <Badge text={severity(r)} className={`sev-badge sev-${sev}`}/>
            </InfoRow>
            <InfoRow label="Priority">
              <Badge text={pri} className={`pri-badge pri-${pri}`}/>
            </InfoRow>
            <InfoRow label="Assigned To">
              {r.assigned_to ?? <span style={{color:"#aaa", fontStyle:"italic"}}>Unassigned</span>}
            </InfoRow>
            {r.description && (
              <div style={{marginTop: 10}}>
                <div style={{fontSize:"0.75rem", fontWeight:700, color:"#888", marginBottom:4}}>Description</div>
                <div className="additional-info">{r.description}</div>
              </div>
            )}
          </div>

          <div className="location-info">
            <div style={{display:"flex", alignItems:"flex-start", gap:8}}>
              <IcoMapPin size={16} style={{color:C.green600}}/>
              <div>
                <div style={{fontWeight:700, fontSize:"0.9rem", color:C.green800}}>{barangay(r)}</div>
                {street(r) && <div style={{fontSize:"0.8rem", color:"#666", marginTop:2}}>{street(r)}</div>}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            {st==="pending"     && <button className="action-btn wide ab-verify" onClick={()=>onVerify(r.id)}><IcoShield size={14}/> Verify Report</button>}
            {st==="verified"    && <button className="action-btn wide ab-assign" onClick={()=>onAssign(r)}><IcoUsers size={14}/> Assign Worker / Team</button>}
            {st==="assigned"    && <button className="action-btn wide ab-start" onClick={()=>onStart(r.id)}><IcoWrench size={14}/> Start Work</button>}
            {st==="in_progress" && <button className="action-btn wide ab-complete" onClick={()=>onMarkComplete(r)}><IcoCheck size={14}/> Mark as Completed</button>}
            {!["completed","rejected","cancelled"].includes(st) && <button className="action-btn wide ab-reject" onClick={()=>onCancel(r)}><IcoBan size={14}/> Cancel Report</button>}
          </div>
        </div>

        <div className="modal-right">
          <div style={{fontSize:"0.85rem", fontWeight:700, color:"#555", marginBottom:8}}>Report Photo</div>
          <div className="modal-media">
            {media ? (
              media.type==="video"
                ? <video src={media.url} controls/>
                : <img src={media.url} alt="Report"/>
            ) : (
              <div className="modal-no-media">
                <IcoCamera size={36} style={{marginBottom:10}}/>
                <div>No media attached</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function CompleteModal({ report:r, onClose, onSuccess }) {
  const [proofFile, setProofFile] = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [comment,   setComment]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState(null);
  const fileRef = useRef(null);
  const media   = mediaFull(r);

  const handleFileChange = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setProofFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    setSaving(true); setErr(null);
    if (proofFile) {
      const up = await uploadReportMedia(r.id, proofFile);
      if (!up.success) { setErr("Upload failed: " + (up.error??"Unknown")); setSaving(false); return; }
    }
    if (comment.trim()) {
      const cm = await addComment(r.id, comment.trim());
      if (!cm.success) { setErr("Comment failed: " + (cm.error??"Unknown")); setSaving(false); return; }
    }
    const res = await updateReport(r.id, { status:"RESOLVED" });
    if (!res.success) { setErr("Could not resolve: " + (res.error??"Unknown")); setSaving(false); return; }
    setSaving(false); onSuccess(r.id);
  };

  return (
    <ModalShell onClose={onClose}>
      <CloseBtn onClose={onClose}/>
      <ModalTitle>Mark as Completed</ModalTitle>
      <div className="modal-body">
        <div className="modal-left">
          <InfoBlock>
            <InfoRow label="Report">#{String(r.id).padStart(3,"0")}</InfoRow>
            <InfoRow label="Reporter">{r.owner?.full_name ?? "Anonymous"}</InfoRow>
            <InfoRow label="Location"><span style={{fontWeight:700}}>{barangay(r)}</span></InfoRow>
            <InfoRow label="Assigned To">{r.assigned_to ?? "—"}</InfoRow>
          </InfoBlock>

          <div className="completion-form">
            <div className="completion-label">
              Proof of Completion <span className="optional">(optional)</span>
            </div>
            <div className="proof-upload-area" onClick={()=>fileRef.current?.click()}>
              {preview
                ? <img src={preview} className="proof-preview" alt="Proof"/>
                : <div className="proof-placeholder">
                    <IcoCamera size={28}/>
                    <p>Click to upload repair photo</p>
                  </div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleFileChange}/>
          </div>

          <div className="completion-form" style={{marginTop:12}}>
            <div className="completion-label">
              Admin Note <span className="optional">(optional)</span>
            </div>
            <textarea className="completion-comment" rows={3} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a note about the completed repair…"/>
          </div>

          {err && <div className="admin-error-banner">{err}</div>}

          <div style={{display:"flex", gap:10, marginTop:16}}>
            <button className="complete-btn" style={{flex:1}} disabled={saving} onClick={handleSubmit}>
              {saving ? "Saving…" : "Confirm Completion"}
            </button>
            <button className="admin-decline-btn" style={{flex:1, color:"#555", borderColor:"#ddd"}} disabled={saving} onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>

        <div className="modal-right">
          <div style={{fontSize:"0.85rem", fontWeight:700, color:"#555", marginBottom:8}}>Original Report Photo</div>
          <div className="modal-media">
            {media ? (
              media.type==="video"
                ? <video src={media.url} controls/>
                : <img src={media.url} alt="Original"/>
            ) : (
              <div className="modal-no-media">
                <IcoCamera size={36} style={{marginBottom:10}}/>
                <div>No media attached</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function AssignModal({ report:r, bulkIds, teams, setTeams, onClose, onAssign }) {
  const [tab,         setTab]         = useState("existing");
  const [chosenTeam,  setChosenTeam]  = useState(null);
  const [saving,      setSaving]      = useState(false);

  const [newName,     setNewName]     = useState("");
  const [newLeader,   setNewLeader]   = useState("");
  const [newMembers,  setNewMembers]  = useState(new Set());

  const isBulk = !!bulkIds;
  const title  = isBulk ? `Assign ${bulkIds.length} Reports` : `Assign Report #${String(r?.id??"").padStart(3,"0")}`;

  const toggleMember = name => setNewMembers(prev => {
    const n = new Set(prev); n.has(name)?n.delete(name):n.add(name); return n;
  });

  const handleConfirm = async () => {
    if (tab==="existing" && !chosenTeam) return;
    if (tab==="create") {
      if (!newName.trim()) return;
      const created = { id: Date.now(), name:newName.trim(), leader:newLeader, members:[...newMembers] };
      setTeams(prev => [...prev, created]);
      setSaving(true);
      const target = r ?? { id: bulkIds?.[0] };
      await onAssign(target.id, created);
      setSaving(false);
      return;
    }
    setSaving(true);
    const target = r ?? { id: bulkIds?.[0] };
    await onAssign(target.id, chosenTeam);
    setSaving(false);
  };

  const tabStyle = (t) => ({
    padding:"10px 20px", fontSize:"0.85rem", fontWeight:700, border:"none", background:"none",
    borderBottom: tab===t ? `2.5px solid ${C.green600}` : "2.5px solid transparent",
    color: tab===t ? C.green700 : C.textSub, cursor:"pointer", flex: 1, textAlign: "center"
  });

  return (
    <ModalShell maxWidth={520} onClose={onClose}>
      <CloseBtn onClose={onClose}/>
      <ModalTitle>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
          <IcoUsers size={20} style={{ color:C.green600 }}/> {title}
        </div>
      </ModalTitle>

      <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, margin:"0 -26px 16px" }}>
        <button style={tabStyle("existing")} onClick={()=>setTab("existing")}>Existing Teams</button>
        <button style={tabStyle("create")} onClick={()=>setTab("create")}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
            <IcoPlus size={14}/> Create New Team
          </div>
        </button>
      </div>

      {tab==="existing" && (
        <div className="worker-list">
          {teams.map(t => {
            const chosen = chosenTeam?.id===t.id;
            return (
              <div key={t.id} className={`worker-card ${chosen ? "selected-worker" : ""}`} onClick={()=>setChosenTeam(t)}>
                <div className="worker-avatar">{initials(t.name)}</div>
                <div className="worker-name">
                  <div style={{fontSize:"0.9rem"}}>{t.name}</div>
                  <div style={{fontSize:"0.75rem", color:"#777", fontWeight:500, marginTop:2}}>
                    Lead: {t.leader || "—"} · {t.members.length} member{t.members.length!==1?"s":""}
                  </div>
                </div>
                {chosen && <div className="worker-check"><IcoCheck size={18}/></div>}
              </div>
            );
          })}
          {teams.length===0 && (
            <div className="no-data">No teams yet. Create one in the other tab.</div>
          )}
        </div>
      )}

      {tab==="create" && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div className="completion-form">
            <label className="completion-label">Team Name <span style={{color:"#e74c3c"}}>*</span></label>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Team Delta" className="completion-comment" style={{padding:"10px 12px"}}/>
          </div>

          <div className="completion-form custom-select">
            <label className="completion-label"><div style={{display:"flex", gap:6, alignItems:"center"}}><IcoStar size={14} style={{color:C.green600}}/> Team Leader</div></label>
            <select value={newLeader} onChange={e=>setNewLeader(e.target.value)} className="completion-comment" style={{padding:"10px 12px", width:"100%"}}>
              <option value="">Select a team leader…</option>
              {WORKERS.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </select>
          </div>

          <div className="completion-form">
            <label className="completion-label"><div style={{display:"flex", gap:6, alignItems:"center"}}><IcoUsers size={14} style={{color:C.green600}}/> Team Members</div></label>
            <div className="worker-list">
              {WORKERS.map(w => {
                const checked = newMembers.has(w.name);
                const isLeader = w.name===newLeader;
                return (
                  <label key={w.id} className={`worker-card ${checked ? "selected-worker" : ""}`} style={{cursor: isLeader ? "not-allowed" : "pointer"}}>
                    <input type="checkbox" className="amr-cb" checked={checked || isLeader} disabled={isLeader} onChange={()=>!isLeader && toggleMember(w.name)}/>
                    <div className="worker-avatar" style={{width:28, height:28, fontSize:"0.7rem", background:C.green100, color:C.green800}}>{initials(w.name)}</div>
                    <span className="worker-name" style={{fontSize:"0.85rem"}}>{w.name}</span>
                    {isLeader && <Badge text="Leader" className="pri-badge pri-low"/>}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ display:"flex", gap:10, marginTop:24 }}>
        <button className="complete-btn" style={{flex:1}} disabled={saving || (tab==="existing" && !chosenTeam) || (tab==="create" && !newName.trim())} onClick={handleConfirm}>
          {saving ? "Assigning…" : tab==="create" ? "Create Team & Assign" : "Confirm Assignment"}
        </button>
        <button className="admin-decline-btn" style={{flex:1, color:"#555", borderColor:"#ddd"}} onClick={onClose}>
          Cancel
        </button>
      </div>
    </ModalShell>
  );
}

function CancelModal({ report:r, onClose, onCancel }) {
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
      <CloseBtn onClose={onClose}/>

      {step===1 ? (
        <>
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ width:60, height:60, borderRadius:"50%", background:"#fdecea", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px", border:"2px solid #f5c6cb" }}>
              <IcoBan size={28} style={{ color:"#c0392b" }}/>
            </div>
            <h3 style={{ fontSize:"1.2rem", fontWeight:700, color:"#333", margin:"0 0 10px" }}>Cancel Report #{String(r.id).padStart(3,"0")}?</h3>
            <p style={{ fontSize:"0.85rem", color:"#777", margin:0, lineHeight:1.6 }}>This action marks the report as cancelled. It cannot be easily undone.</p>
          </div>

          <div className="info-card" style={{marginBottom:24, background:"#f9f9f9"}}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
              <IcoMapPin size={16} style={{ color:C.green600 }}/>
              <span style={{ fontSize:"0.9rem", fontWeight:700, color:"#444" }}>{barangay(r)}</span>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <Badge text={damageType(r)} className="sev-badge"/>
              <Badge text={severity(r)} className={`sev-badge sev-${severity(r).toLowerCase()}`}/>
            </div>
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button className="admin-decline-btn" style={{flex:1, color:"#555", borderColor:"#ddd"}} onClick={onClose}>Go Back</button>
            <button className="complete-btn" style={{flex:1, background:"#c0392b"}} onClick={()=>setStep(2)}>Yes, Cancel</button>
          </div>
        </>
      ) : (
        <>
          <ModalTitle color="#c0392b">
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
              <IcoBan size={20}/> Confirm Cancellation
            </div>
          </ModalTitle>

          <div className="completion-form" style={{marginTop: 20}}>
            <label className="completion-label">Reason for cancellation <span className="optional">(optional)</span></label>
            <textarea className="completion-comment" rows={4} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Duplicate report, incorrect location…" style={{background:"#fef2f2"}}/>
          </div>

          <div style={{ display:"flex", gap:10, marginTop:24 }}>
            <button className="admin-decline-btn" style={{flex:1, color:"#555", borderColor:"#ddd"}} onClick={()=>setStep(1)}>Go Back</button>
            <button className="complete-btn" style={{flex:1, background:"#c0392b"}} disabled={saving} onClick={handleFinal}>{saving ? "Cancelling…" : "Confirm Cancellation"}</button>
          </div>
        </>
      )}
    </ModalShell>
  );
}

export default AdminManageReports;