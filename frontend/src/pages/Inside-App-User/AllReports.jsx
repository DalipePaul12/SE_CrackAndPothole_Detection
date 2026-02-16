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

  const Allreports = [
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
      status: "Pending",
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
      status: "Pending",
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
      status: "Pending",
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
      status: "Pending",
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
                            <option value="Pending">Pending</option>
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
                  <tr key={report.id}>
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
      </div>
    </>
  );
}

export default AllReports;
