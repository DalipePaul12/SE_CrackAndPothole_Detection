import React, { useEffect, useState, useCallback } from "react";
import "./AdminManageRequests.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import { getReports, updateReport } from "../../api/reports";
import { api } from "../../api/client";

function AdminManageRequests() {
  const [filters, setFilters]         = useState({ type: "All", severity: "All" });
  const [reports, setReports]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [selectedReport, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Fetch all then filter client-side — avoids enum casing mismatch on status query param
    const res = await getReports({ page_size: 100 });
    if (!res.success) { setError(res.error); setLoading(false); return; }
    const all = res.data?.results ?? [];
    setReports(all.filter((r) => r.status?.toLowerCase() === "pending"));
    setLoading(false);
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
  const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
  const location   = (r) => r.location_address ?? r.barangay  ?? "—";
  const dateStr    = (r) => r.created_at ? new Date(r.created_at).toLocaleDateString() : "—";

  const filtered = reports.filter((r) => {
    const dt  = damageType(r).toLowerCase();
    const sev = severity(r).toLowerCase().replace(/[\s_]/g, "-");
    return (
      (filters.type === "All" || dt === filters.type.toLowerCase()) &&
      (filters.severity === "All" || sev === filters.severity.toLowerCase())
    );
  });

  const handleConfirm = async (id) => {
    setActionLoading(id + "-confirm");
    const res = await api.put(`/reports/${id}/validate`);
    if (res.success) {
      setReports((prev) => prev.filter((r) => r.id !== id));
    } else {
      alert(res.error || "Failed to confirm report.");
    }
    setActionLoading(null);
    if (selectedReport?.id === id) setSelected(null);
  };

  const handleDecline = async (id) => {
    const reason = prompt("Enter decline reason (min 5 characters):");
    if (!reason || reason.trim().length < 5) return;

    setActionLoading(id + "-decline");

    const formData = new FormData();
    formData.append("reason", reason.trim());

    const token = localStorage.getItem("access_token");
    const res = await fetch(
      `${(import.meta.env.VITE_API_URL || "")}/api/v1/reports/${id}/decline`,
      { method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: formData }
    );
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data?.detail || "Failed to decline report.");
    }
    setActionLoading(null);
    if (selectedReport?.id === id) setSelected(null);
  };

  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      <div className="admin-manage-container">
        <div className="admin-filters-container">
          <h2>Manage Requests</h2>
          <div className="admin-filters-row">
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
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <div className="submissions-table-container">
          <table className="submissions-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Action</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="no-data">Loading…</td></tr>
              ) : filtered.length > 0 ? (
                filtered.map((r) => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td>
                      <strong>Report#{String(r.id).padStart(3, "0")}</strong>
                      <div className="report-location" title={location(r)}>{location(r)}</div>
                    </td>
                    <td>{damageType(r)}</td>
                    <td>
                      <span className={`severity ${severity(r).toLowerCase().replace(/[\s_]/g, "-")}`}>
                        {severity(r)}
                      </span>
                    </td>
                    <td>
                      <div className="admin-action-buttons">
                        <button
                          className="admin-confirm-btn"
                          disabled={!!actionLoading}
                          onClick={(e) => { e.stopPropagation(); handleConfirm(r.id); }}
                        >
                          {actionLoading === r.id + "-confirm" ? "…" : "Confirm"}
                        </button>
                        <button
                          className="admin-decline-btn"
                          disabled={!!actionLoading}
                          onClick={(e) => { e.stopPropagation(); handleDecline(r.id); }}
                        >
                          {actionLoading === r.id + "-decline" ? "…" : "Decline"}
                        </button>
                      </div>
                    </td>
                    <td>{dateStr(r)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5" className="no-data">No pending requests</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedReport && (
          <RequestModal
            report={selectedReport}
            onClose={() => setSelected(null)}
            onConfirm={handleConfirm}
            onDecline={handleDecline}
            actionLoading={actionLoading}
          />
        )}
      </div>
    </>
  );
}

function RequestModal({ report: r, onClose, onConfirm, onDecline, actionLoading }) {
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
              <p><strong>Additional Info:</strong></p>
              <p className="additional-info">{r.description ?? "—"}</p>
            </div>
            <div className="location-info">
              <p><strong>Location:</strong> {location}</p>
            </div>
            <div className="admin-action-buttons" style={{ marginTop: 16 }}>
              <button className="admin-confirm-btn" disabled={!!actionLoading} onClick={() => onConfirm(r.id)}>
                {actionLoading === r.id + "-confirm" ? "Confirming…" : "Confirm"}
              </button>
              <button className="admin-decline-btn" disabled={!!actionLoading} onClick={() => onDecline(r.id)}>
                {actionLoading === r.id + "-decline" ? "Declining…" : "Decline"}
              </button>
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

export default AdminManageRequests;