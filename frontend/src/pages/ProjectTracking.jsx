import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, MapPin, User, Wrench, DollarSign, Package,
  FileText, CheckCircle, Clock, AlertTriangle, Image, Loader2,
  CalendarDays, Percent,
} from "lucide-react";
import { getReport } from "../api/reports";
import { getReportProject } from "../api/reports";
import { getProjectCompletion } from "../api/projects";
import "./ProjectTracking.css";

/* ── Constants ──────────────────────────────────────────────────────────────── */
const BASE_URL = import.meta.env.VITE_API_URL || "";

const STATUS_STEPS = [
  { key: "pending",     label: "Submitted"   },
  { key: "verified",    label: "Verified"    },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved",    label: "Resolved"    },
];

const STATUS_LABELS = {
  pending:     "Submitted",
  verified:    "Verified",
  in_progress: "In Progress",
  resolved:    "Resolved",
  declined:    "Declined",
  cancelled:   "Cancelled",
  rejected:    "Rejected",
};

const PROJECT_STATUS_LABELS = {
  scheduled:   "Assigned — Pending Acceptance",
  in_progress: "Repair In Progress",
  completed:   "Completed",
  on_hold:     "On Hold",
  cancelled:   "Cancelled",
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—";

const toClass = (s = "") => s.toLowerCase().replaceAll(" ", "-").replaceAll("_", "-");

const mediaUrl = (att) =>
  att?.file_url ? `${BASE_URL}${att.file_url}` : null;

function getStepIndex(status) {
  const s = status?.toLowerCase();
  const idx = STATUS_STEPS.findIndex(st => st.key === s);
  return idx;
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */
function StatusProgress({ status }) {
  const current = getStepIndex(status);
  const isTerminal = ["declined", "cancelled", "rejected"].includes(status?.toLowerCase());

  return (
    <div className="pt-progress-track">
      {STATUS_STEPS.map((step, i) => {
        const isDone    = i < current;
        const isCurrent = i === current;
        return (
          <React.Fragment key={step.key}>
            <div className={`pt-step ${isDone ? "done" : ""} ${isCurrent ? "current" : ""} ${i > current ? "future" : ""}`}>
              <div className="pt-step-dot" aria-hidden="true">
                {isDone ? <CheckCircle size={14} /> : isCurrent ? <div className="pt-pulse" /> : <div className="pt-dot-empty" />}
              </div>
              <span className="pt-step-label">{step.label}</span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={`pt-connector ${i < current ? "done" : ""}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
      {isTerminal && (
        <div className="pt-terminal-badge">
          <AlertTriangle size={14} aria-hidden="true" />
          {STATUS_LABELS[status?.toLowerCase()] ?? status}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="pt-info-row">
      <span className="pt-info-label">{label}</span>
      <span className="pt-info-val">{children}</span>
    </div>
  );
}

function SectionCard({ title, icon, children }) {
  return (
    <div className="pt-card">
      <div className="pt-card-title">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function CompletionSection({ projectId }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    getProjectCompletion(projectId)
      .then(res => {
        if (!cancelled) {
          if (res.success) setData(res.data);
          else setErr("Could not load completion details.");
        }
      })
      .catch(() => { if (!cancelled) setErr("Could not load completion details."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return (
      <SectionCard title="Repair Details" icon={<Wrench size={15} />}>
        <div className="pt-loading-row"><Loader2 size={18} className="pt-spin" /> Loading…</div>
      </SectionCard>
    );
  }

  if (err || !data) {
    return (
      <SectionCard title="Repair Details" icon={<Wrench size={15} />}>
        <p className="pt-empty">{err ?? "No repair details yet."}</p>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Repair Details" icon={<Wrench size={15} />}>
      <div className="pt-completion-grid">
        {data.notes && (
          <div className="pt-compl-item pt-compl-item--full">
            <span className="pt-compl-label"><FileText size={13} /> Repair Notes</span>
            <p className="pt-compl-val">{data.notes}</p>
          </div>
        )}
        {data.materials_used && (
          <div className="pt-compl-item pt-compl-item--full">
            <span className="pt-compl-label"><Package size={13} /> Materials Used</span>
            <p className="pt-compl-val">{data.materials_used}</p>
          </div>
        )}
        {data.actual_cost != null && (
          <div className="pt-compl-item">
            <span className="pt-compl-label"><DollarSign size={13} /> Actual Cost</span>
            <p className="pt-compl-val pt-compl-cost">
              ₱{Number(data.actual_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}
        {data.completed_at && (
          <div className="pt-compl-item">
            <span className="pt-compl-label"><CalendarDays size={13} /> Completed On</span>
            <p className="pt-compl-val">{fmtDate(data.completed_at)}</p>
          </div>
        )}
      </div>

      {/* Before / After photos */}
      {data.completion_photos?.length > 0 && (
        <div className="pt-photo-row">
          <p className="pt-photo-row-label"><Image size={13} /> Repair Photos</p>
          <div className="pt-photo-grid">
            {data.completion_photos.map((ph) => (
              <img
                key={ph.id}
                src={`${BASE_URL}${ph.file_url}`}
                alt={ph.file_name ?? "Repair photo"}
                className="pt-photo-img"
              />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function ProjectTracking() {
  const { reportId } = useParams();
  const navigate     = useNavigate();

  const [report,         setReport]         = useState(null);
  const [project,        setProject]        = useState(null);
  const [reportLoading,  setReportLoading]  = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [reportErr,      setReportErr]      = useState(null);

  /* Fetch report */
  useEffect(() => {
    if (!reportId) return;
    setReportLoading(true);
    getReport(reportId)
      .then(res => {
        const d = res?.data ?? res;
        if (d?.id) setReport(d);
        else setReportErr("Report not found.");
      })
      .catch(() => setReportErr("Could not load report."))
      .finally(() => setReportLoading(false));
  }, [reportId]);

  /* Fetch associated project */
  useEffect(() => {
    if (!reportId) return;
    setProjectLoading(true);
    getReportProject(reportId)
      .then(res => { if (res.success && res.data) setProject(res.data); })
      .catch(() => { /* no project yet — not an error */ })
      .finally(() => setProjectLoading(false));
  }, [reportId]);

  /* ── Loading / Error states ── */
  if (reportLoading) {
    return (
      <div className="pt-page pt-centered">
        <Loader2 size={32} className="pt-spin" />
        <p>Loading report…</p>
      </div>
    );
  }

  if (reportErr || !report) {
    return (
      <div className="pt-page pt-centered">
        <AlertTriangle size={32} />
        <p>{reportErr ?? "Report not found."}</p>
        <button className="pt-back-btn" onClick={() => navigate("/dashboard/submissions")}>
          <ArrowLeft size={15} /> Back to My Submissions
        </button>
      </div>
    );
  }

  const statusKey    = report.status?.toLowerCase();
  const isResolved   = statusKey === "resolved";
  const hasProject   = !!project;
  const origAtt      = report.media_attachments?.[0];
  const origUrl      = mediaUrl(origAtt);

  return (
    <div className="pt-page">
      {/* ── Back ─────────────────────────────────────────────────────────────── */}
      <button
        className="pt-back-btn"
        onClick={() => navigate("/dashboard/submissions")}
      >
        <ArrowLeft size={16} /> Back to My Submissions
      </button>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="pt-header">
        <div className="pt-header-left">
          <h1 className="pt-title">Report #{report.id}</h1>
          <span className={`pt-status-badge pt-status--${toClass(statusKey ?? "")}`}>
            {STATUS_LABELS[statusKey] ?? report.status ?? "—"}
          </span>
        </div>
        {report.ai_severity && (
          <span className={`pt-sev-badge pt-sev--${toClass(report.ai_severity)}`}>
            {report.ai_severity}
          </span>
        )}
      </div>

      {/* ── Progress track ───────────────────────────────────────────────────── */}
      <StatusProgress status={report.status} />

      {/* ── Content grid ─────────────────────────────────────────────────────── */}
      <div className="pt-grid">

        {/* LEFT column */}
        <div className="pt-col-left">

          {/* Report Details */}
          <SectionCard title="Report Details" icon={<FileText size={15} />}>
            <div className="pt-info-block">
              {report.ai_damage_type && <InfoRow label="Damage Type">{report.ai_damage_type}</InfoRow>}
              {report.ai_severity    && <InfoRow label="Severity">{report.ai_severity}</InfoRow>}
              <InfoRow label="Submitted">{fmtDate(report.created_at)}</InfoRow>
              {report.barangay   && <InfoRow label="Barangay">{report.barangay}</InfoRow>}
              {report.street_name && <InfoRow label="Street">{report.street_name}</InfoRow>}
              {report.exact_address && <InfoRow label="Address">{report.exact_address}</InfoRow>}
            </div>
            {report.description && (
              <div className="pt-description">
                <span className="pt-desc-label"><FileText size={12} /> Description</span>
                <p>{report.description}</p>
              </div>
            )}
          </SectionCard>

          {/* Original Photo */}
          {origUrl && (
            <SectionCard title="Damage Photo" icon={<Image size={15} />}>
              <img
                src={origUrl}
                alt="Damage evidence"
                className="pt-report-photo"
              />
            </SectionCard>
          )}
        </div>

        {/* RIGHT column */}
        <div className="pt-col-right">

          {/* Assignment / Project status */}
          <SectionCard title="Project Status" icon={<Wrench size={15} />}>
            {projectLoading ? (
              <div className="pt-loading-row"><Loader2 size={16} className="pt-spin" /> Loading…</div>
            ) : !hasProject ? (
              <p className="pt-empty">No project assigned yet. You'll be notified once a contractor is assigned.</p>
            ) : (
              <div className="pt-info-block">
                <InfoRow label="Status">
                  <span className={`pt-proj-status pt-proj-status--${toClass(project.status ?? "")}`}>
                    {PROJECT_STATUS_LABELS[project.status] ?? project.status ?? "—"}
                  </span>
                </InfoRow>
                {project.contractor_name && (
                  <InfoRow label="Contractor">
                    <span className="pt-contractor-name">
                      <User size={13} aria-hidden="true" /> {project.contractor_name}
                    </span>
                  </InfoRow>
                )}
                {project.scheduled_date && (
                  <InfoRow label="Scheduled">
                    {fmtDate(project.scheduled_date)}
                  </InfoRow>
                )}
                {project.estimated_cost != null && (
                  <InfoRow label="Est. Cost">
                    ₱{Number(project.estimated_cost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </InfoRow>
                )}
                {project.completion_percentage != null && (
                  <InfoRow label="Progress">
                    <div className="pt-progress-bar-wrap">
                      <div className="pt-progress-bar">
                        <div
                          className="pt-progress-fill"
                          style={{ width: `${project.completion_percentage}%` }}
                        />
                      </div>
                      <span className="pt-progress-pct">
                        <Percent size={11} />{project.completion_percentage.toFixed(0)}%
                      </span>
                    </div>
                  </InfoRow>
                )}
              </div>
            )}
          </SectionCard>

          {/* Location */}
          {(report.barangay || report.street_name || report.exact_address) && (
            <SectionCard title="Location" icon={<MapPin size={15} />}>
              <div className="pt-location">
                <p className="pt-location-primary">{report.barangay ?? "—"}</p>
                {(report.street_name || report.exact_address) && (
                  <p className="pt-location-secondary">{report.street_name || report.exact_address}</p>
                )}
              </div>
            </SectionCard>
          )}

          {/* Completion details — shown once resolved */}
          {isResolved && project?.id && (
            <CompletionSection projectId={project.id} />
          )}

          {/* Not yet resolved hint */}
          {!isResolved && hasProject && (
            <div className="pt-pending-hint">
              <Clock size={14} aria-hidden="true" />
              Repair completion details will appear here once the work is finished.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
