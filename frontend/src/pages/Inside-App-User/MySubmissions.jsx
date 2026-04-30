import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./MySubmissions.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

import { useReports } from "../../hooks/useReports";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const toClass = (str = "") => str.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";
const mediaUrl = (attachment) =>
  attachment?.file_url ? `${BASE_URL}${attachment.file_url}` : null;

const STATUS_LABEL = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  VERIFIED: "Verified",
  RESOLVED: "Resolved",
  DECLINED: "Declined",
};

const STATUS_STEPS = ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED"];

const SEVERITY_ORDER = { critical: 4, high: 3, moderate: 2, low: 1, "non-critical": 0 };

// ── Status Progress Bar ──────────────────────────────────────────────────────
function StatusProgress({ status }) {
  if (status === "DECLINED") {
    return (
      <div className="status-progress declined-progress">
        <span className="declined-label">⛔ Report Declined</span>
      </div>
    );
  }
  const currentIdx = STATUS_STEPS.indexOf(status);
  return (
    <div className="status-progress">
      {STATUS_STEPS.map((step, idx) => (
        <React.Fragment key={step}>
          <div className={`progress-step ${idx <= currentIdx ? "active" : ""} ${idx === currentIdx ? "current" : ""}`}>
            <div className="step-dot">
              {idx < currentIdx ? "✓" : idx === currentIdx ? "●" : "○"}
            </div>
            <span className="step-label">{STATUS_LABEL[step]}</span>
          </div>
          {idx < STATUS_STEPS.length - 1 && (
            <div className={`progress-line ${idx < currentIdx ? "active" : ""}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────
function Pagination({ page, setPage, total, pageSize = 15 }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <button className="page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
        ‹ Prev
      </button>
      <span className="page-info">
        Page {page} of {totalPages} · {total} report{total !== 1 ? "s" : ""}
      </span>
      <button className="page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
        Next ›
      </button>
    </div>
  );
}

// ── Note Composer ────────────────────────────────────────────────────────────
function NoteComposer({ reportId, onSent }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(null);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setErr(null);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${BASE_URL}/api/v1/reports/${reportId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to send message.");
      setText("");
      setSent(true);
      setTimeout(() => setSent(false), 3000);
      if (onSent) onSent();
    } catch (e) {
      setErr(e.message || "Could not send message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="note-composer">
      <p className="note-label">💬 Send a note to admin</p>
      <textarea
        className="note-textarea"
        rows={3}
        maxLength={500}
        placeholder="Ask about your report, provide more details, or follow up…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={sending}
      />
      <div className="note-footer">
        <span className="note-char">{text.length}/500</span>
        {err && <span className="note-err">{err}</span>}
        {sent && <span className="note-sent">✓ Sent!</span>}
        <button className="note-send-btn" onClick={handleSend} disabled={sending || !text.trim()}>
          {sending ? "Sending…" : "Send Message"}
        </button>
      </div>
    </div>
  );
}

// ── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Image preview">
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close lightbox">×</button>
        <img src={src} alt={alt} className="lightbox-img" />
      </div>
    </div>
  );
}

// ── AI Tooltip ────────────────────────────────────────────────────────────────
function AITooltip({ report }) {
  const [open, setOpen] = useState(false);
  const conf = report.ai_confidence != null ? (report.ai_confidence * 100).toFixed(1) : null;
  const type = report.ai_damage_type ?? "Unknown";
  const sev = report.ai_severity ?? "Unknown";

  return (
    <div className="ai-tooltip-wrapper">
      <button className="ai-tooltip-trigger" onClick={() => setOpen((o) => !o)} aria-label="AI explanation">
        🤖 Why {type}?
      </button>
      {open && (
        <div className="ai-tooltip-popup" role="tooltip">
          <button className="ai-tooltip-close" onClick={() => setOpen(false)}>×</button>
          <h4 className="ai-tooltip-title">AI Classification Details</h4>
          <p><strong>Damage Type:</strong> {type}</p>
          <p><strong>Severity:</strong> {sev}</p>
          {conf && <p><strong>Confidence:</strong> {conf}%</p>}
          <p className="ai-tooltip-note">
            The AI model analyzed visual patterns in the uploaded image — crack geometry, depth cues, and surface texture — to classify this as a <em>{type}</em> with <em>{sev}</em> severity.
          </p>
          {conf && parseFloat(conf) < 70 && (
            <p className="ai-tooltip-warning">⚠️ Low confidence. An admin will manually review this report.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report Timeline ───────────────────────────────────────────────────────────
function ReportTimeline({ report }) {
  const events = useMemo(() => {
    const evts = [{ label: "Submitted", date: report.created_at, icon: "📤" }];
    if (report.verified_at) evts.push({ label: "Verified", date: report.verified_at, icon: "✅" });
    if (report.in_progress_at) evts.push({ label: "In Progress", date: report.in_progress_at, icon: "🔧" });
    if (report.resolved_at) evts.push({ label: "Resolved", date: report.resolved_at, icon: "🎉" });
    if (report.declined_at) evts.push({ label: "Declined", date: report.declined_at, icon: "⛔" });
    return evts.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [report]);

  return (
    <div className="timeline">
      {events.map((evt, i) => (
        <div key={i} className="timeline-item">
          <div className="timeline-icon">{evt.icon}</div>
          <div className="timeline-body">
            <span className="timeline-label">{evt.label}</span>
            <span className="timeline-date">{fmtDateTime(evt.date)}</span>
          </div>
          {i < events.length - 1 && <div className="timeline-connector" />}
        </div>
      ))}
    </div>
  );
}

// ── Delete Confirm Modal ─────────────────────────────────────────────────────
function DeleteConfirmModal({ report, onConfirm, onCancel, loading }) {
  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Withdraw Report?</h3>
        <p>Are you sure you want to withdraw <strong>Report #{report.id}</strong>? This action cannot be undone.</p>
        <div className="confirm-actions">
          <button className="cancel-btn" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="delete-btn" onClick={onConfirm} disabled={loading}>
            {loading ? "Withdrawing…" : "Withdraw Report"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Report Modal ─────────────────────────────────────────────────────────────
function ReportModal({ report, onClose, onDelete, onEdit }) {
  const [comments, setComments] = useState([]);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [imgError1, setImgError1] = useState(false);
  const [imgError2, setImgError2] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [unread, setUnread] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  const originalAttachment = report.media_attachments?.[0];
  const proofAttachment = report.media_attachments?.[1];
  const originalUrl = !imgError1 ? mediaUrl(originalAttachment) : null;
  const proofUrl = !imgError2 ? mediaUrl(proofAttachment) : null;
  const isResolved = report.status === "RESOLVED";
  const canEdit = report.status === "PENDING" || report.status === "DECLINED";
  const canDelete = report.status === "PENDING" || report.status === "DECLINED";

  const loadComments = useCallback(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${BASE_URL}/api/v1/reports/${report.id}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setComments(arr);
        const adminReplies = arr.filter((c) => c.user?.role === "admin").length;
        setUnread(adminReplies);
      })
      .catch(() => {});
  }, [report.id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleShare = () => {
    const url = `${window.location.origin}/reports/${report.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareMsg("Link copied!");
      setTimeout(() => setShareMsg(""), 2500);
    });
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${BASE_URL}/api/v1/reports/${report.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      setShowDeleteConfirm(false);
      onDelete(report.id);
      onClose();
    } catch {
      setDeleteLoading(false);
    }
  };

  const tabs = [
    { id: "details", label: "📋 Details" },
    { id: "timeline", label: "📅 Timeline" },
    { id: "media", label: "🖼 Media" },
    { id: "messages", label: "💬 Messages", badge: unread },
  ];

  return (
    <>
      <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">×</button>

          <div className="modal-header">
            <div className="modal-header-info">
              <h3 className="modal-title">Report #{report.id}</h3>
              <p className="modal-subtitle">{report.barangay ?? report.street_name ?? "—"}</p>
            </div>
            <div className="modal-header-right">
              <span className={`status-badge ${toClass(report.status ?? "")}`}>
                {STATUS_LABEL[report.status] ?? report.status ?? "—"}
              </span>
              <div className="modal-actions-row">
                {canEdit && (
                  <button className="modal-action-btn edit-action" onClick={() => onEdit(report)} title="Edit Report">
                    ✏️ Edit
                  </button>
                )}
                {canDelete && (
                  <button className="modal-action-btn delete-action" onClick={() => setShowDeleteConfirm(true)} title="Withdraw Report">
                    🗑 Withdraw
                  </button>
                )}
                <button className="modal-action-btn share-action" onClick={handleShare} title="Copy share link">
                  🔗 Share
                </button>
                {shareMsg && <span className="share-msg">{shareMsg}</span>}
              </div>
            </div>
          </div>

          <StatusProgress status={report.status} />

          <div className="modal-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`modal-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
                {tab.badge > 0 && <span className="tab-badge">{tab.badge}</span>}
              </button>
            ))}
          </div>

          <div className="modal-body">
            {/* ── Details Tab ── */}
            {activeTab === "details" && (
              <div className="tab-details">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-key">Damage Type</span>
                    <span className="detail-val">{report.ai_damage_type ?? "—"}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-key">Severity</span>
                    <span className={`detail-val severity-val ${toClass(report.ai_severity ?? "")}`}>
                      {report.ai_severity ?? "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-key">AI Confidence</span>
                    <span className="detail-val">
                      {report.ai_confidence != null ? (
                        <span className="confidence-bar-wrapper">
                          <span className="confidence-text">{(report.ai_confidence * 100).toFixed(1)}%</span>
                          <span className="confidence-bar">
                            <span
                              className="confidence-fill"
                              style={{ width: `${(report.ai_confidence * 100).toFixed(0)}%` }}
                            />
                          </span>
                        </span>
                      ) : "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-key">Submitted</span>
                    <span className="detail-val">{fmtDate(report.created_at)}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-key">Barangay</span>
                    <span className="detail-val">{report.barangay ?? "—"}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-key">Street</span>
                    <span className="detail-val">{report.street_name ?? "—"}</span>
                  </div>
                  {report.upvote_count > 0 && (
                    <div className="detail-item">
                      <span className="detail-key">Community Upvotes</span>
                      <span className="detail-val upvotes">👍 {report.upvote_count} people affected</span>
                    </div>
                  )}
                </div>

                {report.description && (
                  <div className="detail-description">
                    <span className="detail-key">Description</span>
                    <p>{report.description}</p>
                  </div>
                )}

                <AITooltip report={report} />

                {report.status === "DECLINED" && report.decline_reason && (
                  <div className="decline-reason">
                    <strong>Decline Reason:</strong> {report.decline_reason}
                  </div>
                )}

                {report.is_flagged_fake && (
                  <div className="ai-flag-badge">
                    ⚠️ Flagged as possibly AI-generated — pending admin review
                  </div>
                )}
              </div>
            )}

            {/* ── Timeline Tab ── */}
            {activeTab === "timeline" && <ReportTimeline report={report} />}

            {/* ── Media Tab ── */}
            {activeTab === "media" && (
              <div className="tab-media">
                <div className="media-block">
                  <p className="media-label">📸 Damage Evidence</p>
                  <div className="modal-media">
                    {originalUrl ? (
                      originalAttachment.media_type === "video" ? (
                        <video src={originalUrl} controls />
                      ) : (
                        <img
                          src={originalUrl}
                          alt="Damage"
                          className="zoomable-img"
                          onClick={() => setLightboxSrc(originalUrl)}
                          onError={() => setImgError1(true)}
                          title="Click to zoom"
                        />
                      )
                    ) : (
                      <div className="no-image">No media uploaded</div>
                    )}
                  </div>
                  {originalUrl && <p className="zoom-hint">🔍 Click image to zoom</p>}
                </div>

                {isResolved && (
                  <div className="media-block">
                    <p className="media-label">🔧 Repair Proof</p>
                    <div className="modal-media">
                      {proofUrl ? (
                        proofAttachment.media_type === "video" ? (
                          <video src={proofUrl} controls />
                        ) : (
                          <img
                            src={proofUrl}
                            alt="Repair proof"
                            className="zoomable-img"
                            onClick={() => setLightboxSrc(proofUrl)}
                            onError={() => setImgError2(true)}
                            title="Click to zoom"
                          />
                        )
                      ) : (
                        <div className="no-image">No repair photo uploaded</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Messages Tab ── */}
            {activeTab === "messages" && (
              <div className="tab-messages">
                <NoteComposer reportId={report.id} onSent={loadComments} />
                {comments.length > 0 ? (
                  <div className="comments-thread">
                    <p className="thread-label">Message thread ({comments.length})</p>
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className={`comment-bubble ${c.user?.role === "admin" ? "admin-bubble" : "user-bubble"}`}
                      >
                        <div className="bubble-header">
                          <span className="bubble-author">
                            {c.user?.role === "admin" ? "🛡 Admin" : "👤 " + (c.user?.full_name ?? "You")}
                          </span>
                          <span className="bubble-date">{fmtDateTime(c.created_at)}</span>
                        </div>
                        <p className="bubble-text">{c.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-messages">No messages yet. Send a note to start the conversation.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxSrc && <Lightbox src={lightboxSrc} alt="Full preview" onClose={() => setLightboxSrc(null)} />}

      {showDeleteConfirm && (
        <DeleteConfirmModal
          report={report}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
          loading={deleteLoading}
        />
      )}
    </>
  );
}

// ── Report Card (Mobile) ────────────────────────────────────────────────────
function ReportCard({ report, onView }) {
  const [imgError, setImgError] = useState(false);
  const attachment = report.media_attachments?.[0];
  const thumbUrl = !imgError ? mediaUrl(attachment) : null;

  return (
    <div
      className="report-card"
      onClick={() => onView(report)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(report); }
      }}
      role="button"
      aria-label={`View report #${report.id}`}
    >
      <div className="card-thumb">
        {thumbUrl ? (
          attachment.media_type === "video" ? (
            <div className="thumb-video-placeholder">▶ Video</div>
          ) : (
            <img src={thumbUrl} alt="Report thumbnail" onError={() => setImgError(true)} />
          )
        ) : (
          <div className="thumb-placeholder">📷</div>
        )}
      </div>
      <div className="card-body">
        <div className="card-top">
          <span className="card-id">#{report.id}</span>
          <span className={`status-badge ${toClass(report.status ?? "")}`}>
            {STATUS_LABEL[report.status] ?? report.status ?? "—"}
          </span>
        </div>
        <p className="card-location">{report.barangay ?? report.street_name ?? "—"}</p>
        <div className="card-meta">
          <span className="card-type">{report.ai_damage_type ?? "—"}</span>
          <span className={`severity-chip ${toClass(report.ai_severity ?? "")}`}>
            {report.ai_severity ?? "—"}
          </span>
        </div>
        <div className="card-footer">
          <span className="card-date">{fmtDate(report.created_at)}</span>
          {report.upvote_count > 0 && (
            <span className="card-upvotes">👍 {report.upvote_count}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Table Row (Desktop) ─────────────────────────────────────────────────────
function TableRow({ report, onView }) {
  const [imgError, setImgError] = useState(false);
  const attachment = report.media_attachments?.[0];
  const thumbUrl = !imgError ? mediaUrl(attachment) : null;

  return (
    <tr
      className="table-row"
      onClick={() => onView(report)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(report); }
      }}
    >
      <td className="thumb-cell">
        <div className="row-thumb">
          {thumbUrl ? (
            attachment.media_type === "video" ? (
              <div className="thumb-video-icon">▶</div>
            ) : (
              <img src={thumbUrl} alt="thumb" onError={() => setImgError(true)} />
            )
          ) : (
            <div className="thumb-empty">📷</div>
          )}
        </div>
      </td>
      <td>
        <strong className="report-id">#{report.id}</strong>
        <div className="report-loc">{report.barangay ?? report.street_name ?? "—"}</div>
      </td>
      <td className="td-type">{report.ai_damage_type ?? "—"}</td>
      <td>
        <span className={`severity-chip ${toClass(report.ai_severity ?? "")}`}>
          {report.ai_severity ?? "—"}
        </span>
      </td>
      <td>
        <span className={`status-badge ${toClass(report.status ?? "")}`}>
          {STATUS_LABEL[report.status] ?? "—"}
        </span>
      </td>
      <td className="td-date">{fmtDate(report.created_at)}</td>
      <td className="td-upvotes">
        {report.upvote_count > 0 && <span className="upvote-count">👍 {report.upvote_count}</span>}
      </td>
    </tr>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ hasFilters, onClear }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">🛣️</div>
      {hasFilters ? (
        <>
          <h3>No reports match your filters</h3>
          <p>Try adjusting your search or filter criteria.</p>
          <button className="empty-action-btn" onClick={onClear}>Clear Filters</button>
        </>
      ) : (
        <>
          <h3>No reports yet</h3>
          <p>Be the first to report road damage in your area and help improve your community.</p>
          <a href="/submit-report" className="empty-action-btn">📸 Report Road Damage</a>
        </>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
function MySubmissions() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState("All");
  const [sevFilter, setSevFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // list | map
  const searchRef = useRef(null);

  const { reports, loading, error, page, setPage, total, refetch } = useReports({
    mine: true,
    status: statusFilter !== "All" ? statusFilter : null,
  });

  // Client-side filter + search + sort
  const processed = useMemo(() => {
    let arr = [...reports];

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (r) =>
          String(r.id).includes(q) ||
          (r.barangay ?? "").toLowerCase().includes(q) ||
          (r.street_name ?? "").toLowerCase().includes(q) ||
          (r.ai_damage_type ?? "").toLowerCase().includes(q)
      );
    }

    // Type filter
    if (typeFilter !== "All") {
      arr = arr.filter((r) => (r.ai_damage_type ?? "").toLowerCase() === typeFilter.toLowerCase());
    }

    // Severity filter
    if (sevFilter !== "All") {
      arr = arr.filter((r) => (r.ai_severity ?? "").toLowerCase() === sevFilter.toLowerCase());
    }

    // Sort
    arr.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === "oldest") return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === "severity")
        return (SEVERITY_ORDER[b.ai_severity?.toLowerCase()] ?? 0) - (SEVERITY_ORDER[a.ai_severity?.toLowerCase()] ?? 0);
      if (sortBy === "upvotes") return (b.upvote_count ?? 0) - (a.upvote_count ?? 0);
      return 0;
    });

    return arr;
  }, [reports, search, typeFilter, sevFilter, sortBy]);

  const handleStatusChange = useCallback(
    (val) => { setStatusFilter(val); setPage(1); },
    [setPage]
  );

  const handleReset = () => {
    setTypeFilter("All");
    setSevFilter("All");
    handleStatusChange("All");
    setSearch("");
    setSortBy("newest");
  };

  const hasActiveFilters =
    typeFilter !== "All" || sevFilter !== "All" || statusFilter !== "All" || search.trim();

  const handleDeleteReport = (id) => {
    refetch();
  };

  const handleEditReport = (report) => {
    // Navigate to edit page or open edit modal
    // e.g.: navigate(`/edit-report/${report.id}`)
    console.log("Edit report:", report.id);
  };

  // Stats
  const stats = useMemo(() => {
    const pending = reports.filter((r) => r.status === "PENDING").length;
    const inProgress = reports.filter((r) => r.status === "IN_PROGRESS").length;
    const resolved = reports.filter((r) => r.status === "RESOLVED").length;
    const verified = reports.filter((r) => r.status === "VERIFIED").length;
    return { pending, inProgress, resolved, verified };
  }, [reports]);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      {sidebarOpen && (
        <div
          className="sidebar-overlay active"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="my-submissions-container">
        {/* ── Page Header ── */}
        <div className="submissions-header-card">
          <div className="header-top-row">
            <div className="header-text">
              <h2 className="page-title">My Reports</h2>
              <p className="page-sub">
                {total} submission{total !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="header-controls">
              <div className="view-toggle">
                <button
                  className={`view-btn ${viewMode === "list" ? "active" : ""}`}
                  onClick={() => setViewMode("list")}
                  title="List View"
                >
                  ☰ List
                </button>
                <button
                  className={`view-btn ${viewMode === "map" ? "active" : ""}`}
                  onClick={() => setViewMode("map")}
                  title="Map View"
                >
                  🗺 Map
                </button>
              </div>
            </div>
          </div>

          {/* ── Mini Stats ── */}
          <div className="mini-stats">
            <div className="mini-stat pending">
              <span className="mini-stat-count">{stats.pending}</span>
              <span className="mini-stat-label">Pending</span>
            </div>
            <div className="mini-stat verified">
              <span className="mini-stat-count">{stats.verified}</span>
              <span className="mini-stat-label">Verified</span>
            </div>
            <div className="mini-stat in-progress">
              <span className="mini-stat-count">{stats.inProgress}</span>
              <span className="mini-stat-label">In Progress</span>
            </div>
            <div className="mini-stat resolved">
              <span className="mini-stat-count">{stats.resolved}</span>
              <span className="mini-stat-label">Resolved</span>
            </div>
          </div>

          {/* ── Search + Sort Row ── */}
          <div className="search-sort-row">
            <div className="search-wrapper">
              <span className="search-icon">🔍</span>
              <input
                ref={searchRef}
                type="text"
                className="search-input"
                placeholder="Search by ID, location, or type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search reports"
              />
              {search && (
                <button className="search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                  ×
                </button>
              )}
            </div>
            <div className="sort-wrapper">
              <label className="sort-label">Sort:</label>
              <div className="custom-select">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort reports">
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="severity">Highest Severity</option>
                  <option value="upvotes">Most Upvotes</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Filters Row ── */}
          <div className="filters-row">
            <div className="filter-group">
              <label className="filter-label">Type</label>
              <div className="filter-chips">
                {["All", "Crack", "Pothole"].map((t) => (
                  <button
                    key={t}
                    className={`chip ${typeFilter === t ? "chip-active" : ""}`}
                    onClick={() => setTypeFilter(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Severity</label>
              <div className="filter-chips">
                {["All", "low", "moderate", "high", "critical"].map((s) => (
                  <button
                    key={s}
                    className={`chip severity-chip-filter ${sevFilter === s ? "chip-active" : ""} ${s !== "All" ? `sev-${s}` : ""}`}
                    onClick={() => setSevFilter(s)}
                  >
                    {s === "All" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label className="filter-label">Status</label>
              <div className="custom-select">
                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  aria-label="Filter by status"
                >
                  <option value="All">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="VERIFIED">Verified</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <button className="reset-btn" onClick={handleReset}>
                ✕ Reset
              </button>
            )}
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="error-banner">
            <span>⚠ {error}</span>
            <button onClick={refetch} className="retry-btn">Retry</button>
          </div>
        )}

        {/* ── Map View ── */}
        {viewMode === "map" && (
          <div className="map-placeholder">
            <span>🗺</span>
            <p>Map view coming soon — integrate with your map provider here.</p>
            <button className="empty-action-btn" onClick={() => setViewMode("list")}>Back to List</button>
          </div>
        )}

        {viewMode === "list" && (
          <>
            {/* ── Desktop Table ── */}
            <div className="submissions-table-wrapper">
              {loading ? (
                <div className="skeleton-list">
                  {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-row" />)}
                </div>
              ) : (
                <table className="submissions-table">
                  <thead>
                    <tr>
                      <th>Evidence</th>
                      <th>Report</th>
                      <th>Type</th>
                      <th>Severity</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Upvotes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processed.length > 0 ? (
                      processed.map((report) => (
                        <TableRow key={report.id} report={report} onView={setSelectedReport} />
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7">
                          <EmptyState hasFilters={hasActiveFilters} onClear={handleReset} />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* ── Mobile Cards ── */}
            <div className="mobile-cards">
              {loading ? (
                <div className="skeleton-list">
                  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" />)}
                </div>
              ) : processed.length > 0 ? (
                processed.map((report) => (
                  <ReportCard key={report.id} report={report} onView={setSelectedReport} />
                ))
              ) : (
                <EmptyState hasFilters={hasActiveFilters} onClear={handleReset} />
              )}
            </div>
          </>
        )}

        {!loading && <Pagination page={page} setPage={setPage} total={total} pageSize={15} />}
      </div>

      {selectedReport && (
        <ReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onDelete={handleDeleteReport}
          onEdit={handleEditReport}
        />
      )}
    </>
  );
}

export default MySubmissions;