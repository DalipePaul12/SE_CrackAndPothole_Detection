import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ChevronLeft, ChevronRight, X,
  ChevronDown, ImageOff, MapPin, Calendar,
  Activity, Shield, TrendingUp, Database,
} from "lucide-react";
import "./AllReports.css";
import { useReports } from "../../hooks/useReports";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const toClass = (str = "") =>
  str.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const getImageUrl = (report) => {
  const url = report?.media_attachments?.[0]?.file_url;
  return url ? `${BASE_URL}${url}` : null;
};

function Pagination({ page, setPage, total, pageSize = 10 }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pagination" role="navigation" aria-label="Report pages">
      <button
        className="page-btn"
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft size={15} /> Prev
      </button>
      <span className="page-info">
        Page {page} of {totalPages}&nbsp;·&nbsp;{total} report{total !== 1 ? "s" : ""}
      </span>
      <button
        className="page-btn"
        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

function ReportModal({ report, onClose }) {
  const imageUrl = getImageUrl(report);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Report details"
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
          <X size={18} />
        </button>
        <h3 className="modal-title">Report #{report.id}</h3>
        <div className="modal-body">
          <div className="modal-left">
            <div className="reporter-info">
              <div className="info-row">
                <strong>Report ID</strong>
                <span>#{report.id}</span>
              </div>
              {report.upvote_count > 0 && (
                <div className="info-row">
                  <strong>Upvotes</strong>
                  <span>{report.upvote_count}</span>
                </div>
              )}
            </div>
            <div className="info-card">
              <div className="info-row">
                <strong>Damage Type</strong>
                <span>{report.ai_damage_type ?? "—"}</span>
              </div>
              <div className="info-row">
                <strong>Severity</strong>
                <span className={`severity ${toClass(report.ai_severity ?? "")}`}>
                  {report.ai_severity ?? "—"}
                </span>
              </div>
              <div className="info-row">
                <strong>Status</strong>
                <span className={`status ${toClass(report.status ?? "")}`}>
                  {report.status ?? "—"}
                </span>
              </div>
              {report.status === "DECLINED" && report.decline_reason && (
                <div className="decline-reason">
                  <AlertTriangle size={15} />
                  <span><strong>Reason:</strong> {report.decline_reason}</span>
                </div>
              )}
              <div className="info-row">
                <strong>AI Confidence</strong>
                <span>
                  {report.ai_confidence != null
                    ? `${(report.ai_confidence * 100).toFixed(1)}%`
                    : "—"}
                </span>
              </div>
              {report.description && (
                <div
                  className="info-row"
                  style={{ alignItems: "flex-start", flexDirection: "column", gap: "6px" }}
                >
                  <strong>Description</strong>
                  <span style={{ color: "var(--text)" }}>{report.description}</span>
                </div>
              )}
            </div>
            <div className="location-info">
              <div className="info-row">
                <strong>Barangay</strong>
                <span>{report.barangay ?? "—"}</span>
              </div>
              <div className="info-row">
                <strong>Street</strong>
                <span>{report.street_name ?? "—"}</span>
              </div>
              <div className="info-row">
                <strong>Coordinates</strong>
                <span>
                  {report.latitude != null && report.longitude != null
                    ? `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`
                    : "—"}
                </span>
              </div>
              <div className="info-row">
                <strong>Submitted</strong>
                <span>{fmtDate(report.created_at)}</span>
              </div>
            </div>
            {report.is_flagged_fake && (
              <div className="ai-flag-badge" role="alert">
                <AlertTriangle size={15} />
                <span>
                  Flagged as possibly AI-generated
                  {report.fake_confidence != null &&
                    ` (${(report.fake_confidence * 100).toFixed(0)}% confidence)`}
                </span>
              </div>
            )}
          </div>
          <div className="modal-right">
            <div className="modal-media">
              {imageUrl && !imgError ? (
                <img
                  src={imageUrl}
                  alt={`Report #${report.id} media`}
                  onError={() => setImgError(true)}
                  loading="lazy"
                />
              ) : (
                <div className="no-image">
                  <ImageOff size={32} />
                  <span>No image available</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AllReports() {
  const [filters, setFilters]           = useState({ type: "All", severity: "All", status: "All" });
  const [activeFilters, setActiveFilters] = useState({});
  const [selectedReport, setSelectedReport] = useState(null);
  const [drawerOpen, setDrawerOpen]     = useState(false);

  const { reports, loading, error, page, setPage, total, pageSize, refetch } = useReports({
    mine:        false,
    status:      activeFilters.status      ?? null,
    barangay:    activeFilters.barangay    ?? null,
    damage_type: activeFilters.type        ?? null,
    severity:    activeFilters.severity    ?? null,
  });

  const applyFilters = useCallback(() => {
    setActiveFilters({
      // Backend ReportStatus enum values are lowercase ("pending", "in_progress", …)
      status:   filters.status   !== "All" ? filters.status.toLowerCase()   : null,
      // DamageType enum values are lowercase ("crack", "pothole")
      type:     filters.type     !== "All" ? filters.type.toLowerCase()     : null,
      // SeverityLevel enum values are lowercase ("critical", "non_critical")
      severity: filters.severity !== "All" ? filters.severity.toLowerCase() : null,
    });
    setDrawerOpen(false);
  }, [filters]);

  const resetFilters = useCallback(() => {
    setFilters({ type: "All", severity: "All", status: "All" });
    setActiveFilters({});
    setDrawerOpen(false);
  }, []);

  const handleRowClick = useCallback((report) => setSelectedReport(report), []);
  const closeModal     = useCallback(() => setSelectedReport(null), []);

  return (
    <div className="allreports-container">
      <div className="allreports-filters">
        <div className="allreports-header">
          <Database size={18} style={{ color: "var(--primary)", flexShrink: 0 }} />
          <h2>All Reports</h2>
          <span className="report-count">{total} total</span>
        </div>
        <button
          className="filter-toggle-btn"
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-expanded={drawerOpen}
        >
          <span>Filters</span>
          <ChevronDown size={16} className={drawerOpen ? "chevron-rotate" : ""} />
        </button>
        <div className={`filter-drawer ${drawerOpen ? "open" : ""}`}>
          <div className="filters-row-allreports">
            <div className="filter-group-allreports">
              <label>Damage Type</label>
              <div className="filter-buttons-allreports">
                {["All", "Crack", "Pothole"].map((type) => (
                  <button
                    key={type}
                    className={filters.type === type ? "active" : ""}
                    onClick={() => setFilters((f) => ({ ...f, type }))}
                    aria-pressed={filters.type === type}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-group-allreports">
              <label htmlFor="ar-severity">Severity</label>
              <div className="custom-select-allreports">
                <select
                  id="ar-severity"
                  value={filters.severity}
                  onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
                >
                  <option value="All">All Severity</option>
                  <option value="non_critical">Non-Critical</option>
                  <option value="critical">Critical</option>
                </select>
                <ChevronDown size={15} className="select-icon" />
              </div>
            </div>
            <div className="filter-group-allreports">
              <label htmlFor="ar-status">Status</label>
              <div className="custom-select-allreports">
                <select
                  id="ar-status"
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DECLINED">Declined</option>
                </select>
                <ChevronDown size={15} className="select-icon" />
              </div>
            </div>
            <div className="filter-actions">
              <button className="apply-filter-btn" onClick={applyFilters}>Apply</button>
              <button className="reset-filter-btn" onClick={resetFilters}>Reset</button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="reports-error-banner" role="alert">
          <span className="flex-center">
            <AlertTriangle size={17} className="inline-icon" />
            {error}
          </span>
          <button onClick={refetch} className="retry-btn-small">Retry</button>
        </div>
      )}

      <div className="allreports-table-container">
        {loading ? (
          <div className="table-skeleton">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : (
          <table className="allreports-table" aria-label="All reports">
            <thead>
              <tr>
                <th scope="col">
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Activity size={13} /> Report
                  </span>
                </th>
                <th scope="col">Type</th>
                <th scope="col">
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <TrendingUp size={13} /> Severity
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Shield size={13} /> Status
                  </span>
                </th>
                <th scope="col">
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={13} /> Date
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.length > 0 ? (
                reports.map((report) => (
                  <tr
                    key={report.id}
                    onClick={() => handleRowClick(report)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleRowClick(report);
                      }
                    }}
                    className="clickable-row"
                    tabIndex={0}
                    role="button"
                    aria-label={`View Report #${report.id}`}
                  >
                    <td>
                      <strong>Report #{report.id}</strong>
                      <div className="report-location-allreports" title={report.barangay}>
                        <MapPin size={11} />
                        {report.barangay ?? report.street_name ?? "—"}
                      </div>
                    </td>
                    <td>{report.ai_damage_type ?? "—"}</td>
                    <td>
                      <span className={`severity ${toClass(report.ai_severity ?? "")}`}>
                        {report.ai_severity ?? "—"}
                      </span>
                    </td>
                    <td>
                      <span className={`status ${toClass(report.status ?? "")}`}>
                        {report.status ?? "—"}
                      </span>
                    </td>
                    <td>{fmtDate(report.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-data-allreports">
                    No reports found matching the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <Pagination page={page} setPage={setPage} total={total} pageSize={pageSize} />
      )}

      {selectedReport && (
        <ReportModal report={selectedReport} onClose={closeModal} />
      )}
    </div>
  );
}

export default AllReports;