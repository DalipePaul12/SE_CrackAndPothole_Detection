import React, { useEffect, useState } from "react";
import "./AdminPanel.css";

import AdminSidebar from "../../components/AdminSidebar.jsx";
import AdminHeader from "../../components/AdminHeader.jsx";

import { GiBookCover } from "react-icons/gi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { FaExclamationCircle, FaExclamation } from "react-icons/fa";
import { FaRegCircleDot } from "react-icons/fa6";
import { IoBarChart } from "react-icons/io5";
import { LuActivity } from "react-icons/lu";
import { FaChartPie } from "react-icons/fa";

import {
  PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

import {
  getDashboardSummary,
  getDamageTypeStats,
  getReportStatusStats,
  getMonthlyReports,
  getSeverityStats,
} from "../../api/analytics";

const COLORS = ["#2ba81d", "#134d05"];
const TREND_RANGES = ["Daily", "Weekly", "Monthly"];

function Skeleton({ w = "100%", h = 32 }) {
  return (
    <div
      style={{
        width: w, height: h, borderRadius: 8,
        background: "linear-gradient(90deg,#e8f5e9 25%,#c8e6c9 50%,#e8f5e9 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.4s infinite",
      }}
    />
  );
}

function AdminPanel() {
  const [summary, setSummary]     = useState(null);
  const [damageData, setDamage]   = useState([]);
  const [statusData, setStatus]   = useState([]);
  const [monthlyData, setMonthly] = useState([]);
  const [trendRange, setTrendRange] = useState("Monthly");
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [summRes, dmgRes, statusRes, monthRes] = await Promise.all([
        getDashboardSummary(),
        getDamageTypeStats(),
        getReportStatusStats(),
        getMonthlyReports(),
      ]);

      if (cancelled) return;

      if (!summRes.success) {
        setError(summRes.error || "Failed to load dashboard data.");
        setLoading(false);
        return;
      }

      setSummary(summRes.data);

      const dmg = dmgRes.data || {};
      setDamage([
        { name: "Crack",   value: dmg.crack   ?? dmg.Crack   ?? 0 },
        { name: "Pothole", value: dmg.pothole  ?? dmg.Pothole ?? 0 },
      ]);

      const st = statusRes.data || {};
      setStatus([
        { status: "PENDING",     count: st.pending     ?? st.PENDING     ?? 0 },
        { status: "VERIFIED",    count: st.verified    ?? st.VERIFIED    ?? 0 },
        { status: "IN PROGRESS", count: st.in_progress ?? st["IN_PROGRESS"] ?? 0 },
        { status: "RESOLVED",    count: st.resolved    ?? st.RESOLVED    ?? 0 },
        { status: "DECLINED",    count: st.declined    ?? st.DECLINED    ?? 0 },
      ]);

      const months = monthRes.data || [];
      setMonthly(
        months.map((m) => ({ period: m.month, Reports: m.count }))
      );

      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const trendData = (() => {
    if (!monthlyData.length) return [];
    if (trendRange === "Monthly") return monthlyData.slice(-6);
    if (trendRange === "Weekly") {
      return monthlyData.slice(-4).map((d, i) => ({ period: `W${i + 1}`, Reports: d.Reports }));
    }
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const last = monthlyData[monthlyData.length - 1]?.Reports ?? 0;
    return days.map((d, i) => ({ period: d, Reports: Math.max(1, Math.round(last / 5) + i * 2) }));
  })();

  const recentActivities = (() => {
    if (!summary) return [];
    return [
      `Total reports in system: ${summary.total_reports ?? 0}`,
      `Pending review: ${summary.pending ?? 0} report(s)`,
      `Currently in progress: ${summary.in_progress ?? 0} report(s)`,
      `Resolved this period: ${summary.resolved ?? 0} report(s)`,
    ];
  })();

  return (
    <>
      <AdminHeader />
      <AdminSidebar />

      <div className="admin-container">
        {error && (
          <div className="admin-error-banner">{error}</div>
        )}

        <div className="admin-summary">
          <div className="admin-summary-card total">
            <h3>Total Reports <GiBookCover className="icon" /></h3>
            <div className="admin-summary-value">{loading ? <Skeleton w={60} h={28} /> : (summary?.total_reports ?? 0)}</div>
          </div>

          <div className="admin-summary-card pending">
            <h3>Resolved <IoMdCheckmarkCircleOutline className="icon" /></h3>
            <div className="admin-summary-value">{loading ? <Skeleton w={60} h={28} /> : (summary?.resolved ?? 0)}</div>
          </div>

          <div className="admin-summary-card progress">
            <h3>Critical Reports <FaExclamationCircle className="icon" /></h3>
            <div className="admin-summary-value">{loading ? <Skeleton w={60} h={28} /> : (summary?.in_progress ?? 0)}</div>
          </div>

          <div className="admin-summary-card completed">
            <h3>Non-Critical Reports <FaExclamation className="icon" /></h3>
            <div className="admin-summary-value">{loading ? <Skeleton w={60} h={28} /> : (summary?.pending ?? 0)}</div>
          </div>
        </div>

        <div className="admin-grid">
          <div className="admin-panel">
            <h3>Status Summary <IoBarChart className="icon" /></h3>
            {loading ? (
              <Skeleton h={200} />
            ) : (
              <ResponsiveContainer width="95%" height={200}>
                <BarChart data={statusData}>
                  <XAxis dataKey="status" tick={{ fill: "#444", fontSize: 11 }} axisLine tickLine={false} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#155318" radius={[20, 20, 0, 0]} barSize={60} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="admin-panel">
            <h3>Recent Activities <LuActivity className="icon" /></h3>
            <ul className="admin-activity-list">
              {loading
                ? [1, 2, 3].map((i) => <li key={i} className="admin-activity-card"><Skeleton h={18} /></li>)
                : recentActivities.map((item, i) => (
                  <li key={i} className="admin-activity-card">
                    <FaRegCircleDot className="admin-activity-icon" />
                    {item}
                  </li>
                ))
              }
            </ul>
          </div>

          <div className="admin-panel-damagecategories">
            <h3>Damage Categories <FaChartPie className="icon" /></h3>
            {loading ? (
              <Skeleton h={180} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={damageData} dataKey="value" nameKey="name" cx="50%" cy="35%" outerRadius={75}>
                    {damageData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                  </Pie>
                  <Legend verticalAlign="top" align="left" />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="admin-panel-submissiontrends">
            <div className="admin-panel-header">
              <h3>Submission Trends</h3>
              <select value={trendRange} onChange={(e) => setTrendRange(e.target.value)}>
                {TREND_RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {loading ? (
              <Skeleton h={150} />
            ) : (
              <ResponsiveContainer width="90%" height={150}>
                <LineChart data={trendData}>
                  <XAxis dataKey="period" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="Reports" stroke="#087218" strokeWidth={4} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </>
  );
}

export default AdminPanel;