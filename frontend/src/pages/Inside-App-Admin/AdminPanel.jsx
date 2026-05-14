import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./AdminPanel.css";

import {
  PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

import {
  LayoutDashboard, CheckCircle2, AlertCircle, AlertTriangle,
  Clock, Settings2, Map, ClipboardList, Zap, SlidersHorizontal,
  Flame, BarChart2, MapPin, Timer, PieChartIcon, TrendingUp, TrendingDown,
  BrainCircuit, Radio, FolderOpen, RefreshCw,
} from "lucide-react";

import { useAnalytics } from "../../hooks/useAnalytics";
import {
  getSLAStats,
  getAIInsights,
  getRecentReports,
  getActivityFeed,
  getPriorityFlags,
} from "../../api/analytics";

const DAMAGE_COLORS = ["#2ba81d", "#134d05"];
const TREND_RANGES  = ["Daily", "Weekly", "Monthly"];
const BARANGAYS     = ["All", "Panghulo", "Dampalit", "Catmon", "Tonsuya", "Tañong", "Tambobong"];
const DATE_RANGES   = ["All time", "This week", "This month", "Last 3 months"];
const SEVERITY_OPTS = ["All", "Critical", "Medium", "Low"];
const POLL_MS       = 60_000;

function statusKey(s) {
  return (s ?? "").toLowerCase().replace(/[\s_]+/g, "");
}

const STATUS_COLOR_MAP = {
  pending:    "#fb8c00",
  verified:   "#7b1fa2",
  inprogress: "#1e88e5",
  resolved:   "#43a047",
  declined:   "#9e9e9e",
};

const ACTIVITY_DOT_MAP = {
  resolved: "dot-green",
  verified: "dot-purple",
  progress: "dot-blue",
  new:      "dot-teal",
  critical: "dot-red",
  declined: "dot-gray",
};

function Skeleton({ w = "100%", h = 32, radius = 8 }) {
  return <div className="ap-skeleton" style={{ width: w, height: h, borderRadius: radius }} />;
}

function timeAgo(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function confColor(pct) {
  if (pct >= 80) return "#2e7d32";
  if (pct >= 60) return "#e65100";
  return "#c62828";
}

export default function AdminPanel() {
  const navigate = useNavigate();

  const {
    summary,
    damageStats,
    statusStats,
    monthlyData,
    barangayRanking,
    severityStats,
    loading: loadingAnalytics,
  } = useAnalytics();

  const [sla,           setSla]           = useState(null);
  const [aiInsights,    setAiInsights]    = useState(null);
  const [recentReports, setRecentReports] = useState([]);
  const [activityFeed,  setActivityFeed]  = useState([]);
  const [priorityFlags, setPriorityFlags] = useState(null);
  const [loadingExtra,  setLoadingExtra]  = useState(true);
  const [errors,        setErrors]        = useState({});

  const [filterBarangay, setFilterBarangay] = useState("All");
  const [filterDate,     setFilterDate]     = useState("All time");
  const [filterSeverity, setFilterSeverity] = useState("All");
  const [trendRange,     setTrendRange]     = useState("Monthly");
  const [clock,          setClock]          = useState("");

  const cancelRef = useRef(false);

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("en-PH", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const loadExtra = useCallback(async () => {
    setLoadingExtra(true);
    cancelRef.current = false;

    const [slaRes, aiRes, recentRes, feedRes, prioRes] = await Promise.all([
      getSLAStats(),
      getAIInsights(),
      getRecentReports(8),
      getActivityFeed(8),
      getPriorityFlags(),
    ]);

    if (cancelRef.current) return;
    const errs = {};

    if (slaRes.success)    setSla(slaRes.data);                    else errs.sla = slaRes.error;
    if (aiRes.success)     setAiInsights(aiRes.data);              else errs.ai = aiRes.error;
    if (recentRes.success) setRecentReports(recentRes.data || []); else errs.recent = recentRes.error;
    if (feedRes.success)   setActivityFeed(feedRes.data || []);    else errs.feed = feedRes.error;
    if (prioRes.success)   setPriorityFlags(prioRes.data);         else errs.priority = prioRes.error;

    setErrors(errs);
    setLoadingExtra(false);
  }, []);

  useEffect(() => {
    loadExtra();
    const poll = setInterval(loadExtra, POLL_MS);
    return () => { cancelRef.current = true; clearInterval(poll); };
  }, [loadExtra]);

  const loadingMain = loadingAnalytics || loadingExtra;

  const severityMap = Object.fromEntries(
    (severityStats || []).map(({ name, value }) => [name.toLowerCase(), value])
  );

  const trendData = (() => {
    if (!monthlyData.length) return [];
    if (trendRange === "Monthly") return monthlyData.slice(-6);
    if (trendRange === "Weekly") {
      return monthlyData.slice(-4).map((d, i) => ({
        period: `W${i + 1}`,
        Reports: Math.round(d.Reports * 0.25),
      }));
    }
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const last  = monthlyData[monthlyData.length - 1]?.Reports ?? 10;
    return days.map((d, i) => ({
      period: d,
      Reports: Math.max(1, Math.round(last / 7) + (i % 3)),
    }));
  })();

  const trendInsight = (() => {
    if (trendData.length < 2) return null;
    const last = trendData[trendData.length - 1].Reports;
    const prev = trendData[trendData.length - 2].Reports;
    const pct  = prev ? Math.round(((last - prev) / prev) * 100) : 0;
    return {
      pct,
      peak: Math.max(...trendData.map((d) => d.Reports)),
      avg:  Math.round(trendData.reduce((a, d) => a + d.Reports, 0) / trendData.length),
    };
  })();

  const filteredReports = recentReports.filter((r) => {
    if (filterBarangay !== "All" && r.location !== filterBarangay) return false;
    if (filterSeverity !== "All" && r.severity?.toLowerCase() !== filterSeverity.toLowerCase()) return false;
    return true;
  });

  const topCritical = priorityFlags?.critical_by_barangay?.[0];

  const summaryCards = [
    { id: "total",      label: "Total Reports", value: summary?.total_reports ?? 0,                            accent: "#155318", Icon: LayoutDashboard, delta: null },
    { id: "resolved",   label: "Resolved",       value: summary?.resolved ?? 0,                                accent: "#43a047", Icon: CheckCircle2,    delta: null },
    { id: "critical",   label: "Critical",        value: severityMap.critical ?? 0,                            accent: "#e53935", Icon: AlertCircle,     delta: (severityMap.critical ?? 0) > 0 ? "Needs immediate attention" : null, deltaClass: "delta-danger" },
    { id: "noncrit",    label: "Non-Critical",    value: (severityMap.low ?? 0) + (severityMap.medium ?? 0),  accent: "#fb8c00", Icon: AlertTriangle,   delta: null },
    { id: "pending",    label: "Pending Review",  value: summary?.pending ?? 0,                                accent: "#1e88e5", Icon: Clock,           delta: (summary?.pending ?? 0) > 5 ? "High queue" : null, deltaClass: "delta-danger" },
    { id: "inprogress", label: "In Progress",     value: summary?.in_progress ?? 0,                            accent: "#7b1fa2", Icon: Settings2,       delta: null },
  ];

  function goTo(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    navigate(qs ? `${path}?${qs}` : path);
  }

  return (
    <div className="ap-root">

      {Object.keys(errors).length > 0 && (
        <div className="ap-error-banner" role="alert">
          <span>
            <AlertTriangle size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            Some data failed to load.
          </span>
          <button className="ap-retry-btn" onClick={loadExtra}>Retry</button>
        </div>
      )}

      <div className="ap-topbar">
        <div>
          <h1 className="ap-topbar-title">Command Center</h1>
          <p className="ap-topbar-sub">
            <span className="ap-clock-dot" />
            Live · {clock}
            <span className="ap-sep">·</span>
            <button className="ap-refresh-btn" onClick={loadExtra}>
              <RefreshCw size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
              Sync now
            </button>
          </p>
        </div>
        <div className="ap-quick-actions">
          <button className="ap-qa-btn" onClick={() => goTo("/adminpanel/map")}>
            <Map size={14} /> View Map
          </button>
          <button className="ap-qa-btn" onClick={() => goTo("/adminpanel/reports")}>
            <ClipboardList size={14} /> Reports
          </button>
          <button className="ap-qa-btn ap-qa-primary" onClick={() => goTo("/adminpanel/reports", { filter: "urgent" })}>
            <Zap size={14} /> Urgent Actions
          </button>
        </div>
      </div>

      <div className="ap-filter-bar">
        <span className="ap-filter-label">
          <SlidersHorizontal size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />Filter
        </span>
        {[
          { id: "bar",  val: filterBarangay, set: setFilterBarangay, opts: BARANGAYS,     label: "Barangay" },
          { id: "date", val: filterDate,     set: setFilterDate,     opts: DATE_RANGES,   label: "Date" },
          { id: "sev",  val: filterSeverity, set: setFilterSeverity, opts: SEVERITY_OPTS, label: "Severity" },
        ].map(({ id, val, set, opts, label }) => (
          <select key={id} className="ap-select" value={val} onChange={(e) => set(e.target.value)} aria-label={label}>
            {opts.map((o) => <option key={o}>{o}</option>)}
          </select>
        ))}
        <span className="ap-filter-result">
          {[
            filterBarangay !== "All" && filterBarangay,
            filterSeverity !== "All" && filterSeverity,
            filterDate     !== "All time" && filterDate,
          ].filter(Boolean).join(" · ") || "Showing all reports"}
        </span>
      </div>

      <div className="ap-priority-panel" role="region" aria-label="Urgent actions">
        <div className="ap-pp-header">
          <span className="ap-pp-dot" />
          <Flame size={15} color="#e65100" />
          <span className="ap-pp-title">Urgent Actions Required</span>
        </div>
        <div className="ap-pp-items">
          {loadingMain
            ? [1, 2, 3].map((i) => (
                <div key={i} className="ap-pp-item ap-pp-skeleton">
                  <Skeleton h={18} radius={5} />
                </div>
              ))
            : (
              <>
                {topCritical && (
                  <button
                    className="ap-pp-item ap-pp-danger"
                    onClick={() => goTo("/adminpanel/map", {
                      barangay: topCritical.barangay,
                      severity: "critical",
                    })}
                  >
                    <span className="ap-pp-badge ap-pp-badge-red">{topCritical.count}</span>
                    Critical in {topCritical.barangay}
                  </button>
                )}
                {priorityFlags?.pending_over_3days > 0 && (
                  <button
                    className="ap-pp-item ap-pp-warn"
                    onClick={() => goTo("/adminpanel/reports", { filter: "stale" })}
                  >
                    <span className="ap-pp-badge ap-pp-badge-orange">{priorityFlags.pending_over_3days}</span>
                    Pending &gt; 3 days
                  </button>
                )}
                {priorityFlags?.low_confidence_count > 0 && (
                  <button
                    className="ap-pp-item ap-pp-info"
                    onClick={() => goTo("/adminpanel/reports", { filter: "low_confidence" })}
                  >
                    <span className="ap-pp-badge ap-pp-badge-blue">{priorityFlags.low_confidence_count}</span>
                    Low AI confidence
                  </button>
                )}
                {priorityFlags?.overdue_count > 0 && (
                  <button
                    className="ap-pp-item ap-pp-warn"
                    onClick={() => goTo("/adminpanel/reports", { filter: "overdue" })}
                  >
                    <span className="ap-pp-badge ap-pp-badge-orange">{priorityFlags.overdue_count}</span>
                    Overdue past SLA
                  </button>
                )}
                {!priorityFlags && (
                  <span className="ap-pp-empty">No urgent actions right now</span>
                )}
              </>
            )}
        </div>
      </div>

      <div className="ap-summary-grid">
        {summaryCards.map(({ id, label, value, accent, Icon, delta, deltaClass }) => (
          <div key={id} className="ap-scard">
            <div className="ap-scard-bar" style={{ background: accent }} />
            <div className="ap-scard-header">
              <span className="ap-scard-label">{label}</span>
              <span className="ap-scard-icon" style={{ color: accent }}>
                <Icon size={16} strokeWidth={2} />
              </span>
            </div>
            <div className="ap-scard-value">
              {loadingMain ? <Skeleton w={52} h={30} /> : value}
            </div>
            {delta && <div className={`ap-scard-delta ${deltaClass ?? ""}`}>{delta}</div>}
          </div>
        ))}
      </div>

      <div className="ap-row-2col">

        <div className="ap-panel">
          <div className="ap-panel-title">
            <span className="ap-panel-icon-pill ap-pill-green">
              <BarChart2 size={13} color="#1b5e20" />
            </span>
            Status Summary
          </div>
          {loadingMain ? <Skeleton h={220} /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusStats} barSize={36} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="status" tick={{ fill: "#888", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#aaa" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }}
                  cursor={{ fill: "rgba(21,83,24,0.05)" }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {statusStats.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLOR_MAP[statusKey(entry.status)] ?? "#155318"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="ap-panel">
          <div className="ap-panel-title">
            <span className="ap-panel-icon-pill ap-pill-red">
              <MapPin size={13} color="#b71c1c" />
            </span>
            Top Hotspot Areas
            <button className="ap-panel-link" onClick={() => goTo("/adminpanel/map")}>
              View on Map →
            </button>
          </div>
          {loadingMain
            ? [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={22} style={{ marginBottom: 8 }} />)
            : barangayRanking.length === 0
              ? <p className="ap-empty">No hotspot data available.</p>
              : (
                <div className="ap-hs-list">
                  {barangayRanking.slice(0, 5).map((h, i) => {
                    const pct = Math.round((h.count / (barangayRanking[0]?.count || 1)) * 100);
                    return (
                      <div
                        key={h.barangay}
                        className="ap-hs-row ap-hs-row-clickable"
                        onClick={() => goTo("/adminpanel/map", { barangay: h.barangay })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && goTo("/adminpanel/map", { barangay: h.barangay })}
                      >
                        <span className={`ap-hs-rank ${i === 0 ? "ap-hs-rank-top" : ""}`}>{i + 1}</span>
                        <span className="ap-hs-name">{h.barangay}</span>
                        <div className="ap-hs-track">
                          <div className="ap-hs-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="ap-hs-count">{h.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
        </div>
      </div>

      <div className="ap-row-2col">

        <div className="ap-panel">
          <div className="ap-panel-title">
            <span className="ap-panel-icon-pill ap-pill-blue">
              <Timer size={13} color="#1565c0" />
            </span>
            SLA &amp; Delay Tracking
          </div>
          {loadingMain
            ? <div className="ap-sla-grid"><Skeleton h={80} /><Skeleton h={80} /><Skeleton h={80} /><Skeleton h={80} /></div>
            : (
              <div className="ap-sla-grid">
                {[
                  { val: sla?.avg_resolution_days != null ? `${sla.avg_resolution_days.toFixed(1)}d` : "—", label: "Avg resolution time", cls: "" },
                  { val: sla?.overdue_count ?? 0,           label: "Overdue reports",  cls: (sla?.overdue_count ?? 0) > 0 ? "sla-danger" : "" },
                  { val: sla?.pending_over_3days ?? 0,      label: "Pending > 3 days", cls: (sla?.pending_over_3days ?? 0) > 0 ? "sla-warn" : "" },
                  { val: sla?.on_time_rate_pct != null ? `${sla.on_time_rate_pct}%` : "—", label: "On-time rate", cls: "" },
                ].map(({ val, label, cls }, i) => (
                  <div key={i} className={`ap-sla-card ${cls}`}>
                    <div className="ap-sla-val">{val}</div>
                    <div className="ap-sla-label">{label}</div>
                  </div>
                ))}
              </div>
            )}
        </div>

        <div className="ap-panel">
          <div className="ap-panel-title">
            <span className="ap-panel-icon-pill ap-pill-purple">
              <PieChartIcon size={13} color="#6a1b9a" />
            </span>
            Damage Categories
          </div>
          {loadingMain ? <Skeleton h={200} /> : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={damageStats} dataKey="value" nameKey="name" cx="50%" cy="44%" innerRadius={56} outerRadius={82} paddingAngle={4}>
                  {damageStats.map((_, i) => (
                    <Cell key={i} fill={DAMAGE_COLORS[i % DAMAGE_COLORS.length]} stroke="none" />
                  ))}
                </Pie>
                <Legend verticalAlign="bottom" iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "#666" }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="ap-panel ap-panel-full">
        <div className="ap-panel-title">
          <span className="ap-panel-icon-pill ap-pill-green">
            <TrendingUp size={13} color="#1b5e20" />
          </span>
          Submission Trends
          <div className="ap-trend-controls">
            {TREND_RANGES.map((r) => (
              <button key={r} className={`ap-trend-btn ${trendRange === r ? "active" : ""}`} onClick={() => setTrendRange(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
        {loadingMain ? <Skeleton h={180} /> : (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="period" tick={{ fill: "#888", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#aaa" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: 12 }} />
                <Line type="monotone" dataKey="Reports" stroke="#155318" strokeWidth={2.5} dot={{ r: 4, fill: "#155318", strokeWidth: 0 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
            {trendInsight && (
              <div className="ap-trend-chips">
                <span className={`ap-chip ${trendInsight.pct >= 0 ? "chip-up" : "chip-down"}`}>
                  {trendInsight.pct >= 0
                    ? <TrendingUp size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                    : <TrendingDown size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />
                  }
                  {trendInsight.pct >= 0 ? "+" : ""}{trendInsight.pct}% vs previous
                </span>
                <span className="ap-chip chip-neutral">Peak: <strong>{trendInsight.peak}</strong></span>
                <span className="ap-chip chip-neutral">Avg: <strong>{trendInsight.avg}</strong> / period</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ap-row-2col">

        <div className="ap-panel">
          <div className="ap-panel-title">
            <span className="ap-panel-icon-pill ap-pill-purple">
              <BrainCircuit size={13} color="#6a1b9a" />
            </span>
            AI Insights
            <span className="ap-badge-pill">ml_service</span>
          </div>
          {loadingMain
            ? [1, 2, 3, 4].map((i) => <Skeleton key={i} h={44} style={{ marginBottom: 8 }} />)
            : (
              <div className="ap-ai-list">
                {aiInsights?.low_confidence_pct != null && (
                  <div className="ap-ai-row ai-warn">
                    <span className="ap-ai-tag tag-warn">Warning</span>
                    {aiInsights.low_confidence_pct.toFixed(0)}% of reports have low AI confidence (&lt;50%)
                  </div>
                )}
                {aiInsights?.crack_change_pct != null && (
                  <div className={`ap-ai-row ${aiInsights.crack_change_pct > 0 ? "ai-danger" : "ai-info"}`}>
                    <span className={`ap-ai-tag ${aiInsights.crack_change_pct > 0 ? "tag-danger" : "tag-ok"}`}>Trend</span>
                    Crack reports {aiInsights.crack_change_pct > 0 ? "increased" : "decreased"} by {aiInsights.crack_change_pct > 0 ? "+" : ""}{aiInsights.crack_change_pct.toFixed(0)}% this week
                  </div>
                )}
                {aiInsights?.duplicate_count > 0 && (
                  <div className="ap-ai-row ai-info">
                    <span className="ap-ai-tag tag-info">Duplicate</span>
                    {aiInsights.duplicate_count} location{aiInsights.duplicate_count > 1 ? "s" : ""} reported multiple times
                  </div>
                )}
                {aiInsights?.avg_model_accuracy != null && (
                  <div className="ap-ai-row ai-ok">
                    <span className="ap-ai-tag tag-ok">Model</span>
                    Model accuracy stable at {aiInsights.avg_model_accuracy.toFixed(0)}% avg this period
                  </div>
                )}
                {!aiInsights && <p className="ap-empty">AI insights unavailable.</p>}
              </div>
            )}
        </div>

        <div className="ap-panel">
          <div className="ap-panel-title">
            <span className="ap-panel-icon-pill ap-pill-blue">
              <Radio size={13} color="#1565c0" />
            </span>
            Live Activity Feed
            <button className="ap-panel-link" onClick={() => goTo("/adminpanel/audit-log")}>
              Full log →
            </button>
          </div>
          {loadingMain
            ? [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} h={28} style={{ marginBottom: 8 }} />)
            : activityFeed.length === 0
              ? <p className="ap-empty">No recent activity.</p>
              : (
                <ul className="ap-feed">
                  {activityFeed.map((item, i) => (
                    <li key={i} className="ap-feed-item">
                      <span className={`ap-feed-dot ${ACTIVITY_DOT_MAP[item.type] ?? "dot-gray"}`} />
                      <span className="ap-feed-text">{item.message}</span>
                      <span className="ap-feed-time">{timeAgo(item.timestamp)}</span>
                    </li>
                  ))}
                </ul>
              )}
        </div>
      </div>

      <div className="ap-panel ap-panel-full">
        <div className="ap-panel-title">
          <span className="ap-panel-icon-pill ap-pill-green">
            <FolderOpen size={13} color="#1b5e20" />
          </span>
          Recent Reports
          <button className="ap-panel-link" onClick={() => goTo("/adminpanel/reports")}>
            View all →
          </button>
        </div>
        {loadingMain
          ? <Skeleton h={200} />
          : filteredReports.length === 0
            ? <p className="ap-empty">No reports match the current filters.</p>
            : (
              <div className="ap-table-wrap">
                <table className="ap-table">
                  <thead>
                    <tr>
                      {["Report ID", "Type", "Location", "Severity", "Status", "AI Confidence", "Submitted"].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((r) => (
                      <tr
                        key={r.id}
                        className="ap-table-row"
                        onClick={() => goTo(`/adminpanel/reports/${r.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && goTo(`/adminpanel/reports/${r.id}`)}
                      >
                        <td className="ap-td-id">{r.id}</td>
                        <td>{r.type}</td>
                        <td>{r.location}</td>
                        <td><span className={`ap-badge badge-${r.severity?.toLowerCase()}`}>{r.severity}</span></td>
                        <td><span className={`ap-badge badge-${r.status?.toLowerCase()}`}>{r.status}</span></td>
                        <td>
                          <span className="ap-confidence" style={{ color: confColor(r.confidence ?? 0) }}>
                            {r.confidence != null ? `${r.confidence}%` : "—"}
                          </span>
                        </td>
                        <td className="ap-td-date">
                          {r.submitted
                            ? new Date(r.submitted).toLocaleDateString("en-PH", { month: "short", day: "numeric" })
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>

    </div>
  );
}