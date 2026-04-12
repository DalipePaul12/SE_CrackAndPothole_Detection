import React, { useState } from "react";
import "./MyProfile.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";

import { ImLocation } from "react-icons/im";
import { FaPaperPlane, FaSearch, FaTools, FaCheckCircle } from "react-icons/fa";
import { FaCamera } from "react-icons/fa6";
import { IoPersonSharp } from "react-icons/io5";
import { FaUserEdit } from "react-icons/fa";

import { useUser } from "../../hooks/useUser";
import { useReports } from "../../hooks/useReports";

function MyProfile() {
  const { profile, loading: profileLoading, update, saving } = useUser();
  const { reports, loading: reportsLoading } = useReports(true);

  const [showConfirm, setShowConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState("feed");
  const [reportFilter, setReportFilter] = useState("all");
  const [formData, setFormData] = useState(null);
  const [saveError, setSaveError] = useState("");

  const stages = ["Submitted", "Reviewing", "In Progress", "Resolved"];

  const getStageIcon = (stage) => {
    switch (stage) {
      case "Submitted": return <FaPaperPlane />;
      case "Reviewing": return <FaSearch />;
      case "In Progress": return <FaTools />;
      case "Resolved": return <FaCheckCircle />;
      default: return null;
    }
  };

  const statusToStage = (status) => {
    switch (status) {
      case "PENDING": return "Submitted";
      case "VERIFIED": return "Reviewing";
      case "IN_PROGRESS": return "In Progress";
      case "RESOLVED": return "Resolved";
      case "DECLINED": return "Declined";
      default: return "Submitted";
    }
  };

  const filteredReports = reportFilter === "resolved"
    ? reports.filter((r) => r.status === "RESOLVED")
    : reports;

  const totalPosts = reports.length;
  const resolved = reports.filter((r) => r.status === "RESOLVED").length;
  const inProgress = reports.filter((r) => r.status === "IN_PROGRESS").length;

  const handleSaveProfile = async () => {
    try {
      setSaveError("");
      await update({
        full_name: formData.full_name,
      });
      setShowConfirm(false);
    } catch {
      setSaveError("Failed to save. Try again.");
      setShowConfirm(false);
    }
  };

  if (profileLoading) return (
    <>
      <Sidebar />
      <AppHeader />
      <div className="myprofile-container"><p>Loading profile...</p></div>
    </>
  );

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

      <div className="myprofile-container">
        <div className="profile-header">
          <img
            src={profile?.profile_picture_url || "/snap.jpg"}
            alt="Profile"
            className="profile-avatar"
          />

          <div className="profile-info">
            <h2>{profile?.full_name || "—"}</h2>
            <p className="profile-bio">{profile?.barangay ? `${profile.barangay}, ${profile.city}` : "No location set"}</p>
          </div>

          <div className="profile-stats">
            <div className="stat-card"><span>{totalPosts}</span><p>Total Posts</p></div>
            <div className="stat-card"><span>{resolved}</span><p>Resolved</p></div>
            <div className="stat-card"><span>{inProgress}</span><p>In Progress</p></div>
            <div className="stat-card"><span>{Math.floor(profile?.reputation_score ?? 0)}</span><p>Rep Score</p></div>
          </div>
        </div>

        {/* TABS */}
        <div className="profile-tabs">
          <button className={activeTab === "feed" ? "active" : ""} onClick={() => setActiveTab("feed")}>
            Reports Feed
          </button>
          <button
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => {
              setFormData({ full_name: profile?.full_name || "" });
              setActiveTab("settings");
            }}
          >
            Profile Settings
          </button>
        </div>

        {/* REPORTS FEED */}
        {activeTab === "feed" && (
          <div className="profile-content">
            <div className="profile-content-header">
              <div className="profile-content-title"><h2>Personal Activity Feed</h2></div>
              <div className="feed-filters">
                <button className={reportFilter === "all" ? "active" : ""} onClick={() => setReportFilter("all")}>All</button>
                <button className={reportFilter === "resolved" ? "active" : ""} onClick={() => setReportFilter("resolved")}>Resolved</button>
              </div>
            </div>

            {reportsLoading ? (
              <p style={{ padding: "1rem" }}>Loading reports...</p>
            ) : filteredReports.length === 0 ? (
              <div className="no-reports">
                <h3>No Reports Found</h3>
                <p>{reportFilter === "resolved" ? "You don't have any resolved reports yet." : "You haven't submitted any reports yet."}</p>
              </div>
            ) : (
              filteredReports.map((report) => {
                const currentStage = statusToStage(report.status);
                return (
                  <div key={report.id} className="report-card">
                    <div className="report-header">
                      <div>
                        <strong>Report #{report.id}</strong>
                        <p>{report.created_at ? new Date(report.created_at).toLocaleDateString() : "—"}</p>
                      </div>
                    </div>

                    <div className="report-main">
                      {report.image_url && <img src={report.image_url} alt="Report" />}
                      <div className="ai-result">
                        <h4>AI CLASSIFICATION</h4>
                        <h5>RESULT</h5>
                        <p><strong>Damage: </strong>
                          <span className={`damage ${report.ai_damage_type || ""}`}>{report.ai_damage_type || "Pending"}</span>
                        </p>
                        <p><strong>Severity: </strong>
                          <span className={`severity ${report.ai_severity || ""}`}>{report.ai_severity || "Pending"}</span>
                        </p>
                      </div>
                    </div>

                    <p className="report-location">
                      <ImLocation className="report-location-icon" />
                      {report.barangay || report.street_name || `${report.latitude}, ${report.longitude}`}
                    </p>

                    <div className="report-description">{report.description || "—"}</div>

                    <div className="status-timeline">
                      {stages.map((stage, index) => {
                        const stopIndex = report.status === "DECLINED"
                          ? stages.indexOf("Reviewing")
                          : stages.indexOf(currentStage);
                        const isStepActive = index <= stopIndex;
                        const isLineActive = index < stopIndex;
                        const isDeclined = report.status === "DECLINED" && stage === "Reviewing";

                        return (
                          <div key={stage} className={`timeline-step ${isStepActive ? "active" : ""} ${isDeclined ? "declined" : ""}`}>
                            <div className="timeline-icon">{getStageIcon(stage)}</div>
                            {index !== stages.length - 1 && (
                              <div className={`timeline-line ${isLineActive ? "active" : ""} ${isDeclined ? "declined" : ""}`} />
                            )}
                            <p>{stage}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* PROFILE SETTINGS */}
        {activeTab === "settings" && formData && (
          <div className="profile-settings">
            <h3>Profile Settings</h3>
            <p>Customize your profile in Snap2Fix!</p>

            <div className="settings-avatar">
              <div className="avatar-wrapper">
                <img src={profile?.profile_picture_url || "/snap.jpg"} alt="Profile" />
                <label className="camera-btn">
                  <FaCamera className="change-camera-icon" />
                  <input type="file" accept="image/*" hidden />
                </label>
              </div>
            </div>

            <div className="settings-form">
              <label>FULL NAME</label>
              <div className="input-with-icon">
                <IoPersonSharp className="input-icon" />
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Full Name"
                />
              </div>
            </div>

            {saveError && <p style={{ color: "red", marginTop: "0.5rem" }}>{saveError}</p>}

            <div className="settings-actions">
              <button className="discard" onClick={() => setActiveTab("feed")}>Discard</button>
              <button className="save" onClick={() => setShowConfirm(true)} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}

        {showConfirm && (
          <ConfirmChangesModal
            title="Save Profile Changes?"
            message="Your updated name will be visible to others."
            confirmText="Save"
            onCancel={() => setShowConfirm(false)}
            onConfirm={handleSaveProfile}
          />
        )}
      </div>
    </>
  );
}

export default MyProfile;