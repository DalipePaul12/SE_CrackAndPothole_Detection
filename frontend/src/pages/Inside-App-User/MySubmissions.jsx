import React, { useState } from "react";
import "./MySubmissions.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

function MySubmissions() {
  const [filters, setFilters] = useState({
    type: "All",
    severity: "All",
    status: "All",
  });

  const reports = [
    {
      id: "Report#001",
      location: "EDSA, Quezon City",
      type: "Pothole",
      severity: "Critical",
      status: "In Progress",
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
  ];

  const filteredReports = reports.filter((r) => {
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

      <div className="my-submissions-container">
        {/* FILTERS */}
        <div className="submissions-filters">
            <div className="mysubmissions">
            <h2>My Report Database</h2>
            </div>
            <div className="filters-row">
                <div className="filter-group">
                  <label>Damage Type</label>
                    <div className="filter-buttons">
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

                <div className="filter-group">
                  <label>Severity</label>

                    <div className="custom-select">
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

                  <div className="filter-group">
                      <label>Status</label>

                      <div className="custom-select">
                        <select
                          value={filters.status}
                          onChange={(e) =>
                              setFilters({ ...filters, status: e.target.value })
                            }
                          >
                            <option value="All">All Status</option>
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                          </select>
                      </div>
                  </div>
        </div>
        </div>

        {/*TABLE */}
        <div className="submissions-table-container">
          <table className="submissions-table">
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
              {filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <tr key={report.id}>
                    <td>
                      <strong>{report.id}</strong>
                      <div className="report-location">
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
                  <td colSpan="5" className="no-data">
                    No submissions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default MySubmissions;
