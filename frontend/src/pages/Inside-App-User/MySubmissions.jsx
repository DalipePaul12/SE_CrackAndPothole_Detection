import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import "./MySubmissions.css";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useReports } from "../../hooks/useReports";
import { useReportSummary } from "../../hooks/useReportSummary";
import { useReportStats } from "../../hooks/useReportStats";
import { updateReport } from "../../api/reports";
import { normalizeStatus } from "../../utils/normalizeStatus";
import {
  FileText, LayoutList, Map, Search, X, SlidersHorizontal,
  RotateCcw, AlertTriangle, Image, Video, ThumbsUp,
  ChevronLeft, ChevronRight, CircleCheck, Clock, Wrench,
  Send, FileSearch, Trash2, Pencil, Share2, Bot, ZoomIn,
  MessageSquare, Info, ShieldX, CheckCheck, MapPin, ChevronDown,
  Sparkles,
} from "lucide-react";

const BASE_URL  = import.meta.env.VITE_API_URL || "";
const toClass   = (str = "") => str.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");
const fmtDate   = (iso) => iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const fmtDT     = (iso) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const mediaUrl  = (att) => att?.file_url ? `${BASE_URL}${att.file_url}` : null;

const STATUS_LABEL  = { PENDING: "Pending", IN_PROGRESS: "In Progress", VERIFIED: "Verified", RESOLVED: "Resolved", DECLINED: "Declined" };
const STATUS_STEPS  = ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED"];
const SEVERITY_ORDER = { critical: 1, non_critical: 0 };

// ── Map marker setup (same visual language as MapView.jsx) ──────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const SUB_MAP_CENTER = [14.6615, 120.966];

const makeSubMarkerIcon = (color) =>
  L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 54" width="34" height="46">
      <circle cx="20" cy="20" r="13" fill="${color}" stroke="#fff" stroke-width="2.5"/>
      <circle cx="20" cy="20" r="5.5" fill="#fff" opacity="0.95"/>
      <path d="M20 35 L13.5 23 Q20 9 26.5 23 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
    className: "",
    iconSize:    [34, 46],
    iconAnchor:  [17, 44],
    popupAnchor: [0, -46],
  });

const SUB_MAP_ICONS = {
  critical:     makeSubMarkerIcon("#ef4444"),
  non_critical: makeSubMarkerIcon("#f59e0b"),
  unknown:      makeSubMarkerIcon("#6b7280"),
};

const getSubMapIcon = (r) =>
  SUB_MAP_ICONS[(r.ai_severity || "").toLowerCase()] || SUB_MAP_ICONS.unknown;

function StatusProgress({ status: rawStatus }) {
  const status = normalizeStatus(rawStatus);
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

function Pagination({ page, setPage, total, pageSize = 15 }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return (
    <div className="s2f-pagination">
      <button className="s2f-page-btn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
        <ChevronLeft size={15} /> Prev
      </button>
      <span className="s2f-page-info">Page {page} of {totalPages} &middot; {total} report{total !== 1 ? "s" : ""}</span>
      <button className="s2f-page-btn" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}

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
        placeholder="Ask about your report, provide more details, or follow up..."
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
          {sending ? "Sending..." : "Send Message"}
        </button>
      </div>
    </div>
  );
}

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
            The model analyzed visual patterns in the uploaded image to classify this as <em>{type}</em> with <em>{sev}</em> severity.
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

// ── AI Summary card ────────────────────────────────────────────────────────
// Shows a cached ai_summary if present; otherwise offers a "Generate" action
// that hits POST /reports/{id}/summary via useReportSummary. On success it
// calls onGenerated so the parent can lift the new summary into local state
// (avoids losing it if the modal is closed before a full refetch happens).
function AISummaryCard({ report, onGenerated }) {
  const { summary, loading, error, fetchSummary } = useReportSummary(report.id);
  const displaySummary = summary ?? report.ai_summary ?? null;

  const handleGenerate = async () => {
    const ok = await fetchSummary();
    if (ok) {
      // fetchSummary sets internal `summary` state already; also bubble up
      // so MySubmissions can patch its reports list without a full refetch.
      onGenerated?.(report.id);
    }
  };

  if (displaySummary) {
    return (
      <div className="sub-ai-summary-card">
        <p className="sub-ai-summary-label">
          <Sparkles size={13} aria-hidden="true" /> AI Summary
        </p>
        <p className="sub-ai-summary-text">{displaySummary}</p>
      </div>
    );
  }

  return (
    <div className="sub-ai-summary-card sub-ai-summary-empty">
      <div className="sub-ai-summary-empty-body">
        <Sparkles size={16} aria-hidden="true" />
        <span>Get a plain-language AI summary of this report.</span>
      </div>
      <button className="sub-ai-summary-btn" onClick={handleGenerate} disabled={loading}>
        {loading ? "Generating…" : "Generate Summary"}
      </button>
      {error && <p className="sub-ai-summary-err">{error}</p>}
    </div>
  );
}

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

function DeleteConfirmModal({ report, onConfirm, onCancel, loading, error }) {
  return (
    <div className="s2f-modal-overlay" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div className="sub-confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="del-title">Withdraw Report?</h3>
        <p>Are you sure you want to withdraw <strong>Report #{report.id}</strong>? This cannot be undone.</p>
        {error && (
          <p role="alert" style={{ color: "var(--danger)", fontSize: "0.82rem", fontWeight: 600, margin: "0 0 10px" }}>
            {error}
          </p>
        )}
        <div className="sub-confirm-actions">
          <button className="sub-cancel-btn" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="sub-delete-btn" onClick={onConfirm} disabled={loading}>
            {loading ? "Withdrawing..." : "Yes, Withdraw"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ report, onClose, onDelete, onEdit, onUpdated, onSummaryGenerated, initialTab = "details" }) {
  const [comments, setComments]           = useState([]);
  const [lightboxSrc, setLightboxSrc]     = useState(null);
  const [imgErr1, setImgErr1]             = useState(false);
  const [imgErr2, setImgErr2]             = useState(false);
  const [activeTab, setActiveTab]         = useState(initialTab);
  const [unread, setUnread]               = useState(0);
  const [unreadAdmin, setUnreadAdmin]     = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError]     = useState("");
  const [shareMsg, setShareMsg]           = useState("");

  const [isEditing, setIsEditing]     = useState(false);
  const [editForm, setEditForm]       = useState({ barangay: "", street_name: "", description: "" });
  const [editSaving, setEditSaving]   = useState(false);
  const [editError, setEditError]     = useState("");
  const [editSuccess, setEditSuccess] = useState("");
  const [liveReport, setLiveReport]   = useState(report);

  useEffect(() => { setLiveReport(report); }, [report]);

  const originalAtt = liveReport.media_attachments?.[0];
  const proofAtt    = liveReport.media_attachments?.[1];
  const originalUrl = !imgErr1 ? mediaUrl(originalAtt) : null;
  const proofUrl    = !imgErr2 ? mediaUrl(proofAtt)    : null;
  const liveStatus  = normalizeStatus(liveReport.status);
  const isResolved  = liveStatus === "RESOLVED";
  const canEdit     = liveStatus === "PENDING" || liveStatus === "DECLINED";
  const canDelete   = liveStatus === "PENDING" || liveStatus === "DECLINED";

  const startEdit = () => {
    setEditForm({
      barangay:    liveReport.barangay ?? "",
      street_name: liveReport.street_name ?? "",
      description: liveReport.description ?? "",
    });
    setEditError("");
    setEditSuccess("");
    setIsEditing(true);
    setActiveTab("details");
    onEdit?.(liveReport);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditError("");
  };

  const saveEdit = async () => {
    setEditSaving(true);
    setEditError("");
    const res = await updateReport(liveReport.id, {
      barangay:    editForm.barangay.trim(),
      street_name: editForm.street_name.trim(),
      description: editForm.description.trim(),
    });
    setEditSaving(false);
    if (!res.success) {
      setEditError(res.error ?? "Failed to save changes.");
      return;
    }
    // Normalize casing so it matches everywhere else this page compares or
    // displays status (canEdit/canDelete/labels/progress) — see
    // src/utils/normalizeStatus.js.
    const updated = {
      ...liveReport,
      ...res.data,
      status: normalizeStatus(res.data?.status ?? liveReport.status),
    };
    setLiveReport(updated);
    setIsEditing(false);
    setEditSuccess("Report updated successfully.");
    setTimeout(() => setEditSuccess(""), 3000);
    onUpdated?.(updated);
  };

  const loadComments = useCallback(() => {
    const token = localStorage.getItem("access_token");
    fetch(`${BASE_URL}/api/v1/reports/${report.id}/comments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        setComments(arr);
        const adminMsgs = arr.filter((c) => c.user?.role === "admin");
        setUnread(adminMsgs.length);
        setUnreadAdmin(adminMsgs.filter((c) => !c.is_read).length);
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
    const url = `${window.location.origin}/reports/${liveReport.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setShareMsg("Link copied!");
      setTimeout(() => setShareMsg(""), 2500);
    });
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    setDeleteError("");
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${BASE_URL}/api/v1/reports/${liveReport.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let detail = "Failed to withdraw report.";
        try {
          const body = await res.json();
          detail = body?.detail ?? detail;
        } catch { /* no JSON body */ }
        throw new Error(detail);
      }
      setShowDeleteConfirm(false);
      onDelete(liveReport.id);
      onClose();
    } catch (err) {
      setDeleteLoading(false);
      setDeleteError(err.message || "Failed to withdraw report.");
    }
  };

  const TABS = [
    { id: "details",  label: "Details",  Icon: FileText },
    { id: "timeline", label: "Timeline", Icon: Clock },
    { id: "media",    label: "Media",    Icon: Image },
    { id: "messages", label: "Updates", Icon: MessageSquare, badge: unreadAdmin > 0 ? unreadAdmin : unread > 0 ? unread : null },
  ];

  return (
    <>
      <div className="s2f-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="sub-modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="sub-modal-close-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>

          <div className="sub-modal-header">
            <div>
              <h2 id="modal-title" className="sub-modal-title">Report #{liveReport.id}</h2>
              <p className="sub-modal-subtitle">
                <MapPin size={12} style={{ display: "inline", marginRight: 4 }} aria-hidden="true" />
                {liveReport.barangay ?? liveReport.street_name ?? "—"}
              </p>
            </div>
            <div className="sub-modal-header-right">
              <span className={`badge badge-${toClass(liveStatus ?? "")}`}>
                {STATUS_LABEL[liveStatus] ?? liveStatus ?? "—"}
              </span>
              <div className="sub-modal-actions-row">
                {canEdit && !isEditing && (
                  <button className="sub-modal-action-btn sub-action-edit" onClick={startEdit}>
                    <Pencil size={12} /> Edit
                  </button>
                )}
                {canDelete && !isEditing && (
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

          {editSuccess && (
            <div className="sub-edit-success" role="status" style={{
              background: "var(--success-bg, #e6f7ee)", border: "1px solid var(--success-border, #34c98a)",
              color: "var(--success, #1e8f5f)", borderRadius: "var(--radius-lg)", padding: "10px 14px",
              margin: "0 0 12px", fontSize: "0.85rem", fontWeight: 600,
            }}>
              {editSuccess}
            </div>
          )}

          <StatusProgress status={liveStatus} />

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

          <div className="sub-modal-body">

            {activeTab === "details" && isEditing && (
              <div className="sub-edit-form">
                {editError && (
                  <div className="sub-decline-reason" role="alert" style={{ marginBottom: 12 }}>
                    <AlertTriangle size={16} aria-hidden="true" />
                    <div>{editError}</div>
                  </div>
                )}
                <label className="sub-detail-key" htmlFor="edit-barangay" style={{ display: "flex", marginBottom: 6 }}>
                  <MapPin size={12} aria-hidden="true" /> Barangay
                </label>
                <input
                  id="edit-barangay"
                  type="text"
                  className="sub-search-input"
                  style={{ width: "100%", marginBottom: 14 }}
                  value={editForm.barangay}
                  onChange={(e) => setEditForm((f) => ({ ...f, barangay: e.target.value }))}
                  disabled={editSaving}
                  maxLength={100}
                />

                <label className="sub-detail-key" htmlFor="edit-street" style={{ display: "flex", marginBottom: 6 }}>
                  <MapPin size={12} aria-hidden="true" /> Street name
                </label>
                <input
                  id="edit-street"
                  type="text"
                  className="sub-search-input"
                  style={{ width: "100%", marginBottom: 14 }}
                  value={editForm.street_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, street_name: e.target.value }))}
                  disabled={editSaving}
                  maxLength={200}
                />

                <label className="sub-detail-key" htmlFor="edit-description" style={{ display: "flex", marginBottom: 6 }}>
                  <Info size={12} aria-hidden="true" /> Description
                </label>
                <textarea
                  id="edit-description"
                  className="sub-note-textarea"
                  style={{ width: "100%", minHeight: 100, marginBottom: 16 }}
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  disabled={editSaving}
                  maxLength={1000}
                />

                <div className="sub-confirm-actions">
                  <button className="sub-cancel-btn" onClick={cancelEdit} disabled={editSaving}>Cancel</button>
                  <button className="sub-modal-action-btn sub-action-edit" onClick={saveEdit} disabled={editSaving}>
                    {editSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "details" && !isEditing && (
              <div>
                <div className="sub-detail-grid">
                  {[
                    { key: "Damage Type", val: liveReport.ai_damage_type ?? "—", Icon: FileText },
                    { key: "Severity",    val: liveReport.ai_severity ?? "—",    Icon: AlertTriangle },
                    { key: "Submitted",   val: fmtDate(liveReport.created_at),   Icon: Clock },
                    { key: "Barangay",    val: liveReport.barangay ?? "—",        Icon: MapPin },
                    { key: "Street",      val: liveReport.street_name ?? "—",     Icon: MapPin },
                    ...(liveReport.upvote_count > 0 ? [{ key: "Upvotes", val: `${liveReport.upvote_count} people`, Icon: ThumbsUp }] : []),
                  ].map(({ key, val, Icon }) => (
                    <div key={key} className="sub-detail-item">
                      <span className="sub-detail-key"><Icon size={12} aria-hidden="true" />{key}</span>
                      <span className={`sub-detail-val ${key === "Severity" ? `sev-chip sev-${toClass(liveReport.ai_severity ?? "")}` : ""}`}>
                        {val}
                      </span>
                    </div>
                  ))}
                  {liveReport.ai_confidence != null && (
                    <div className="sub-detail-item" style={{ gridColumn: "span 2" }}>
                      <span className="sub-detail-key"><Bot size={12} aria-hidden="true" />AI Confidence</span>
                      <div className="sub-confidence-wrap">
                        <span className="sub-confidence-text">{(liveReport.ai_confidence * 100).toFixed(1)}%</span>
                        <div className="sub-confidence-track">
                          <span className="sub-confidence-fill" style={{ width: `${(liveReport.ai_confidence * 100).toFixed(0)}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {liveReport.description && (
                  <div className="sub-detail-description">
                    <span className="sub-detail-key"><Info size={12} aria-hidden="true" />Description</span>
                    <p>{liveReport.description}</p>
                  </div>
                )}

                <AISummaryCard report={liveReport} onGenerated={onSummaryGenerated} />

                <AITooltip report={liveReport} />

                {liveStatus === "DECLINED" && liveReport.decline_reason && (
                  <div className="sub-decline-reason" role="alert">
                    <ShieldX size={16} aria-hidden="true" />
                    <div><strong>Decline Reason:</strong> {liveReport.decline_reason}</div>
                  </div>
                )}

                {liveReport.is_flagged_fake && (
                  <div className="sub-ai-flag-badge" role="alert">
                    <AlertTriangle size={16} aria-hidden="true" />
                    Flagged as possibly AI-generated — pending admin review
                  </div>
                )}
              </div>
            )}

            {activeTab === "timeline" && <ReportTimeline report={liveReport} />}

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

            {activeTab === "messages" && (
              <div className="sub-tab-messages">

              {comments.filter(c => c.user?.role === "admin").length > 0 && (
                <div style={{
                  background: "var(--info-bg)",
                  border: "1px solid var(--info-border)",
                  borderRadius: "var(--radius-lg)",
                  padding: "14px",
                  marginBottom: "4px",
                }}>
                  <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--info)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                    <MessageSquare size={13} /> Updates from Admin
                  </p>
                  {comments.filter(c => c.user?.role === "admin").map((c) => (
                    <div key={c.id} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--info-border)" }}>
                      <p style={{ margin: "0 0 3px", fontWeight: 700, fontSize: "0.87rem", color: "var(--text)" }}>{c.title ?? ""}</p>
                      <p style={{ margin: "0 0 5px", fontSize: "0.86rem", color: "var(--subtext)", lineHeight: 1.5 }}>{c.content}</p>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{fmtDT(c.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

              {comments.filter(c => c.user?.role === "admin").length === 0 && (
                <div style={{
                  background: "var(--bg-secondary)",
                  border: "1px dashed var(--border-strong)",
                  borderRadius: "var(--radius-lg)",
                  padding: "16px",
                  textAlign: "center",
                  marginBottom: "4px",
                  color: "var(--text-muted)",
                  fontSize: "0.84rem",
                }}>
                  <MessageSquare size={20} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <p style={{ margin: 0 }}>No updates from admin yet.</p>
                  <p style={{ margin: "4px 0 0", fontSize: "0.76rem" }}>Estimated review time: 24-48 hours.</p>
                </div>
              )}

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

                <NoteComposer reportId={report.id} onSent={loadComments} />
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
          report={liveReport}
          onConfirm={handleDelete}
          onCancel={() => { setShowDeleteConfirm(false); setDeleteError(""); }}
          loading={deleteLoading}
          error={deleteError}
        />
      )}
    </>
  );
}

function ReportCard({ report, onView }) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const att      = report.media_attachments?.[0];
  const thumbUrl = !imgError ? mediaUrl(att) : null;
  const status   = normalizeStatus(report.status);
  const trackable = status === "IN_PROGRESS" || status === "RESOLVED";

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
          <span className={`badge badge-${toClass(status ?? "")}`}>
            {STATUS_LABEL[status] ?? "—"}
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
          <div className="sub-card-footer-right">
            {report.upvote_count > 0 && (
              <span className="sub-card-upvotes">
                <ThumbsUp size={12} aria-hidden="true" /> {report.upvote_count}
              </span>
            )}
            {trackable && (
              <button
                className="sub-track-btn"
                onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/submissions/${report.id}/track`); }}
                aria-label={`Track project for report #${report.id}`}
              >
                Track →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TableRow({ report, onView }) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const att      = report.media_attachments?.[0];
  const thumbUrl = !imgError ? mediaUrl(att) : null;
  const status   = normalizeStatus(report.status);
  const trackable = status === "IN_PROGRESS" || status === "RESOLVED";

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
        <span className={`badge badge-${toClass(status ?? "")}`}>
          {STATUS_LABEL[status] ?? "—"}
        </span>
      </td>
      <td style={{ color: "var(--text-muted)", fontSize: "0.83rem" }}>
        {fmtDate(report.created_at)}
      </td>
      <td>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
          {report.upvote_count > 0 && (
            <span style={{ color: "var(--primary)", fontWeight: 600, fontSize: "0.82rem", display: "flex", alignItems: "center", gap: 4 }}>
              <ThumbsUp size={13} aria-hidden="true" /> {report.upvote_count}
            </span>
          )}
          {trackable && (
            <button
              className="sub-track-btn"
              onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/submissions/${report.id}/track`); }}
              aria-label={`Track project for report #${report.id}`}
            >
              Track →
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

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

function FilterDrawer({ typeFilter, setTypeFilter, sevFilter, setSevFilter, statusFilter, handleStatusChange, hasActiveFilters, handleReset }) {
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
    }
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  return (
    <div className="sub-filter-drawer-wrap" ref={drawerRef}>
      <button
        className={`sub-filter-toggle-btn ${hasActiveFilters ? "has-active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="filter-drawer-panel"
      >
        <SlidersHorizontal size={15} aria-hidden="true" />
        <span>Filters</span>
        <ChevronDown size={14} className={`sub-filter-chevron ${open ? "open" : ""}`} aria-hidden="true" />
        {hasActiveFilters && <span className="sub-filter-badge" />}
      </button>

      <div
        id="filter-drawer-panel"
        className={`sub-filter-drawer ${open ? "open" : ""}`}
        role="region"
        aria-label="Filter options"
      >
        <div className="sub-filter-drawer-inner">
          <div className="sub-filter-drawer-header">
            <span className="sub-filter-drawer-title">
              <SlidersHorizontal size={14} aria-hidden="true" />
              Filter Reports
            </span>
            <button
              className="sub-filter-drawer-close"
              onClick={() => setOpen(false)}
              aria-label="Close filters"
            >
              <X size={14} />
            </button>
          </div>

          <div className="sub-filter-drawer-body">
            <div className="sub-filter-drawer-group">
              <label className="sub-filter-drawer-label">Damage Type</label>
              <select
                className="sub-filter-drawer-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by damage type"
              >
                <option value="All">All Types</option>
                <option value="Crack">Crack</option>
                <option value="Pothole">Pothole</option>
              </select>
            </div>

            <div className="sub-filter-drawer-group">
              <label className="sub-filter-drawer-label">Severity</label>
              <select
                className="sub-filter-drawer-select"
                value={sevFilter === "All" ? "All" : sevFilter.charAt(0).toUpperCase() + sevFilter.slice(1)}
                onChange={(e) => setSevFilter(e.target.value === "All" ? "All" : e.target.value.toLowerCase())}
                aria-label="Filter by severity"
              >
                <option value="All">All Severity</option>
                <option value="non_critical">Non-Critical</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="sub-filter-drawer-group">
              <label className="sub-filter-drawer-label">Status</label>
              <select
                className="sub-filter-drawer-select"
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
            <div className="sub-filter-drawer-footer">
              <button className="sub-filter-drawer-reset" onClick={handleReset}>
                <RotateCcw size={13} /> Reset
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MySubmissions() {
  const [typeFilter, setTypeFilter]     = useState("All");
  const [sevFilter, setSevFilter]       = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch]             = useState("");
  const [sortBy, setSortBy]             = useState("newest");
  const [selectedReport, setSelectedReport] = useState(null);
  const [initialTab,     setInitialTab]     = useState("details");
  const [viewMode, setViewMode]         = useState("list");
  const searchRef = useRef(null);

  const { reports, loading, error, page, setPage, total, refetch } = useReports({
    mine: true
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("report_id");
    const tab      = params.get("tab") ?? "details";

    if (!reportId) return;

    window.history.replaceState({}, "", window.location.pathname);

    const open = async () => {
      const found = reports.find((r) => String(r.id) === String(reportId));
      if (found) {
        setInitialTab(tab);
        setSelectedReport(found);
        return;
      }
      try {
        const token = localStorage.getItem("access_token");
        const res = await fetch(`${BASE_URL}/api/v1/reports/${reportId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setInitialTab(tab);
          setSelectedReport(data);
        }
      } catch {}
    };

    open();
  }, []);

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

  // Reports from `processed` that have valid coordinates — used by the map view.
  const mappable = useMemo(
    () => processed.filter((r) => r.latitude && r.longitude),
    [processed]
  );

  const handleStatusChange = useCallback((val) => { setStatusFilter(val); setPage(1); }, [setPage]);

  const handleReset = () => {
    setTypeFilter("All"); setSevFilter("All");
    handleStatusChange("All"); setSearch(""); setSortBy("newest");
  };

  const hasActiveFilters = typeFilter !== "All" || sevFilter !== "All" || statusFilter !== "All" || search.trim();

  // Remote aggregate stats — independent of pagination, fetched once on mount.
  const { stats: remoteStats, loading: statsLoading } = useReportStats();

  // Called after AISummaryCard successfully generates a summary. We don't
  // have the summary text itself here (it lives in the hook's local state),
  // so we just refetch the list in the background to keep `reports` in sync
  // for the next time this report is opened or rendered in the table/cards.
  const handleSummaryGenerated = useCallback(() => {
    refetch();
  }, [refetch]);

  return (
    <>
      <main className="submissions-page">
        <div className="submissions-inner">

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

            <div className="sub-mini-stats">
              <div className="sub-mini-stat stat-total">
                <span className="sub-mini-stat-count">
                  {statsLoading ? "—" : (remoteStats?.total ?? "—")}
                </span>
                <span className="sub-mini-stat-label">Total Posts</span>
              </div>
              <div className="sub-mini-stat stat-resolved">
                <span className="sub-mini-stat-count">
                  {statsLoading ? "—" : (remoteStats?.resolved ?? "—")}
                </span>
                <span className="sub-mini-stat-label">Resolved</span>
              </div>
              <div className="sub-mini-stat stat-progress">
                <span className="sub-mini-stat-count">
                  {statsLoading ? "—" : (remoteStats?.in_progress ?? "—")}
                </span>
                <span className="sub-mini-stat-label">In Progress</span>
              </div>
              <div className="sub-mini-stat stat-score">
                <span className="sub-mini-stat-count">
                  {statsLoading ? "—" : `${remoteStats?.rep_score ?? 0}%`}
                </span>
                <span className="sub-mini-stat-label">Rep Score</span>
              </div>
            </div>

            <div className="sub-search-sort-row">
              <div className="sub-search-wrapper">
                <Search size={16} className="sub-search-icon" aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="text"
                  className="sub-search-input"
                  placeholder="Search by ID, location, or type..."
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
              <FilterDrawer
                typeFilter={typeFilter}
                setTypeFilter={setTypeFilter}
                sevFilter={sevFilter}
                setSevFilter={setSevFilter}
                statusFilter={statusFilter}
                handleStatusChange={handleStatusChange}
                hasActiveFilters={hasActiveFilters}
                handleReset={handleReset}
              />
            </div>
          </div>

          {error && (
            <div className="s2f-error-banner" role="alert">
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlertTriangle size={16} aria-hidden="true" /> {error}
              </span>
              <button onClick={refetch} className="s2f-retry-btn">Retry</button>
            </div>
          )}

          {viewMode === "map" && (
            <div className="sub-map-view">
              {loading ? (
                <div className="sub-map-placeholder">
                  <div className="skeleton-row" style={{ width: "100%", height: "100%" }} />
                </div>
              ) : mappable.length === 0 ? (
                <div className="sub-map-placeholder">
                  <Map size={42} aria-hidden="true" />
                  <p>
                    {processed.length === 0
                      ? "No reports match your current filters."
                      : "None of your reports have location data yet."}
                  </p>
                  <button className="sub-empty-action" onClick={() => setViewMode("list")}>
                    <LayoutList size={14} /> Back to List
                  </button>
                </div>
              ) : (
                <div className="sub-map-container">
                  <MapContainer
                    center={SUB_MAP_CENTER}
                    zoom={13}
                    minZoom={11}
                    zoomControl={false}
                    className="sub-map-leaflet"
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
                    />
                    <ZoomControl position="bottomright" />
                    {mappable.map((r) => (
                      <Marker
                        key={r.id}
                        position={[parseFloat(r.latitude), parseFloat(r.longitude)]}
                        icon={getSubMapIcon(r)}
                      >
                        <Popup>
                          <div className="sub-map-popup">
                            <div className="sub-map-popup-head">
                              <span>#{r.id}</span>
                              <span className={`sub-badge sub-badge--${toClass(normalizeStatus(r.status))}`}>
                                {STATUS_LABEL[normalizeStatus(r.status)] || r.status}
                              </span>
                            </div>
                            <p className="sub-map-popup-type">
                              {r.ai_damage_type ? r.ai_damage_type.replace(/_/g, " ") : "Unclassified"}
                              {r.barangay ? ` · ${r.barangay}` : ""}
                            </p>
                            <p className="sub-map-popup-date">{fmtDate(r.created_at)}</p>
                            <button
                              className="sub-map-popup-btn"
                              onClick={() => setSelectedReport(r)}
                            >
                              View Details
                            </button>
                          </div>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              )}
            </div>
          )}

          {viewMode === "list" && (
            <>
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
          onClose={() => { setSelectedReport(null); setInitialTab("details"); }}
          onDelete={() => refetch()}
          onUpdated={() => refetch()}
          onSummaryGenerated={handleSummaryGenerated}
          initialTab={initialTab}
        />
      )}
    </>
  );
}

export default MySubmissions;