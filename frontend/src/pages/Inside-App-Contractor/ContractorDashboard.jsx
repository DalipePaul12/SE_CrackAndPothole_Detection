import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Wrench, CheckCircle2, RefreshCw, AlertCircle, ArrowRight } from "lucide-react";
import SeverityBadge from "../../components/SeverityBadge.jsx";
import { useContractorProjects } from "../../hooks/useContractorProjects.js";
import "./ContractorDashboard.css";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";

const toClass = (str = "") => str.toLowerCase().replaceAll("_", "-");

const STATUS_LABEL = {
  SCHEDULED:   "Pending Acceptance",
  IN_PROGRESS: "In Progress",
  COMPLETED:   "Completed",
};

/* project.report may be a nested object or fields may be at the project root */
function getReport(project) {
  return project.report ?? project;
}

export default function ContractorDashboard() {
  const { projects, loading, error, refetch } = useContractorProjects();

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear  = now.getFullYear();

    let pending = 0, active = 0, completedThisMonth = 0;
    for (const p of projects) {
      const s = p.status?.toUpperCase();
      if (s === "SCHEDULED")   pending++;
      if (s === "IN_PROGRESS") active++;
      if (s === "COMPLETED") {
        const d = p.completed_at ? new Date(p.completed_at) : null;
        if (d && d.getMonth() === thisMonth && d.getFullYear() === thisYear)
          completedThisMonth++;
      }
    }
    return { pending, active, completedThisMonth };
  }, [projects]);

  /* Most recent 5 projects for the preview list */
  const recent = useMemo(
    () =>
      [...projects]
        .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0))
        .slice(0, 5),
    [projects]
  );

  return (
    <div className="c-dashboard">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="c-dashboard-hero">
        <h1 className="c-dashboard-title">Contractor Dashboard</h1>
        <p className="c-dashboard-sub">
          Overview of your assigned projects and completion status.
        </p>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="c-dash-error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {error}
          <button className="c-dash-retry" onClick={refetch}>Retry</button>
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="c-dashboard-cards">
        <div className="c-stat-card c-stat-card--pending">
          <div className="c-stat-icon-wrap">
            <ClipboardList size={22} aria-hidden="true" />
          </div>
          <div>
            <span className="c-stat-label">Pending Acceptance</span>
            <span className="c-stat-value">
              {loading ? <span className="c-stat-skeleton" /> : stats.pending}
            </span>
          </div>
        </div>

        <div className="c-stat-card c-stat-card--active">
          <div className="c-stat-icon-wrap">
            <Wrench size={22} aria-hidden="true" />
          </div>
          <div>
            <span className="c-stat-label">In Progress</span>
            <span className="c-stat-value">
              {loading ? <span className="c-stat-skeleton" /> : stats.active}
            </span>
          </div>
        </div>

        <div className="c-stat-card c-stat-card--done">
          <div className="c-stat-icon-wrap">
            <CheckCircle2 size={22} aria-hidden="true" />
          </div>
          <div>
            <span className="c-stat-label">Completed This Month</span>
            <span className="c-stat-value">
              {loading ? <span className="c-stat-skeleton" /> : stats.completedThisMonth}
            </span>
          </div>
        </div>
      </div>

      {/* ── Recent projects preview ─────────────────────────────────────────── */}
      <div className="c-dash-section">
        <div className="c-dash-section-header">
          <h2 className="c-dash-section-title">Recent Projects</h2>
          <div className="c-dash-section-actions">
            <button
              className="c-dash-refresh"
              onClick={refetch}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw size={15} aria-hidden="true" />
            </button>
            <Link to="/contractorpanel/projects" className="c-dash-see-all">
              See all <ArrowRight size={13} aria-hidden="true" />
            </Link>
          </div>
        </div>

        {loading && (
          <div className="c-dash-skeleton-list">
            {[1, 2, 3].map((i) => (
              <div key={i} className="c-dash-skeleton-row" />
            ))}
          </div>
        )}

        {!loading && !error && recent.length === 0 && (
          <div className="c-dash-empty">
            <ClipboardList size={36} aria-hidden="true" />
            <p>No projects assigned yet.</p>
          </div>
        )}

        {!loading && recent.length > 0 && (
          <ul className="c-dash-project-list">
            {recent.map((project) => {
              const report = getReport(project);
              const status = project.status?.toUpperCase();
              return (
                <li key={project.id} className="c-dash-project-row">
                  <div className="c-dash-row-left">
                    <span className="c-dash-project-id">#{project.id}</span>
                    <div className="c-dash-row-info">
                      <span className="c-dash-location">
                        {report.barangay ?? report.street_name ?? "Unknown location"}
                      </span>
                      <SeverityBadge
                        severity={report.ai_severity}
                        damageType={report.ai_damage_type}
                        size="sm"
                        showIcon={false}
                        inline
                      />
                    </div>
                  </div>
                  <div className="c-dash-row-right">
                    <span className={`c-status-badge c-status--${toClass(status)}`}>
                      {STATUS_LABEL[status] ?? status ?? "—"}
                    </span>
                    <span className="c-dash-date">{fmtDate(project.created_at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
