import React, { useState } from "react";
import "./AdminStreetReports.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

// ── Sample data ────────────────────────────────────────────────────────────────
const allReports = [
  { id: "Report#001", street: "EDSA, Quezon City",      type: "Pothole", severity: "Critical",     status: "In Progress", date: "2026-03-02", reporterName: "Juan Dela Cruz",   contact: "09171234567", additionalInfo: "Large pothole near flyover." },
  { id: "Report#002", street: "EDSA, Quezon City",      type: "Crack",   severity: "Non-Critical", status: "Completed",   date: "2026-03-01", reporterName: "Maria Santos",     contact: "09181234567", additionalInfo: "Surface crack along sidewalk." },
  { id: "Report#003", street: "EDSA, Quezon City",      type: "Pothole", severity: "Critical",     status: "Pending",     date: "2026-03-05", reporterName: "Pedro Reyes",      contact: "09191234567", additionalInfo: "Deep pothole causing traffic." },
  { id: "Report#004", street: "España Blvd, Manila",    type: "Crack",   severity: "Non-Critical", status: "Completed",   date: "2026-03-01", reporterName: "Ana Gomez",        contact: "09201234567", additionalInfo: "Hairline cracks on road surface." },
  { id: "Report#005", street: "España Blvd, Manila",    type: "Pothole", severity: "Critical",     status: "In Progress", date: "2026-03-04", reporterName: "Carlos Mendoza",   contact: "09211234567", additionalInfo: "Dangerous pothole near bus stop." },
  { id: "Report#006", street: "Katipunan Ave, QC",      type: "Crack",   severity: "Critical",     status: "Pending",     date: "2026-03-06", reporterName: "Liza Cruz",        contact: "09221234567", additionalInfo: "Multiple cracks, needs urgent repair." },
  { id: "Report#007", street: "Katipunan Ave, QC",      type: "Pothole", severity: "Non-Critical", status: "Completed",   date: "2026-02-28", reporterName: "Ramon Bautista",   contact: "09231234567", additionalInfo: "Small pothole, filled temporarily." },
  { id: "Report#008", street: "Commonwealth Ave, QC",   type: "Pothole", severity: "Critical",     status: "In Progress", date: "2026-03-03", reporterName: "Sofia Reyes",      contact: "09241234567", additionalInfo: "Multiple potholes on center lane." },
  { id: "Report#009", street: "Commonwealth Ave, QC",   type: "Crack",   severity: "Non-Critical", status: "In Progress", date: "2026-03-07", reporterName: "Miguel Torres",    contact: "09251234567", additionalInfo: "Longitudinal cracking visible." },
  { id: "Report#010", street: "Taft Ave, Manila",       type: "Pothole", severity: "Non-Critical", status: "Pending",     date: "2026-03-08", reporterName: "Elena Villanueva", contact: "09261234567", additionalInfo: "Shallow pothole near LRT station." },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByStreet(reports) {
  const map = {};
  reports.forEach((r) => {
    if (!map[r.street]) map[r.street] = [];
    map[r.street].push(r);
  });
  return map;
}

function latestDate(reports) {
  return reports
    .map((r) => r.date)
    .sort()
    .reverse()[0];
}

function dominantStatus(reports) {
  const order = ["Pending", "In Progress", "Completed"];
  for (const s of order) {
    if (reports.some((r) => r.status === s)) return s;
  }
  return reports[0].status;
}

// ── Component ─────────────────────────────────────────────────────────────────
function AdminStreetReports() {
  const [expandedStreet, setExpandedStreet] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [filters, setFilters] = useState({ type: "All", severity: "All", status: "All" });

  const streetMap = groupByStreet(allReports);

  const streetRows = Object.entries(streetMap).map(([street, reports]) => ({
    street,
    reports,
    total: reports.length,
    potholes: reports.filter((r) => r.type === "Pothole").length,
    cracks: reports.filter((r) => r.type === "Crack").length,
    critical: reports.filter((r) => r.severity === "Critical").length,
    nonCritical: reports.filter((r) => r.severity === "Non-Critical").length,
    dominantStatus: dominantStatus(reports),
    latestDate: latestDate(reports),
  }));

  // apply street-level filters
  const filteredStreetRows = streetRows.filter((row) => {
    const matchType =
      filters.type === "All" ||
      (filters.type === "Pothole" && row.potholes > 0) ||
      (filters.type === "Crack" && row.cracks > 0);
    const matchSeverity =
      filters.severity === "All" ||
      (filters.severity === "Critical" && row.critical > 0) ||
      (filters.severity === "Non-Critical" && row.nonCritical > 0);
    const matchStatus =
      filters.status === "All" ||
      row.reports.some((r) => r.status === filters.status);
    return matchType && matchSeverity && matchStatus;
  });

  const toggleStreet = (street) =>
    setExpandedStreet((prev) => (prev === street ? null : street));

  // ── NEW: filter child reports using the same active filters ───────────────
  const filterChildReports = (reports) =>
    reports.filter((r) => {
      const matchType = filters.type === "All" || r.type === filters.type;
      const matchSeverity = filters.severity === "All" || r.severity === filters.severity;
      const matchStatus = filters.status === "All" || r.status === filters.status;
      return matchType && matchSeverity && matchStatus;
    });
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      <div className="asr-container">
        {/* ── FILTERS ── */}
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
                  <button
                    key={t}
                    className={filters.type === t ? "active" : ""}
                    onClick={() => setFilters({ ...filters, type: t })}
                  >
                    {t}
                  </button>
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
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* ── TABLE ── */}
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
              {filteredStreetRows.length > 0 ? (
                filteredStreetRows.map((row) => {
                  // ── NEW: filtered child reports for this street ────────────
                  const filteredChildren = filterChildReports(row.reports);
                  // ──────────────────────────────────────────────────────────
                  return (
                  <React.Fragment key={row.street}>
                    {/* ── STREET ROW ── */}
                    <tr
                      className={`asr-street-row ${expandedStreet === row.street ? "expanded" : ""}`}
                      onClick={() => toggleStreet(row.street)}
                    >
                      <td className="col-expand">
                        <span className={`chevron ${expandedStreet === row.street ? "open" : ""}`}>›</span>
                      </td>
                      <td className="asr-street-name">{row.street}</td>
                      <td>
                        <span className="asr-total-pill">{row.total}</span>
                      </td>
                      <td>
                        <div className="asr-type-badges">
                          {row.potholes > 0 && (
                            <span className="type-badge pothole">{row.potholes} Pothole{row.potholes > 1 ? "s" : ""}</span>
                          )}
                          {row.cracks > 0 && (
                            <span className="type-badge crack">{row.cracks} Crack{row.cracks > 1 ? "s" : ""}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="asr-sev-badges">
                          {row.critical > 0 && (
                            <span className="sev-badge critical">{row.critical} Critical</span>
                          )}
                          {row.nonCritical > 0 && (
                            <span className="sev-badge non-critical">{row.nonCritical} Non-Critical</span>
                          )}
                        </div>
                      </td>
                      {/* STATUS — dash at street level, values only in expanded child rows */}
                      <td>
                        <span className="asr-empty-status">—</span>
                      </td>
                      <td>{row.latestDate}</td>
                    </tr>

                    {/* ── EXPANDED CHILD ROWS ── */}
                    {expandedStreet === row.street && (
                      <>
                        <tr className="asr-child-header-row">
                          <td></td>
                          <td colSpan={6}>
                            <div className="asr-child-header">
                              <span>Reports for <strong>{row.street}</strong></span>
                              {/* ── NEW: show filtered count vs total ───────── */}
                              <span className="asr-child-count">
                                {filteredChildren.length} of {row.reports.length} report{row.reports.length > 1 ? "s" : ""}
                              </span>
                              {/* ──────────────────────────────────────────── */}
                            </div>
                          </td>
                        </tr>
                        {/* ── NEW: render filteredChildren instead of row.reports ── */}
                        {filteredChildren.length > 0 ? (
                          filteredChildren.map((report) => (
                            <tr
                              key={report.id}
                              className="asr-child-row clickable-row"
                              onClick={(e) => { e.stopPropagation(); setSelectedReport(report); }}
                            >
                              <td></td>
                              <td>
                                <strong className="asr-report-id">{report.id}</strong>
                              </td>
                              <td>—</td>
                              <td>
                                <span className={`type-badge ${report.type.toLowerCase()}`}>{report.type}</span>
                              </td>
                              <td>
                                <span className={`admin-severity ${report.severity.toLowerCase().replace(" ", "-")}`}>
                                  {report.severity}
                                </span>
                              </td>
                              {/* STATUS — shown per individual report */}
                              <td>
                                <span className={`admin-status ${report.status.toLowerCase().replace(" ", "-")}`}>
                                  {report.status}
                                </span>
                              </td>
                              <td>{report.date}</td>
                            </tr>
                          ))
                        ) : (
                          <tr className="asr-child-row">
                            <td></td>
                            <td colSpan={6} className="admin-no-data">No reports match the current filters</td>
                          </tr>
                        )}
                        {/* ──────────────────────────────────────────────────── */}
                        {/* Spacer after expanded section */}
                        <tr className="asr-spacer-row"><td colSpan={7}></td></tr>
                      </>
                    )}
                  </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" className="admin-no-data">No streets match the current filters</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── MODAL ── */}
        {selectedReport && (
          <div className="modal-overlay" onClick={() => setSelectedReport(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close-btn" onClick={() => setSelectedReport(null)}>×</button>
              <h3 className="modal-title">Report Details</h3>

              <div className="modal-body">
                <div className="modal-left">
                  <div className="reporter-info">
                    <div className="info-row"><strong>Report:</strong> {selectedReport.id}</div>
                    <div className="info-row"><strong>Reporter:</strong> {selectedReport.reporterName}</div>
                    <div className="info-row"><strong>Contact:</strong> {selectedReport.contact}</div>
                  </div>

                  <div className="info-card">
                    <p><strong>Damage Type:</strong> {selectedReport.type}</p>
                    <p><strong>Severity:</strong> {selectedReport.severity}</p>
                    <p><strong>Status:</strong> {selectedReport.status}</p>
                    <p><strong>Additional Info:</strong></p>
                    <p className="additional-info">{selectedReport.additionalInfo}</p>
                  </div>

                  <div className="location-info">
                    <p><strong>Location:</strong> {selectedReport.street}</p>
                  </div>
                </div>

                <div className="modal-right">
                  <div className="modal-media">
                    <div className="modal-no-media">No media attached</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AdminStreetReports;