import React, { useEffect, useState, useCallback } from "react";
import "./AdminManageReports.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import { getReports, updateReport } from "../../api/reports";

function AdminManageReports() {
  const [filterType, setFilterType]         = useState("All");
  const [filterSeverity, setFilterSeverity] = useState("All");
  const [reports, setReports]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [selectedReport, setSelected]       = useState(null);
  const [completing, setCompleting]         = useState(null);

  const fetchInProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Fetch all then filter client-side — avoids enum casing mismatch on status query param
    const res = await getReports({ page_size: 100 });
    if (!res.success) { setError(res.error); setLoading(false); return; }
    const all = res.data?.results ?? [];
    setReports(all.filter((r) => r.status?.toLowerCase() === "in_progress"));
    setLoading(false);
  }, []);

  useEffect(() => { fetchInProgress(); }, [fetchInProgress]);

  const damageType = (r) => r.ai_damage_type ?? r.damage_type ?? "—";
  const severity   = (r) => r.ai_severity    ?? r.severity    ?? "—";
  const location   = (r) => r.location_address ?? r.barangay  ?? "—";

  const filtered = reports.filter((r) => {
    const dt  = damageType(r).toLowerCase();
    const sev = severity(r).toLowerCase().replace(/[\s_]/g, "-");
    return (
      (filterType === "All" || dt === filterType.toLowerCase()) &&
      (filterSeverity === "All" || sev === filterSeverity.toLowerCase())
    );
  });

  const handleComplete = async (id) => {
    setCompleting(id);
    const res = await updateReport(id, { status: "resolved" });
    if (res.success) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      if (selectedReport?.id === id) setSelected(null);
    } else {
      alert(res.error || "Failed to update report.");
    }
    setCompleting(null);
  };

  return (
    <>
      <AdminHeader />
      <AdminSidebar />

      <div className="manage-container">
        <div className="manage-filters">
          <h2 className="manage-title">Manage Reports</h2>
          <div className="filters-row">
            <div className="filter-group">
              <label>Damage Type</label>
              <div className="filter-buttons">
                {["All", "Crack", "Pothole"].map((t) => (
                  <button key={t} className={filterType === t ? "active" : ""} onClick={() => setFilterType(t)}>{t}</button>
                ))}
              </div>
            </div>
            <div className="filter-group">
              <label>Severity</label>
              <div className="custom-select">
                <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
                  <option value="All">All Severity</option>
                  <option value="Critical">Critical</option>
                  <option value="Non-Critical">Non-Critical</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <div className="manage-table-container">
          <table className="manage-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Damage Type</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="no-data">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan="5" className="no-data">No In Progress Reports</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="clickable-row" onClick={() => setSelected(r)}>
                    <td className="report-cell">
                      <div className="report-number">Report#{String(r.id).padStart(3, "0")}</div>
                      <div className="report-location" title={location(r)}>{location(r)}</div>
                    </td>
                    <td>{damageType(r)}</td>
                    <td className={`severity ${severity(r).toLowerCase().replace(/[\s_]/g, "-")}`}>
                      {severity(r)}
                    </td>
                    <td className="status in-progress">In Progress</td>
                    <td>
                      <button
                        className="complete-btn"
                        disabled={completing === r.id}
                        onClick={(e) => { e.stopPropagation(); handleComplete(r.id); }}
                      >
                        {completing === r.id ? "Saving…" : "Mark as Completed"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedReport && (
          <ManageModal
            report={selectedReport}
            onClose={() => setSelected(null)}
            onComplete={handleComplete}
            completing={completing}
          />
        )}
      </div>
    </>
  );
}

function ManageModal({ report: r, onClose, onComplete, completing }) {
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
            <button
              className="complete-btn"
              style={{ marginTop: 16, width: "100%" }}
              disabled={completing === r.id}
              onClick={() => onComplete(r.id)}
            >
              {completing === r.id ? "Saving…" : "Mark as Completed"}
            </button>
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

export default AdminManageReports;