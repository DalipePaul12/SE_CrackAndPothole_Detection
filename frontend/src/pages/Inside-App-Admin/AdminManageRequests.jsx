import React, { useState } from "react";
import "./AdminManageRequests.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

function AdminManageRequests() {
  // Filters state
  const [filters, setFilters] = useState({
    type: "All",
    severity: "All",
  });

  const [selectedReport, setSelectedReport] = useState(null); // NEW
  const [isModalOpen, setIsModalOpen] = useState(false); // NEW

  const handleRowClick = (report) => {
    setSelectedReport(report);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedReport(null);
  };

  // Reports state
  const [reports, setReports] = useState([
    {
      id: "Report#001",
      location: "EDSA, Quezon City",
      type: "Pothole",
      severity: "Critical",
      status: "Pending",
      date: "2026-03-02",
    },
    {
      id: "Report#002",
      location: "España Blvd, Manila",
      type: "Crack",
      severity: "Non-Critical",
      status: "Pending",
      date: "2026-03-01",
    },
  ]);

  // Handle Confirm
  const handleConfirm = (id) => {
    const updatedReports = reports.map((report) =>
      report.id === id ? { ...report, status: "Confirmed" } : report
    );
    setReports(updatedReports);
  };

  // Handle Decline
  const handleDecline = (id) => {
    const updatedReports = reports.map((report) =>
      report.id === id ? { ...report, status: "Declined" } : report
    );
    setReports(updatedReports);
  };

  // Filter reports by type & severity
  const filteredReports = reports.filter(
    (r) =>
      (filters.type === "All" || r.type === filters.type) &&
      (filters.severity === "All" || r.severity === filters.severity)
  );

  return (
    <>
      <AdminSidebar />
      <AdminHeader />

      <div className="admin-manage-container">
        {/* HEADER */}

        {/* FILTERS */}
        <div className="admin-filters-container">
            <h2>Manage Requests</h2>
          <div className="admin-filters-row">
            {/* Damage Type */}
            <div className="admin-filter-group">
              <label>Damage Type</label>
              <div className="admin-filter-buttons">
                {["All", "Crack", "Pothole"].map((type) => (
                  <button
                    key={type}
                    className={filters.type === type ? "active" : ""}
                    onClick={() => setFilters({ ...filters, type })}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div className="admin-filter-group">
              <label>Severity</label>
              <div className="admin-custom-select">
                <select
                  value={filters.severity}
                  onChange={(e) =>
                    setFilters({ ...filters, severity: e.target.value })
                  }
                >
                  <option value="All">All Severity</option>
                  <option value="Non-Critical">Non-Critical</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* TABLE */}
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
              {filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <tr key={report.id}
                    onClick={() => handleRowClick(report)}
                    className="clickable-row">
                    <td>
                      <strong>{report.id}</strong>
                      <div className="report-location" title={report.location}>{report.location}</div>
                    </td>

                    <td>{report.type}</td>

                    <td>
                      <span
                        className={`severity ${report.severity
                          .toLowerCase()
                          .replace(" ", "-")}`}
                      >
                        {report.severity}
                      </span>
                    </td>

                    <td>
                      {report.status === "Pending" ? (
                        <div className="admin-action-buttons">
                          <button
                            className="admin-confirm-btn"
                            onClick={(e) => {
                            e.stopPropagation(); 
                            handleConfirm(report.id);
                          }}
                          >
                            Confirm
                          </button>
                          <button
                            className="admin-decline-btn"
                            onClick={(e) => {
                            e.stopPropagation();
                            handleDecline(report.id);
                          }}
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`status ${report.status
                            .toLowerCase()
                            .replace(" ", "-")}`}
                        >
                          {report.status}
                        </span>
                      )}
                    </td>

                    <td>{report.date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-data">
                    No reports found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* MODAL */}
        {isModalOpen && selectedReport && (
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close-btn" onClick={closeModal}>×</button>
              <h3 className="modal-title">Report Details</h3>

              <div className="modal-body">
                {/* LEFT SIDE */}
                <div className="modal-left">
                  <div className="reporter-info">
                    <div className="info-row">
                      <strong>Report:</strong> {selectedReport.id}
                    </div>
                    <div className="info-row">
                      <strong>Reporter Name:</strong> {selectedReport.reporterName}
                    </div>
                    <div className="info-row">
                      <strong>Contact:</strong> {selectedReport.contact}
                    </div>
                  </div>

                  <div className="info-card">
                    <p><strong>Damage Type:</strong> {selectedReport.type}</p>
                    <p><strong>Severity:</strong> {selectedReport.severity}</p>
                    <p><strong>Additional Info:</strong></p>
                    <p className="additional-info">{selectedReport.additionalInfo}</p>
                  </div>

                  <div className="location-info">
                    <p><strong>Location:</strong> {selectedReport.location}</p>
                  </div>
                </div>

                {/* RIGHT SIDE */}
                <div className="modal-right">
                  <div className="modal-media">
                    {selectedReport.fileUrl && selectedReport.fileType === "video" ? (
                      <video src={selectedReport.fileUrl} controls />
                    ) : (
                      <img src={selectedReport.fileUrl} alt="Report File" />
                    )}
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

export default AdminManageRequests;