/**
 * MySubmissions.jsx — User: My Report History
 * =============================================
 * Fixes applied:
 *  [M1]  Image: media_attachments[0]?.file_url (was wrong image_url field)
 *  [M2]  Severity CSS class normalised via toClass() helper (was raw value)
 *  [M3]  Pagination added
 *  [M4]  Error state rendered
 *  [M5]  Sidebar overlay uses React state (no direct DOM mutation)
 *  [M6]  useReports({ mine: true }) — named param, not positional boolean
 *  [M7]  upvote_count shown in modal
 *  [M8]  Modal closes on Escape key
 *  [M9]  decline_reason shown when DECLINED
 *  [A5]  Severity .replaceAll not .replace
 *  [A7]  Keyboard nav on table rows
 *  [A8]  Image onError fallback
 */

import React, { useState, useEffect, useCallback } from "react";
import "./MySubmissions.css";

import Sidebar   from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

import { useReports } from "../../hooks/useReports";

// [A1] Base URL from env
const BASE_URL = import.meta.env.VITE_API_URL || "";

// ── Helpers ────────────────────────────────────────────────────────────────────
const toClass = (str = "") =>
  str.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const getImageUrl = (report) => {
  const url = report?.media_attachments?.[0]?.file_url;
  return url ? `${BASE_URL}${url}` : null;
};

// ── Status badge colour map ────────────────────────────────────────────────────
const STATUS_LABEL = {
  PENDING:     "Pending",
  IN_PROGRESS: "In Progress",
  VERIFIED:    "Verified",
  RESOLVED:    "Resolved",
  DECLINED:    "Declined",
};

// ── Pagination ─────────────────────────────────────────────────────────────────
function Pagination({ page, setPage, total, pageSize = 15 }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pagination" role="navigation" aria-label="Submission pages">
      <button
        className="page-btn"
        onClick={() => setPage((p) => Math.max(1, p - 1))}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        ‹ Prev
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
        Next ›
      </button>
    </div>
  );
}

// ── Report detail modal ────────────────────────────────────────────────────────
function ReportModal({ report, onClose }) {
  const imageUrl = getImageUrl(report);
  const [imgError, setImgError] = useState(false);

  // [M8] Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for Report #${report.id}`}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button
          className="modal-close-btn"
          onClick={onClose}
          aria-label="Close modal"
        >
          ×
        </button>

        <h3 className="modal-title">Report Details</h3>

        <div className="modal-body">
          {/* ── Left: info ─────────────────────────────────────────────── */}
          <div className="modal-left">
            <div className="info-card">
              <p><strong>Report ID:</strong> #{report.id}</p>
              <p><strong>Damage Type:</strong> {report.ai_damage_type ?? "—"}</p>
              <p>
                <strong>Severity:</strong>{" "}
                <span className={`severity ${toClass(report.ai_severity ?? "")}`}>
                  {report.ai_severity ?? "—"}
                </span>
              </p>
              <p>
                <strong>Status:</strong>{" "}
                <span className={`status ${toClass(report.status ?? "")}`}>
                  {STATUS_LABEL[report.status] ?? report.status ?? "—"}
                </span>
              </p>

              {/* [M9] Decline reason */}
              {report.status === "DECLINED" && report.decline_reason && (
                <p className="decline-reason">
                  <strong>Reason:</strong> {report.decline_reason}
                </p>
              )}

              {report.ai_confidence != null && (
                <p>
                  <strong>AI Confidence:</strong>{" "}
                  {(report.ai_confidence * 100).toFixed(1)}%
                </p>
              )}

              <p><strong>Description:</strong> {report.description ?? "—"}</p>

              {/* [M7] Upvote count */}
              {report.upvote_count > 0 && (
                <p>
                  <strong>Community Upvotes:</strong> {report.upvote_count}
                </p>
              )}
            </div>

            <div className="location-info">
              <p><strong>Barangay:</strong> {report.barangay ?? "—"}</p>
              <p><strong>Street:</strong> {report.street_name ?? "—"}</p>
              <p>
                <strong>Coordinates:</strong>{" "}
                {report.latitude != null && report.longitude != null
                  ? `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`
                  : "—"}
              </p>
              <p><strong>Submitted:</strong> {fmtDate(report.created_at)}</p>
            </div>

            {/* AI-generated flag */}
            {report.is_flagged_fake && (
              <div className="ai-flag-badge" role="alert">
                ⚠️ Flagged as possibly AI-generated
                {report.fake_confidence != null &&
                  ` (${(report.fake_confidence * 100).toFixed(0)}% confidence)`}
              </div>
            )}
          </div>

          {/* ── Right: media ────────────────────────────────────────────── */}
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
                <div className="no-image">No image available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function MySubmissions() {
  // [M5] React state for sidebar overlay — no direct DOM mutation
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [filters, setFilters] = useState({
    type: "All",
    severity: "All",
    status: "All",
  });
  const [activeStatus, setActiveStatus] = useState(null);

  const [selectedReport, setSelectedReport] = useState(null);

  // [M6] Named param — was useReports(true) (ambiguous boolean)
  const { reports, loading, error, page, setPage, total, refetch } =
    useReports({ mine: true, status: activeStatus });

  const applyFilters = useCallback(() => {
    setPage(1);
    setActiveStatus(filters.status !== "All" ? filters.status : null);
  }, [filters.status, setPage]);

  const resetFilters = useCallback(() => {
    setFilters({ type: "All", severity: "All", status: "All" });
    setActiveStatus(null);
    setPage(1);
  }, [setPage]);

  // Client-side type + severity filter
  const filteredReports = reports.filter((r) => {
    const type     = r.ai_damage_type ?? "";
    const severity = r.ai_severity    ?? "";
    return (
      (filters.type     === "All" || type.toLowerCase()     === filters.type.toLowerCase()) &&
      (filters.severity === "All" || severity.toLowerCase() === filters.severity.toLowerCase())
    );
  });

  const handleRowClick = useCallback((r) => setSelectedReport(r), []);
  const closeModal     = useCallback(() => setSelectedReport(null), []);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />

      {/* [M5] React-controlled overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay active"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="my-submissions-container">

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <div className="submissions-filters">
          <div className="mysubmissions-header">
            <h2>My Report Database</h2>
            <span className="report-count">{total} submission{total !== 1 ? "s" : ""}</span>
          </div>

          <div className="filters-row">
            {/* Damage Type */}
            <div className="filter-group">
              <label>Damage Type</label>
              <div className="filter-buttons">
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

            {/* Severity */}
            <div className="filter-group">
              <label htmlFor="ms-severity">Severity</label>
              <div className="custom-select">
                <select
                  id="ms-severity"
                  value={filters.severity}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, severity: e.target.value }))
                  }
                >
                  <option value="All">All Severity</option>
                  <option value="low">Low</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            {/* Status */}
            <div className="filter-group">
              <label htmlFor="ms-status">Status</label>
              <div className="custom-select">
                <select
                  id="ms-status"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, status: e.target.value }))
                  }
                >
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="DECLINED">Declined</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            </div>

            <div className="filter-actions">
              <button className="apply-filter-btn" onClick={applyFilters}>
                Apply
              </button>
              <button className="reset-filter-btn" onClick={resetFilters}>
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* ── Error banner [M4] ────────────────────────────────────────── */}
        {error && (
          <div className="reports-error-banner" role="alert">
            <span>⚠ {error}</span>
            <button onClick={refetch} className="retry-btn-small">Retry</button>
          </div>
        )}

        {/* ── Table ───────────────────────────────────────────────────── */}
        <div className="submissions-table-container">
          {loading ? (
            <div className="table-skeleton">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton-row" />
              ))}
            </div>
          ) : (
            <table className="submissions-table" aria-label="My submissions">
              <thead>
                <tr>
                  <th scope="col">Report</th>
                  <th scope="col">Type</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Status</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.length > 0 ? (
                  filteredReports.map((report) => (
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
                        <div
                          className="report-location"
                          title={report.barangay}
                        >
                          {report.barangay ?? report.street_name ?? "—"}
                        </div>
                      </td>
                      <td>{report.ai_damage_type ?? "—"}</td>
                      <td>
                        {/* [M2] Normalised severity class */}
                        <span className={`severity ${toClass(report.ai_severity ?? "")}`}>
                          {report.ai_severity ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className={`status ${toClass(report.status ?? "")}`}>
                          {STATUS_LABEL[report.status] ?? report.status ?? "—"}
                        </span>
                      </td>
                      <td>{fmtDate(report.created_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="no-data">
                      No submissions found matching the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination [M3] ──────────────────────────────────────────── */}
        {!loading && (
          <Pagination page={page} setPage={setPage} total={total} pageSize={15} />
        )}
      </div>

      {/* ── Modal ───────────────────────────────────────────────────────── */}
      {selectedReport && (
        <ReportModal report={selectedReport} onClose={closeModal} />
      )}
    </>
  );
}

export default MySubmissions;