import React, { useState } from "react";
import "./AllReports.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

function AllReports() {
  const [filters, setFilters] = useState({
    type: "All",
    severity: "All",
    status: "All",
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

  const Allreports = [
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
      id: "Report#002",
      reporterName: "Maria Santos",
      contact: "09181234567",
      location: "España Blvd, Manila",
      type: "Crack",
      severity: "Non-Critical",
      status: "Completed",
      date: "2026-03-01",
      fileUrl: "/snap.jpg",
      fileType: "image",
      additionalInfo: "Small crack forming near intersection.",
    },
     {
      id: "Report#003",
      location: "EDSA, Quezon City",
      type: "Pothole",
      severity: "Critical",
      status: "In Progress",
      date: "2026-03-02",
    },
    {
      id: "Report#004",
      location: "España Blvd, Manila",
      type: "Crack",
      severity: "Non-Critical",
      status: "Completed",
      date: "2026-03-01",
    },
     {
      id: "Report#005",
      location: "EDSA, Quezon City",
      type: "Pothole",
      severity: "Critical",
      status: "In Progress",
      date: "2026-03-02",
    },
    {
      id: "Report#006",
      location: "España Blvd, Manila",
      type: "Crack",
      severity: "Non-Critical",
      status: "Completed",
      date: "2026-03-01",
    },
     {
      id: "Report#007",
      location: "EDSA, Quezon City",
      type: "Pothole",
      severity: "Critical",
      status: "In Progress",
      date: "2026-03-02",
    },
    {
      id: "Report#008",
      location: "España Blvd, Manila",
      type: "Crack",
      severity: "Non-Critical",
      status: "Completed",
      date: "2026-03-01",
    },
     {
      id: "Report#009",
      location: "EDSA, Quezon City",
      type: "Pothole",
      severity: "Critical",
      status: "In Progress",
      date: "2026-03-02",
    },
    {
      id: "Report#010",
      location: "España Blvd, Manila",
      type: "Crack",
      severity: "Non-Critical",
      status: "In Progress",
      date: "2026-03-01",
    },
  ];

  const filteredAllReports = Allreports.filter((r) => {
    return (
      (filters.type === "All" || r.type === filters.type) &&
      (filters.severity === "All" || r.severity === filters.severity) &&
      (filters.status === "All" || r.status === filters.status)
    );
  });

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div 
      className="sidebar-overlay"
      onClick={() => {
        document.querySelector(".app-sidebar").classList.remove("active");
        document.querySelector(".sidebar-overlay").classList.remove("active");
      }}
    ></div>

      <div className="allreports-container">
        {/* FILTERS */}
        <div className="allreports-filters">
            <div className="allreports-header">
            <h2>All Reports Database</h2>
            </div>
            <div className="filters-row-allreports">
                <div className="filter-group-allreports">
                  <label>Damage Type</label>
                    <div className="filter-buttons-allreports">
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

                <div className="filter-group-allreports">
                  <label>Severity</label>

                    <div className="custom-select-allreports">
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

                  <div className="filter-group-allreports">
                      <label>Status</label>

                      <div className="custom-select-allreports">
                        <select
                          value={filters.status}
                          onChange={(e) =>
                              setFilters({ ...filters, status: e.target.value })
                            }
                          >
                            <option value="All">All Status</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                      </div>
                  </div>
        </div>
        </div>

        {/*TABLE */}
        <div className="allreports-table-container">
          <table className="allreports-table">
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
              {filteredAllReports.length > 0 ? (
                filteredAllReports.map((report) => (
                  <tr key={report.id}
                    onClick={() => handleRowClick(report)}
                    className="clickable-row">
                    <td>
                      <strong>{report.id}</strong>
                      <div className="report-location-allreports" title={report.location}>
                        {report.location}
                      </div>
                    </td>
                    <td>{report.type}</td>
                    <td>
                      <span
                        className={`severity ${report.severity
                          .toLowerCase()
                          .replace(" ", " - ")}`}
                      >
                        {report.severity}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status ${report.status
                          .toLowerCase()
                          .replace(" ", "-")}`}
                      >
                        {report.status}
                      </span>
                    </td>
                    <td>{report.date}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="no-data-allreports">
                    No submissions found
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

export default AllReports;
