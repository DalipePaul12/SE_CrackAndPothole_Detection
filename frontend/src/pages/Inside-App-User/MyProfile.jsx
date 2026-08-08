import React, { useState, useEffect, useRef } from "react";
import "./MyProfile.css";
import { createPortal } from "react-dom";
import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";
import { useNavigate } from "react-router-dom";

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
import { MdLocationOn, MdBrokenImage } from "react-icons/md";
import { BiError } from "react-icons/bi";

import { useUser } from "../../hooks/useUser";
import { useReports } from "../../hooks/useReports";

const BASE_URL = import.meta.env.VITE_API_URL || "";
const PAGE_SIZE = 6;

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

const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov)(\?|$)/i;

function getReportMedia(report) {
  const url = report?.media_attachments?.[0]?.file_url;
  if (!url) return { url: null, type: null };
  return {
    url: `${BASE_URL}${url}`,
    type: VIDEO_EXT_RE.test(url) ? "video" : "image",
  };
}

function ReportMedia({ media, reportId }) {
  const [failed, setFailed] = useState(false);

  if (!media.url || failed) {
    return (
      <div className="report-media-wrap">
        <div className="report-image-placeholder">
          <MdBrokenImage />
          <span>No media</span>
        </div>
      </div>
    );
  }

  if (media.type === "video") {
    return (
      <div className="report-media-wrap">
        <video
          src={media.url}
          controls
          muted
          playsInline
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className="report-media-wrap">
      <img
        src={media.url}
        alt={`Report #${reportId}`}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/* ─── Report Detail Modal ─── */
function ReportDetailModal({ report, onClose, BASE_URL }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("details");
  const attachments = report?.media_attachments ?? [];
  const imageUrl = attachments[0]?.file_url
    ? `${BASE_URL}${attachments[0].file_url}`
    : null;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add("report-modal-open");
    return () => { 
      document.body.style.overflow = ""; 
      document.body.classList.remove("report-modal-open");
    };
  }, []);

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const statusLabel = statusToStage(report.status).toUpperCase();

  const padId = (id) => `RPT-${String(id).padStart(5, "0")}`;

  const TABS = [
    { id: "details",  label: "Details",  icon: <FaSearch /> },
    { id: "media",    label: "Media",    icon: <FaCamera />, badge: attachments.length },
    { id: "timeline", label: "Timeline", icon: <FaTools /> },
  ];

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="mp-modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="mp-modal-header">
          <div className="mp-modal-header-id">
            <span className="mp-modal-id">{padId(report.id)}</span>
            <span className={`mp-modal-badge mp-status-badge mp-status-${(report.status || "").toLowerCase()}`}>
              {statusLabel}
            </span>
            {report.ai_confidence != null && (
              <span className="mp-modal-badge mp-confidence-badge">
                AI {(report.ai_confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <button className="mp-modal-close" onClick={onClose} aria-label="Close">
            <FaTimes />
          </button>
        </div>

        {/* Tabs */}
        <div className="mp-modal-tabs">
          {TABS.map(({ id, label, icon, badge }) => (
            <button
              key={id}
              className={`mp-modal-tab ${activeTab === id ? "active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {icon}
              {label}
              {badge > 0 && <span className="mp-modal-tab-badge">{badge}</span>}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="mp-modal-body">
          {activeTab === "details" && (
            <div className="mp-modal-grid">
              <div className="mp-modal-card">
                <h4 className="mp-modal-card-title"><FaPaperPlane /> Report Info</h4>
                <div className="mp-modal-card-body">
                  <div className="mp-modal-row">
                    <span>Date / Time</span>
                    <strong>{report.created_at ? new Date(report.created_at).toLocaleString() : "—"}</strong>
                  </div>
                  <div className="mp-modal-row">
                    <span>Description</span>
                    <strong>{report.description || "No description provided."}</strong>
                  </div>
                </div>
              </div>

              <div className="mp-modal-card">
                <h4 className="mp-modal-card-title"><BiError /> Damage Info</h4>
                <div className="mp-modal-card-body">
                  <div className="mp-modal-row">
                    <span>Type</span>
                    <strong className={`damage ${(report.ai_damage_type || "").toLowerCase()}`}>
                      {report.ai_damage_type || "Pending"}
                    </strong>
                  </div>
                  <div className="mp-modal-row">
                    <span>Severity</span>
                    <strong className={`severity ${(report.ai_severity || "").toLowerCase().replace(" ", "-")}`}>
                      {report.ai_severity || "Pending"}
                    </strong>
                  </div>
                  {report.ai_confidence != null && (
                    <div style={{ marginTop: "6px" }}>
                      <ConfidenceBar value={report.ai_confidence} />
                    </div>
                  )}
                </div>
              </div>

              <div className="mp-modal-card mp-modal-card--full">
                <h4 className="mp-modal-card-title"><MdLocationOn /> Location</h4>
                <div className="mp-modal-card-body">
                  <div className="mp-modal-row">
                    <span>Barangay</span>
                    <strong>{report.barangay || "—"}</strong>
                  </div>
                  <div className="mp-modal-row">
                    <span>Street</span>
                    <strong>{report.street_name || "—"}</strong>
                  </div>
                  <div className="mp-modal-row">
                    <span>Coordinates</span>
                    <strong>{report.latitude}, {report.longitude}</strong>
                  </div>
                  {report.latitude != null && report.longitude != null && (
                    <button
                      type="button"
                      className="mp-modal-map-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/dashboard/mapview", {
                          state: {
                            lat: report.latitude,
                            lng: report.longitude,
                            reportId: report.id,
                          },
                        });
                      }}
                    >
                      <ImLocation /> View on Map
                    </button>
                  )}
                </div>
              </div>

              {report.status === "DECLINED" && report.decline_reason && (
                <div className="mp-modal-card mp-modal-card--full mp-modal-card--danger">
                  <div className="mp-modal-card-body mp-modal-decline-body">
                    <BiError />
                    <span><strong>Decline Reason:</strong> {report.decline_reason}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "media" && (
            <div className="mp-modal-media-tab">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={`Report #${report.id}`}
                  className="mp-modal-media-main"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                <div className="mp-modal-media-empty">
                  <MdBrokenImage />
                  <p>No media attachments for this report</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="mp-modal-timeline-tab">
              <StatusTimeline report={report} />
            </div>
          )}
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
  const {
    profile,
    loading: profileLoading,
    update,
    saving,
    updatePassword,
  } = useUser();

  const { reports, loading: reportsLoading, stats: reportStats } = useReports({ mine: true });

  const [showConfirm, setShowConfirm]   = useState(false);
  const [activeTab, setActiveTab]       = useState("feed");
  const [isDirty, setIsDirty]               = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [pendingTab, setPendingTab]         = useState(null);

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

  /* ─── Dirty-state tab switching ─── */
  const performTabSwitch = (tab) => {
    if (tab === "settings") {
      setFormData({
        full_name: profile?.full_name || "",
        barangay:  profile?.barangay  || "",
        city:      profile?.city      || "",
      });
      setFormErrors({});
    }
    setIsDirty(false);
    setActiveTab(tab);
  };

  const handleTabSwitch = (tab) => {
    if (activeTab === "settings" && tab !== "settings" && isDirty) {
      setPendingTab(tab);
      setShowDiscardDialog(true);
      return;
    }
    performTabSwitch(tab);
  };

  /* Derived report list */
  const filteredReports = (() => {
    let list = [...reports];
    if (reportFilter === "pending")
      list = list.filter((r) => r.status === "PENDING");
    else if (reportFilter === "in_progress")
      list = list.filter((r) => r.status === "IN_PROGRESS");
    else if (reportFilter === "resolved")
      list = list.filter((r) => r.status === "RESOLVED");

    const sevOrder = { CRITICAL: 0, "NON_CRITICAL": 1 };
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

  const totalPosts = reportStats?.total ?? reports.length;
  const resolved   = reportStats?.resolved ?? reports.filter((r) => r.status === "RESOLVED").length;
  const inProgress = reportStats?.inProgress ?? reports.filter((r) => r.status === "IN_PROGRESS").length;

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
      setIsDirty(false);
      showToast("Profile updated successfully!", "success");
      setActiveTab("feed");
    } catch {
      setSaveError("Failed to save. Try again.");
      setShowConfirm(false);
      showToast("Failed to save profile. Try again.", "error");
    }
  };

  /* ─── Change Password ─── */
  const [pwLoading, setPwLoading] = useState(false);

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

    setPwLoading(true);
    try {
      const success = await updatePassword(pwData.current, pwData.newPw);
      if (success) {
        setPwData({ current: "", newPw: "", confirm: "" });
        setPwErrors({});
        showToast("Password changed successfully!", "success");
      } else {
        showToast("Failed to change password. Check your current password.", "error");
      }
    } catch (err) {
      showToast(err.message || "Password change failed.", "error");
    } finally {
      setPwLoading(false);
    }
  };

  /* ─── Loading state ─── */
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
              aria-label="View reputation breakdown"
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
            onClick={() => handleTabSwitch("feed")}
          >
            Reports Feed
          </button>
          <button
            className={activeTab === "settings" ? "active" : ""}
            onClick={() => handleTabSwitch("settings")}
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
                <div className="reports-grid">
                  {visibleReports.map((report) => {
                    const media = getReportMedia(report);
                    return (
                      <div
                        key={report.id}
                        className="report-card"
                        onClick={() => setSelectedReport(report)}
                        role="button"
                        tabIndex={0}
                        aria-label={`View details for report #${report.id}`}
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
                          <ReportMedia media={media} reportId={report.id} />
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

                        <div
                          className={`report-description${report.description ? "" : " report-description--empty"}`}
                        >
                          {report.description || "No description provided."}
                        </div>

                        <StatusTimeline report={report} />
                      </div>
                    );
                  })}
                </div>

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
                <label className="camera-btn" aria-label="Change profile picture">
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
                    setIsDirty(true);
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
                    setIsDirty(true);
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
                    setIsDirty(true);
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
              <button className="discard" onClick={() => { setIsDirty(false); setActiveTab("feed"); }}>
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
                <button className="save" onClick={handleChangePassword} disabled={pwLoading}>
                  {pwLoading ? "Changing…" : "Change Password"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals (portaled to document.body) ── */}
      {showConfirm &&
        createPortal(
          <ConfirmChangesModal
            title="Save Profile Changes?"
            message="Your updated name and location will be visible to others."
            confirmText="Save"
            onCancel={() => setShowConfirm(false)}
            onConfirm={confirmSave}
          />,
          document.body
        )}

      {showDiscardDialog &&
        createPortal(
          <ConfirmChangesModal
            title="Discard unsaved changes?"
            message="You have unsaved changes — discard them and leave this tab?"
            confirmText="Discard"
            variant="danger"
            onCancel={() => { setShowDiscardDialog(false); setPendingTab(null); }}
            onConfirm={() => {
              const tab = pendingTab;
              setShowDiscardDialog(false);
              setPendingTab(null);
              performTabSwitch(tab);
            }}
          />,
          document.body
        )}

      {selectedReport &&
        createPortal(
          <ReportDetailModal
            report={selectedReport}
            onClose={() => setSelectedReport(null)}
            BASE_URL={BASE_URL}
          />,
          document.body
        )}

      {showRepModal &&
        createPortal(
          <ReputationModal
            score={Math.floor(profile?.reputation_score ?? 0)}
            onClose={() => setShowRepModal(false)}
          />,
          document.body
        )}
    </>
  );
}

export default MyProfile;