import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./MySubmissions.css";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { useReports } from "../../hooks/useReports";
import {
  FileText, LayoutList, Map, Search, X, SlidersHorizontal,
  RotateCcw, AlertTriangle, Image, Video, ThumbsUp,
  ChevronLeft, ChevronRight, CircleCheck, Clock, Wrench,
  Send, FileSearch, Trash2, Pencil, Share2, Bot, ZoomIn,
  MessageSquare, Info, ShieldX, CheckCheck, MapPin,
} from "lucide-react";

const BASE_URL  = import.meta.env.VITE_API_URL || "";
const toClass   = (str = "") => str.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");
const fmtDate   = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const fmtDT     = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const mediaUrl  = (att) => att?.file_url ? `${BASE_URL}${att.file_url}` : null;

const STATUS_LABEL  = { PENDING: "Pending", IN_PROGRESS: "In Progress", VERIFIED: "Verified", RESOLVED: "Resolved", DECLINED: "Declined" };
const STATUS_STEPS  = ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED"];
const SEVERITY_ORDER = { critical: 4, high: 3, moderate: 2, low: 1, "non-critical": 0 };

/* ──────────────────────────────────────────────────────────
   STATUS PROGRESS BAR
────────────────────────────────────────────────────────── */
function StatusProgress({ status }) {
  if (status === "DECLINED") {
    return (
      <div className="sub-status-progress sub-declined-progress">
        <ShieldX size={16} aria-hidden="true" />
        <span className="sub-declined-label">Report Declined</span>
      </div>
    );
  }
  const currentIdx = STATUS_STEPS.indexOf(status);
  const StepIcons  = [Send, FileSearch, Wrench, CircleCheck];

  return (
    <div className="sub-status-progress" role="progressbar" aria-label="Report status">
      {STATUS_STEPS.map((step, idx) => {
        const StepIcon = StepIcons[idx];
        return (
          <React.Fragment key={step}>
            <div className={`sub-progress-step ${idx <= currentIdx ? "step-active" : ""} ${idx === currentIdx ? "step-current" : ""}`}>
              <div className="sub-step-dot" aria-hidden="true">
                {idx < currentIdx ? <CheckCheck size={12} /> : <StepIcon size={12} />}
              </div>
              <span className="sub-step-label">{STATUS_LABEL[step]}</span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div className={`sub-progress-line ${idx < currentIdx ? "line-active" : ""}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   PAGINATION
────────────────────────────────────────────────────────── */
function Pagination({ page, setPage, total, pageSize = 15 }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="s2f-pagination">
      <button className="s2f-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
        <ChevronLeft size={15} /> Prev
      </button>
      <span className="s2f-page-info">Page {page} of {totalPages} · {total} report{total !== 1 ? "s" : ""}</span>
      <button className="s2f-page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   NOTE COMPOSER
────────────────────────────────────────────────────────── */
function NoteComposer({ reportId, onSent }) {
  const [text, setText]     = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);
  const [err, setErr]       = useState(null);

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
    <div className="sub-note-composer">
      <p className="sub-note-label">
        <MessageSquare size={14} aria-hidden="true" />
        Send a note to admin
      </p>
      <textarea
        className="sub-note-textarea"
        rows={3}
        maxLength={500}
        placeholder="Ask about your report, provide more details, or follow up…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={sending}
        aria-label="Message to admin"
      />
      <div className="sub-note-footer">
        <span className="sub-note-char">{text.length}/500</span>
        {err  && <span className="sub-note-err">{err}</span>}
        {sent && <span className="sub-note-sent"><CheckCheck size={13} /> Sent!</span>}
        <button
          className="sub-note-send-btn"
          onClick={handleSend}
          disabled={sending || !text.trim()}
          aria-label="Send message"
        >
          <Send size={14} aria-hidden="true" />
          {sending ? "Sending…" : "Send Message"}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   LIGHTBOX
────────────────────────────────────────────────────────── */
function Lightbox({ src, alt, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="sub-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div className="sub-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button className="sub-lightbox-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <img src={src} alt={alt} className="sub-lightbox-img" />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   AI TOOLTIP
────────────────────────────────────────────────────────── */
function AITooltip({ report }) {
  const [open, setOpen] = useState(false);
  const conf = report.ai_confidence != null ? (report.ai_confidence * 100).toFixed(1) : null;
  const type = report.ai_damage_type ?? "Unknown";
  const sev  = report.ai_severity ?? "Unknown";

  return (
    <div className="sub-ai-tooltip-wrap">
      <button className="sub-ai-tooltip-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Bot size={14} aria-hidden="true" />
        Why classified as {type}?
      </button>
      {open && (
        <div className="sub-ai-tooltip-popup" role="tooltip">
          <button className="sub-ai-tooltip-close" onClick={() => setOpen(false)} aria-label="Close">
            <X size={14} />
          </button>
          <h4 className="sub-ai-tooltip-title">AI Classification Details</h4>
          <p><strong>Damage Type:</strong> {type}</p>
          <p><strong>Severity:</strong> {sev}</p>
          {conf && <p><strong>Confidence:</strong> {conf}%</p>}
          <p className="sub-ai-tooltip-note">
            The model analyzed visual patterns in the uploaded image — crack geometry, depth cues, and surface texture — to classify this as <em>{type}</em> with <em>{sev}</em> severity.
          </p>
          {conf && parseFloat(conf) < 70 && (
            <p className="sub-ai-tooltip-warning">
              <AlertTriangle size={12} aria-hidden="true" />
              Low confidence. An admin will manually review this report.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   REPORT TIMELINE
────────────────────────────────────────────────────────── */
function ReportTimeline({ report }) {
  const events = useMemo(() => {
    const evts = [{ label: "Submitted",  date: report.created_at,     Icon: Send }];
    if (report.verified_at)    evts.push({ label: "Verified",    date: report.verified_at,    Icon: FileSearch });
    if (report.in_progress_at) evts.push({ label: "In Progress", date: report.in_progress_at, Icon: Wrench });
    if (report.resolved_at)    evts.push({ label: "Resolved",    date: report.resolved_at,    Icon: CircleCheck });
    if (report.declined_at)    evts.push({ label: "Declined",    date: report.declined_at,    Icon: ShieldX });
    return evts.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [report]);

  return (
    <div className="sub-timeline">
      {events.map((evt, i) => {
        const Icon = evt.Icon;
        return (
          <div key={i} className="sub-timeline-item">
            <div className="sub-timeline-icon" aria-hidden="true">
              <Icon size={16} />
            </div>
            <div className="sub-timeline-body">
              <span className="sub-timeline-label">{evt.label}</span>
              <span className="sub-timeline-date">
                <Clock size={11} aria-hidden="true" />
                {fmtDT(evt.date)}
              </span>
            </div>
            {i < events.length - 1 && <div className="sub-timeline-connector" aria-hidden="true" />}
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   DELETE CONFIRM MODAL
────────────────────────────────────────────────────────── */
function DeleteConfirmModal({ report, onConfirm, onCancel, loading }) {
  return (
    <div className="s2f-modal-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div className="sub-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="del-title">Withdraw Report?</h3>
        <p>Are you sure you want to withdraw <strong>Report #{report.id}</strong>? This cannot be undone.</p>
        <div className="sub-confirm-actions">
          <button className="sub-cancel-btn" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="sub-delete-btn" onClick={onConfirm} disabled={loading}>
            {loading ? "Withdrawing…" : "Yes, Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   REPORT MODAL
────────────────────────────────────────────────────────── */
function ReportModal({ report, onClose, onDelete, onEdit }) {
  const [comments, setComments]           = useState([]);
  const [lightboxSrc, setLightboxSrc]     = useState(null);
  const [imgErr1, setImgErr1]             = useState(false);
  const [imgErr2, setImgErr2]             = useState(false);
  const [activeTab, setActiveTab]         = useState("details");
  const [unread, setUnread]               = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [shareMsg, setShareMsg]           = useState("");

  const originalAtt = report.media_attachments?.[0];
  const proofAtt    = report.media_attachments?.[1];
  const originalUrl = !imgErr1 ? mediaUrl(originalAtt) : null;
  const proofUrl    = !imgErr2 ? mediaUrl(proofAtt)    : null;
  const isResolved  = report.status === "RESOLVED";
  const canEdit     = report.status === "PENDING" || report.status === "DECLINED";
  const canDelete   = report.status === "PENDING" || report.status === "DECLINED";

  const loadComments = useCallback(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${BASE_URL}/api/v1/reports/${report.id}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setComments(arr);
        setUnread(arr.filter((c) => c.user?.role === "admin").length);
      })
      .catch(() => {});
  }, [report.id]);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
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
      if (!res.ok) throw new Error();
      setShowDeleteConfirm(false);
      onDelete(report.id);
      onClose();
    } catch {
      setDeleteLoading(false);
    }
  };

  const TABS = [
    { id: "details",  label: "Details",  Icon: FileText },
    { id: "timeline", label: "Timeline", Icon: Clock },
    { id: "media",    label: "Media",    Icon: Image },
    { id: "messages", label: "Messages", Icon: MessageSquare, badge: unread },
  ];

  return (
    <>
      <div className="s2f-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="sub-modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="sub-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>

          {/* Header */}
          <div className="sub-modal-header">
            <div>
              <h2 id="modal-title" className="sub-modal-title">Report #{report.id}</h2>
              <p className="sub-modal-subtitle">
                <MapPin size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden="true" />
                {report.barangay ?? report.street_name ?? "—"}
              </p>
            </div>
            <div className="sub-modal-header-right">
              <span className={`badge badge-${toClass(report.status ?? "")}`}>
                {STATUS_LABEL[report.status] ?? report.status ?? "—"}
              </span>
              <div className="sub-modal-actions-row">
                {canEdit && (
                  <button className="sub-modal-action-btn sub-action-edit" onClick={() => onEdit(report)}>
                    <Pencil size={12} /> Edit
                  </button>
                )}
                {canDelete && (
                  <button className="sub-modal-action-btn sub-action-delete" onClick={() => setShowDeleteConfirm(true)}>
                    <Trash2 size={12} /> Withdraw
                  </button>
                )}
                <button className="sub-modal-action-btn sub-action-share" onClick={handleShare}>
                  <Share2 size={12} /> Share
                </button>
                {shareMsg && <span className="sub-share-msg">{shareMsg}</span>}
              </div>
            </div>
          </div>

          {/* Status Progress */}
          <StatusProgress status={report.status} />

          {/* Tabs */}
          <div className="sub-modal-tabs" role="tablist">
            {TABS.map(({ id, label, Icon, badge }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                className={`sub-modal-tab ${activeTab === id ? "active" : ""}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
                {badge > 0 && <span className="sub-tab-badge">{badge}</span>}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="sub-modal-body">

            {/* ── Details ── */}
            {activeTab === "details" && (
              <div>
                <div className="sub-detail-grid">
                  {[
                    { key: "Damage Type", val: report.ai_damage_type ?? "—", Icon: FileText },
                    { key: "Severity",    val: report.ai_severity ?? "—",    Icon: AlertTriangle },
                    { key: "Submitted",   val: fmtDate(report.created_at),   Icon: Clock },
                    { key: "Barangay",    val: report.barangay ?? "—",        Icon: MapPin },
                    { key: "Street",      val: report.street_name ?? "—",     Icon: MapPin },
                    ...(report.upvote_count > 0 ? [{ key: "Upvotes", val: `${report.upvote_count} people`, Icon: ThumbsUp }] : []),
                  ].map(({ key, val, Icon }) => (
                    <div key={key} className="sub-detail-item">
                      <span className="sub-detail-key"><Icon size={12} aria-hidden="true" />{key}</span>
                      <span className={`sub-detail-val ${key === "Severity" ? `sev-chip sev-${toClass(report.ai_severity ?? "")}` : ""}`}>
                        {val}
                      </span>
                    </div>
                  ))}
                  {report.ai_confidence != null && (
                    <div className="sub-detail-item" style={{ gridColumn: "span 2" }}>
                      <span className="sub-detail-key"><Bot size={12} aria-hidden="true" />AI Confidence</span>
                      <div className="sub-confidence-wrap">
                        <span className="sub-confidence-text">{(report.ai_confidence * 100).toFixed(1)}%</span>
                        <div className="sub-confidence-track">
                          <span className="sub-confidence-fill" style={{ width: `${(report.ai_confidence * 100).toFixed(0)}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {report.description && (
                  <div className="sub-detail-description">
                    <span className="sub-detail-key"><Info size={12} aria-hidden="true" />Description</span>
                    <p>{report.description}</p>
                  </div>
                )}

                <AITooltip report={report} />

                {report.status === "DECLINED" && report.decline_reason && (
                  <div className="sub-decline-reason" role="alert">
                    <ShieldX size={16} aria-hidden="true" />
                    <div><strong>Decline Reason:</strong> {report.decline_reason}</div>
                  </div>
                )}

                {report.is_flagged_fake && (
                  <div className="sub-ai-flag-badge" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    Flagged as possibly AI-generated — pending admin review
                  </div>
                )}
              </div>
            )}

            {/* ── Timeline ── */}
            {activeTab === "timeline" && <ReportTimeline report={report} />}

            {/* ── Media ── */}
            {activeTab === "media" && (
              <div className="sub-tab-media">
                <div className="sub-media-block">
                  <p className="sub-media-label"><Image size={14} aria-hidden="true" />Damage Evidence</p>
                  <div className="sub-modal-media">
                    {originalUrl ? (
                      originalAtt.media_type === "video" ? (
                        <video src={originalUrl} controls />
                      ) : (
                        <img
                          src={originalUrl}
                          alt="Damage evidence"
                          className="sub-zoomable"
                          onClick={() => setLightboxSrc(originalUrl)}
                          onError={() => setImgErr1(true)}
                        />
                      )
                    ) : (
                      <div className="sub-no-media">
                        <Image size={28} aria-hidden="true" />
                        No media uploaded
                      </div>
                    )}
                  </div>
                  {originalUrl && (
                    <p className="sub-zoom-hint">
                      <ZoomIn size={12} aria-hidden="true" /> Click image to expand
                    </p>
                  )}
                </div>

                {isResolved && (
                  <div className="sub-media-block">
                    <p className="sub-media-label"><Wrench size={14} aria-hidden="true" />Repair Proof</p>
                    <div className="sub-modal-media">
                      {proofUrl ? (
                        proofAtt.media_type === "video" ? (
                          <video src={proofUrl} controls />
                        ) : (
                          <img
                            src={proofUrl}
                            alt="Repair proof"
                            className="sub-zoomable"
                            onClick={() => setLightboxSrc(proofUrl)}
                            onError={() => setImgErr2(true)}
                          />
                        )
                      ) : (
                        <div className="sub-no-media">
                          <Image size={28} aria-hidden="true" />
                          No repair photo uploaded
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Messages ── */}
            {activeTab === "messages" && (
              <div className="sub-tab-messages">
                <NoteComposer reportId={report.id} onSent={loadComments} />
                {comments.length > 0 ? (
                  <div className="sub-comments-thread">
                    <p className="sub-thread-label">Thread ({comments.length})</p>
                    {comments.map((c) => {
                      const isAdmin = c.user?.role === "admin";
                      return (
                        <div key={c.id} className={`sub-comment-bubble ${isAdmin ? "sub-admin-bubble" : "sub-user-bubble"}`}>
                          <div className="sub-bubble-header">
                            <span className="sub-bubble-author">
                              {isAdmin
                                ? <><ShieldX size={12} aria-hidden="true" /> Admin</>
                                : c.user?.full_name ?? "You"
                              }
                            </span>
                            <span className="sub-bubble-date">{fmtDT(c.created_at)}</span>
                          </div>
                          <p className="sub-bubble-text">{c.content}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sub-no-messages">
                    <MessageSquare size={24} aria-hidden="true" />
                    No messages yet. Send a note to start the conversation.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxSrc && (
        <Lightbox src={lightboxSrc} alt="Full preview" onClose={() => setLightboxSrc(null)} />
      )}

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

/* ──────────────────────────────────────────────────────────
   MOBILE CARD
────────────────────────────────────────────────────────── */
function ReportCard({ report, onView }) {
  const [imgError, setImgError] = useState(false);
  const att      = report.media_attachments?.[0];
  const thumbUrl = !imgError ? mediaUrl(att) : null;

  return (
    <div
      className="sub-report-card"
      onClick={() => onView(report)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(report); } }}
      role="button"
      aria-label={`View report #${report.id}`}
    >
      <div className="sub-card-thumb">
        {thumbUrl ? (
          att.media_type === "video"
            ? <Video size={22} aria-hidden="true" />
            : <img src={thumbUrl} alt="Report thumbnail" onError={() => setImgError(true)} />
        ) : (
          <Image size={22} aria-hidden="true" />
        )}
      </div>
      <div className="sub-card-body">
        <div className="sub-card-top">
          <span className="sub-card-id">#{report.id}</span>
          <span className={`badge badge-${toClass(report.status ?? "")}`}>
            {STATUS_LABEL[report.status] ?? "—"}
          </span>
        </div>
        <p className="sub-card-location">{report.barangay ?? report.street_name ?? "—"}</p>
        <div className="sub-card-meta">
          <span className="sub-card-type">{report.ai_damage_type ?? "—"}</span>
          <span className={`sev-chip sev-${toClass(report.ai_severity ?? "")}`}>
            {report.ai_severity ?? "—"}
          </span>
        </div>
        <div className="sub-card-footer">
          <span className="sub-card-date">{fmtDate(report.created_at)}</span>
          {report.upvote_count > 0 && (
            <span className="sub-card-upvotes">
              <ThumbsUp size={12} aria-hidden="true" /> {report.upvote_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   TABLE ROW (DESKTOP)
────────────────────────────────────────────────────────── */
function TableRow({ report, onView }) {
  const [imgError, setImgError] = useState(false);
  const att      = report.media_attachments?.[0];
  const thumbUrl = !imgError ? mediaUrl(att) : null;

  return (
    <tr
      className="sub-table-row"
      onClick={() => onView(report)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(report); } }}
    >
      <td className="sub-thumb-cell">
        <div className="sub-row-thumb">
          {thumbUrl ? (
            att.media_type === "video"
              ? <Video size={18} aria-hidden="true" />
              : <img src={thumbUrl} alt="" onError={() => setImgError(true)} />
          ) : (
            <Image size={18} aria-hidden="true" />
          )}
        </div>
      </td>
      <td>
        <strong className="sub-report-id">#{report.id}</strong>
        <div className="sub-report-loc">{report.barangay ?? report.street_name ?? "—"}</div>
      </td>
      <td>{report.ai_damage_type ?? "—"}</td>
      <td>
        <span className={`sev-chip sev-${toClass(report.ai_severity ?? "")}`}>
          {report.ai_severity ?? "—"}
        </span>
      </td>
      <td>
        <span className={`badge badge-${toClass(report.status ?? "")}`}>
          {STATUS_LABEL[report.status] ?? "—"}
        </span>
      </td>
      <td style={{ color: "var(--text-muted)", fontSize: "0.83rem" }}>
        {fmtDate(report.created_at)}
      </td>
      <td>
        {report.upvote_count > 0 && (
          <span style={{ color: "var(--primary)", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}>
            <ThumbsUp size={13} aria-hidden="true" /> {report.upvote_count}
          </span>
        )}
      </td>
    </tr>
  );
}

/* ──────────────────────────────────────────────────────────
   EMPTY STATE
────────────────────────────────────────────────────────── */
function EmptyState({ hasFilters, onClear }) {
  return (
    <div className="sub-empty-state">
      <div className="sub-empty-icon">
        <FileText size={32} />
      </div>
      {hasFilters ? (
        <>
          <h3>No reports match your filters</h3>
          <p>Try adjusting your search or filter criteria.</p>
          <button className="sub-empty-action" onClick={onClear}>
            <RotateCcw size={14} /> Clear Filters
          </button>
        </>
      ) : (
        <>
          <h3>No reports yet</h3>
          <p>Be the first to report road damage in your area and help improve your community.</p>
          <a href="/submit-report" className="sub-empty-action">
            <FileText size={14} /> Report Road Damage
          </a>
        </>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MAIN COMPONENT
────────────────────────────────────────────────────────── */
function MySubmissions() {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [typeFilter, setTypeFilter]     = useState("All");
  const [sevFilter, setSevFilter]       = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch]             = useState("");
  const [sortBy, setSortBy]             = useState("newest");
  const [selectedReport, setSelectedReport] = useState(null);
  const [viewMode, setViewMode]         = useState("list");
  const searchRef = useRef(null);

  const { reports, loading, error, page, setPage, total, refetch } = useReports({
    mine: true,
    status: statusFilter !== "All" ? statusFilter : null,
  });

  const processed = useMemo(() => {
    let arr = [...reports];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter((r) =>
        String(r.id).includes(q) ||
        (r.barangay ?? "").toLowerCase().includes(q) ||
        (r.street_name ?? "").toLowerCase().includes(q) ||
        (r.ai_damage_type ?? "").toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "All") arr = arr.filter((r) => (r.ai_damage_type ?? "").toLowerCase() === typeFilter.toLowerCase());
    if (sevFilter  !== "All") arr = arr.filter((r) => (r.ai_severity   ?? "").toLowerCase() === sevFilter.toLowerCase());
    arr.sort((a, b) => {
      if (sortBy === "newest")   return new Date(b.created_at) - new Date(a.created_at);
      if (sortBy === "oldest")   return new Date(a.created_at) - new Date(b.created_at);
      if (sortBy === "severity") return (SEVERITY_ORDER[b.ai_severity?.toLowerCase()] ?? 0) - (SEVERITY_ORDER[a.ai_severity?.toLowerCase()] ?? 0);
      if (sortBy === "upvotes")  return (b.upvote_count ?? 0) - (a.upvote_count ?? 0);
      return 0;
    });
    return arr;
  }, [reports, search, typeFilter, sevFilter, sortBy]);

  const handleStatusChange = useCallback((val) => { setStatusFilter(val); setPage(1); }, [setPage]);

  const handleReset = () => {
    setTypeFilter("All"); setSevFilter("All");
    handleStatusChange("All"); setSearch(""); setSortBy("newest");
  };

  const hasActiveFilters = typeFilter !== "All" || sevFilter !== "All" || statusFilter !== "All" || search.trim();

  const stats = useMemo(() => ({
    pending:    reports.filter((r) => r.status === "PENDING").length,
    verified:   reports.filter((r) => r.status === "VERIFIED").length,
    inProgress: reports.filter((r) => r.status === "IN_PROGRESS").length,
    resolved:   reports.filter((r) => r.status === "RESOLVED").length,
  }), [reports]);

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      {sidebarOpen && (
        <div className="sidebar-overlay active" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <main className="submissions-page">
        <div className="submissions-inner">

          {/* ── Header Card ── */}
          <div className="submissions-header-card">
            <div className="sub-header-top">
              <div className="sub-header-title-group">
                <div className="sub-header-icon-wrap" aria-hidden="true">
                  <FileText size={22} />
                </div>
                <div>
                  <h1 className="sub-page-title">My Reports</h1>
                  <p className="sub-page-subtitle">
                    {total} submission{total !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <div className="sub-header-controls">
                <div className="sub-view-toggle" role="group" aria-label="View mode">
                  <button
                    className={`sub-view-btn ${viewMode === "list" ? "active" : ""}`}
                    onClick={() => setViewMode("list")}
                    aria-pressed={viewMode === "list"}
                  >
                    <LayoutList size={15} aria-hidden="true" /> List
                  </button>
                  <button
                    className={`sub-view-btn ${viewMode === "map" ? "active" : ""}`}
                    onClick={() => setViewMode("map")}
                    aria-pressed={viewMode === "map"}
                  >
                    <Map size={15} aria-hidden="true" /> Map
                  </button>
                </div>
              </div>
            </div>

            {/* Mini Stats */}
            <div className="sub-mini-stats">
              {[
                { cls: "stat-pending",  count: stats.pending,    label: "Pending" },
                { cls: "stat-verified", count: stats.verified,   label: "Verified" },
                { cls: "stat-progress", count: stats.inProgress, label: "In Progress" },
                { cls: "stat-resolved", count: stats.resolved,   label: "Resolved" },
              ].map(({ cls, count, label }) => (
                <div key={label} className={`sub-mini-stat ${cls}`}>
                  <span className="sub-mini-stat-count">{count}</span>
                  <span className="sub-mini-stat-label">{label}</span>
                </div>
              ))}
            </div>

            {/* Search + Sort */}
            <div className="sub-search-sort-row">
              <div className="sub-search-wrapper">
                <Search size={16} className="sub-search-icon" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  className="sub-search-input"
                  placeholder="Search by ID, location, or type…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search reports"
                />
                {search && (
                  <button className="sub-search-clear" onClick={() => setSearch("")} aria-label="Clear search">
                    <X size={15} />
                  </button>
                )}
              </div>
              <div className="sub-sort-wrapper">
                <SlidersHorizontal size={15} className="sub-sort-label" aria-hidden="true" />
                <select
                  className="sub-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  aria-label="Sort reports"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="severity">Highest Severity</option>
                  <option value="upvotes">Most Upvotes</option>
                </select>
              </div>
            </div>

            {/* Filters */}
            <div className="sub-filters-row">
              <div className="sub-filter-group">
                <label className="sub-filter-label">Type</label>
                <div className="sub-filter-chips">
                  {["All", "Crack", "Pothole"].map((t) => (
                    <button
                      key={t}
                      className={`sub-chip ${typeFilter === t ? "chip-active" : ""}`}
                      onClick={() => setTypeFilter(t)}
                      aria-pressed={typeFilter === t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sub-filter-group">
                <label className="sub-filter-label">Severity</label>
                <div className="sub-filter-chips">
                  {["All", "low", "moderate", "high", "critical"].map((s) => (
                    <button
                      key={s}
                      className={`sub-chip ${sevFilter === s ? "chip-active" : ""} ${s !== "All" ? `sev-${s}` : ""}`}
                      onClick={() => setSevFilter(s)}
                      aria-pressed={sevFilter === s}
                    >
                      {s === "All" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sub-filter-group">
                <label className="sub-filter-label">Status</label>
                <select
                  className="sub-status-select"
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

              {hasActiveFilters && (
                <button className="sub-reset-btn" onClick={handleReset}>
                  <RotateCcw size={13} /> Reset
                </button>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="s2f-error-banner" role="alert">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} aria-hidden="true" /> {error}
              </span>
              <button onClick={refetch} className="s2f-retry-btn">Retry</button>
            </div>
          )}

          {/* Map View */}
          {viewMode === "map" && (
            <div className="sub-map-placeholder">
              <Map size={42} aria-hidden="true" />
              <p>Map view coming soon — your reports will appear here as pins.</p>
              <button className="sub-empty-action" onClick={() => setViewMode("list")}>
                <LayoutList size={14} /> Back to List
              </button>
            </div>
          )}

          {viewMode === "list" && (
            <>
              {/* Desktop Table */}
              <div className="sub-table-wrapper">
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 0" }}>
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton-row" />)}
                  </div>
                ) : (
                  <table className="sub-table" aria-label="My reports">
                    <thead>
                      <tr>
                        <th scope="col">Evidence</th>
                        <th scope="col">Report</th>
                        <th scope="col">Type</th>
                        <th scope="col">Severity</th>
                        <th scope="col">Status</th>
                        <th scope="col">Date</th>
                        <th scope="col">Upvotes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processed.length > 0 ? (
                        processed.map((r) => (
                          <TableRow key={r.id} report={r} onView={setSelectedReport} />
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="sub-no-data">
                            <EmptyState hasFilters={hasActiveFilters} onClear={handleReset} />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Mobile Cards */}
              <div className="sub-mobile-cards">
                {loading ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-row" style={{ height: 90 }} />)}
                  </div>
                ) : processed.length > 0 ? (
                  processed.map((r) => (
                    <ReportCard key={r.id} report={r} onView={setSelectedReport} />
                  ))
                ) : (
                  <EmptyState hasFilters={hasActiveFilters} onClear={handleReset} />
                )}
              </div>
            </>
          )}

          {!loading && <Pagination page={page} setPage={setPage} total={total} pageSize={15} />}
        </div>
      </main>

      {selectedReport && (
        <ReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onDelete={() => refetch()}
          onEdit={(r) => console.log("Edit:", r.id)}
        />
      )}
    </>
  );
}

export default MySubmissions;