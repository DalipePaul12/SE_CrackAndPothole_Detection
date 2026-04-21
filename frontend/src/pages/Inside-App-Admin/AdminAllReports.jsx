import React, { useEffect, useState, useCallback } from "react";
import "./AdminAllReports.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import { getReports, updateReport } from "../../api/reports";

const TYPE_OPTIONS     = ["All", "Crack", "Pothole"];
const SEVERITY_OPTIONS = ["All", "Non-Critical", "Critical"];
const STATUS_OPTIONS   = ["All", "pending", "verified", "in_progress", "resolved", "declined"];
const STATUS_LABELS    = { pending: "Pending", verified: "Verified", in_progress: "In Progress", resolved: "Resolved", declined: "Declined" };

function AdminAllReports() {
  const [filters, setFilters] = useState({ type: "All", severity: "All", status: "All" });
  const [reports, setReports]         = useState([]);
  const [total, setTotal]             = useState(0);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedReport, setSelected] = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = { page, page_size: 20 };
    if (filters.status !== "All") params.status = filters.status;

    const res = await getReports(params);

    if (!res.success) {
      setError(res.error);
      setLoading(false);
      return;
    }

    let data = res.data?.results ?? [];

    if (filters.type !== "All") {
      data = data.filter((r) => (r.ai_damage_type ?? r.damage_type ?? "").toLowerCase() === filters.type.toLowerCase());
    }
    if (filters.severity !== "All") {
      data = data.filter((r) => (r.ai_severity ?? r.severity ?? "").toLowerCase().replace("_", "-") === filters.severity.toLowerCase());
    }

    setReports(data);
    setTotal(res.data?.total ?? 0);
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
  const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
  const statusVal  = (r) => r.status ?? "—";
  const location   = (r) => r.location_address ?? r.barangay ?? "—";
  const dateStr    = (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : "—";

  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      <div className="admin-allreports-container">
        <div className="admin-allreports-filters">
          <div className="admin-allreports-header">
            <h2>Admin Reports Database</h2>
            <span className="asr-total-badge">{total} total</span>
          </div>

          <div className="admin-filters-row">
            <div className="admin-filter-group">
              <label>Damage Type</label>
              <div className="admin-filter-buttons">
                {TYPE_OPTIONS.map((t) => (
                  <button key={t} className={filters.type === t ? "active" : ""} onClick={() => { setFilters({ ...filters, type: t }); setPage(1); }}>{t}</button>
                ))}
              </div>
            </div>

            <div className="admin-filter-group">
              <label>Severity</label>
              <div className="admin-custom-select">
                <select value={filters.severity} onChange={(e) => { setFilters({ ...filters, severity: e.target.value }); setPage(1); }}>
                  {SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s === "All" ? "All Severity" : s}</option>)}
                </select>
              </div>
            </div>

            <div className="admin-filter-group">
              <label>Status</label>
              <div className="admin-custom-select">
                <select value={filters.status} onChange={(e) => { setFilters({ ...filters, status: e.target.value }); setPage(1); }}>
                  {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s === "All" ? "All Status" : STATUS_LABELS[s]}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <div className="admin-allreports-table-container">
          <table className="admin-allreports-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="admin-no-data">Loading…</td></tr>
              ) : reports.length > 0 ? (
                reports.map((r) => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <strong>Report#{String(r.id).padStart(3, "0")}</strong>
                      <div className="admin-report-location" title={location(r)}>{location(r)}</div>
                    </td>
                    <td>{damageType(r)}</td>
                    <td>
                      <span className={`admin-severity ${severity(r).toLowerCase().replace(/[\s_]/g, "-")}`}>
                        {severity(r)}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-status ${statusVal(r).toLowerCase().replace(/[\s_]/g, "-")}`}>
                        {STATUS_LABELS[statusVal(r)] ?? statusVal(r)}
                      </span>
                    </td>
                    <td>{dateStr(r)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5" className="admin-no-data">No reports found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {total > 20 && (
          <div className="admin-pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page} of {Math.ceil(total / 20)}</span>
            <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}

        {selectedReport && (
          <ReportModal report={selectedReport} onClose={() => setSelected(null)} onRefresh={fetchReports} />
        )}
      </div>
    </>
  );
}

function ReportModal({ report, onClose, onRefresh }) {
  const r           = report;
  const location    = r.location_address ?? r.barangay ?? "—";
  const damageType  = r.ai_damage_type   ?? r.damage_type ?? "—";
  const severity    = r.ai_severity      ?? r.severity    ?? "—";
  const mediaUrl    = r.media_attachments?.[0]?.file_url;
  const mediaType   = r.media_attachments?.[0]?.media_type;
  const fullUrl     = mediaUrl ? `${import.meta.env.VITE_API_URL || ""}${mediaUrl}` : null;

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
              <p><strong>Status:</strong> {r.status}</p>
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
                  : <img src={fullUrl} alt="Report media" style={{ width: "100%", borderRadius: 8, objectFit: "cover" }} />
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

export default AdminAllReports;