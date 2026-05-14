import React, { useState, useEffect, useRef } from "react";
import "./MyProfile.css";

import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";

import { ImLocation } from "react-icons/im";
import {
  FaPaperPlane,
  FaSearch,
  FaTools,
  FaCheckCircle,
  FaCamera,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaTimes,
  FaStar,
  FaSortAmountDown,
  FaChevronDown,
} from "react-icons/fa";
import { IoPersonSharp } from "react-icons/io5";
import { MdLocationOn } from "react-icons/md";
import { BiError } from "react-icons/bi";

import { useUser } from "../../hooks/useUser";
import { useReports } from "../../hooks/useReports";

const BASE_URL = import.meta.env.VITE_API_URL || "";
const PAGE_SIZE = 5;

/* ─── Toast Component ─── */
function Toast({ toasts, removeToast }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type} ${t.hiding ? "hiding" : ""}`}
        >
          {t.type === "success" && <FaCheckCircle />}
          {t.type === "error" && <BiError />}
          {t.type === "info" && <FaStar />}
          <span>{t.message}</span>
          <button className="toast-close" onClick={() => removeToast(t.id)}>
            <FaTimes />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ─── Confidence Bar ─── */
function ConfidenceBar({ value }) {
  const pct = (value * 100).toFixed(1);
  const cls = value >= 0.75 ? "high" : value >= 0.5 ? "medium" : "low";
  return (
    <div className="confidence-bar-wrap">
      <div className="confidence-bar-label">
        <strong>Confidence</strong>
        <span>{pct}%</span>
      </div>
      <div className="confidence-bar">
        <div
          className={`confidence-bar-fill ${cls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Status Timeline ─── */
const STAGES = ["Submitted", "Reviewing", "In Progress", "Resolved"];

function getStageIcon(stage) {
  switch (stage) {
    case "Submitted":   return <FaPaperPlane />;
    case "Reviewing":   return <FaSearch />;
    case "In Progress": return <FaTools />;
    case "Resolved":    return <FaCheckCircle />;
    default:            return null;
  }
}

function statusToStage(status) {
  switch (status) {
    case "PENDING":     return "Submitted";
    case "VERIFIED":    return "Reviewing";
    case "IN_PROGRESS": return "In Progress";
    case "RESOLVED":    return "Resolved";
    case "DECLINED":    return "Declined";
    default:            return "Submitted";
  }
}

function StatusTimeline({ report }) {
  const currentStage = statusToStage(report.status);
  return (
    <div className="status-timeline">
      {STAGES.map((stage, index) => {
        const stopIndex =
          report.status === "DECLINED"
            ? STAGES.indexOf("Reviewing")
            : STAGES.indexOf(currentStage);
        const isStepActive = index <= stopIndex;
        const isLineActive = index < stopIndex;
        const isDeclined =
          report.status === "DECLINED" && stage === "Reviewing";
        return (
          <div
            key={stage}
            className={`timeline-step ${isStepActive ? "active" : ""} ${isDeclined ? "declined" : ""}`}
          >
            <div className="timeline-icon">{getStageIcon(stage)}</div>
            {index !== STAGES.length - 1 && (
              <div
                className={`timeline-line ${isLineActive ? "active" : ""} ${isDeclined ? "declined" : ""}`}
              />
            )}
            <p>{stage}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Report Detail Modal ─── */
function ReportDetailModal({ report, onClose, BASE_URL }) {
  const imageUrl = report?.media_attachments?.[0]?.file_url
    ? `${BASE_URL}${report.media_attachments[0].file_url}`
    : null;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box report-detail-modal">
        <div className="modal-header-band">
          <h3 className="modal-title">
            <FaSearch />
            Report #{report.id}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="modal-scroll-body">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={`Report #${report.id}`}
              className="modal-report-img"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          )}

          <div className="modal-body">
            <div className="modal-detail-grid">
              <div className="modal-detail-cell">
                <span className="modal-detail-label">Date / Time</span>
                <span className="modal-detail-value">
                  {report.created_at ? new Date(report.created_at).toLocaleString() : "—"}
                </span>
              </div>

              <div className="modal-detail-cell">
                <span className="modal-detail-label">Location</span>
                <span className="modal-detail-value">
                  {report.barangay || report.street_name || `${report.latitude}, ${report.longitude}`}
                </span>
              </div>

              <div className="modal-detail-cell">
                <span className="modal-detail-label">Damage Type</span>
                <span className={`modal-detail-value damage ${(report.ai_damage_type || "").toLowerCase()}`}>
                  {report.ai_damage_type || "Pending"}
                </span>
              </div>

              <div className="modal-detail-cell">
                <span className="modal-detail-label">Severity</span>
                <span className={`modal-detail-value severity ${(report.ai_severity || "").toLowerCase().replace(" ", "-")}`}>
                  {report.ai_severity || "Pending"}
                </span>
              </div>

              {report.ai_confidence != null && (
                <div className="modal-detail-cell full">
                  <span className="modal-detail-label">AI Confidence</span>
                  <div style={{ marginTop: "4px" }}>
                    <ConfidenceBar value={report.ai_confidence} />
                  </div>
                </div>
              )}

              {report.description && (
                <div className="modal-detail-cell full">
                  <span className="modal-detail-label">Description</span>
                  <span className="modal-detail-value">{report.description}</span>
                </div>
              )}
            </div>

            <div className="modal-timeline-section">
              <p className="modal-timeline-title">Status Timeline</p>
              <StatusTimeline report={report} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Reputation Modal ─── */
function ReputationModal({ score, onClose }) {
  const submitted = Math.floor(score * 0.6);
  const resolved  = Math.floor(score * 0.3);
  const bonus     = score - submitted - resolved;
  const nextLevel = 200;
  const pct       = Math.min((score / nextLevel) * 100, 100);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-box rep-modal">
        <div className="modal-header-band">
          <h3 className="modal-title">
            <FaStar /> Reputation Score
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        <div className="modal-scroll-body">
          <div className="modal-body">
            <div className="rep-progress-wrap">
              <div className="rep-progress-meta">
                <span>Progress to next level</span>
                <strong>{score} / {nextLevel} pts</strong>
              </div>
              <div className="rep-progress-track">
                <div className="rep-progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="rep-rows">
              <div className="rep-row">
                <div className="rep-row-left"><FaPaperPlane className="rep-icon" /><span>Reports Submitted</span></div>
                <strong className="rep-points">+{submitted} pts</strong>
              </div>
              <div className="rep-row">
                <div className="rep-row-left"><FaCheckCircle className="rep-icon" /><span>Resolved Reports</span></div>
                <strong className="rep-points">+{resolved} pts</strong>
              </div>
              <div className="rep-row">
                <div className="rep-row-left"><FaStar className="rep-icon" /><span>Bonus Points</span></div>
                <strong className="rep-points">+{bonus} pts</strong>
              </div>
              <div className="rep-row rep-total">
                <span>Total Score</span>
                <strong className="rep-total-pts">{score} pts</strong>
              </div>
            </div>

            <p className="rep-hint">Keep submitting and resolving reports to earn more points and level up!</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */
function MyProfile() {
  const { profile, loading: profileLoading, update, saving } = useUser();
  const { reports, loading: reportsLoading } = useReports({ mine: true });

  const [showConfirm, setShowConfirm]   = useState(false);
  const [activeTab, setActiveTab]       = useState("feed");

  const [reportFilter, setReportFilter] = useState("all");
  const [sortOption, setSortOption]     = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const [showFilters, setShowFilters] = useState(false);
  const filtersRef = useRef(null);

  const [formData, setFormData]     = useState(null);
  const [saveError, setSaveError]   = useState("");
  const [formErrors, setFormErrors] = useState({});

  const [pwData, setPwData]     = useState({ current: "", newPw: "", confirm: "" });
  const [pwErrors, setPwErrors] = useState({});
  const [showPw, setShowPw]     = useState({ current: false, newPw: false, confirm: false });

  const [avatarPreview, setAvatarPreview] = useState(null);
  const [uploading, setUploading]         = useState(false);
  const avatarInputRef                    = useRef(null);

  const [selectedReport, setSelectedReport] = useState(null);
  const [showRepModal, setShowRepModal]     = useState(false);

  const [toasts, setToasts] = useState([]);

  /* Filter dropdown click-outside */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (filtersRef.current && !filtersRef.current.contains(e.target)) {
        setShowFilters(false);
      }
    };
    if (showFilters) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showFilters]);

  /* Toast helpers */
  const showToast = (message, type = "info") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, hiding: false }]);
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, hiding: true } : t))
      );
      setTimeout(
        () => setToasts((prev) => prev.filter((t) => t.id !== id)),
        300
      );
    }, 3000);
  };
  const removeToast = (id) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  /* Derived report list */
  const filteredReports = (() => {
    let list = [...reports];
    if (reportFilter === "pending")
      list = list.filter((r) => r.status === "PENDING");
    else if (reportFilter === "in_progress")
      list = list.filter((r) => r.status === "IN_PROGRESS");
    else if (reportFilter === "resolved")
      list = list.filter((r) => r.status === "RESOLVED");

    const sevOrder = { CRITICAL: 0, "NON-CRITICAL": 1 };
    if (sortOption === "oldest")
      list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sortOption === "severity")
      list.sort(
        (a, b) =>
          (sevOrder[(a.ai_severity || "").toUpperCase()] ?? 2) -
          (sevOrder[(b.ai_severity || "").toUpperCase()] ?? 2)
      );
    else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
  })();

  const visibleReports = filteredReports.slice(0, visibleCount);
  const hasMore        = visibleCount < filteredReports.length;

  /* Stats */
  const totalPosts = reports.length;
  const resolved   = reports.filter((r) => r.status === "RESOLVED").length;
  const inProgress = reports.filter((r) => r.status === "IN_PROGRESS").length;

  /* ─── Avatar Upload ─── */
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      showToast("Only JPEG or PNG images are allowed.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("File too large. Maximum size is 5 MB.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target.result);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("profile_picture", file);
      await update(fd);
      showToast("Profile picture updated!", "success");
    } catch {
      showToast("Failed to upload picture. Try again.", "error");
      setAvatarPreview(null);
    } finally {
      setUploading(false);
    }
  };

  /* ─── Save Profile ─── */
  const validateProfileForm = () => {
    const errors = {};
    if (!formData.full_name?.trim()) errors.full_name = "Full name cannot be empty.";
    if (!formData.barangay?.trim())  errors.barangay  = "Barangay cannot be empty.";
    if (!formData.city?.trim())      errors.city      = "City cannot be empty.";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProfile = async () => {
    if (!validateProfileForm()) return;
    setShowConfirm(true);
  };

  const confirmSave = async () => {
    try {
      setSaveError("");
      await update({
        full_name: formData.full_name,
        barangay:  formData.barangay,
        city:      formData.city,
      });
      setShowConfirm(false);
      showToast("Profile updated successfully!", "success");
      setActiveTab("feed");
    } catch {
      setSaveError("Failed to save. Try again.");
      setShowConfirm(false);
      showToast("Failed to save profile. Try again.", "error");
    }
  };

  /* ─── Change Password ─── */
  const handleChangePassword = async () => {
    const errors = {};
    if (!pwData.current)
      errors.current = "Current password is required.";
    if (!pwData.newPw)
      errors.newPw = "New password is required.";
    else if (pwData.newPw.length < 8)
      errors.newPw = "Password must be at least 8 characters.";
    if (pwData.newPw !== pwData.confirm)
      errors.confirm = "Passwords do not match.";
    setPwErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      const res = await fetch(`${BASE_URL}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          current_password: pwData.current,
          new_password:     pwData.newPw,
        }),
      });
      if (!res.ok) throw new Error();
      setPwData({ current: "", newPw: "", confirm: "" });
      setPwErrors({});
      showToast("Password changed successfully!", "success");
    } catch {
      showToast(
        "Failed to change password. Check your current password.",
        "error"
      );
    }
  };

  /* ─── Image URL helper ─── */
  const getImageUrl = (report) => {
    const url = report?.media_attachments?.[0]?.file_url;
    return url ? `${BASE_URL}${url}` : null;
  };

  /* ─── Loading state (no layout wrappers) ─── */
  if (profileLoading)
    return (
      <div className="myprofile-container">
        <p className="loading-text">Loading profile…</p>
      </div>
    );

  const profilePicSrc =
    avatarPreview || profile?.profile_picture_url || "/snap.jpg";

  return (
    <>
      <Toast toasts={toasts} removeToast={removeToast} />

      <div className="myprofile-container">
        {/* ── PROFILE HEADER ── */}
        <div className="profile-header">
          <img src={profilePicSrc} alt="Profile" className="profile-avatar" />

          <div className="profile-info">
            <h2>{profile?.full_name || "—"}</h2>
            <p className="profile-bio">
              <MdLocationOn className="bio-location-icon" />
              {profile?.barangay
                ? `${profile.barangay}, ${profile.city}`
                : "No location set"}
            </p>
          </div>

          <div className="profile-stats">
            <div className="stat-card">
              <span>{totalPosts}</span>
              <p>Total Posts</p>
            </div>
            <div className="stat-card">
              <span>{resolved}</span>
              <p>Resolved</p>
            </div>
            <div className="stat-card">
              <span>{inProgress}</span>
              <p>In Progress</p>
            </div>
            <div
              className="stat-card stat-card--clickable"
              onClick={() => setShowRepModal(true)}
              title="View reputation breakdown"
            >
              <span>{Math.floor(profile?.reputation_score ?? 0)}</span>
              <p>Rep Score</p>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="profile-tabs">
          <button
            className={activeTab === "feed" ? "active" : ""}
            onClick={() => setActiveTab("feed")}
          >
            Reports Feed
          </button>
          <button
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => {
              setFormData({
                full_name: profile?.full_name || "",
                barangay:  profile?.barangay  || "",
                city:      profile?.city      || "",
              });
              setFormErrors({});
              setActiveTab("settings");
            }}
          >
            Profile Settings
          </button>
        </div>

        {/* ════════ FEED TAB ════════ */}
        {activeTab === "feed" && (
          <div className="profile-content">
            <div className="profile-content-header">
              <div className="profile-content-title">
                <h2>Personal Activity Feed</h2>
              </div>

              <div className="feed-controls">
                <div
                  className={`filter-dropdown ${showFilters ? "open" : ""}`}
                  ref={filtersRef}
                >
                  <button
                    className="filter-toggle"
                    onClick={() => setShowFilters((s) => !s)}
                  >
                    Filters <FaChevronDown />
                  </button>
                  <div className="filter-dropdown-panel">
                    {[
                      { key: "all",         label: "All" },
                      { key: "pending",     label: "Pending" },
                      { key: "in_progress", label: "In Progress" },
                      { key: "resolved",    label: "Resolved" },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        className={reportFilter === key ? "active" : ""}
                        onClick={() => {
                          setReportFilter(key);
                          setVisibleCount(PAGE_SIZE);
                          setShowFilters(false);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="feed-sort">
                  <FaSortAmountDown className="sort-icon" />
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value)}
                    className="sort-select"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="severity">Highest Severity</option>
                  </select>
                </div>
              </div>
            </div>

            {reportsLoading ? (
              <p className="loading-text">Loading reports…</p>
            ) : filteredReports.length === 0 ? (
              <div className="no-reports">
                <h3>No Reports Found</h3>
                <p>
                  {reportFilter === "resolved"
                    ? "You don't have any resolved reports yet."
                    : "No reports match this filter."}
                </p>
              </div>
            ) : (
              <>
                {visibleReports.map((report) => {
                  const imageUrl = getImageUrl(report);
                  return (
                    <div
                      key={report.id}
                      className="report-card"
                      onClick={() => setSelectedReport(report)}
                      title="Click to view full details"
                    >
                      <div className="report-header">
                        <div>
                          <strong>Report #{report.id}</strong>
                          <p>
                            {report.created_at
                              ? new Date(report.created_at).toLocaleString()
                              : "—"}
                          </p>
                        </div>
                      </div>

                      <div className="report-main">
                        {imageUrl && (
                          <img
                            src={imageUrl}
                            alt={`Report #${report.id}`}
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                        <div className="ai-result">
                          <h4>AI Classification</h4>
                          <h5>Result</h5>
                          <p>
                            <strong>Damage:</strong>
                            <span
                              className={`damage ${(report.ai_damage_type || "").toLowerCase()}`}
                            >
                              {report.ai_damage_type || "Pending"}
                            </span>
                          </p>
                          <p>
                            <strong>Severity:</strong>
                            <span
                              className={`severity ${(report.ai_severity || "").toLowerCase().replace(" ", "-")}`}
                            >
                              {report.ai_severity || "Pending"}
                            </span>
                          </p>
                          {report.ai_confidence != null && (
                            <ConfidenceBar value={report.ai_confidence} />
                          )}
                        </div>
                      </div>

                      <p className="report-location">
                        <ImLocation className="report-location-icon" />
                        {report.barangay ||
                          report.street_name ||
                          `${report.latitude}, ${report.longitude}`}
                      </p>

                      <div className="report-description">
                        {report.description || "—"}
                      </div>

                      <StatusTimeline report={report} />
                    </div>
                  );
                })}

                {hasMore && (
                  <button
                    className="load-more-btn"
                    onClick={() => {
                      setVisibleCount((v) => v + PAGE_SIZE);
                      showToast("More reports loaded.", "info");
                    }}
                  >
                    Load More Reports
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════ SETTINGS TAB ════════ */}
        {activeTab === "settings" && formData && (
          <div className="profile-settings">
            <h3>Profile Settings</h3>
            <p>Customize your profile in Snap2Fix</p>

            <div className="settings-avatar">
              <div className="avatar-wrapper">
                <img src={profilePicSrc} alt="Profile" />
                <label className="camera-btn" title="Change profile picture">
                  <FaCamera className="change-camera-icon" />
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    hidden
                    onChange={handleAvatarChange}
                  />
                </label>
              </div>
              {uploading && (
                <div className="upload-progress-wrap">
                  <div className="upload-progress-bar">
                    <div className="upload-progress-fill" />
                  </div>
                  <p className="upload-label">Uploading…</p>
                </div>
              )}
            </div>

            <div className="settings-form">
              <label>Full Name</label>
              <div className="input-with-icon">
                <IoPersonSharp className="input-icon" />
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => {
                    setFormData({ ...formData, full_name: e.target.value });
                    setFormErrors({ ...formErrors, full_name: "" });
                  }}
                  placeholder="Full Name"
                  className={formErrors.full_name ? "input-error" : ""}
                />
              </div>
              {formErrors.full_name && (
                <p className="field-error"><BiError /> {formErrors.full_name}</p>
              )}

              <label>Barangay</label>
              <div className="input-with-icon">
                <MdLocationOn className="input-icon" />
                <input
                  type="text"
                  value={formData.barangay}
                  onChange={(e) => {
                    setFormData({ ...formData, barangay: e.target.value });
                    setFormErrors({ ...formErrors, barangay: "" });
                  }}
                  placeholder="Barangay"
                  className={formErrors.barangay ? "input-error" : ""}
                />
              </div>
              {formErrors.barangay && (
                <p className="field-error"><BiError /> {formErrors.barangay}</p>
              )}

              <label>City</label>
              <div className="input-with-icon">
                <MdLocationOn className="input-icon" />
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => {
                    setFormData({ ...formData, city: e.target.value });
                    setFormErrors({ ...formErrors, city: "" });
                  }}
                  placeholder="City"
                  className={formErrors.city ? "input-error" : ""}
                />
              </div>
              {formErrors.city && (
                <p className="field-error"><BiError /> {formErrors.city}</p>
              )}
            </div>

            {saveError && <p className="save-error">{saveError}</p>}

            <div className="settings-actions">
              <button className="discard" onClick={() => setActiveTab("feed")}>
                Discard
              </button>
              <button
                className="save"
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>

            <div className="change-password-section">
              <h4><FaLock /> Change Password</h4>

              <div className="settings-form">
                <label>Current Password</label>
                <div className="input-with-icon">
                  <FaLock className="input-icon" />
                  <input
                    type={showPw.current ? "text" : "password"}
                    value={pwData.current}
                    onChange={(e) => {
                      setPwData({ ...pwData, current: e.target.value });
                      setPwErrors({ ...pwErrors, current: "" });
                    }}
                    placeholder="Current Password"
                    className={pwErrors.current ? "input-error" : ""}
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                  >
                    {showPw.current ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {pwErrors.current && (
                  <p className="field-error"><BiError /> {pwErrors.current}</p>
                )}

                <label>New Password</label>
                <div className="input-with-icon">
                  <FaLock className="input-icon" />
                  <input
                    type={showPw.newPw ? "text" : "password"}
                    value={pwData.newPw}
                    onChange={(e) => {
                      setPwData({ ...pwData, newPw: e.target.value });
                      setPwErrors({ ...pwErrors, newPw: "" });
                    }}
                    placeholder="New Password (min 8 chars)"
                    className={pwErrors.newPw ? "input-error" : ""}
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPw((s) => ({ ...s, newPw: !s.newPw }))}
                  >
                    {showPw.newPw ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {pwErrors.newPw && (
                  <p className="field-error"><BiError /> {pwErrors.newPw}</p>
                )}

                <label>Confirm Password</label>
                <div className="input-with-icon">
                  <FaLock className="input-icon" />
                  <input
                    type={showPw.confirm ? "text" : "password"}
                    value={pwData.confirm}
                    onChange={(e) => {
                      setPwData({ ...pwData, confirm: e.target.value });
                      setPwErrors({ ...pwErrors, confirm: "" });
                    }}
                    placeholder="Confirm New Password"
                    className={pwErrors.confirm ? "input-error" : ""}
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                  >
                    {showPw.confirm ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {pwErrors.confirm && (
                  <p className="field-error"><BiError /> {pwErrors.confirm}</p>
                )}
              </div>

              <div className="settings-actions" style={{ marginTop: "16px" }}>
                <button className="save" onClick={handleChangePassword}>
                  Change Password
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modals ── */}
        {showConfirm && (
          <ConfirmChangesModal
            title="Save Profile Changes?"
            message="Your updated name and location will be visible to others."
            confirmText="Save"
            onCancel={() => setShowConfirm(false)}
            onConfirm={confirmSave}
          />
        )}

        {selectedReport && (
          <ReportDetailModal
            report={selectedReport}
            onClose={() => setSelectedReport(null)}
            BASE_URL={BASE_URL}
          />
        )}

        {showRepModal && (
          <ReputationModal
            score={Math.floor(profile?.reputation_score ?? 0)}
            onClose={() => setShowRepModal(false)}
          />
        )}
      </div>
    </>
  );
}

export default MyProfile;