import React, { useState } from "react";
import "./MyProfile.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

//Icons
import { ImLocation } from "react-icons/im";
import {FaPaperPlane, FaSearch, FaTools, FaCheckCircle} from "react-icons/fa";


function MyProfile() {
  const [activeTab, setActiveTab] = useState("feed"); // feed | settings
  const [reportFilter, setReportFilter] = useState("all"); // all | resolved

  const stages = ["Submitted", "Reviewing", "In Progress", "Resolved"];
  const getStageIcon = (stage) => {
  switch (stage) {
    case "Submitted":
      return <FaPaperPlane />;
    case "Reviewing":
      return <FaSearch />;
    case "In Progress":
      return <FaTools />;
    case "Resolved":
      return <FaCheckCircle />;
    default:
      return null;
  }
};

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
      id: "Report #01",
      date: "Mar 2, 2026",
      time: "10:45 AM",
      image: "/snap.jpg",
      damage: "Crack",
      severity: "Non-Critical",
      location: "EDSA, Quezon City",
      description: "Large pothole causing traffic congestion.",
      status: "In Progress",
    },
    {
      id: "Report #02",
      date: "Mar 2, 2026",
      time: "10:45 AM",
      image: "/snap.jpg",
      damage: "Pothole",
      severity: "Critical",
      location: "EDSA, Quezon City",
      description: "Large pothole causing traffic congestion.",
      status: "Submitted",
    },
        {
      id: "Report #03",
      date: "Mar 2, 2026",
      time: "10:45 AM",
      image: "/snap.jpg",
      damage: "Pothole",
      severity: "Non-Critical",
      location: "EDSA, Quezon City",
      description: "Large pothole causing traffic congestion.",
      status: "Reviewing",
    },
        {
      id: "Report #04",
      date: "Mar 2, 2026",
      time: "10:45 AM",
      image: "/snap.jpg",
      damage: "Crack",
      severity: "Critical",
      location: "EDSA, Quezon City",
      description: "Large pothole causing traffic congestion.",
      status: "Resolved",
    },
  ];

  const filteredReports =
  reportFilter === "resolved"
    ? reports.filter((r) => r.status === "Resolved")
    : reports;

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
            <div className="profile-content-header">
            <div className="profile-content-title">
              <h2>Personal Activity Feed</h2>
            </div>
            <div className="feed-filters">
              <button
                className={reportFilter === "all" ? "active" : ""}
                onClick={() => setReportFilter("all")}
              >
                All
              </button>
              <button
                className={reportFilter === "resolved" ? "active" : ""}
                onClick={() => setReportFilter("resolved")}
              >
                Resolved
              </button>
            </div>
            </div>

            {filteredReports.length === 0 ? (
  <div className="no-reports">
    <h3>No Reports Found</h3>
    <p>
      {reportFilter === "resolved"
        ? "You don't have any resolved reports yet."
        : "You haven't submitted any reports yet."}
    </p>
  </div>
) : (
  filteredReports.map((report) => (
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
          <h4>AI CLASSIFICATION</h4>
          <h5>RESULT</h5>
          <p>
            <strong>Damage: </strong>
            <span className={`damage ${report.damage.toLowerCase()}`}>
              {report.damage}
            </span>
          </p>
          <p>
            <strong>Severity: </strong>
            <span
              className={`severity ${report.severity
                .toLowerCase()
                .replace(" ", "-")}`}
            >
              {report.severity}
            </span>
          </p>
        </div>
      </div>

      {/* LOCATION */}
      <p className="report-location">
        <ImLocation className="report-location-icon" />
        {report.location}
      </p>

      {/* DESCRIPTION */}
      <div className="report-description">
        {report.description}
      </div>

      {/* STATUS TIMELINE */}
      <div className="status-timeline">
        {stages.map((stage, index) => {
          const currentIndex = stages.indexOf(report.status);
          const isActive = index <= currentIndex;

          return (
            <div
              key={stage}
              className={`timeline-step ${isActive ? "active" : ""}`}
            >
              <div className="timeline-icon">
                {getStageIcon(stage)}
              </div>

              {index !== stages.length - 1 && (
                <div
                  className={`timeline-line ${isActive ? "active" : ""}`}
                />
              )}

              <p>{stage}</p>
            </div>
          );
        })}
      </div>
    </div>
  ))
)}

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
