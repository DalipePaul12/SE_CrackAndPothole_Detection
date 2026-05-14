import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminAllReports.css";
import { getReports, updateReport, deleteReport, addComment } from "../../api/reports";
import { sendNotification } from "../../api/notifications";
import {
  Search, X, Download, Check, XCircle, Trash2, Settings, MapPin, ArrowUpRight,
  Loader2, ChevronFirst, ChevronLeft, ChevronRight, ChevronLast, User,
  AlertTriangle, Calendar, FileText, Wrench, Image, Camera, Paperclip,
  Mail, MailOpen, Send, CheckCircle, ClipboardList, ArrowDown, ArrowUp,
  ArrowUpDown, Circle, StickyNote, Ban, UserCog, RotateCcw, ChevronUp, ChevronDown,
} from "lucide-react";

const BASE_URL    = import.meta.env.VITE_API_URL || "";
const PAGE_SIZE   = 20;
const TYPE_OPTIONS   = ["All", "Crack", "Pothole"];
const STATUS_OPTIONS = ["All", "PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED", "DECLINED"];
const TEAM_OPTIONS   = ["Unassigned", "Road Team A", "Road Team B", "Maintenance Unit", "Emergency Response"];
const STATUS_LABELS  = {
  PENDING:     "Pending",
  VERIFIED:    "Verified",
  IN_PROGRESS: "In Progress",
  RESOLVED:    "Resolved",
  DECLINED:    "Declined",
};
const STATUS_TRANSITIONS = {
  PENDING:     ["VERIFIED", "DECLINED"],
  VERIFIED:    ["IN_PROGRESS", "DECLINED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED:    [],
  DECLINED:    [],
};
const STATUS_FLOW_ORDER = ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED"];

const NOTIF_TEMPLATES = {
  VERIFIED:    (r) => ({ title: "Your report has been verified",       message: `Report ${padId(r.id)} at ${location(r)} has been verified by our team.`,                  type: "success" }),
  IN_PROGRESS: (r) => ({ title: "Repairs are underway",               message: `Work has started on the road damage at ${location(r)} that you reported.`,                type: "info"    }),
  RESOLVED:    (r) => ({ title: "Your report has been resolved",       message: `The road damage at ${location(r)} has been fully repaired. Thank you for reporting!`,     type: "success" }),
  DECLINED:    (r, reason) => ({ title: "Your report has been declined",  message: reason ? `Your report was declined: ${reason}` : "Your report was reviewed and declined.", type: "warning" }),
};

const toClass  = (s = "") => s.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");
const fmtDate  = (iso) => iso ? new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—";
const padId    = (id) => `RPT-${String(id).padStart(4, "0")}`;
const mediaUrl = (att) => att?.file_url ? `${BASE_URL}${att.file_url}` : null;

const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
const location   = (r) => r.location_address ?? r.barangay  ?? "—";

const confVal = (r) => {
  const v = r.ai_confidence ?? r.confidence;
  if (v == null) return null;
  const n = Number(v);
  return Math.round(n <= 1 ? n * 100 : n);
};
const confColor = (v) => {
  if (v === null) return "#aaa";
  if (v < 50)  return "#e53935";
  if (v < 80)  return "#f57c00";
  return "#2e7d32";
};
const sevWeight = (r) => {
  const map = { critical: 0, "non-critical": 1};
  return map[severity(r).toLowerCase()] ?? 99;
};

function exportCSV(rows) {
  const headers = ["ID", "Type", "Severity", "AI Conf", "Status", "Location", "Street", "Barangay", "Reporter", "Date"];
  const escape  = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines   = [
    headers.map(escape).join(","),
    ...rows.map((r) => [
      padId(r.id),
      damageType(r),
      severity(r),
      confVal(r) != null ? `${confVal(r)}%` : "",
      r.status ?? "",
      location(r),
      r.street_name ?? "",
      r.barangay ?? "",
      r.owner?.full_name ?? "Anonymous",
      r.created_at ? new Date(r.created_at).toLocaleDateString() : "",
    ].map(escape).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `reports_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAllReports() {
  const navigate = useNavigate();

  const [search,      setSearch]      = useState("");
  const [dSearch,     setDSearch]     = useState("");
  const [filters,     setFilters]     = useState({
    type: "All", severity: "All", status: "All", barangay: "All",
    dateFrom: "", dateTo: "", confMin: 0, confMax: 100,
  });
  const [sort,        setSort]        = useState({ field: "created_at", dir: "desc" });
  const [criticalOnly,setCriticalOnly]= useState(false);
  const [page,        setPage]        = useState(1);

  const [rawReports, setRawReports] = useState([]);
  const [reports,   setReports]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [barangays, setBarangays] = useState(["All"]);

  const [selectedIds,    setSelectedIds]    = useState(new Set());
  const [bulkLoading,    setBulkLoading]    = useState(false);
  const [actionLoading,  setActionLoading]  = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [showFilters,    setShowFilters]    = useState(true);
  const [toast,          setToast]          = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3_500);
  };

  useEffect(() => {
    const t = setTimeout(() => { setDSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = { page, page_size: PAGE_SIZE };
    if (filters.status !== "All") params.status = filters.status;

    const res = await getReports(params);
    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }

    const data = res.data?.results ?? [];
    setTotal(res.data?.total ?? 0);
    setRawReports(data);

    const bSet = new Set(["All"]);
    data.forEach((r) => { if (r.barangay) bSet.add(r.barangay); });
    setBarangays([...bSet]);

    setLoading(false);
  }, [page, filters.status]);

  useEffect(() => {
    let data = [...rawReports];

    if (filters.type !== "All")
      data = data.filter((r) => damageType(r).toLowerCase() === filters.type.toLowerCase());
    if (filters.severity !== "All")
      data = data.filter((r) => severity(r).toLowerCase() === filters.severity.toLowerCase());
    if (criticalOnly)
      data = data.filter((r) => severity(r).toLowerCase() === "critical");
    if (filters.barangay !== "All")
      data = data.filter((r) => r.barangay === filters.barangay);
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      data = data.filter((r) => r.created_at && new Date(r.created_at) >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo); to.setHours(23, 59, 59);
      data = data.filter((r) => r.created_at && new Date(r.created_at) <= to);
    }
    data = data.filter((r) => {
      const c = confVal(r);
      return c === null || (c >= filters.confMin && c <= filters.confMax);
    });
    if (dSearch) {
      const q = dSearch.toLowerCase();
      data = data.filter((r) =>
        padId(r.id).toLowerCase().includes(q) ||
        (r.street_name ?? "").toLowerCase().includes(q) ||
        (r.barangay ?? "").toLowerCase().includes(q) ||
        location(r).toLowerCase().includes(q) ||
        (r.owner?.full_name ?? "").toLowerCase().includes(q)
      );
    }

    const { field, dir } = sort;
    data = [...data].sort((a, b) => {
      let av, bv;
      if (field === "created_at")      { av = new Date(a.created_at || 0); bv = new Date(b.created_at || 0); }
      else if (field === "severity")   { av = sevWeight(a);     bv = sevWeight(b);     }
      else if (field === "confidence") { av = confVal(a) ?? -1; bv = confVal(b) ?? -1; }
      else if (field === "status") {
        const o = { PENDING: 0, VERIFIED: 1, IN_PROGRESS: 2, RESOLVED: 3, DECLINED: 4 };
        av = o[a.status] ?? 99; bv = o[b.status] ?? 99;
      } else { av = a[field] ?? ""; bv = b[field] ?? ""; }
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ?  1 : -1;
      return 0;
    });

    setReports(data);
  }, [rawReports, filters, dSearch, sort, criticalOnly]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const toggleSort = (field) =>
    setSort((p) => p.field === field
      ? { field, dir: p.dir === "asc" ? "desc" : "asc" }
      : { field, dir: "desc" }
    );

  const SortIcon = ({ field }) =>
    sort.field !== field
      ? <ArrowUpDown size={14} className="sort-neutral" />
      : (sort.dir === "asc" ? <ArrowUp size={14} className="sort-active" /> : <ArrowDown size={14} className="sort-active" />);

  const setFilter    = (k, v) => { setFilters((p) => ({ ...p, [k]: v })); setPage(1); };
  const resetFilters = () => {
    setFilters({ type: "All", severity: "All", status: "All", barangay: "All", dateFrom: "", dateTo: "", confMin: 0, confMax: 100 });
    setSearch(""); setPage(1); setCriticalOnly(false);
  };

  const handleStatusChange = async (reportId, newStatus, declineReason = "") => {
    setActionLoading((p) => ({ ...p, [reportId]: true }));

    const payload = { status: newStatus };
    if (newStatus === "DECLINED" && declineReason) payload.decline_reason = declineReason;

    const res = await updateReport(reportId, payload);
    if (res.success) {
      setRawReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, status: newStatus, decline_reason: declineReason || r.decline_reason }
            : r
        )
      );
      if (selectedReport?.id === reportId)
        setSelectedReport((p) => ({ ...p, status: newStatus }));

      const report = reports.find((r) => r.id === reportId);
      if (report?.owner?.id) {
        const tmplFn = NOTIF_TEMPLATES[newStatus];
        if (tmplFn) {
          const notif = newStatus === "DECLINED"
            ? tmplFn(report, declineReason)
            : tmplFn(report);
          await sendNotification({ user_id: report.owner.id, report_id: reportId, ...notif });
        }
      }

      showToast(`${padId(reportId)} → ${STATUS_LABELS[newStatus]}`);
    } else {
      showToast(res.error || "Update failed.", "error");
    }

    setActionLoading((p) => ({ ...p, [reportId]: false }));
    return res;
  };

  const toggleSelect = (id) =>
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelectedIds(selectedIds.size === reports.length ? new Set() : new Set(reports.map((r) => r.id)));

  const bulkAction = async (action) => {
    if (action === "delete" && !window.confirm(`Permanently delete ${selectedIds.size} report(s)?`)) return;
    setBulkLoading(true);
    const ids = [...selectedIds];
    if (action === "delete") {
      await Promise.all(ids.map((id) => deleteReport(id)));
    } else {
      await Promise.all(ids.map((id) => handleStatusChange(id, action)));
    }
    setSelectedIds(new Set());
    await fetchReports();
    setBulkLoading(false);
    showToast(`Bulk action applied to ${ids.length} report(s)`);
  };

  const viewOnMap = (r, e) => {
    e.stopPropagation();
    navigate("/admin/map", { state: { focusReport: { id: r.id, lat: r.latitude, lng: r.longitude } } });
  };

  const pageCount   = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageStart   = (page - 1) * PAGE_SIZE + 1;
  const pageEnd     = Math.min(page * PAGE_SIZE, total);
  const allSelected = reports.length > 0 && selectedIds.size === reports.length;

  const visiblePages = (() => {
    const half  = 2;
    let start   = Math.max(1, page - half);
    const end   = Math.min(pageCount, start + 4);
    start       = Math.max(1, end - 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  })();

  const stats = {
    total:    total,
    critical: rawReports.filter((r) => severity(r).toLowerCase() === "critical").length,
    pending:  rawReports.filter((r) => r.status === "PENDING").length,
    resolved: rawReports.filter((r) => r.status === "RESOLVED").length,
  };

  return (
    <>
      {toast && (
        <div className={`aar-toast aar-toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      <div className="aar-container">
        <div className="aar-stats-row">
          <div className="aar-stat aar-stat--total">
            <div className="aar-stat-value">{stats.total.toLocaleString()}</div>
            <div className="aar-stat-label">Total Reports</div>
          </div>
          <div className="aar-stat aar-stat--critical">
            <div className="aar-stat-value">{stats.critical}</div>
            <div className="aar-stat-label">Critical</div>
          </div>
          <div className="aar-stat aar-stat--pending">
            <div className="aar-stat-value">{stats.pending}</div>
            <div className="aar-stat-label">Pending</div>
          </div>
          <div className="aar-stat aar-stat--resolved">
            <div className="aar-stat-value">{stats.resolved}</div>
            <div className="aar-stat-label">Resolved</div>
          </div>
        </div>

        <div className="aar-topbar">
          <div className="aar-title-group">
            <h1 className="aar-title">Reports Database</h1>
            <span className="aar-count-badge">{total.toLocaleString()}</span>
          </div>

          <div className="aar-search-wrap">
            <Search className="search-ico" size={18} />
            <input
              className="aar-search"
              placeholder="Search ID, street, barangay, reporter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && <button className="search-clear" onClick={() => setSearch("")}><X size={20} /></button>}
          </div>

          <div className="aar-topbar-actions">
            <button
              className={`btn-critical-toggle ${criticalOnly ? "active" : ""}`}
              onClick={() => { setCriticalOnly((p) => !p); setPage(1); }}
            ><Circle size={16} className="icon-critical" /> Critical Only</button>
            <button className="btn-filter-toggle" onClick={() => setShowFilters((p) => !p)}>
              <Settings size={16} /> Filters {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button className="btn-export" onClick={() => exportCSV(reports)}>
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        <div className={`aar-filters-panel ${showFilters ? "open" : "closed"}`}>
          <div className="aar-filters-grid">
            <div className="filter-group">
              <label>Damage Type</label>
              <div className="filter-btn-row">
                {TYPE_OPTIONS.map((t) => (
                  <button
                    key={t}
                    className={`flt-btn ${filters.type === t ? "active" : ""}`}
                    onClick={() => setFilter("type", t)}
                  >{t}</button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label>Status</label>
              <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s === "All" ? "All Statuses" : STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Severity</label>
              <select value={filters.severity} onChange={(e) => setFilter("severity", e.target.value)}>
                <option value="All">All Severity</option>
                <option value="critical">Critical</option>
                <option value="non-critical">Non-Critical</option>
              </select>
            </div>

            <div className="filter-group">
              <label>Barangay</label>
              <select value={filters.barangay} onChange={(e) => setFilter("barangay", e.target.value)}>
                {barangays.map((b) => (
                  <option key={b} value={b}>{b === "All" ? "All Barangays" : b}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>Date From</label>
              <input type="date" value={filters.dateFrom} onChange={(e) => setFilter("dateFrom", e.target.value)} />
            </div>

            <div className="filter-group">
              <label>Date To</label>
              <input type="date" value={filters.dateTo} onChange={(e) => setFilter("dateTo", e.target.value)} />
            </div>

            <div className="filter-group filter-conf-group">
              <label>AI Confidence: <strong>{filters.confMin}%–{filters.confMax}%</strong></label>
              <div className="conf-dual-range">
                <input type="range" min="0" max="100" value={filters.confMin}
                  onChange={(e) => setFilter("confMin", +e.target.value)} />
                <input type="range" min="0" max="100" value={filters.confMax}
                  onChange={(e) => setFilter("confMax", +e.target.value)} />
              </div>
              <div className="conf-range-labels">
                <span style={{ color: "#e53935" }}>Low &lt;50%</span>
                <span style={{ color: "#f57c00" }}>Mid 50–80%</span>
                <span style={{ color: "#2e7d32" }}>High &gt;80%</span>
              </div>
            </div>

            <button className="btn-reset" onClick={resetFilters}><RotateCcw size={16} /> Reset All</button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="aar-bulk-bar">
            <span className="bulk-count"><strong>{selectedIds.size}</strong> selected</span>
            <div className="bulk-actions">
              <button onClick={() => bulkAction("VERIFIED")}    disabled={bulkLoading} className="bulk-btn bulk-verify"><Check size={16} /> Verify</button>
              <button onClick={() => bulkAction("IN_PROGRESS")} disabled={bulkLoading} className="bulk-btn bulk-progress"><Wrench size={16} /> In Progress</button>
              <button onClick={() => bulkAction("RESOLVED")}    disabled={bulkLoading} className="bulk-btn bulk-resolve"><CheckCircle size={16} /> Resolve</button>
              <button onClick={() => bulkAction("DECLINED")}    disabled={bulkLoading} className="bulk-btn bulk-decline"><XCircle size={16} /> Decline</button>
              <button onClick={() => bulkAction("delete")}      disabled={bulkLoading} className="bulk-btn bulk-delete"><Trash2 size={16} /> Delete</button>
            </div>
            <button className="bulk-cancel" onClick={() => setSelectedIds(new Set())}><X size={16} /> Cancel</button>
            {bulkLoading && <span className="bulk-spinner">Processing…</span>}
          </div>
        )}

        {error && (
          <div className="aar-error">
            <span><AlertTriangle size={16} /> {error}</span>
            <button onClick={fetchReports}>Retry</button>
          </div>
        )}

        <div className="aar-table-card">
          <div className="aar-table-scroll">
            <table className="aar-table">
              <thead>
                <tr>
                  <th className="th-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && !allSelected; }}
                    />
                  </th>
                  <th className="th-report sortable" onClick={() => toggleSort("id")}>
                    Report <SortIcon field="id" />
                  </th>
                  <th className="th-reporter">Reporter</th>
                  <th className="th-thumb">Photo</th>
                  <th className="th-type">Type</th>
                  <th className="th-sev sortable" onClick={() => toggleSort("severity")}>
                    Severity <SortIcon field="severity" />
                  </th>
                  <th className="th-conf sortable" onClick={() => toggleSort("confidence")}>
                    AI Conf <SortIcon field="confidence" />
                  </th>
                  <th className="th-status sortable" onClick={() => toggleSort("status")}>
                    Status <SortIcon field="status" />
                  </th>
                  <th className="th-date sortable" onClick={() => toggleSort("created_at")}>
                    Date <SortIcon field="created_at" />
                  </th>
                  <th className="th-actions">Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {[...Array(10)].map((_, j) => (
                        <td key={j}><div className="skeleton-cell" /></td>
                      ))}
                    </tr>
                  ))
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="aar-empty">
                      <div className="empty-state">
                        <span className="empty-icon"><ClipboardList size={32} /></span>
                        <p>No reports match your current filters</p>
                        <button onClick={resetFilters}>Clear Filters</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reports.map((r) => {
                    const conf        = confVal(r);
                    const sev         = severity(r);
                    const isCritical  = sev.toLowerCase() === "critical";
                    const thumb       = r.media_attachments?.[0];
                    const thumbUrl    = thumb ? mediaUrl(thumb) : null;
                    const transitions = STATUS_TRANSITIONS[r.status] ?? [];
                    const isActing    = !!actionLoading[r.id];
                    const isNew       = r.created_at && (Date.now() - new Date(r.created_at)) < 86_400_000;
                    const lowConf     = conf !== null && conf < 50;
                    const isSelected  = selectedIds.has(r.id);

                    return (
                      <tr
                        key={r.id}
                        className={`aar-row ${isSelected ? "row-selected" : ""} ${isCritical ? "row-critical" : ""}`}
                        onClick={() => setSelectedReport(r)}
                      >
                        <td className="td-check" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(r.id)} />
                        </td>

                        <td className="td-report">
                          <span className="report-id">{padId(r.id)}</span>
                          <span className="report-loc" title={location(r)}>{location(r)}</span>
                          <div className="report-flags">
                            {isNew      && <span className="flag flag-new">NEW</span>}
                            {lowConf    && <span className="flag flag-review"><AlertTriangle size={12} /> Low AI</span>}
                            {isCritical && <span className="flag flag-critical"><Circle size={12} className="icon-critical" /></span>}
                          </div>
                        </td>

                        <td className="td-reporter">
                          <span className="reporter-name">{r.owner?.full_name ?? "—"}</span>
                        </td>

                        <td className="td-thumb" onClick={(e) => e.stopPropagation()}>
                          {thumbUrl ? (
                            <img
                              className="thumb-img"
                              src={thumbUrl}
                              alt="Damage preview"
                              onClick={() => setSelectedReport(r)}
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          ) : (
                            <div className="thumb-empty">—</div>
                          )}
                        </td>

                        <td className="td-type">{damageType(r)}</td>

                        <td className="td-sev">
                          <span className={`sev-pill ${toClass(sev)}`}>{sev}</span>
                        </td>

                        <td className="td-conf">
                          {conf !== null ? (
                            <div className="conf-display">
                              <span className="conf-pct" style={{ color: confColor(conf) }}>{conf}%</span>
                              <div className="conf-bar-track">
                                <div className="conf-bar-fill" style={{ width: `${conf}%`, background: confColor(conf) }} />
                              </div>
                            </div>
                          ) : <span className="conf-na">—</span>}
                        </td>

                        <td className="td-status">
                          <span className={`status-pill ${toClass(r.status ?? "")}`}>
                            {STATUS_LABELS[r.status] ?? r.status ?? "—"}
                          </span>
                        </td>

                        <td className="td-date">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString("en-PH") : "—"}
                        </td>

                        <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-actions">
                            {transitions.length > 0 && (
                              <select
                                className="status-select"
                                disabled={isActing}
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) handleStatusChange(r.id, e.target.value);
                                }}
                              >
                                <option value="">Change Status…</option>
                                {transitions.map((t) => (
                                  <option key={t} value={t}>{STATUS_LABELS[t]}</option>
                                ))}
                              </select>
                            )}
                            <button className="act-map-btn"    onClick={(e) => viewOnMap(r, e)} title="View on Map"><MapPin size={14} /></button>
                            <button className="act-detail-btn" onClick={() => setSelectedReport(r)} title="View Details"><ArrowUpRight size={14} /></button>
                            {isActing && <span className="act-spinner"><Loader2 size={14} className="spin" /></span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="aar-pagination">
          <span className="page-info">
            Showing <strong>{total ? pageStart : 0}–{pageEnd}</strong> of <strong>{total.toLocaleString()}</strong> reports
          </span>
          <div className="page-controls">
            <button className="page-btn" disabled={page === 1}         onClick={() => setPage(1)}              title="First"><ChevronFirst size={16} /></button>
            <button className="page-btn" disabled={page === 1}         onClick={() => setPage((p) => p - 1)}   title="Previous"><ChevronLeft size={16} /></button>
            {visiblePages.map((p) => (
              <button key={p} className={`page-btn ${page === p ? "page-active" : ""}`} onClick={() => setPage(p)}>
                {p}
              </button>
            ))}
            <button className="page-btn" disabled={page >= pageCount}  onClick={() => setPage((p) => p + 1)}   title="Next"><ChevronRight size={16} /></button>
            <button className="page-btn" disabled={page >= pageCount}  onClick={() => setPage(pageCount)}      title="Last"><ChevronLast size={16} /></button>
          </div>
          <span className="page-size-info">Page {page} of {pageCount}</span>
        </div>
      </div>

      {selectedReport && (
        <ReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onStatusChange={handleStatusChange}
          onRefresh={fetchReports}
          navigate={navigate}
        />
      )}
    </>
  );
}

function ReportModal({ report: initial, onClose, onStatusChange, onRefresh, navigate }) {
  const [r,             setR]             = useState(initial);
  const [activeTab,     setTab]           = useState("details");
  const [comments,      setComments]      = useState([]);
  const [newNote,       setNewNote]       = useState("");
  const [assignedTo,    setAssigned]      = useState(initial.assigned_to ?? "Unassigned");
  const [declineReason, setDeclineReason] = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [imgErrors,     setImgErrors]     = useState({});
  const [noteLoading,   setNoteLoading]   = useState(false);
  const [updates,       setUpdates]       = useState([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updateSent,    setUpdateSent]    = useState(false);
  const [customMsg,     setCustomMsg]     = useState("");

  const transitions = STATUS_TRANSITIONS[r.status] ?? [];
  const attachments = r.media_attachments ?? [];
  const conf        = confVal(r);

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${BASE_URL}/api/v1/reports/${r.id}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setComments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [r.id]);

  const doStatusChange = async (newStatus) => {
    if (newStatus === "DECLINED" && !declineReason.trim()) {
      alert("A decline reason is required before declining a report.");
      return;
    }
    setSubmitting(true);
    const res = await onStatusChange(r.id, newStatus, declineReason);
    if (res?.success || true) {
      setR((p) => ({ ...p, status: newStatus, decline_reason: declineReason || p.decline_reason }));
    }
    setSubmitting(false);
    await onRefresh();
  };

  const doAddNote = async () => {
    if (!newNote.trim()) return;
    setNoteLoading(true);
    const trimmed = newNote.trim();
    try {
      const res = await addComment(r.id, trimmed);
      const comment = res?.data ?? res;
      if (comment?.id || res?.success) {
        setComments((p) => [...p, comment]);
        setNewNote("");
      }
      if (r.owner?.id) {
        await sendNotification({
          user_id:   r.owner.id,
          report_id: r.id,
          title:     `Admin message on your report ${padId(r.id)}`,
          message:   trimmed.length > 120 ? trimmed.slice(0, 117) + "…" : trimmed,
          type:      "comment",
        });
      }
    } catch (e) {
      console.error("doAddNote failed:", e);
    }
    setNoteLoading(false);
  };

  const doAssign = async () => {
    setSubmitting(true);
    await updateReport(r.id, { assigned_to: assignedTo });
    setR((p) => ({ ...p, assigned_to: assignedTo }));
    setSubmitting(false);
  };

  const loadUpdates = useCallback(async () => {
    setUpdatesLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${BASE_URL}/api/v1/notifications/?report_id=${r.id}&visible_to_user=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUpdates(Array.isArray(data) ? data : (data?.results ?? []));
    } catch {
      setUpdates([]);
    } finally {
      setUpdatesLoading(false);
    }
  }, [r.id]);

  useEffect(() => {
    if (activeTab === "message") loadUpdates();
  }, [activeTab, loadUpdates]);

  const doSendUpdate = async (title, message, type = "info") => {
    if (!r.owner?.id) return;
    setUpdatesLoading(true);
    await sendNotification({
      user_id:   r.owner.id,
      report_id: r.id,
      title,
      message,
      type,
    });
    setCustomMsg("");
    setUpdateSent(true);
    setTimeout(() => setUpdateSent(false), 3000);
    await loadUpdates();
    setUpdatesLoading(false);
  };

  const flowIndex = STATUS_FLOW_ORDER.indexOf(r.status);

  const TABS = [
    { id: "details", label: "Details",  badge: null              },
    { id: "media",   label: "Media",    badge: attachments.length },
    { id: "notes",   label: "Notes",    badge: comments.length    },
    { id: "actions", label: "Actions",  badge: transitions.length },
    { id: "message", label: "Updates",  badge: updates.length > 0 ? updates.length : null },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-hdr-left">
            <span className="modal-id">{padId(r.id)}</span>
            <span className={`status-pill ${toClass(r.status ?? "")}`}>
              {STATUS_LABELS[r.status] ?? r.status}
            </span>
            {conf !== null && (
              <span className="conf-badge-modal" style={{ borderColor: confColor(conf), color: confColor(conf) }}>
                AI {conf}%
              </span>
            )}
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>

        <div className="modal-tabs">
          {TABS.map(({ id, label, badge }) => (
            <button
              key={id}
              className={`tab-btn ${activeTab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
              {badge > 0 && <span className="tab-badge">{badge}</span>}
            </button>
          ))}
        </div>

        <div className="modal-content-area">
          {activeTab === "details" && (
            <div className="tab-pane">
              <div className="detail-grid">
                <div className="detail-card">
                  <h5 className="detail-card-title"><User size={16} /> Reporter</h5>
                  <div className="detail-row"><span>Name</span>   <strong>{r.owner?.full_name ?? "Anonymous"}</strong></div>
                  <div className="detail-row"><span>Contact</span><strong>{r.owner?.phone ?? "—"}</strong></div>
                  <div className="detail-row"><span>Email</span>  <strong>{r.owner?.email ?? "—"}</strong></div>
                </div>
                <div className="detail-card">
                  <h5 className="detail-card-title"><AlertTriangle size={16} /> Damage Info</h5>
                  <div className="detail-row"><span>Type</span>   <strong>{damageType(r)}</strong></div>
                  <div className="detail-row">
                    <span>Severity</span>
                    <span className={`sev-pill ${toClass(severity(r))}`}>{severity(r)}</span>
                  </div>
                  {conf !== null && (
                    <div className="detail-row">
                      <span>AI Confidence</span>
                      <span style={{ color: confColor(conf), fontWeight: 700 }}>{conf}%</span>
                    </div>
                  )}
                </div>
                <div className="detail-card">
                  <h5 className="detail-card-title"><MapPin size={16} /> Location</h5>
                  <div className="detail-row"><span>Address</span> <strong>{r.location_address ?? "—"}</strong></div>
                  <div className="detail-row"><span>Street</span>  <strong>{r.street_name ?? "—"}</strong></div>
                  <div className="detail-row"><span>Barangay</span><strong>{r.barangay ?? "—"}</strong></div>
                </div>
                <div className="detail-card">
                  <h5 className="detail-card-title"><Calendar size={16} /> Timeline</h5>
                  <div className="detail-row"><span>Submitted</span><strong>{fmtDate(r.created_at)}</strong></div>
                  <div className="detail-row"><span>Updated</span>  <strong>{fmtDate(r.updated_at)}</strong></div>
                </div>
              </div>

              {r.description && (
                <div className="detail-desc-card">
                  <h5 className="detail-card-title"><FileText size={16} /> Description</h5>
                  <p>{r.description}</p>
                </div>
              )}

              {r.status === "DECLINED" && r.decline_reason && (
                <div className="decline-notice">
                  <strong><Ban size={16} /> Decline Reason:</strong> {r.decline_reason}
                </div>
              )}

              <div className="detail-card assign-card">
                <h5 className="detail-card-title"><UserCog size={16} /> Assignment</h5>
                <div className="assign-row">
                  <select value={assignedTo} onChange={(e) => setAssigned(e.target.value)}>
                    {TEAM_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button className="btn-assign" onClick={doAssign} disabled={submitting}>
                    {submitting ? "Saving…" : "Assign"}
                  </button>
                </div>
              </div>

              <div className="modal-map-link">
                <button
                  className="btn-view-map"
                  onClick={() => navigate("/admin/map", { state: { focusReport: { id: r.id, lat: r.latitude, lng: r.longitude } } })}
                ><MapPin size={16} /> View on Map</button>
              </div>
            </div>
          )}

          {activeTab === "media" && (
            <div className="tab-pane media-pane">
              {attachments.length === 0 ? (
                <div className="no-media-state"><span><Image size={32} /></span><p>No media attachments for this report</p></div>
              ) : (
                <div className="media-grid">
                  {attachments.map((att, i) => {
                    const url   = imgErrors[i] ? null : mediaUrl(att);
                    const label = i === 0 ? <><Camera size={14} /> Damage Photo</>
                      : (i === 1 && r.status === "RESOLVED") ? <><CheckCircle size={14} /> Repair Proof</>
                      : <><Paperclip size={14} /> Attachment {i + 1}</>;
                    return (
                      <div key={i} className="media-item-card">
                        <p className="media-item-label">{label}</p>
                        {url ? (
                          att.media_type === "video"
                            ? <video src={url} controls className="media-display" />
                            : <img src={url} alt={label} className="media-display"
                                onError={() => setImgErrors((p) => ({ ...p, [i]: true }))} />
                        ) : (
                          <div className="media-unavail">Media unavailable</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <div className="tab-pane notes-pane">
              <div className="notes-timeline">
                {comments.length === 0 ? (
                  <div className="no-notes"><span><StickyNote size={32} /></span><p>No admin notes yet. Be the first to add one.</p></div>
                ) : (
                  comments.map((c, i) => (
                    <div key={c.id ?? i} className="note-entry">
                      <div className="note-line" />
                      <div className="note-dot" />
                      <div className="note-body">
                        <div className="note-meta">
                          <span className="note-author">{c.user?.full_name ?? "Admin"}</span>
                          <span className="note-date">{fmtDate(c.created_at)}</span>
                        </div>
                        <p className="note-text">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="notes-compose">
                <textarea
                  placeholder="Add an admin note…"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  rows={3}
                  onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) doAddNote(); }}
                />
                <div className="notes-compose-actions">
                  <span className="compose-hint">Ctrl+Enter to submit</span>
                  <button className="btn-add-note" onClick={doAddNote} disabled={noteLoading || !newNote.trim()}>
                    {noteLoading ? "Adding…" : "Add Note"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "actions" && (
            <div className="tab-pane actions-pane">
              <div className="workflow-section">
                <h5>Status Workflow</h5>
                <div className="workflow-track">
                  {STATUS_FLOW_ORDER.map((s, i) => {
                    const isDone    = flowIndex > i;
                    const isCurrent = flowIndex === i;
                    return (
                      <React.Fragment key={s}>
                        <div className={`workflow-node ${isDone ? "done" : ""} ${isCurrent ? "current" : ""}`}>
                          <div className="wf-dot">{isDone ? <Check size={12} /> : i + 1}</div>
                          <span className="wf-label">{STATUS_LABELS[s]}</span>
                        </div>
                        {i < STATUS_FLOW_ORDER.length - 1 && (
                          <div className={`workflow-arrow-line ${isDone ? "done" : ""}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                {r.status === "DECLINED" && (
                  <div className="workflow-declined-badge"><Ban size={16} /> This report was declined</div>
                )}
              </div>

              {transitions.length > 0 ? (
                <div className="action-section">
                  <h5>Change Status</h5>
                  <p className="action-note">
                    <Mail size={16} /> The reporter will receive an in-app notification for every status change.
                  </p>
                  {transitions.includes("DECLINED") && (
                    <div className="decline-reason-input">
                      <label>Decline Reason <span className="required">*</span></label>
                      <input
                        type="text"
                        placeholder="Enter reason for declining…"
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="status-action-btns">
                    {transitions.map((t) => (
                      <button
                        key={t}
                        className={`status-action-btn action-${toClass(t)}`}
                        onClick={() => doStatusChange(t)}
                        disabled={submitting || (t === "DECLINED" && !declineReason.trim())}
                      >
                        {submitting ? "Updating…" : STATUS_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="actions-terminal">
                  <span><CheckCircle size={24} /></span>
                  <p>This report is in a final state — no further status changes are allowed.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "message" && (
            <div className="tab-pane message-pane">
              {!r.owner?.id ? (
                <div className="no-notes">
                  <span><MailOpen size={32} /></span>
                  <p>This report has no linked reporter account. Updates cannot be sent.</p>
                </div>
              ) : (
                <>
                  <div className="msg-reporter-info">
                    <strong>Sending to:</strong> {r.owner?.full_name ?? "Reporter"}
                    {r.owner?.email && <span style={{ color: "var(--subtext)", marginLeft: 6 }}>{r.owner.email}</span>}
                  </div>

                  <p className="msg-label" style={{ marginBottom: 8 }}>Quick updates</p>
                  <div className="msg-quick-replies">
                    {[
                      { label: <><CheckCircle size={14} /> Under Review</>,          title: "Your report is under review",             text: "Your report is currently being reviewed by our team. We will update you shortly.", type: "info"    },
                      { label: <><Camera size={14} /> Need Clearer Photo</>,    title: "Additional information needed",            text: "Thank you for your report. Could you please provide a clearer photo of the damage?", type: "warning" },
                      { label: <><Wrench size={14} /> Scheduled for Repair</>,  title: "Repair has been scheduled",               text: "Your report has been reviewed and a repair has been scheduled. Thank you!", type: "info"    },
                      { label: <><CheckCircle size={14} /> Repair Complete</>,        title: "Road damage has been repaired",           text: "The damage you reported has been fully repaired. Thank you for helping keep our roads safe!", type: "success" },
                      { label: <><ClipboardList size={14} /> Duplicate Report</>,      title: "Your report is a duplicate",              text: "This damage has already been reported and is being addressed. Thank you for your vigilance!", type: "warning" },
                    ].map((tpl) => (
                      <button
                        key={tpl.label}
                        className="msg-quick-btn"
                        disabled={updatesLoading}
                        onClick={() => doSendUpdate(tpl.title, tpl.text, tpl.type)}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>

                  <label className="msg-label" style={{ marginTop: 14 }}>Custom message (optional)</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <textarea
                      className="msg-textarea"
                      value={customMsg}
                      onChange={(e) => setCustomMsg(e.target.value)}
                      rows={3}
                      maxLength={300}
                      placeholder="Write a custom update for the reporter…"
                      style={{ flex: 1 }}
                    />
                    <button
                      className="btn-send-msg"
                      style={{ flexShrink: 0, height: "fit-content" }}
                      onClick={() => doSendUpdate(`Update on ${padId(r.id)}`, customMsg, "info")}
                      disabled={updatesLoading || !customMsg.trim()}
                    >
                      {updatesLoading ? "Sending…" : <><Send size={14} /> Send</>}
                    </button>
                  </div>

                  {updateSent && (
                    <div className="msg-sent-banner"><Check size={14} /> Update sent to reporter successfully!</div>
                  )}

                  <div style={{ marginTop: 20 }}>
                    <p className="msg-label">Update history ({updates.length})</p>
                    {updatesLoading ? (
                      <p style={{ color: "var(--subtext)", fontSize: "0.84rem" }}>Loading…</p>
                    ) : updates.length === 0 ? (
                      <div className="no-notes" style={{ padding: "16px 0" }}>
                        <span><MailOpen size={32} /></span>
                        <p>No updates sent yet for this report.</p>
                      </div>
                    ) : (
                      <div className="notes-timeline">
                        {updates.map((u, i) => (
                          <div key={u.id ?? i} className="note-entry">
                            <div className="note-line" />
                            <div className="note-dot" />
                            <div className="note-body">
                              <div className="note-meta">
                                <span className="note-author">Admin → {r.owner?.full_name ?? "Reporter"}</span>
                                <span className="note-date">{fmtDate(u.created_at)}</span>
                              </div>
                              <p className="note-text" style={{ fontWeight: 600 }}>{u.title}</p>
                              <p className="note-text">{u.message}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}