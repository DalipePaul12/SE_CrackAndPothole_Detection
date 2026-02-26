import React, { useState } from "react";
import "./AdminManageReports.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

function AdminManageReports() {
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

  const [reports, setReports] = useState([
    {
      id: "Report#001",
      reporterName: "Juan Dela Cruz",
      contact: "09171234567",
      location: "EDSA, Quezon City",
      type: "Pothole",
      severity: "Critical",
      status: "In Progress",
      date: "2026-03-02",
      fileUrl: "/snap.jpg",
      fileType: "image",
      additionalInfo: "Large pothole near the bus stop.",
    },
    {
      id: 2,
      title: "Road crack near school",
      location: "España Blvd",
      severity: "Non-Critical",
      type: "Crack",
      status: "In Progress",
    },
        {
      id: 4,
      title: "Pothole in EDSA",
      location: "EDSA, Quezon City",
      severity: "Critical",
      type: "Pothole",
      status: "In Progress",
    },
  ]);

  const [filterType, setFilterType] = useState("All");
  const [filterSeverity, setFilterSeverity] = useState("All");

  // Only IN PROGRESS reports
  const inProgressReports = reports.filter(
    (report) => report.status === "In Progress"
  );

  // Apply both filters
  const filteredReports = inProgressReports.filter((report) => {
    const typeMatch = filterType === "All" || report.type === filterType;
    const severityMatch = filterSeverity === "All" || report.severity === filterSeverity;
    return typeMatch && severityMatch;
  });

  const handleComplete = (id) => {
    const updatedReports = reports.map((report) =>
      report.id === id
        ? { ...report, status: "COMPLETED" }
        : report
    );
    setReports(updatedReports);
  };

  return (
    <>
      <AdminHeader />
      <AdminSidebar />

      <div className="manage-container">

        {/* FILTERS */}
        <div className="manage-filters">
            <h2 className="manage-title">Manage Reports</h2>
          <div className="filters-row">

            {/* Damage Type Buttons */}
            <div className="filter-group">
            <label> Damage Type</label>
            
            <div className="filter-buttons">
              <button
                className={filterType === "All" ? "active" : ""}
                onClick={() => setFilterType("All")}
              >
                All
              </button>
              <button
                className={filterType === "Crack" ? "active" : ""}
                onClick={() => setFilterType("Crack")}
              >
                Crack
              </button>
                
                <button
                className={filterType === "Pothole" ? "active" : ""}
                onClick={() => setFilterType("Pothole")}
              >
                Pothole
              </button>
            </div>
            </div>

            {/* Severity Dropdown */}
            <div className="filter-group">
              <label>Severity</label>
              <div className="custom-select">
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                >
                  <option value="All">All Severity</option>
                  <option value="Critical">Critical</option>
                  <option value="Non-Critical">Non-Critical</option>
                </select>
              </div>
            </div>

          </div>
        </div>

        {/* TABLE */}
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
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan="6" className="no-data">
                    No In Progress Reports
                  </td>
                </tr>
              ) : (
                filteredReports.map((report) => (
                  <tr key={report.id}
                    onClick={() => handleRowClick(report)}
                    className="clickable-row">
                   <td className="report-cell">
                    <div className="report-number">
                        Report #{String(report.id).padStart(4, "0")}
                    </div>
                    <div className="report-location" title={report.location}>
                        {report.location}
                    </div>
                    </td>
                    <td>{report.type}</td>
                    <td className={`severity ${report.severity.toLowerCase().replace(" ", "-")}`}>
                      {report.severity}
                    </td>
                    <td className="status in-progress">{report.status}</td>
                    <td>
                      <button
                        className="complete-btn"
                        onClick={(e) => {
                        e.stopPropagation(); 
                        handleComplete(report.id); 
                      }}
                      >
                        Mark as Completed
                      </button>
                    </td>
                  </tr>
                ))
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

export default AdminManageReports;