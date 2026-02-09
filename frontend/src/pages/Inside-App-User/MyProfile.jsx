import React, { useState } from "react";
import "./MyProfile.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

function MyProfile() {
  const [activeTab, setActiveTab] = useState("feed"); // feed | settings
  const [reportFilter, setReportFilter] = useState("all"); // all | resolved

  // BACKEND-READY USER DATA
  const user = {
    name: "John Carlo Trajico",
    bio: "Committed to making the streets of Manila safer for everyone",
    avatar: "/snap.jpg",
    totalPosts: 24,
    resolved: 10,
    inProgress: 8,
    badges: 3,
  };

  // BACKEND-READY REPORTS
  const reports = [
    {
      id: "Report#023",
      date: "Mar 2, 2026",
      time: "10:45 AM",
      image: "/snap.jpg",
      damage: "Pothole",
      severity: "Critical",
      location: "EDSA, Quezon City",
      description: "Large pothole causing traffic congestion.",
      status: "In Progress",
    },
  ];

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div className="myprofile-container">
        <div className="profile-header">
  {/* LEFT: AVATAR */}
  <img src={user.avatar} alt="Profile" className="profile-avatar" />

  {/* MIDDLE: NAME + BIO */}
  <div className="profile-info">
    <h2>{user.name}</h2>
    <p className="profile-bio">{user.bio}</p>
  </div>

  {/* RIGHT: STATS */}
  <div className="profile-stats">
    <div className="stat-card">
      <span>{user.totalPosts}</span>
      <p>Total Posts</p>
    </div>
    <div className="stat-card">
      <span>{user.resolved}</span>
      <p>Resolved</p>
    </div>
    <div className="stat-card">
      <span>{user.inProgress}</span>
      <p>In Progress</p>
    </div>
    <div className="stat-card">
      <span>{user.badges}</span>
      <p>Badges</p>
    </div>
  </div>
</div>



        {/* ================= TAB BUTTONS ================= */}
        <div className="profile-tabs">
          <button
            className={activeTab === "feed" ? "active" : ""}
            onClick={() => setActiveTab("feed")}
          >
            Reports Feed
          </button>

          <button
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => setActiveTab("settings")}
          >
            Profile Settings
          </button>
        </div>

        {/* ================= REPORTS FEED ================= */}
        {activeTab === "feed" && (
          <div className="profile-content">
            <div className="feed-filters">
              <button
                className={reportFilter === "all" ? "active" : ""}
                onClick={() => setReportFilter("all")}
              >
                All Reports
              </button>
              <button
                className={reportFilter === "resolved" ? "active" : ""}
                onClick={() => setReportFilter("resolved")}
              >
                Resolved Reports
              </button>
            </div>

            {reports.map((report) => (
              <div key={report.id} className="report-card">
                {/* TOP INFO */}
                <div className="report-header">
                  <div>
                    <strong>{report.id}</strong>
                    <p>{report.date} • {report.time}</p>
                  </div>
                </div>

                {/* IMAGE + AI RESULT */}
                <div className="report-main">
                  <img src={report.image} alt="Report" />

                  <div className="ai-result">
                    <p><strong>Damage:</strong> {report.damage}</p>
                    <p><strong>Severity:</strong> {report.severity}</p>
                  </div>
                </div>

                {/* LOCATION */}
                <p className="report-location">{report.location}</p>

                {/* DESCRIPTION */}
                <div className="report-description">
                  {report.description}
                </div>

                {/* STATUS TIMELINE */}
                <div className="status-timeline">
                  {["Submitted", "Reviewing", "In Progress", "Resolved"].map(
                    (stage, index) => (
                      <div
                        key={index}
                        className={`timeline-step ${
                          stage === report.status ||
                          (stage === "Submitted")
                            ? "active"
                            : ""
                        }`}
                      >
                        <span></span>
                        <p>{stage}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ================= PROFILE SETTINGS ================= */}
        {activeTab === "settings" && (
          <div className="profile-settings">
            <h3>Profile Settings</h3>
            <p>Update your personal information and profile picture.</p>

            <div className="settings-avatar">
              <img src={user.avatar} alt="Profile" />
              <button>Change Photo</button>
            </div>

            <div className="settings-form">
              <input type="text" placeholder="Full Name" />
              <textarea placeholder="Bio" />
            </div>

            <div className="settings-actions">
              <button className="discard">Discard</button>
              <button className="save">Save Changes</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default MyProfile;
