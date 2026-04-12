import React, { useState } from "react";
import "./AllReports.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

import { useReports } from "../../hooks/useReports";

function AllReports() {
  const { reports, loading } = useReports(false); // all reports

  const [filters, setFilters] = useState({ type: "All", severity: "All", status: "All" });
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleRowClick = (report) => { setSelectedReport(report); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); setSelectedReport(null); };

  const filteredAllReports = reports.filter((r) => {
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

      <div className="allreports-container">
        <div className="allreports-filters">
          <div className="allreports-header"><h2>All Reports Database</h2></div>
          <div className="filters-row-allreports">
            <div className="filter-group-allreports">
              <label>Damage Type</label>
              <div className="filter-buttons-allreports">
                {["All", "Crack", "Pothole"].map((type) => (
                  <button key={type} className={filters.type === type ? "active" : ""}
                    onClick={() => setFilters({ ...filters, type })}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group-allreports">
              <label>Severity</label>
              <div className="custom-select-allreports">
                <select value={filters.severity} onChange={(e) => setFilters({ ...filters, severity: e.target.value })}>
                  <option value="All">All Severity</option>
                  <option value="low">Low</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="filter-group-allreports">
              <label>Status</label>
              <div className="custom-select-allreports">
                <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="allreports-table-container">
          {loading ? (
            <p style={{ padding: "1rem" }}>Loading reports...</p>
          ) : (
            <table className="allreports-table">
              <thead>
                <tr>
                  <th>Report</th><th>Type</th><th>Severity</th><th>Status</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllReports.length > 0 ? (
                  filteredAllReports.map((report) => (
                    <tr key={report.id} onClick={() => handleRowClick(report)} className="clickable-row">
                      <td>
                        <strong>Report#{report.id}</strong>
                        <div className="report-location-allreports" title={report.barangay}>
                          {report.barangay ?? report.street_name ?? "—"}
                        </div>
                      </td>
                      <td>{report.ai_damage_type ?? "—"}</td>
                      <td>
                        <span className={`severity ${(report.ai_severity ?? "").toLowerCase().replace(" ", "-")}`}>
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
                  <tr><td colSpan="5" className="no-data-allreports">No reports found</td></tr>
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
                  <div className="reporter-info">
                    <div className="info-row"><strong>Report:</strong> #{selectedReport.id}</div>
                  </div>
                  <div className="info-card">
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
                    {selectedReport.image_url
                      ? <img src={selectedReport.image_url} alt="Report File" />
                      : <p>No image available</p>
                    }
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

export default AllReports;