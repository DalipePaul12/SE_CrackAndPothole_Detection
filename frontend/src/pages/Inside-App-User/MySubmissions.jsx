import React, { useState } from "react";
import "./MySubmissions.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

import { useReports } from "../../hooks/useReports";

function MySubmissions() {
  const { reports, loading } = useReports(true);

  const [filters, setFilters] = useState({ type: "All", severity: "All", status: "All" });
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleRowClick = (report) => { setSelectedReport(report); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setSelectedReport(null); };

  const filteredReports = reports.filter((r) => {
    const type = r.ai_damage_type ?? "";
    const severity = r.ai_severity ?? "";
    const status = r.status ?? "";
    return (
      (filters.type === "All" || type.toLowerCase() === filters.type.toLowerCase()) &&
      (filters.severity === "All" || severity.toLowerCase() === filters.severity.toLowerCase()) &&
      (filters.status === "All" || status === filters.status)
    );
  });

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div
        className="sidebar-overlay"
        onClick={() => {
          document.querySelector(".app-sidebar")?.classList.remove("active");
          document.querySelector(".sidebar-overlay")?.classList.remove("active");
        }}
      />

      <div className="my-submissions-container">
        <div className="submissions-filters">
          <div className="mysubmissions"><h2>My Report Database</h2></div>
          <div className="filters-row">
            <div className="filter-group">
              <label>Damage Type</label>
              <div className="filter-buttons">
                {["All", "Crack", "Pothole"].map((type) => (
                  <button key={type} className={filters.type === type ? "active" : ""}
                    onClick={() => setFilters({ ...filters, type })}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label>Severity</label>
              <div className="custom-select">
                <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
                  <option value="All">All Severity</option>
                  <option value="low">Low</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="filter-group">
              <label>Status</label>
              <div className="custom-select">
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="DECLINED">Declined</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="submissions-table-container">
          {loading ? (
            <p style={{ padding: "1rem" }}>Loading reports...</p>
          ) : (
            <table className="submissions-table">
              <thead>
                <tr>
                  <th>Report</th><th>Type</th><th>Severity</th><th>Status</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.length > 0 ? (
                  filteredReports.map((report) => (
                    <tr key={report.id} onClick={() => handleRowClick(report)} className="clickable-row">
                      <td>
                        <strong>Report#{report.id}</strong>
                        <div className="report-location" title={report.barangay}>
                          {report.barangay ?? report.street_name ?? "—"}
                        </div>
                      </td>
                      <td>{report.ai_damage_type ?? "—"}</td>
                      <td>
                        <span className={`severity ${report.ai_severity ?? ""}`}>
                          {report.ai_severity ?? "—"}
                        </span>
                      </td>
                      <td>
                        <span className={`status ${(report.status ?? "").toLowerCase().replace("_", "-")}`}>
                          {report.status ?? "—"}
                        </span>
                      </td>
                      <td>{report.created_at ? new Date(report.created_at).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="5" className="no-data">No submissions found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {isModalOpen && selectedReport && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close-btn" onClick={closeModal}>×</button>
              <h3 className="modal-title">Report Details</h3>
              <div className="modal-body">
                <div className="modal-left">
                  <div className="info-card">
                    <p><strong>Report ID:</strong> #{selectedReport.id}</p>
                    <p><strong>Damage Type:</strong> {selectedReport.ai_damage_type ?? "—"}</p>
                    <p><strong>Severity:</strong> {selectedReport.ai_severity ?? "—"}</p>
                    <p><strong>Status:</strong> {selectedReport.status}</p>
                    <p><strong>Description:</strong> {selectedReport.description ?? "—"}</p>
                  </div>
                  <div className="location-info">
                    <p><strong>Barangay:</strong> {selectedReport.barangay ?? "—"}</p>
                    <p><strong>Coordinates:</strong> {selectedReport.latitude}, {selectedReport.longitude}</p>
                  </div>
                </div>
                <div className="modal-right">
                  <div className="modal-media">
                    {selectedReport.image_url && <img src={selectedReport.image_url} alt="Report" />}
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

export default MySubmissions;