import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, RefreshCw, AlertCircle, MapPin,
  Calendar, DollarSign, FileText, ChevronDown, ChevronUp,
  ArrowRight, Hash, Wrench, ClipboardList,
} from "lucide-react";
import SeverityBadge from "../../components/SeverityBadge.jsx";
import { useContractorProjects } from "../../hooks/useContractorProjects.js";
import "./ContractorCompletedProjects.css";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const fmtCurrency = (val) =>
  val != null ? `₱${Number(val).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : "—";

/* project.report may be nested or flattened */
function getReport(project) {
  return project.report ?? project;
}

/* ── Single completed project card ──────────────────────────────────────── */
function CompletedCard({ project }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const report = getReport(project);

  const materials = useMemo(() => {
    if (!project.materials_used) return [];
    if (Array.isArray(project.materials_used)) return project.materials_used;
    if (typeof project.materials_used === "object") return Object.entries(project.materials_used);
    return [];
  }, [project.materials_used]);

  const totalMaterialCost = useMemo(() => {
    return materials.reduce((sum, item) => {
      if (typeof item === "object" && !Array.isArray(item)) {
        const qty = parseFloat(item.quantity ?? item.qty ?? 1);
        const cost = parseFloat(item.unit_cost ?? item.cost ?? 0);
        return sum + qty * cost;
      }
      return sum;
    }, 0);
  }, [materials]);

  const hasDetails = project.notes || materials.length > 0 || report.description;

  return (
    <div className="ccp-card">
      {/* ── Card header ─────────────────────────────────────────────────── */}
      <div className="ccp-card-header">
        <div className="ccp-id-row">
          <span className="ccp-project-id">Project #{project.id}</span>
          <span className="c-status-badge c-status--completed">Completed</span>
        </div>
        <SeverityBadge
          severity={report.ai_severity}
          damageType={report.ai_damage_type}
          size="sm"
          showIcon
          inline
        />
      </div>

      {/* ── Core info ───────────────────────────────────────────────────── */}
      <div className="ccp-card-body">
        {(report.barangay || report.street_name) && (
          <p className="ccp-location">
            <MapPin size={13} aria-hidden="true" />
            {[report.barangay, report.street_name].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="ccp-meta-row">
          <span className="ccp-meta-item">
            <Calendar size={12} aria-hidden="true" />
            Completed {fmtDate(project.actual_completion_date ?? project.completed_at)}
          </span>
          {project.actual_cost != null && (
            <span className="ccp-meta-item">
              <DollarSign size={12} aria-hidden="true" />
              {fmtCurrency(project.actual_cost)}
            </span>
          )}
          {report.id && (
            <span className="ccp-meta-item">
              <Hash size={12} aria-hidden="true" />
              Report #{report.id}
            </span>
          )}
        </div>
      </div>

      {/* ── Action row ──────────────────────────────────────────────────── */}
      <div className="ccp-action-row">
        {hasDetails && (
          <button
            className="ccp-expand-btn"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
          >
            {expanded ? (
              <><ChevronUp size={14} aria-hidden="true" /> Hide details</>
            ) : (
              <><ChevronDown size={14} aria-hidden="true" /> Show details</>
            )}
          </button>
        )}

        <button
          className="ccp-view-btn"
          onClick={() => navigate(`/contractorpanel/projects/${project.id}`, { state: { project } })}
        >
          View Full Details <ArrowRight size={13} aria-hidden="true" />
        </button>
      </div>

      {/* ── Expanded details ─────────────────────────────────────────────── */}
      {expanded && (
        <div className="ccp-details">

          {/* Report description */}
          {report.description && (
            <div className="ccp-detail-block">
              <p className="ccp-detail-label">
                <ClipboardList size={13} aria-hidden="true" /> Report Description
              </p>
              <p className="ccp-detail-text">{report.description}</p>
            </div>
          )}

          {/* Completion notes */}
          {project.notes && (
            <div className="ccp-detail-block">
              <p className="ccp-detail-label">
                <FileText size={13} aria-hidden="true" /> Completion Notes
              </p>
              <p className="ccp-detail-text">{project.notes}</p>
            </div>
          )}

          {/* Materials */}
          {materials.length > 0 && (
            <div className="ccp-detail-block">
              <p className="ccp-detail-label">
                <Wrench size={13} aria-hidden="true" /> Materials Used
              </p>
              <ul className="ccp-materials-list">
                {materials.map((item, idx) => {
                  if (typeof item === "object" && !Array.isArray(item)) {
                    const name = item.name ?? item.material ?? "Item";
                    const qty  = item.quantity ?? item.qty ?? null;
                    const cost = item.unit_cost ?? item.cost ?? null;
                    return (
                      <li key={idx} className="ccp-material-item">
                        <span className="ccp-mat-name">{name}</span>
                        <span className="ccp-mat-meta">
                          {qty != null && <span>{qty} unit{qty !== 1 ? "s" : ""}</span>}
                          {cost != null && <span>{fmtCurrency(cost)} each</span>}
                          {qty != null && cost != null && (
                            <span className="ccp-mat-subtotal">{fmtCurrency(qty * cost)}</span>
                          )}
                        </span>
                      </li>
                    );
                  }
                  const label = Array.isArray(item)
                    ? `${item[0]}: ${item[1]}`
                    : String(item);
                  return <li key={idx} className="ccp-material-item"><span className="ccp-mat-name">{label}</span></li>;
                })}
              </ul>

              {totalMaterialCost > 0 && (
                <div className="ccp-materials-total">
                  <span>Materials subtotal</span>
                  <span>{fmtCurrency(totalMaterialCost)}</span>
                </div>
              )}
            </div>
          )}

          {/* Cost summary */}
          {project.actual_cost != null && (
            <div className="ccp-cost-summary">
              <span>Total project cost</span>
              <span className="ccp-cost-value">{fmtCurrency(project.actual_cost)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ContractorCompletedProjects() {
  const { projects, loading, error, refetch } = useContractorProjects();

  const completed = useMemo(
    () =>
      projects
        .filter((p) => p.status?.toUpperCase() === "COMPLETED")
        .sort(
          (a, b) =>
            new Date(b.actual_completion_date ?? b.completed_at ?? b.created_at ?? 0) -
            new Date(a.actual_completion_date ?? a.completed_at ?? a.created_at ?? 0)
        ),
    [projects]
  );

  return (
    <div className="ccp-page">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="ccp-page-header">
        <div>
          <h1 className="ccp-page-title">Completed Projects</h1>
          <p className="ccp-page-sub">
            Your work history — all projects you have successfully completed.
          </p>
        </div>
        <button
          className="ccp-refresh-btn"
          onClick={refetch}
          disabled={loading}
          aria-label="Refresh"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {/* ── Summary count ───────────────────────────────────────────────── */}
      {!loading && completed.length > 0 && (
        <p className="ccp-count">
          <CheckCircle2 size={14} aria-hidden="true" />
          {completed.length} project{completed.length !== 1 ? "s" : ""} completed
        </p>
      )}

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {error && (
        <div className="ccp-error-banner" role="alert">
          <AlertCircle size={15} aria-hidden="true" />
          {error}
          <button className="ccp-retry-btn" onClick={refetch}>Retry</button>
        </div>
      )}

      {/* ── Loading skeletons ────────────────────────────────────────────── */}
      {loading && (
        <div className="ccp-skeleton-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="ccp-skeleton-card" />
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {!loading && !error && completed.length === 0 && (
        <div className="ccp-empty">
          <CheckCircle2 size={40} aria-hidden="true" />
          <p>No completed projects yet.</p>
          <span>Completed projects will appear here once you finish your first assignment.</span>
        </div>
      )}

      {/* ── Cards ────────────────────────────────────────────────────────── */}
      {!loading && completed.length > 0 && (
        <div className="ccp-card-grid">
          {completed.map((project) => (
            <CompletedCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  );
}
