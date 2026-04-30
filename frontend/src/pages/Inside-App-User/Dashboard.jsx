import React, { useState, useCallback } from "react";
import "./Dashboard.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { SeverityInline } from "../../components/SeverityBadge.jsx";

import { GiBookCover } from "react-icons/gi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { FaExclamationCircle, FaChartPie, FaUsers } from "react-icons/fa";
import { FaRegCircleDot } from "react-icons/fa6";
import { IoBarChart } from "react-icons/io5";
import { LuActivity } from "react-icons/lu";
import { MdOutlinePendingActions } from "react-icons/md";

import {
  PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

import { useAnalytics, invalidateAnalyticsCache } from "../../hooks/useAnalytics";
import { useReports } from "../../hooks/useReports";

const PIE_COLORS = ["#155318", "#2ba81d", "#5cd65c", "#98e698"];
const BAR_COLOR  = "#155318";

// ── Helpers ────────────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="summary-card skeleton" aria-busy="true">
      <div className="skeleton-line short" />
      <div className="skeleton-line tall"  />
    </div>
  );
}

function SkeletonPanel() {
  return (
    <div className="dashboard-panel skeleton" aria-busy="true">
      <div className="skeleton-line short" style={{ marginBottom: "1rem" }} />
      <div className="skeleton-block" />
    </div>
  );
}

// ── Citizen view — personal stats only ────────────────────────────────────────
function CitizenDashboard() {
  const { reports, loading, total } = useReports({ mine: true });

  const pending    = reports.filter(r => r.status?.toLowerCase() === "pending").length;
  const verified   = reports.filter(r => r.status?.toLowerCase() === "verified").length;
  const inProgress = reports.filter(r => r.status?.toLowerCase() === "in_progress").length;
  const resolved   = reports.filter(r => r.status?.toLowerCase() === "resolved").length;

  // Damage breakdown for pie chart
  const crackCount   = reports.filter(r => r.ai_damage_type?.toLowerCase() === "crack").length;
  const potholeCount = reports.filter(r => r.ai_damage_type?.toLowerCase() === "pothole").length;
  const damageStats  = [
    ...(crackCount   > 0 ? [{ name: "Crack",   value: crackCount }]   : []),
    ...(potholeCount > 0 ? [{ name: "Pothole", value: potholeCount }] : []),
  ];

  return (
    <div className="dashboard-container">
      {/* ── Personal summary cards ──────────────────────────────────────── */}
      <div className="dashboard-summary">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <div className="summary-card total">
              <h3>My Reports <GiBookCover className="icon" /></h3>
              <p>{total}</p>
            </div>
            <div className="summary-card pending">
              <h3>Pending <MdOutlinePendingActions className="icon" /></h3>
              <p>{pending}</p>
            </div>
            <div className="summary-card progress">
              <h3>In Progress <FaExclamationCircle className="icon" /></h3>
              <p>{inProgress}</p>
            </div>
            <div className="summary-card completed">
              <h3>Resolved <IoMdCheckmarkCircleOutline className="icon" /></h3>
              <p>{resolved}</p>
            </div>
          </>
        )}
      </div>

      {/* ── Personal charts ─────────────────────────────────────────────── */}
      <div className="dashboard-grid">

        {/* Status breakdown bar */}
        <div className="dashboard-panel">
          <h3>My Report Status <IoBarChart className="icon" /></h3>
          {loading ? <SkeletonPanel /> : (
            total === 0 ? (
              <p className="empty-state">No report data available.</p>
            ) : (
              <ResponsiveContainer width="95%" height={200}>
                <BarChart data={[
                  { status: "Pending",     count: pending },
                  { status: "Verified",    count: verified },
                  { status: "In Progress", count: inProgress },
                  { status: "Resolved",    count: resolved },
                ]}>
                  <XAxis dataKey="status" tick={{ fill: "#444", fontSize: 12 }} tickLine={false} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v} reports`, "Count"]} />
                  <Bar dataKey="count" fill={BAR_COLOR} radius={[8, 8, 0, 0]} maxBarSize={80} />
                </BarChart>
              </ResponsiveContainer>
            )
          )}
        </div>

        {/* Recent submissions list */}
        <div className="dashboard-panel">
          <h3>Recent Submissions <LuActivity className="icon" /></h3>
          {loading ? <SkeletonPanel /> : (
            <ul className="activity-list">
              {reports.length > 0 ? (
                reports.slice(0, 4).map((r) => (
                  <li key={r.id} className="activity-card">
                    <FaRegCircleDot className="activity-icon" />
                    <SeverityInline severity={r.ai_severity} damageType={r.ai_damage_type} confidence={r.ai_confidence} />
                    Report #{r.id} — {r.barangay ?? "Unknown"} —{" "}
                    <span style={{ textTransform: "capitalize" }}>{r.status}</span>
                  </li>
                ))
              ) : (
                <li className="activity-card empty-state">No submissions yet.</li>
              )}
            </ul>
          )}
        </div>

        {/* Damage type pie */}
        <div className="dashboard-panel-damagecategories">
          <h3>My Damage Types <FaChartPie className="icon" /></h3>
          {loading ? <SkeletonPanel /> : (
            damageStats.length === 0 ? (
              <p className="empty-state">No damage data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={damageStats} dataKey="value" nameKey="name"
                    cx="50%" cy="40%" outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {damageStats.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="bottom" align="center" />
                  <Tooltip formatter={(v) => [`${v} reports`, "Count"]} />
                </PieChart>
              </ResponsiveContainer>
            )
          )}
        </div>

        {/* Empty 4th panel placeholder to keep grid layout consistent */}
        <div className="dashboard-panel-submissiontrends">
          <h3>Tips</h3>
          <ul className="activity-list">
            <li className="activity-card"><FaRegCircleDot className="activity-icon" /> Submit clear photos for better AI detection</li>
            <li className="activity-card"><FaRegCircleDot className="activity-icon" /> Add a description to help LGU prioritize</li>
            <li className="activity-card"><FaRegCircleDot className="activity-icon" /> Check your submissions for status updates</li>
          </ul>
        </div>

      </div>
    </div>
  );
}

// ── Admin/Contractor view — full system analytics ──────────────────────────────
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

  return (
    <div className="dashboard-container">
      {error && (
        <div className="dashboard-error-banner" role="alert">
          <FaExclamationCircle className="error-icon" />
          <span>{error}</span>
          <button className="retry-btn" onClick={handleRefresh}>Retry</button>
        </div>
      )}

      <div className="dashboard-summary">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <div className="summary-card total">
              <h3>Total Reports <GiBookCover className="icon" /></h3>
              <p>{summary?.total_reports ?? 0}</p>
            </div>
            <div className="summary-card completed">
              <h3>Resolved <IoMdCheckmarkCircleOutline className="icon" /></h3>
              <p>{summary?.resolved ?? 0}</p>
            </div>
            <div className="summary-card progress">
              <h3>In Progress <FaExclamationCircle className="icon" /></h3>
              <p>{summary?.in_progress ?? 0}</p>
            </div>
            <div className="summary-card pending">
              <h3>Pending <MdOutlinePendingActions className="icon" /></h3>
              <p>{summary?.pending ?? 0}</p>
            </div>
            <div className="summary-card users">
              <h3>Active Users <FaUsers className="icon" /></h3>
              <p>{summary?.active_users ?? 0}</p>
            </div>
          </>
        )}
      </div>

      <div className="dashboard-grid">
        <div className="dashboard-panel">
          <h3>Status Summary <IoBarChart className="icon" /></h3>
          {loading ? <SkeletonPanel /> : statusStats.length === 0 ? (
            <p className="empty-state">No report data available.</p>
          ) : (
            <ResponsiveContainer width="95%" height={200}>
              <BarChart data={statusStats}>
                <XAxis dataKey="status" tick={{ fill: "#444", fontSize: 12 }} tickLine={false} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} reports`, "Count"]} />
                <Bar dataKey="count" fill={BAR_COLOR} radius={[8, 8, 0, 0]} maxBarSize={80} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="dashboard-panel">
          <h3>Report Hotspots <LuActivity className="icon" /></h3>
          {loading ? <SkeletonPanel /> : (
            <ul className="activity-list">
              {hotspots.length > 0 ? hotspots.map((item, i) => (
                <li key={i} className="activity-card">
                  <FaRegCircleDot className="activity-icon" />{item}
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
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={damageStats} dataKey="value" nameKey="name"
                  cx="50%" cy="40%" outerRadius={80}
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
          {loading ? <SkeletonPanel /> : monthlyData.length === 0 ? (
            <p className="empty-state">No trend data available.</p>
          ) : (
            <ResponsiveContainer width="95%" height={160}>
              <LineChart data={monthlyData}>
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(v) => [`${v} reports`, "Submissions"]} />
                <Line type="monotone" dataKey="Reports" stroke="#087218"
                  strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root — role gate ───────────────────────────────────────────────────────────
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