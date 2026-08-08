import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Wrench, CheckCircle2, RefreshCw, AlertCircle, ArrowRight, TrendingUp, PieChart, Timer } from "lucide-react";
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
    let turnaroundSum = 0, turnaroundCount = 0;
    for (const p of projects) {
      const s = p.status?.toUpperCase();
      if (s === "SCHEDULED")   pending++;
      if (s === "IN_PROGRESS") active++;
      if (s === "COMPLETED") {
        const d = p.actual_completion_date ? new Date(p.actual_completion_date) : null;
        if (d && d.getMonth() === thisMonth && d.getFullYear() === thisYear)
          completedThisMonth++;

        const created = p.created_at ? new Date(p.created_at) : null;
        if (d && created) {
          const days = (d - created) / (1000 * 60 * 60 * 24);
          if (days >= 0) {
            turnaroundSum += days;
            turnaroundCount++;
          }
        }
      }
    }
    const avgTurnaroundDays = turnaroundCount > 0 ? Math.round(turnaroundSum / turnaroundCount) : null;
    return { pending, active, completedThisMonth, avgTurnaroundDays };
  }, [projects]);
/* Severity + monthly-completion breakdown for the performance charts */
const DAMAGE_COLORS = ["#8b5cf6", "#f59e0b", "#0ea5e9", "#ec4899", "#14b8a6", "#f43f5e"];

  const chartData = useMemo(() => {
    let critical = 0, nonCritical = 0;
    const monthCounts = new Map();
    const damageCounts = new Map();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthCounts.set(d.toLocaleDateString(undefined, { month: "short" }), 0);
    }

for (const p of projects) {
      const report = getReport(p);
      const sev = (report.ai_severity ?? "").toLowerCase();
      if (sev === "critical") critical++;
      else if (sev) nonCritical++;

      const dmgType = report.ai_damage_type;
      if (dmgType) {
        damageCounts.set(dmgType, (damageCounts.get(dmgType) ?? 0) + 1);
      }

      if (p.status?.toUpperCase() === "COMPLETED") {
        const d = p.actual_completion_date ? new Date(p.actual_completion_date) : null;
        if (d) {
          const label = d.toLocaleDateString(undefined, { month: "short" });
          if (monthCounts.has(label)) monthCounts.set(label, monthCounts.get(label) + 1);
        }
      }
    }

const months = [...monthCounts.entries()].map(([label, count]) => ({ label, count }));
    const maxMonthly = Math.max(1, ...months.map((m) => m.count));
    const sevTotal = Math.max(1, critical + nonCritical);

    const damageTypes = [...damageCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, count], i) => ({
        label,
        count,
        color: DAMAGE_COLORS[i % DAMAGE_COLORS.length],
      }));
    const damageTotal = Math.max(1, damageTypes.reduce((sum, d) => sum + d.count, 0));

    return { critical, nonCritical, sevTotal, months, maxMonthly, damageTypes, damageTotal };
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

        <div className="c-stat-card c-stat-card--turnaround">
          <div className="c-stat-icon-wrap">
            <Timer size={22} aria-hidden="true" />
          </div>
          <div>
            <span className="c-stat-label">Avg Turnaround</span>
            <span className="c-stat-value">
              {loading ? (
                <span className="c-stat-skeleton" />
              ) : stats.avgTurnaroundDays !== null ? (
                `${stats.avgTurnaroundDays}d`
              ) : (
                "—"
              )}
            </span>
          </div>
        </div>
      </div>
      {/* ── Performance overview ──────────────────────────────────────────── */}
      {!loading && projects.length > 0 && (
        <div className="c-perf-grid">
          <div className="c-dash-section c-perf-card">
            <div className="c-dash-section-header">
              <h2 className="c-dash-section-title">
                <PieChart size={16} aria-hidden="true" /> Severity Mix
              </h2>
            </div>
            <div
              className="c-sev-bar-track"
              role="img"
              aria-label={`${chartData.critical} critical, ${chartData.nonCritical} non-critical`}
            >
              <div className="c-sev-bar-fill c-sev-bar-fill--critical"
                style={{ width: `${(chartData.critical / chartData.sevTotal) * 100}%` }} />
              <div className="c-sev-bar-fill c-sev-bar-fill--non-critical"
                style={{ width: `${(chartData.nonCritical / chartData.sevTotal) * 100}%` }} />
            </div>
            <div className="c-sev-legend">
              <span><i className="c-legend-dot c-legend-dot--critical" />Critical ({chartData.critical})</span>
              <span><i className="c-legend-dot c-legend-dot--non-critical" />Non-critical ({chartData.nonCritical})</span>
            </div>
          </div>

<div className="c-dash-section c-perf-card">
            <div className="c-dash-section-header">
              <h2 className="c-dash-section-title">
                <TrendingUp size={16} aria-hidden="true" /> Completions — Last 6 Months
              </h2>
            </div>
            <div className="c-month-chart">
              {chartData.months.map((m) => (
                <div className="c-month-col" key={m.label}>
                  <div className="c-month-bar-track">
                    <div className="c-month-bar-fill"
                      style={{ height: `${(m.count / chartData.maxMonthly) * 100}%` }}
                      title={`${m.count} completed`} />
                  </div>
                  <span className="c-month-label">{m.label}</span>
                  <span className="c-month-count">{m.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="c-dash-section c-perf-card">
            <div className="c-dash-section-header">
              <h2 className="c-dash-section-title">
                <Wrench size={16} aria-hidden="true" /> Damage Types
              </h2>
            </div>
            {chartData.damageTypes.length === 0 ? (
              <p className="c-dash-empty-inline">No damage data yet.</p>
            ) : (
              <div className="c-dmg-list">
                {chartData.damageTypes.map((d) => (
                  <div className="c-dmg-row" key={d.label}>
                    <span className="c-dmg-label">{d.label}</span>
                    <div className="c-dmg-bar-track">
                      <div
                        className="c-dmg-bar-fill"
                        style={{
                          width: `${(d.count / chartData.damageTotal) * 100}%`,
                          background: d.color,
                        }}
                      />
                    </div>
                    <span className="c-dmg-count">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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
              const sevClass = toClass(report.ai_severity ?? "");
              return (
<li key={project.id} className={`c-dash-project-row c-sev-${sevClass}`}>
                  <Link
                    to={`/contractorpanel/projects/${project.id}`}
                    state={{ project }}
                    className="c-dash-row-link"
                  >
                    <span className="c-dash-sev-bar" aria-hidden="true" />
                    <div className="c-dash-row-main">
                      <span className="c-dash-project-avatar">#{project.id}</span>
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
                    <div className="c-dash-row-end">
                      <div className="c-dash-row-right">
                        <span className={`c-status-badge c-status--${toClass(status)}`}>
                          <span className="c-status-dot" aria-hidden="true" />
                          {STATUS_LABEL[status] ?? status ?? "—"}
                        </span>
                        <span className="c-dash-date">{fmtDate(project.created_at)}</span>
                      </div>
                      <ArrowRight size={15} className="c-dash-row-arrow" aria-hidden="true" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
