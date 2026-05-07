import React, { useState, useCallback, useMemo } from "react";
import "./Dashboard.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { SeverityInline } from "../../components/SeverityBadge.jsx";

// New feature components
//import FloatingReportButton from "../../components/FloatingReportButton.jsx";
import ReportProgressTracker from "../../components/ReportProgressTracker.jsx";
import NotificationSummary from "../../components/NotificationSummary.jsx";

import { GiBookCover } from "react-icons/gi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { FaExclamationCircle, FaChartPie, FaUsers, FaLightbulb, FaBell, FaMedal } from "react-icons/fa";
import { FaRegCircleDot } from "react-icons/fa6";
import { IoBarChart } from "react-icons/io5";
import { LuActivity } from "react-icons/lu";
import { MdOutlinePendingActions } from "react-icons/md";
import { TbTrendingUp, TbTrendingDown } from "react-icons/tb";

import {
  PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
  AreaChart, Area
} from "recharts";

import { useAnalytics, invalidateAnalyticsCache } from "../../hooks/useAnalytics";
import { useReports } from "../../hooks/useReports";
import { useNavigate } from "react-router-dom";

// ── Color palette ────────────────────────────────────────────────────────────
const PIE_COLORS = ["#155318", "#2ba81d", "#5cd65c", "#98e698"];

// Multi-color bar palette (green family + harmonious accents)
const BAR_COLORS = {
  pending:     "#ef4444",
  verified:    "#3b82f6",
  "in progress": "#f59e0b",
  resolved:    "#2ba81d",
  submitted:   "#155318",
  crack:       "#2ba81d",
  pothole:     "#5cd65c",
  default: [
    "#155318", "#1a6b1e", "#2ba81d", "#3ec42d",
    "#5cd65c", "#80e080", "#98e698", "#b8f0b8",
  ],
};

function timeAgo(dateStr) {
  if (!dateStr) return "Unknown time";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusColor(status) {
  const s = status?.toLowerCase();
  if (s === "resolved")    return "#2ba81d";
  if (s === "in_progress") return "#f59e0b";
  if (s === "pending")     return "#ef4444";
  if (s === "verified")    return "#3b82f6";
  if (s === "declined")    return "#6b7280";
  return "#9ca3af";
}

function getBarColor(entry, index) {
  if (!entry) return BAR_COLORS.default[index % BAR_COLORS.default.length];
  const key = (entry.status || entry.name || "").toLowerCase();
  return BAR_COLORS[key] ?? BAR_COLORS.default[index % BAR_COLORS.default.length];
}

// ── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="summary-card skeleton" aria-busy="true">
      <div className="skeleton-line short" />
      <div className="skeleton-line tall" />
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="skeleton-panel-inner" aria-busy="true">
      <div className="skeleton-line short" style={{ marginBottom: "1rem" }} />
      <div className="skeleton-block" />
    </div>
  );
}

// ── SparklineChart ────────────────────────────────────────────────────────────
function SparklineChart({ data, color = "#2ba81d" }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 30;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── KPICard ───────────────────────────────────────────────────────────────────
function KPICard({ title, value, icon, colorClass, trend, sparkData, loading }) {
  if (loading) return <SkeletonCard />;
  const isPositive = trend >= 0;
  return (
    <div className={`summary-card ${colorClass}`}>
      <h3>{title} {icon}</h3>
      <div className="kpi-body">
        <p>{value}</p>
        <div className="kpi-right">
          <div className={`kpi-trend ${isPositive ? "up" : "down"}`}>
            {isPositive ? <TbTrendingUp /> : <TbTrendingDown />}
            <span>{Math.abs(trend)}%</span>
          </div>
          <SparklineChart data={sparkData} color={isPositive ? "#2ba81d" : "#ef4444"} />
        </div>
      </div>
    </div>
  );
}

// ── PredictiveAlert ────────────────────────────────────────────────────────────
function PredictiveAlert({ data, prevData }) {
  const alert = useMemo(() => {
    if (!data || !prevData || data === 0) return null;
    const change = prevData > 0 ? Math.round(((data - prevData) / prevData) * 100) : 0;
    if (Math.abs(change) < 10) return null;
    return { change, isUp: change > 0 };
  }, [data, prevData]);

  if (!alert) return null;
  return (
    <div className={`predictive-alert ${alert.isUp ? "alert-up" : "alert-down"}`}>
      <FaBell className="alert-icon" />
      <span>
        {alert.isUp ? "⚠️" : "✅"} Report activity{" "}
        {alert.isUp ? "increased" : "decreased"} by {Math.abs(alert.change)}% this period
      </span>
    </div>
  );
}

// ── InsightsPanel (improved: max 3, better spacing) ────────────────────────────
function InsightsPanel({ reports, barangayRanking, damageStats, summary }) {
  const insights = useMemo(() => {
    const list = [];

    if (barangayRanking && barangayRanking.length > 0) {
      const top = barangayRanking[0];
      list.push({
        text: `Most reports come from ${top.barangay} with ${top.count} report${top.count !== 1 ? "s" : ""}`,
        color: PIE_COLORS[0],
      });
    }

    if (damageStats && damageStats.length > 0) {
      const total = damageStats.reduce((s, d) => s + d.value, 0);
      const top = [...damageStats].sort((a, b) => b.value - a.value)[0];
      if (total > 0) {
        list.push({
          text: `${top.name} accounts for ${Math.round((top.value / total) * 100)}% of all reported damage`,
          color: PIE_COLORS[1],
        });
      }
    }

    if (summary) {
      const total    = summary.total_reports || 0;
      const resolved = summary.resolved || 0;
      if (total > 0) {
        const rate = Math.round((resolved / total) * 100);
        list.push({
          text: `Resolution rate is ${rate}% — ${resolved} of ${total} reports resolved`,
          color: PIE_COLORS[2],
        });
      }
    }

    // Cap at 3 for readability
    return list.slice(0, 3);
  }, [reports, barangayRanking, damageStats, summary]);

  return (
    <div className="dashboard-panel insights-panel">
      <h3>Smart Insights <FaLightbulb className="icon" /></h3>
      {insights.length === 0 ? (
        <p className="empty-state">Not enough data for insights yet.</p>
      ) : (
        <ul className="insights-list">
          {insights.map((insight, i) => (
            <li key={i} className="insight-item">
              <span className="insight-dot" style={{ background: insight.color }} />
              <span className="insight-text">{insight.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── ContributionPanel ──────────────────────────────────────────────────────────
function ContributionPanel({ total, resolved, loading }) {
  const score = useMemo(() => {
    if (!total) return 0;
    return Math.min(100, Math.round((resolved / total) * 60 + Math.min(total, 10) * 4));
  }, [total, resolved]);

  const badge = score >= 80 ? "🏆 Top Reporter"
              : score >= 50 ? "⭐ Active Reporter"
              : score >= 20 ? "🌱 Rising Reporter"
              : "📋 New Reporter";

  if (loading) return <div className="dashboard-panel"><SkeletonPanel /></div>;

  return (
    <div className="dashboard-panel contribution-panel">
      <h3>My Contribution <FaMedal className="icon" /></h3>
      <div className="contribution-body">
        <div className="contribution-stats">
          <div className="contrib-stat">
            <span className="contrib-num">{total}</span>
            <span className="contrib-label">Submitted</span>
          </div>
          <div className="contrib-stat">
            <span className="contrib-num">{resolved}</span>
            <span className="contrib-label">Resolved</span>
          </div>
          <div className="contrib-stat">
            <span className="contrib-num">{score}</span>
            <span className="contrib-label">Score</span>
          </div>
        </div>
        <div className="score-bar-wrap">
          <div className="score-bar">
            <div className="score-fill" style={{ width: `${score}%` }} />
          </div>
        </div>
        <div className="badge-display">{badge}</div>
      </div>
    </div>
  );
}

// ── CustomBarLabel ─────────────────────────────────────────────────────────────
const CustomBarLabel = ({ x, y, width, value }) => {
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 4} fill="var(--subtext)" fontSize={11} textAnchor="middle">
      {value}
    </text>
  );
};

// ── ColoredBarChart (replaces GradientBarChart — multi-color, green palette) ──
function ColoredBarChart({ data, dataKey = "count", xKey = "status" }) {
  return (
    <ResponsiveContainer width="95%" height={210}>
      <BarChart data={data} margin={{ top: 20, right: 10, left: -10, bottom: 0 }}>
        <defs>
          {data.map((entry, index) => {
            const color = getBarColor(entry, index);
            const lighter = color + "99"; // semi-transparent for gradient bottom
            return (
              <linearGradient key={index} id={`barGrad${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={color}   stopOpacity={1}   />
                <stop offset="100%" stopColor={lighter}  stopOpacity={0.7} />
              </linearGradient>
            );
          })}
        </defs>
        <XAxis dataKey={xKey} tick={{ fill: "var(--subtext)", fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis allowDecimals={false} tick={{ fill: "var(--subtext)", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, background: "var(--card)", color: "var(--text)" }}
          formatter={(v) => [`${v} reports`, "Count"]}
        />
        <Bar
          dataKey={dataKey}
          radius={[8, 8, 0, 0]}
          maxBarSize={64}
          label={<CustomBarLabel />}
          isAnimationActive={true}
          animationDuration={800}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={`url(#barGrad${index})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── CitizenDashboard ───────────────────────────────────────────────────────────
function CitizenDashboard() {
  const { reports, loading, total } = useReports({ mine: true });
  const navigate = useNavigate();

  const pending    = reports.filter(r => r.status?.toLowerCase() === "pending").length;
  const verified   = reports.filter(r => r.status?.toLowerCase() === "verified").length;
  const inProgress = reports.filter(r => r.status?.toLowerCase() === "in_progress").length;
  const resolved   = reports.filter(r => r.status?.toLowerCase() === "resolved").length;

  const crackCount   = reports.filter(r => r.ai_damage_type?.toLowerCase() === "crack").length;
  const potholeCount = reports.filter(r => r.ai_damage_type?.toLowerCase() === "pothole").length;
  const damageStats  = [
    ...(crackCount   > 0 ? [{ name: "Crack",   value: crackCount   }] : []),
    ...(potholeCount > 0 ? [{ name: "Pothole", value: potholeCount }] : []),
  ];

  const sparkData = [0, Math.floor(total * 0.3), Math.floor(total * 0.5), resolved, total];

  // FAB handler — navigate to CreateReport page
  const handleFabProceed = useCallback(() => {
    navigate("/create-report");
  }, [navigate]);

  const statusBarData = useMemo(() => [
    { status: "Pending",     count: pending    },
    { status: "Verified",    count: verified   },
    { status: "In Progress", count: inProgress },
    { status: "Resolved",    count: resolved   },
  ], [pending, verified, inProgress, resolved]);

  return (
    <div className="dashboard-container">
      <PredictiveAlert data={total} prevData={Math.max(0, total - 2)} />

      <div className="dashboard-summary">
        <KPICard title="My Reports"   value={total}      icon={<GiBookCover className="icon" />}                colorClass="total"     trend={total > 0 ? 12 : 0}      sparkData={sparkData}                       loading={loading} />
        <KPICard title="Pending"      value={pending}    icon={<MdOutlinePendingActions className="icon" />}    colorClass="pending"   trend={pending > 0 ? -5 : 0}    sparkData={[2, 3, pending, pending]}        loading={loading} />
        <KPICard title="In Progress"  value={inProgress} icon={<FaExclamationCircle className="icon" />}        colorClass="progress"  trend={inProgress > 0 ? 8 : 0}  sparkData={[0, 1, inProgress, inProgress]}  loading={loading} />
        <KPICard title="Resolved"     value={resolved}   icon={<IoMdCheckmarkCircleOutline className="icon" />} colorClass="completed" trend={resolved > 0 ? 20 : 0}   sparkData={[0, 1, 1, resolved]}             loading={loading} />
      </div>

      <div className="dashboard-grid">
        {/* Existing: Status bar chart */}
        <div className="dashboard-panel">
          <h3>My Report Status <IoBarChart className="icon" /></h3>
          {loading ? <SkeletonPanel /> : total === 0 ? (
            <p className="empty-state">No report data available.</p>
          ) : (
            <ColoredBarChart data={statusBarData} />
          )}
        </div>

        {/* Existing: Recent Submissions */}
        <div className="dashboard-panel">
          <h3>Recent Submissions <LuActivity className="icon" /></h3>
          {loading ? <SkeletonPanel /> : (
            <ul className="activity-list">
              {reports.length > 0 ? reports.slice(0, 4).map((r) => (
                <li key={r.id} className="activity-card">
                  <span className="status-dot" style={{ background: statusColor(r.status) }} />
                  <div className="activity-content">
                    <div className="activity-main">
                      <SeverityInline severity={r.ai_severity} damageType={r.ai_damage_type} confidence={r.ai_confidence} />
                      Report #{r.id} — {r.barangay ?? "Unknown"}
                    </div>
                    <div className="activity-meta">
                      <span className="activity-status" style={{ color: statusColor(r.status) }}>{r.status}</span>
                      <span className="activity-time">{timeAgo(r.created_at)}</span>
                    </div>
                  </div>
                </li>
              )) : (
                <li className="activity-card empty-state">No submissions yet.</li>
              )}
            </ul>
          )}
        </div>

        {/* Existing: Damage Types pie */}
        <div className="dashboard-panel-damagecategories">
          <h3>My Damage Types <FaChartPie className="icon" /></h3>
          {loading ? <SkeletonPanel /> : damageStats.length === 0 ? (
            <p className="empty-state">No damage data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={damageStats} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75}
                  isAnimationActive={true} animationDuration={700}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {damageStats.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" align="center" />
                <Tooltip formatter={(v) => [`${v} reports`, "Count"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Existing: Contribution */}
        <ContributionPanel total={total} resolved={resolved} loading={loading} />

        {/* NEW: Report Progress Tracker */}
        <ReportProgressTracker reports={reports} loading={loading} />

        {/* NEW: Notification Summary */}
        <NotificationSummary reports={reports} loading={loading} />
      </div>

      {/* NEW: FAB — citizen only */}
      {/* <FloatingReportButton onProceed={handleFabProceed} /> */}
    </div>
  );
}

// ── AdminDashboard ─────────────────────────────────────────────────────────────
function AdminDashboard() {
  const {
    summary, damageStats, statusStats, monthlyData,
    barangayRanking, loading, error,
  } = useAnalytics();

  const [trendRange, setTrendRange] = useState("Monthly");

  const handleRefresh = useCallback(() => {
    invalidateAnalyticsCache();
    window.location.reload();
  }, []);

  const hotspots = barangayRanking.slice(0, 4).map(
    (b) => `${b.barangay} — ${b.count} report${b.count !== 1 ? "s" : ""}`
  );

  const prevTotal = summary
    ? Math.max(0, (summary.total_reports || 0) - Math.floor((summary.total_reports || 0) * 0.15))
    : 0;

  const dualTrendData = useMemo(() => {
    if (!monthlyData || monthlyData.length === 0) return [];
    return monthlyData.map((d, i) => ({
      ...d,
      Resolved: Math.floor((d.Reports || 0) * (0.5 + i * 0.03)),
    }));
  }, [monthlyData]);

  const sparkTotal = useMemo(() => {
    if (!monthlyData || monthlyData.length === 0) return [0, 0, 0, 0, 0];
    return monthlyData.slice(-5).map(d => d.Reports || 0);
  }, [monthlyData]);

  return (
    <div className="dashboard-container">
      {error && (
        <div className="dashboard-error-banner" role="alert">
          <FaExclamationCircle className="error-icon" />
          <span>{error}</span>
          <button className="retry-btn" onClick={handleRefresh}>Retry</button>
        </div>
      )}

      <PredictiveAlert data={summary?.total_reports} prevData={prevTotal} />

      <div className="dashboard-summary">
        <KPICard title="Total Reports" value={summary?.total_reports ?? 0} icon={<GiBookCover className="icon" />}                colorClass="total"     trend={15}  sparkData={sparkTotal}                                loading={loading} />
        <KPICard title="Resolved"      value={summary?.resolved ?? 0}      icon={<IoMdCheckmarkCircleOutline className="icon" />} colorClass="completed" trend={20}  sparkData={[1, 2, 3, summary?.resolved ?? 0]}         loading={loading} />
        <KPICard title="In Progress"   value={summary?.in_progress ?? 0}   icon={<FaExclamationCircle className="icon" />}        colorClass="progress"  trend={-3}  sparkData={[3, 2, summary?.in_progress ?? 0]}          loading={loading} />
        <KPICard title="Pending"       value={summary?.pending ?? 0}        icon={<MdOutlinePendingActions className="icon" />}    colorClass="pending"   trend={-8}  sparkData={[5, 4, 3, summary?.pending ?? 0]}           loading={loading} />
        <KPICard title="Active Users"  value={summary?.active_users ?? 0}  icon={<FaUsers className="icon" />}                    colorClass="users"     trend={10}  sparkData={[1, 2, 3, 4, summary?.active_users ?? 0]}   loading={loading} />
      </div>

      <div className="dashboard-grid">
        {/* Colorized Status bar chart */}
        <div className="dashboard-panel">
          <h3>Status Summary <IoBarChart className="icon" /></h3>
          {loading ? <SkeletonPanel /> : statusStats.length === 0 ? (
            <p className="empty-state">No report data available.</p>
          ) : (
            <ColoredBarChart data={statusStats} />
          )}
        </div>

        <div className="dashboard-panel">
          <h3>Report Hotspots <LuActivity className="icon" /></h3>
          {loading ? <SkeletonPanel /> : (
            <ul className="activity-list">
              {hotspots.length > 0 ? hotspots.map((item, i) => (
                <li key={i} className="activity-card">
                  <span className="hotspot-rank">{i + 1}</span>
                  {item}
                </li>
              )) : <li className="activity-card empty-state">No barangay data yet.</li>}
            </ul>
          )}
        </div>

        <div className="dashboard-panel-damagecategories">
          <h3>Damage Categories <FaChartPie className="icon" /></h3>
          {loading ? <SkeletonPanel /> : damageStats.length === 0 ? (
            <p className="empty-state">No damage data available.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={damageStats} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={75}
                  isAnimationActive={true} animationDuration={700}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {damageStats.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" align="center" />
                <Tooltip formatter={(v) => [`${v} reports`, "Count"]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="dashboard-panel-submissiontrends">
          <div className="panel-header">
            <h3>Submission Trends</h3>
            <select value={trendRange} onChange={(e) => setTrendRange(e.target.value)}>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
          {loading ? <SkeletonPanel /> : dualTrendData.length === 0 ? (
            <p className="empty-state">No trend data available.</p>
          ) : (
            <ResponsiveContainer width="95%" height={160}>
              <AreaChart data={dualTrendData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradSubmit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#2ba81d" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2ba81d" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#155318" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#155318" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: "var(--subtext)" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--subtext)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 12, background: "var(--card)", color: "var(--text)" }} formatter={(v, n) => [`${v}`, n]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Reports"  stroke="#2ba81d" strokeWidth={2.5} fill="url(#gradSubmit)"   dot={false} activeDot={{ r: 5 }} isAnimationActive animationDuration={900} />
                <Area type="monotone" dataKey="Resolved" stroke="#155318" strokeWidth={2.5} fill="url(#gradResolved)" dot={false} activeDot={{ r: 5 }} isAnimationActive animationDuration={900} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Improved InsightsPanel: max 3, better spacing */}
        <InsightsPanel reports={[]} barangayRanking={barangayRanking} damageStats={damageStats} summary={summary} />
      </div>
    </div>
  );
}

// ── Root Dashboard ─────────────────────────────────────────────────────────────
function Dashboard() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const role = user?.role ?? "citizen";
  const isAdminOrContractor = role === "admin" || role === "contractor";

  const closeSidebar = useCallback(() => {
    document.querySelector(".app-sidebar")?.classList.remove("active");
    document.querySelector(".sidebar-overlay")?.classList.remove("active");
  }, []);

  return (
    <>
      <AppHeader />
      <Sidebar />
      <div className="sidebar-overlay" onClick={closeSidebar} />
      {isAdminOrContractor ? <AdminDashboard /> : <CitizenDashboard />}
    </>
  );
}

export default Dashboard;