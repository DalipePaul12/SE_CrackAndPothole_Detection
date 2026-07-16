import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, RefreshCw, AlertCircle, AlertTriangle,
  CheckCircle2, Wrench, MapPin, Calendar, X, ArrowRight,
} from "lucide-react";
import SeverityBadge from "../../components/SeverityBadge.jsx";
import { useContractorProjects } from "../../hooks/useContractorProjects.js";
import "./ContractorAssignedProjects.css";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const toClass = (str = "") => str.toLowerCase().replaceAll("_", "-");

const STATUS_LABEL = {
  SCHEDULED:   "Pending Acceptance",
  IN_PROGRESS: "In Progress",
};

/* project.report may be a nested object or fields may be at the project root */
function getReport(project) {
  return project.report ?? project;
}

/* ── Decline modal — portal, same visual pattern as ConfirmChangesModal ── */
function DeclineModal({ project, onConfirm, onCancel, loading, error }) {
  const [reason, setReason] = useState("");
  const report = getReport(project);

  return createPortal(
    <div
      className="cap-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-title"
    >
      <div className="cap-modal" onClick={(e) => e.stopPropagation()}>
        <button className="cap-modal-close" onClick={onCancel} aria-label="Close">
          <X size={16} />
        </button>

        <AlertTriangle size={28} className="cap-modal-icon cap-icon-warning" aria-hidden="true" />

        <h3 id="decline-title" className="cap-modal-title">Decline Project?</h3>
        <p className="cap-modal-desc">
          You are declining <strong>Project #{project.id}</strong>
          {report.barangay ? ` — ${report.barangay}` : ""}.
          Please provide a reason so the admin can reassign it.
        </p>

        <label htmlFor="decline-reason" className="cap-reason-label">
          Reason <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="decline-reason"
          className="cap-reason-textarea"
          rows={4}
          maxLength={500}
          placeholder="e.g. Outside service area, schedule conflict, equipment unavailable…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={loading}
          aria-required="true"
        />
        <div className="cap-reason-counter">{reason.length}/500</div>

        {error && (
          <p className="cap-modal-error" role="alert">
            <AlertCircle size={14} aria-hidden="true" /> {error}
          </p>
        )}

        <div className="cap-modal-actions">
          <button className="cap-btn cap-btn-cancel" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className="cap-btn cap-btn-decline"
            onClick={() => onConfirm(reason.trim())}
            disabled={loading || reason.trim().length === 0}
          >
            {loading ? "Declining…" : "Confirm Decline"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Single project card ──────────────────────────────────────────────────── */
function ProjectCard({ project, onAccept, onDecline, actionLoading, actionError }) {
  const [showDecline, setShowDecline] = useState(false);
  const [localError,  setLocalError]  = useState(null);
  const navigate = useNavigate();
  const report  = getReport(project);
  const status  = project.status?.toUpperCase();
  const isPending = status === "SCHEDULED";

  const handleAccept = async () => {
    setLocalError(null);
    const ok = await onAccept(project.id);
    if (!ok) setLocalError(actionError);
  };

  const handleDecline = async (reason) => {
    setLocalError(null);
    const ok = await onDecline(project.id, reason);
    if (ok) { setShowDecline(false); }
    else    { setLocalError(actionError); }
  };

  return (
    <>
      <div className={`cap-card cap-card--${toClass(status)}`}>
        {/* ── Card header ───────────────────────────────────────────────── */}
        <div className="cap-card-header">
          <div className="cap-card-id-row">
            <span className="cap-project-id">Project #{project.id}</span>
            <span className={`c-status-badge c-status--${toClass(status)}`}>
              {STATUS_LABEL[status] ?? status ?? "—"}
            </span>
          </div>
          <SeverityBadge
            severity={report.ai_severity}
            damageType={report.ai_damage_type}
            size="sm"
            showIcon
            inline
          />
        </div>

        {/* ── Card body ─────────────────────────────────────────────────── */}
        <div className="cap-card-body">
          {(report.barangay || report.street_name) && (
            <p className="cap-card-location">
              <MapPin size={13} aria-hidden="true" />
              {[report.barangay, report.street_name].filter(Boolean).join(" · ")}
            </p>
          )}

          {report.description && (
            <p className="cap-card-desc">{report.description}</p>
          )}

          <div className="cap-card-meta">
            <span className="cap-meta-item">
              <Calendar size={12} aria-hidden="true" />
              Assigned {fmtDate(project.created_at)}
            </span>
            {project.completion_percentage != null && status === "IN_PROGRESS" && (
              <span className="cap-meta-item">
                <Wrench size={12} aria-hidden="true" />
                {project.completion_percentage}% complete
              </span>
            )}
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {localError && (
          <p className="cap-inline-error" role="alert">
            <AlertCircle size={13} aria-hidden="true" /> {localError}
          </p>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        {isPending && (
          <div className="cap-card-actions">
            <button
              className="cap-btn cap-btn-accept"
              onClick={handleAccept}
              disabled={actionLoading}
              aria-label={`Accept project ${project.id}`}
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              {actionLoading ? "Accepting…" : "Accept"}
            </button>
            <button
              className="cap-btn cap-btn-decline-sm"
              onClick={() => { setLocalError(null); setShowDecline(true); }}
              disabled={actionLoading}
              aria-label={`Decline project ${project.id}`}
            >
              <X size={15} aria-hidden="true" />
              Decline
            </button>
          </div>
        )}

        {status === "IN_PROGRESS" && (
          <div className="cap-card-actions cap-card-actions--inprogress">
            <span className="cap-in-progress-label">
              <Wrench size={14} aria-hidden="true" />
              Work in progress
            </span>
            <button
              className="cap-btn cap-btn-detail"
              onClick={() => navigate(`/contractorpanel/projects/${project.id}`, { state: { project } })}
              aria-label={`View details for project ${project.id}`}
            >
              View Details
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {showDecline && (
        <DeclineModal
          project={project}
          onConfirm={handleDecline}
          onCancel={() => { setShowDecline(false); setLocalError(null); }}
          loading={actionLoading}
          error={localError}
        />
      )}
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ContractorAssignedProjects() {
  const [statusFilter, setStatusFilter] = useState(null);
  const { projects, loading, error, refetch, accept, decline, actionLoading, actionError } =
    useContractorProjects(statusFilter ? { statusFilter } : {});

  /* Filter client-side to SCHEDULED + IN_PROGRESS (exclude COMPLETED) */
  const visible = useMemo(
    () => projects.filter((p) => {
      const s = p.status?.toUpperCase();
      if (statusFilter) return s === statusFilter;
      return s === "SCHEDULED" || s === "IN_PROGRESS";
    }),
    [projects, statusFilter]
  );

  const scheduledCount   = useMemo(() => projects.filter((p) => p.status?.toUpperCase() === "SCHEDULED").length,   [projects]);
  const inProgressCount  = useMemo(() => projects.filter((p) => p.status?.toUpperCase() === "IN_PROGRESS").length, [projects]);

  const FILTERS = [
    { label: "All Active",        value: null },
    { label: `Pending (${scheduledCount})`,  value: "SCHEDULED"   },
    { label: `In Progress (${inProgressCount})`, value: "IN_PROGRESS" },
  ];

  return (
    <div className="cap-page">
      {/* ── Page header ────────────────────────────────────────────────── */}
      <div className="cap-page-header">
        <div>
          <h1 className="cap-page-title">Assigned Projects</h1>
          <p className="cap-page-sub">
            Projects awaiting your acceptance or currently in progress.
          </p>
        </div>
        <button
          className="cap-refresh-btn"
          onClick={refetch}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* ── Filter tabs ────────────────────────────────────────────────── */}
      <div className="cap-filter-tabs" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={String(f.value)}
            role="tab"
            aria-selected={statusFilter === f.value}
            className={`cap-filter-tab ${statusFilter === f.value ? "active" : ""}`}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Error banner ───────────────────────────────────────────────── */}
      {error && (
        <div className="cap-error-banner" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          {error}
          <button className="cap-retry-btn" onClick={refetch}>Retry</button>
        </div>
      )}

      {/* ── Loading skeletons ───────────────────────────────────────────── */}
      {loading && (
        <div className="cap-skeleton-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="cap-skeleton-card" />
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────── */}
      {!loading && !error && visible.length === 0 && (
        <div className="cap-empty">
          <ClipboardList size={40} aria-hidden="true" />
          <p>No projects to show here.</p>
          <span>
            {statusFilter === "SCHEDULED"
              ? "No projects pending your acceptance."
              : statusFilter === "IN_PROGRESS"
              ? "No projects currently in progress."
              : "You have no active assigned projects."}
          </span>
        </div>
      )}

      {/* ── Project cards ───────────────────────────────────────────────── */}
      {!loading && visible.length > 0 && (
        <div className="cap-card-grid">
          {visible.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onAccept={accept}
              onDecline={decline}
              actionLoading={actionLoading}
              actionError={actionError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
