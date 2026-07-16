import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft, MapPin, Calendar, Wrench, CheckCircle2, AlertCircle,
  AlertTriangle, Camera, Plus, Trash2, ImagePlus, Send, MessageSquare,
  Info, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { getContractorProject, acceptProject, declineProject, completeProject } from "../../api/contractor";
import { getComments, addComment } from "../../api/reports";
import SeverityBadge from "../../components/SeverityBadge.jsx";
import ConfirmSubmitModal from "../PopUps/ConfirmSubmitModal.jsx";
import "./ContractorProjectDetail.css";

const BASE_URL = import.meta.env.VITE_API_URL || "";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
const fmtDT = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const mediaUrl = (att) => (att?.file_url ? `${BASE_URL}${att.file_url}` : null);

function getReport(project) {
  return project?.report ?? project ?? {};
}

const STATUS_LABEL = {
  SCHEDULED:   "Pending Acceptance",
  IN_PROGRESS: "In Progress",
  COMPLETED:   "Completed",
  DECLINED:    "Declined",
};

const toClass = (str = "") => str.toLowerCase().replaceAll("_", "-");

/* ── Lightbox ──────────────────────────────────────────────────────────────── */
function Lightbox({ src, onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="cpd-lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="cpd-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <button className="cpd-lightbox-close" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
        <img src={src} alt="Preview" className="cpd-lightbox-img" />
      </div>
    </div>
  );
}

/* ── Material row ───────────────────────────────────────────────────────────── */
function MaterialRow({ row, index, onChange, onRemove, disabled }) {
  const rowTotal = (parseFloat(row.qty) || 0) * (parseFloat(row.unit_cost) || 0);

  return (
    <div className="cpd-mat-row">
      <input
        className="cpd-input cpd-mat-name"
        placeholder="Material name"
        value={row.name}
        onChange={(e) => onChange(index, "name", e.target.value)}
        disabled={disabled}
        aria-label="Material name"
      />
      <input
        className="cpd-input cpd-mat-qty"
        type="number"
        min="0"
        placeholder="Qty"
        value={row.qty}
        onChange={(e) => onChange(index, "qty", e.target.value)}
        disabled={disabled}
        aria-label="Quantity"
      />
      <input
        className="cpd-input cpd-mat-cost"
        type="number"
        min="0"
        step="0.01"
        placeholder="Unit cost"
        value={row.unit_cost}
        onChange={(e) => onChange(index, "unit_cost", e.target.value)}
        disabled={disabled}
        aria-label="Unit cost"
      />
      <div className="cpd-mat-total">
        ₱{isNaN(rowTotal) ? "0.00" : rowTotal.toFixed(2)}
      </div>
      <button
        className="cpd-mat-remove"
        onClick={() => onRemove(index)}
        disabled={disabled}
        aria-label="Remove row"
        type="button"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/* ── Comment thread ─────────────────────────────────────────────────────────── */
function CommentThread({ reportId }) {
  const [comments,     setComments]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [text,         setText]         = useState("");
  const [sending,      setSending]      = useState(false);
  const [sendErr,      setSendErr]      = useState(null);
  const [sent,         setSent]         = useState(false);
  const [expanded,     setExpanded]     = useState(true);
  const endRef = useRef(null);

  const loadComments = useCallback(async () => {
    if (!reportId) return;
    setLoading(true);
    const res = await getComments(reportId);
    setLoading(false);
    if (res.success) {
      const arr = Array.isArray(res.data) ? res.data : [];
      setComments(arr);
    }
  }, [reportId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setSendErr(null);
    const res = await addComment(reportId, trimmed);
    setSending(false);
    if (!res.success) {
      setSendErr(res.error || "Failed to send message.");
      return;
    }
    setText("");
    setSent(true);
    setTimeout(() => setSent(false), 3000);
    await loadComments();
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const initials = (name = "") =>
    (name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const roleLabel = (role) => {
    if (role === "admin" || role === "superadmin") return "Admin";
    if (role === "contractor") return "Contractor";
    return "Citizen";
  };

  return (
    <div className="cpd-thread">
      <button
        className="cpd-thread-toggle"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <MessageSquare size={16} />
        <span>Messages with Admin</span>
        {comments.length > 0 && (
          <span className="cpd-thread-count">{comments.length}</span>
        )}
        {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      {expanded && (
        <div className="cpd-thread-body">
          {loading ? (
            <p className="cpd-thread-loading">Loading messages…</p>
          ) : comments.length === 0 ? (
            <p className="cpd-thread-empty">
              No messages yet. Use this thread to communicate with the admin about this project.
            </p>
          ) : (
            <div className="cpd-thread-list">
              {comments.map((c) => {
                const isAdmin = c.user?.role === "admin" || c.user?.role === "superadmin";
                return (
                  <div key={c.id} className={`cpd-comment ${isAdmin ? "cpd-comment--admin" : "cpd-comment--self"}`}>
                    <div className={`cpd-comment-avatar ${isAdmin ? "cpd-avatar--admin" : "cpd-avatar--self"}`}>
                      {initials(c.user?.full_name)}
                    </div>
                    <div className="cpd-comment-body">
                      <div className="cpd-comment-meta">
                        <span className="cpd-comment-name">{c.user?.full_name ?? "Unknown"}</span>
                        <span className={`cpd-comment-role cpd-role--${c.user?.role}`}>
                          {roleLabel(c.user?.role)}
                        </span>
                        <span className="cpd-comment-time">{fmtDT(c.created_at)}</span>
                      </div>
                      {c.is_deleted ? (
                        <p className="cpd-comment-deleted">[Message removed]</p>
                      ) : (
                        <p className="cpd-comment-text">{c.content}</p>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
          )}

          <div className="cpd-composer">
            <textarea
              className="cpd-composer-input"
              rows={3}
              maxLength={1000}
              placeholder="Ask a question or send an update to the admin…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={sending}
              aria-label="Message to admin"
            />
            <div className="cpd-composer-footer">
              <span className="cpd-composer-char">{text.length}/1000</span>
              <div className="cpd-composer-right">
                {sendErr && <span className="cpd-composer-err">{sendErr}</span>}
                {sent    && <span className="cpd-composer-sent">✓ Sent!</span>}
                <button
                  className="cpd-composer-send"
                  onClick={handleSend}
                  disabled={sending || !text.trim()}
                  aria-label="Send message"
                  type="button"
                >
                  <Send size={14} />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Photo upload preview ───────────────────────────────────────────────────── */
function PhotoPreviewGrid({ previews, onRemove, disabled }) {
  if (previews.length === 0) return null;
  return (
    <div className="cpd-photo-grid">
      {previews.map((src, i) => (
        <div key={i} className="cpd-photo-thumb">
          <img src={src} alt={`Proof ${i + 1}`} />
          {!disabled && (
            <button
              className="cpd-photo-remove"
              onClick={() => onRemove(i)}
              type="button"
              aria-label="Remove photo"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   ContractorProjectDetail — main page
══════════════════════════════════════════════════════════════════════════════ */
export default function ContractorProjectDetail() {
  const { projectId } = useParams();
  const location      = useLocation();
  const navigate      = useNavigate();

  /* ── Project data ─────────────────────────────────────────────────────── */
  const [project,     setProject]     = useState(location.state?.project ?? null);
  const [loadingData, setLoadingData] = useState(!location.state?.project);
  const [dataError,   setDataError]   = useState(null);

  /* ── Lightbox ─────────────────────────────────────────────────────────── */
  const [lightboxSrc, setLightboxSrc] = useState(null);

  /* ── Accept / Decline (SCHEDULED) ────────────────────────────────────── */
  const [actionLoading,  setActionLoading]  = useState(false);
  const [actionError,    setActionError]    = useState(null);
  const [showDecline,    setShowDecline]    = useState(false);
  const [declineReason,  setDeclineReason]  = useState("");

  /* ── Completion form ──────────────────────────────────────────────────── */
  const [notes,        setNotes]        = useState("");
  const [materials,    setMaterials]    = useState([{ name: "", qty: "", unit_cost: "" }]);
  const [actualCost,   setActualCost]   = useState("");
  const [photos,       setPhotos]       = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const fileRef = useRef(null);
  const previewUrlsRef = useRef([]);

  /* ── Load project if not in navigation state ──────────────────────────── */
  useEffect(() => {
    if (project) return;
    setLoadingData(true);
    setDataError(null);
    getContractorProject(projectId)
      .then((res) => {
        if (!res.success) { setDataError(res.error || "Could not load project."); return; }
        if (!res.data) setDataError("Project not found.");
        else           setProject(res.data);
      })
      .catch(() => setDataError("Network error loading project."))
      .finally(() => setLoadingData(false));
  }, [projectId, project]);

  /* ── Cleanup object URLs on unmount ──────────────────────────────────── */
  useEffect(() => {
    return () => previewUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  /* ── Accept / Decline handlers ───────────────────────────────────────── */
  const handleAccept = async () => {
    setActionLoading(true);
    setActionError(null);
    const res = await acceptProject(project.id);
    setActionLoading(false);
    if (!res.success) {
      setActionError(res.error || "Failed to accept project.");
      return;
    }
    // Reload fresh project data to reflect IN_PROGRESS status
    const fresh = await getContractorProject(project.id);
    if (fresh.success && fresh.data) setProject(fresh.data);
  };

  const handleDecline = async () => {
    if (!declineReason.trim()) return;
    setActionLoading(true);
    setActionError(null);
    const res = await declineProject(project.id, declineReason.trim());
    setActionLoading(false);
    if (!res.success) {
      setActionError(res.error || "Failed to decline project.");
      return;
    }
    navigate("/contractorpanel/projects", { replace: true });
  };

  /* ── Derived data ─────────────────────────────────────────────────────── */
  const report     = project ? getReport(project) : {};
  const status     = project?.status?.toUpperCase() ?? "";
  const isPending  = status === "SCHEDULED";
  const isIP       = status === "IN_PROGRESS";
  const isDone     = status === "COMPLETED";

  const allAttachments    = report.media_attachments ?? [];
  const submissionPhotos  = allAttachments.filter((a) => a.attachment_type !== "completion_proof");
  const completionPhotos  = allAttachments.filter((a) => a.attachment_type === "completion_proof");

  /* ── Materials helpers ────────────────────────────────────────────────── */
  const materialsSubtotal = materials.reduce(
    (s, m) => s + (parseFloat(m.qty) || 0) * (parseFloat(m.unit_cost) || 0),
    0
  );

  const updateMaterial = (i, field, val) =>
    setMaterials((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

  const addMaterialRow = () =>
    setMaterials((prev) => [...prev, { name: "", qty: "", unit_cost: "" }]);

  const removeMaterialRow = (i) =>
    setMaterials((prev) => prev.filter((_, idx) => idx !== i));

  const fillFromSubtotal = () => setActualCost(materialsSubtotal.toFixed(2));

  /* ── Photo upload ─────────────────────────────────────────────────────── */
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const newUrls = files.map((f) => URL.createObjectURL(f));
    previewUrlsRef.current = [...previewUrlsRef.current, ...newUrls];
    setPhotos((prev) => [...prev, ...files]);
    setPhotoPreviews((prev) => [...prev, ...newUrls]);
    e.target.value = "";
  };

  const removePhoto = (i) => {
    URL.revokeObjectURL(previewUrlsRef.current[i]);
    previewUrlsRef.current.splice(i, 1);
    setPhotos((prev) => prev.filter((_, idx) => idx !== i));
    setPhotoPreviews((prev) => prev.filter((_, idx) => idx !== i));
  };

  /* ── Validation before confirm ────────────────────────────────────────── */
  const validate = () => {
    if (!notes.trim()) return "Please add completion notes.";
    if (photos.length === 0) return "At least one proof photo is required.";
    if (!actualCost || isNaN(parseFloat(actualCost)) || parseFloat(actualCost) < 0)
      return "Please enter a valid actual cost (₱).";
    const hasMaterialData = materials.some((m) => m.name.trim());
    const allValid = materials.every(
      (m) => !m.name.trim() || (parseFloat(m.qty) > 0 && parseFloat(m.unit_cost) >= 0)
    );
    if (hasMaterialData && !allValid)
      return "Please fill in quantity and unit cost for all listed materials.";
    return null;
  };

  const handleSubmitClick = () => {
    const err = validate();
    if (err) { setSubmitError(err); return; }
    setSubmitError(null);
    setShowConfirm(true);
  };

  const handleConfirmedSubmit = async () => {
    setShowConfirm(false);
    setSubmitting(true);
    setSubmitError(null);

    const fd = new FormData();
    fd.append("notes", notes.trim());
    fd.append("actual_cost", actualCost);

    const validMaterials = materials.filter((m) => m.name.trim());
    fd.append("materials", JSON.stringify(validMaterials.map((m) => ({
      name:      m.name.trim(),
      quantity:  parseFloat(m.qty) || 0,
      unit_cost: parseFloat(m.unit_cost) || 0,
    }))));

    photos.forEach((file) => fd.append("photos", file));

    const res = await completeProject(project.id, fd);
    setSubmitting(false);

    if (!res.success) {
      // The project may have been saved successfully but the server crashed
      // on the post-commit notification step. Re-fetch to get the real status.
      const fresh = await getContractorProject(project.id);
      if (fresh.success && fresh.data?.status === "COMPLETED") {
        setProject(fresh.data);
        setSubmitSuccess(true);
        setTimeout(() => navigate("/contractorpanel/projects", { replace: true }), 2500);
        return;
      }
      setSubmitError(res.error || "Submission failed. Please try again.");
      return;
    }

    setSubmitSuccess(true);
    setTimeout(() => navigate("/contractorpanel/projects", { replace: true }), 2500);
  };

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  if (loadingData) {
    return (
      <div className="cpd-page">
        <div className="cpd-loading">
          <div className="cpd-spinner" />
          Loading project…
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="cpd-page">
        <button className="cpd-back-btn" onClick={() => navigate("/contractorpanel/projects")}>
          <ArrowLeft size={16} /> Back to Projects
        </button>
        <div className="cpd-error-box">
          <AlertCircle size={20} />
          {dataError}
        </div>
      </div>
    );
  }

  return (
    <div className="cpd-page">
      {/* ── Back button ───────────────────────────────────────────────────── */}
      <button
        className="cpd-back-btn"
        onClick={() => navigate("/contractorpanel/projects")}
      >
        <ArrowLeft size={16} /> Back to Projects
      </button>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="cpd-header">
        <div className="cpd-header-left">
          <h1 className="cpd-title">Project #{project.id}</h1>
          <span className={`cpd-status-badge cpd-status--${toClass(status)}`}>
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>
        <SeverityBadge
          severity={report.ai_severity}
          damageType={report.ai_damage_type}
          showIcon
        />
      </div>

      {/* ── Success banner ─────────────────────────────────────────────────── */}
      {submitSuccess && (
        <div className="cpd-success-banner">
          <CheckCircle2 size={18} />
          Project marked as complete! Redirecting…
        </div>
      )}

      {/* ── Accept / Decline panel (SCHEDULED only) ────────────────────────── */}
      {isPending && !submitSuccess && (
        <div className="cpd-pending-actions">
          <div className="cpd-pending-prompt">
            <AlertTriangle size={16} aria-hidden="true" />
            Review the report details and photos below, then accept or decline this assignment.
          </div>

          {actionError && (
            <p className="cpd-action-error" role="alert">
              <AlertCircle size={14} aria-hidden="true" /> {actionError}
            </p>
          )}

          {!showDecline ? (
            <div className="cpd-pending-btns">
              <button
                className="cpd-accept-btn"
                onClick={handleAccept}
                disabled={actionLoading}
                type="button"
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                {actionLoading ? "Accepting…" : "Accept Project"}
              </button>
              <button
                className="cpd-decline-open-btn"
                onClick={() => { setActionError(null); setShowDecline(true); }}
                disabled={actionLoading}
                type="button"
              >
                <X size={16} aria-hidden="true" />
                Decline
              </button>
            </div>
          ) : (
            <div className="cpd-decline-form">
              <label className="cpd-label" htmlFor="cpd-decline-reason">
                Reason for declining <span className="cpd-required">*</span>
              </label>
              <textarea
                id="cpd-decline-reason"
                className="cpd-textarea"
                rows={3}
                maxLength={500}
                placeholder="e.g. Outside service area, schedule conflict, equipment unavailable…"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                disabled={actionLoading}
                aria-required="true"
              />
              <div className="cpd-char-count">{declineReason.length}/500</div>
              <div className="cpd-decline-actions">
                <button
                  className="cpd-decline-confirm-btn"
                  onClick={handleDecline}
                  disabled={actionLoading || !declineReason.trim()}
                  type="button"
                >
                  {actionLoading ? "Declining…" : "Confirm Decline"}
                </button>
                <button
                  className="cpd-cancel-btn"
                  onClick={() => { setShowDecline(false); setDeclineReason(""); setActionError(null); }}
                  disabled={actionLoading}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="cpd-content">
        {/* ── LEFT: Info ──────────────────────────────────────────────────── */}
        <div className="cpd-info-col">
          {/* Location */}
          {(report.barangay || report.street_name || report.exact_address) && (
            <div className="cpd-card">
              <div className="cpd-card-title">
                <MapPin size={15} /> Location
              </div>
              <p className="cpd-location-primary">
                {report.barangay ?? "—"}
              </p>
              {(report.street_name || report.exact_address) && (
                <p className="cpd-location-secondary">
                  {report.street_name || report.exact_address}
                </p>
              )}
            </div>
          )}

          {/* Report info */}
          <div className="cpd-card">
            <div className="cpd-card-title">
              <Info size={15} /> Report Details
            </div>
            <div className="cpd-info-grid">
              <span className="cpd-info-label">Damage Type</span>
              <span className="cpd-info-value">
                {report.ai_damage_type ?? report.damage_type ?? "—"}
              </span>

              <span className="cpd-info-label">Severity</span>
              <span className="cpd-info-value">
                {report.ai_severity ?? report.severity ?? "—"}
              </span>

              {report.ai_confidence != null && (
                <>
                  <span className="cpd-info-label">AI Confidence</span>
                  <span className="cpd-info-value">
                    {(report.ai_confidence * 100).toFixed(1)}%
                  </span>
                </>
              )}

              <span className="cpd-info-label">Assigned</span>
              <span className="cpd-info-value">
                <Calendar size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
                {fmtDate(project.created_at)}
              </span>
            </div>
            {report.description && (
              <div className="cpd-description">
                <div className="cpd-desc-label">Description</div>
                <p className="cpd-desc-text">{report.description}</p>
              </div>
            )}
          </div>

          {/* Completed project info */}
          {isDone && project.notes && (
            <div className="cpd-card">
              <div className="cpd-card-title">
                <CheckCircle2 size={15} /> Completion Notes
              </div>
              <p className="cpd-desc-text">{project.notes}</p>
              {project.actual_cost != null && (
                <div className="cpd-completed-cost">
                  Actual Cost: <strong>₱{parseFloat(project.actual_cost).toFixed(2)}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Photos ────────────────────────────────────────────────── */}
        <div className="cpd-photo-col">
          {/* Submission photos */}
          <div className="cpd-card">
            <div className="cpd-card-title">
              <Camera size={15} />
              {isDone ? "Submission Photos" : "Report Photos"}
            </div>
            {submissionPhotos.length === 0 ? (
              <div className="cpd-no-photo">
                <Camera size={32} />
                <span>No photos attached</span>
              </div>
            ) : (
              <div className="cpd-report-photos">
                {submissionPhotos.map((att, i) => {
                  const url = mediaUrl(att);
                  return url ? (
                    <img
                      key={i}
                      src={url}
                      alt={`Report photo ${i + 1}`}
                      className="cpd-report-photo"
                      onClick={() => setLightboxSrc(url)}
                    />
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Completion proof photos (only once completed) */}
          {isDone && completionPhotos.length > 0 && (
            <div className="cpd-card cpd-card--proof">
              <div className="cpd-card-title cpd-title--success">
                <CheckCircle2 size={15} /> Completion Proof
              </div>
              <div className="cpd-report-photos">
                {completionPhotos.map((att, i) => {
                  const url = mediaUrl(att);
                  return url ? (
                    <img
                      key={i}
                      src={url}
                      alt={`Proof photo ${i + 1}`}
                      className="cpd-report-photo"
                      onClick={() => setLightboxSrc(url)}
                    />
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          COMPLETION FORM (only when IN_PROGRESS)
      ══════════════════════════════════════════════════════════════════════ */}
      {isIP && !submitSuccess && (
        <div className="cpd-completion-section">
          <h2 className="cpd-section-title">
            <Wrench size={18} /> Submit Completion Report
          </h2>

          {/* Notes */}
          <div className="cpd-field">
            <label className="cpd-label" htmlFor="cpd-notes">
              Completion Notes <span className="cpd-required">*</span>
            </label>
            <textarea
              id="cpd-notes"
              className="cpd-textarea"
              rows={4}
              maxLength={2000}
              placeholder="Describe the work completed, methods used, any issues encountered…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={submitting}
            />
            <div className="cpd-char-count">{notes.length}/2000</div>
          </div>

          {/* Materials */}
          <div className="cpd-field">
            <div className="cpd-label">Materials Used</div>
            <div className="cpd-mat-header">
              <span>Material</span>
              <span>Qty</span>
              <span>Unit Cost (₱)</span>
              <span>Total</span>
              <span />
            </div>
            {materials.map((row, i) => (
              <MaterialRow
                key={i}
                row={row}
                index={i}
                onChange={updateMaterial}
                onRemove={removeMaterialRow}
                disabled={submitting}
              />
            ))}
            <button
              className="cpd-add-material"
              onClick={addMaterialRow}
              disabled={submitting}
              type="button"
            >
              <Plus size={14} /> Add Material
            </button>
            {materials.some((m) => m.name.trim()) && (
              <div className="cpd-mat-subtotal">
                Materials Subtotal: <strong>₱{materialsSubtotal.toFixed(2)}</strong>
              </div>
            )}
          </div>

          {/* Actual cost */}
          <div className="cpd-field">
            <label className="cpd-label" htmlFor="cpd-cost">
              Actual Total Cost (₱) <span className="cpd-required">*</span>
            </label>
            <div className="cpd-cost-row">
              <input
                id="cpd-cost"
                className="cpd-input cpd-cost-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={actualCost}
                onChange={(e) => setActualCost(e.target.value)}
                disabled={submitting}
              />
              {materialsSubtotal > 0 && (
                <button
                  className="cpd-fill-btn"
                  onClick={fillFromSubtotal}
                  disabled={submitting}
                  type="button"
                >
                  Use subtotal (₱{materialsSubtotal.toFixed(2)})
                </button>
              )}
            </div>
          </div>

          {/* Proof photos */}
          <div className="cpd-field">
            <div className="cpd-label">
              Proof of Completion Photos
              <span className="cpd-required"> *</span>
            </div>
            <div
              className="cpd-upload-zone"
              onClick={() => !submitting && fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && !submitting && fileRef.current?.click()}
              aria-label="Upload proof photos"
            >
              <ImagePlus size={28} className="cpd-upload-icon" />
              <span className="cpd-upload-label">Click to add photos</span>
              <span className="cpd-upload-hint">JPG, PNG, WEBP — multiple allowed</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="cpd-file-hidden"
              onChange={handleFileChange}
              disabled={submitting}
            />
            <PhotoPreviewGrid
              previews={photoPreviews}
              onRemove={removePhoto}
              disabled={submitting}
            />
          </div>

          {/* Error */}
          {submitError && (
            <div className="cpd-submit-error">
              <AlertTriangle size={15} /> {submitError}
            </div>
          )}

          {/* Submit */}
          <div className="cpd-submit-row">
            <button
              className="cpd-submit-btn"
              onClick={handleSubmitClick}
              disabled={submitting || !notes.trim() || photos.length === 0}
              type="button"
            >
              {submitting ? (
                <><div className="cpd-btn-spinner" /> Submitting…</>
              ) : (
                <><CheckCircle2 size={16} /> Submit Completion</>
              )}
            </button>
            <button
              className="cpd-cancel-btn"
              onClick={() => navigate("/contractorpanel/projects")}
              disabled={submitting}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Comment thread ─────────────────────────────────────────────────── */}
      {project?.report_id && (
        <CommentThread reportId={project.report_id} />
      )}

      {/* ── Lightbox ───────────────────────────────────────────────────────── */}
      {lightboxSrc && (
        <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}

      {/* ── Confirm submit modal ────────────────────────────────────────────── */}
      {showConfirm && (
        <ConfirmSubmitModal
          title="Submit Completion?"
          message="This will mark the project as complete and notify the admin for review. This action cannot be undone."
          onConfirm={handleConfirmedSubmit}
          onCancel={() => setShowConfirm(false)}
          confirmText="Yes, Submit"
          cancelText="Go Back"
        />
      )}
    </div>
  );
}
