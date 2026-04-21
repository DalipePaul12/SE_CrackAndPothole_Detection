import React, { useEffect, useState, useCallback } from "react";
import "./AdminStreetReports.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import { getReports } from "../../api/reports";

function groupByStreet(reports) {
  const map = {};
  reports.forEach((r) => {
    const key = r.location_address ?? r.barangay ?? "Unknown";
    if (!map[key]) map[key] = [];
    map[key].push(r);
  });
  return map;
}

function dominantStatus(reports) {
  const order = ["pending", "verified", "in_progress", "resolved"];
  for (const s of order) {
    if (reports.some((r) => r.status === s)) return s;
  }
  return reports[0]?.status ?? "—";
}

const STATUS_LABEL = { pending: "Pending", verified: "Verified", in_progress: "In Progress", resolved: "Resolved", declined: "Declined" };

function AdminStreetReports() {
  const [allReports, setAllReports]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [expandedStreet, setExpanded] = useState(null);
  const [selectedReport, setSelected] = useState(null);
  const [filters, setFilters]         = useState({ type: "All", severity: "All", status: "All" });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getReports({ page_size: 100 });
    if (!res.success) { setError(res.error); setLoading(false); return; }
    setAllReports(res.data?.results ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
  const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
  const dateStr    = (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : "—";

  const streetMap  = groupByStreet(allReports);
  const streetRows = Object.entries(streetMap).map(([street, reports]) => ({
    street,
    reports,
    total:      reports.length,
    potholes:   reports.filter((r) => damageType(r).toLowerCase() === "pothole").length,
    cracks:     reports.filter((r) => damageType(r).toLowerCase() === "crack").length,
    critical:   reports.filter((r) => severity(r).toLowerCase().includes("critical") && !severity(r).toLowerCase().includes("non")).length,
    nonCritical: reports.filter((r) => severity(r).toLowerCase().includes("non")).length,
    dominantStatus: dominantStatus(reports),
    latestDate: reports.map((r) => r.created_at).sort().reverse()[0],
  }));

  const filteredRows = streetRows.filter((row) => {
    const mt = filters.type === "All" || (filters.type === "Pothole" && row.potholes > 0) || (filters.type === "Crack" && row.cracks > 0);
    const ms = filters.severity === "All" || (filters.severity === "Critical" && row.critical > 0) || (filters.severity === "Non-Critical" && row.nonCritical > 0);
    const mst = filters.status === "All" || row.reports.some((r) => r.status === filters.status);
    return mt && ms && mst;
  });

  const filterChildren = (reports) =>
    reports.filter((r) => {
      const mt  = filters.type === "All" || damageType(r).toLowerCase() === filters.type.toLowerCase();
      const ms  = filters.severity === "All" || severity(r).toLowerCase().replace(/[\s_]/g, "-") === filters.severity.toLowerCase().replace(" ", "-");
      const mst = filters.status === "All" || r.status === filters.status;
      return mt && ms && mst;
    });

  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      <div className="asr-container">
        <div className="asr-filters-card">
          <div className="asr-header">
            <h2>Street Reports Overview</h2>
            <span className="asr-total-badge">{allReports.length} total reports</span>
          </div>
          <div className="asr-filters-row">
            <div className="admin-filter-group">
              <label>Damage Type</label>
              <div className="admin-filter-buttons">
                {["All", "Crack", "Pothole"].map((t) => (
                  <button key={t} className={filters.type === t ? "active" : ""} onClick={() => setFilters({ ...filters, type: t })}>{t}</button>
                ))}
              </div>
            </div>
            <div className="admin-filter-group">
              <label>Severity</label>
              <div className="admin-custom-select">
                <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
                  <option value="All">All Severity</option>
                  <option value="Non-Critical">Non-Critical</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
            <div className="admin-filter-group">
              <label>Status</label>
              <div className="admin-custom-select">
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                  <option value="All">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <div className="asr-table-card">
          <table className="asr-table">
            <thead>
              <tr>
                <th className="col-expand"></th>
                <th>Street / Location</th>
                <th>Total Reports</th>
                <th>Damage Type</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Latest Report</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="admin-no-data">Loading…</td></tr>
              ) : filteredRows.length > 0 ? (
                filteredRows.map((row) => {
                  const children = filterChildren(row.reports);
                  return (
                    <React.Fragment key={row.street}>
                      <tr
                        className={`asr-street-row${expandedStreet === row.street ? " expanded" : ""}`}
                        onClick={() => setExpanded((p) => p === row.street ? null : row.street)}
                      >
                        <td className="col-expand">
                          <span className={`chevron${expandedStreet === row.street ? " open" : ""}`}>›</span>
                        </td>
                        <td className="asr-street-name">{row.street}</td>
                        <td><span className="asr-total-pill">{row.total}</span></td>
                        <td>
                          <div className="asr-type-badges">
                            {row.potholes > 0 && <span className="type-badge pothole">{row.potholes} Pothole{row.potholes > 1 ? "s" : ""}</span>}
                            {row.cracks   > 0 && <span className="type-badge crack">{row.cracks} Crack{row.cracks > 1 ? "s" : ""}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="asr-sev-badges">
                            {row.critical    > 0 && <span className="sev-badge critical">{row.critical} Critical</span>}
                            {row.nonCritical > 0 && <span className="sev-badge non-critical">{row.nonCritical} Non-Critical</span>}
                          </div>
                        </td>
                        <td><span className="asr-empty-status">—</span></td>
                        <td>{row.latestDate ? new Date(row.latestDate).toLocaleDateString() : "—"}</td>
                      </tr>

                      {expandedStreet === row.street && (
                        <>
                          <tr className="asr-child-header-row">
                            <td></td>
                            <td colSpan={6}>
                              <div className="asr-child-header">
                                <span>Reports for <strong>{row.street}</strong></span>
                                <span className="asr-child-count">{children.length} of {row.reports.length} report{row.reports.length > 1 ? "s" : ""}</span>
                              </div>
                            </td>
                          </tr>
                          {children.length > 0 ? children.map((r) => (
                            <tr key={r.id} className="asr-child-row clickable-row" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
                              <td></td>
                              <td><strong className="asr-report-id">Report#{String(r.id).padStart(3, "0")}</strong></td>
                              <td>—</td>
                              <td><span className={`type-badge ${damageType(r).toLowerCase()}`}>{damageType(r)}</span></td>
                              <td><span className={`admin-severity ${severity(r).toLowerCase().replace(/[\s_]/g, "-")}`}>{severity(r)}</span></td>
                              <td><span className={`admin-status ${r.status?.toLowerCase().replace(/[\s_]/g, "-")}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                              <td>{dateStr(r)}</td>
                            </tr>
                          )) : (
                            <tr className="asr-child-row">
                              <td></td>
                              <td colSpan={6} className="admin-no-data">No reports match the current filters</td>
                            </tr>
                          )}
                          <tr className="asr-spacer-row"><td colSpan={7}></td></tr>
                        </>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr><td colSpan="7" className="admin-no-data">No streets match the current filters</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedReport && (
          <StreetReportModal report={selectedReport} onClose={() => setSelected(null)} />
        )}
      </div>
    </>
  );
}

function StreetReportModal({ report: r, onClose }) {
  const location   = r.location_address ?? r.barangay ?? "—";
  const damageType = r.ai_damage_type   ?? r.damage_type ?? "—";
  const severity   = r.ai_severity      ?? r.severity    ?? "—";
  const mediaUrl   = r.media_attachments?.[0]?.file_url;
  const mediaType  = r.media_attachments?.[0]?.media_type;
  const fullUrl    = mediaUrl ? `${import.meta.env.VITE_API_URL || ""}${mediaUrl}` : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>×</button>
        <h3 className="modal-title">Report Details</h3>
        <div className="modal-body">
          <div className="modal-left">
            <div className="reporter-info">
              <div className="info-row"><strong>Report:</strong> Report#{String(r.id).padStart(3, "0")}</div>
              <div className="info-row"><strong>Reporter:</strong> {r.owner?.full_name ?? "Anonymous"}</div>
              <div className="info-row"><strong>Contact:</strong> {r.owner?.phone ?? "—"}</div>
            </div>
            <div className="info-card">
              <p><strong>Damage Type:</strong> {damageType}</p>
              <p><strong>Severity:</strong> {severity}</p>
              <p><strong>Status:</strong> {STATUS_LABEL[r.status] ?? r.status}</p>
              <p><strong>Additional Info:</strong></p>
              <p className="additional-info">{r.description ?? "—"}</p>
            </div>
            <div className="location-info">
              <p><strong>Location:</strong> {location}</p>
            </div>
          </div>
          <div className="modal-right">
            <div className="modal-media">
              {fullUrl ? (
                mediaType === "video"
                  ? <video src={fullUrl} controls style={{ width: "100%", borderRadius: 8 }} />
                  : <img src={fullUrl} alt="Report" style={{ width: "100%", borderRadius: 8, objectFit: "cover" }} />
              ) : (
                <div className="modal-no-media">No media attached</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminStreetReports;