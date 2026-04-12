import React, { useState } from "react";
import "./Dashboard.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

import { GiBookCover } from "react-icons/gi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { FaExclamationCircle, FaExclamation, FaChartPie } from "react-icons/fa";
import { FaRegCircleDot } from "react-icons/fa6";
import { IoBarChart } from "react-icons/io5";
import { LuActivity } from "react-icons/lu";

import {
  PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, BarChart, Bar,
} from "recharts";

import { useAnalytics } from "../../hooks/useAnalytics";

const COLORS = ["#2ba81d", "#134d05"];

function Dashboard() {
  const {
    summary, damageStats, statusStats, monthlyData, loading,
  } = useAnalytics();

  const [trendRange, setTrendRange] = useState("Monthly");

  const recentActivities = statusStats.slice(0, 3).map(
    (s) => `${s.status}: ${s.count} report(s)`
  );

  return (
    <>
      <AppHeader />
      <Sidebar />

      <div
        className="sidebar-overlay"
        onClick={() => {
          document.querySelector(".app-sidebar")?.classList.remove("active");
          document.querySelector(".sidebar-overlay")?.classList.remove("active");
        }}
      />

      <div className="dashboard-container">
        {loading ? (
          <p style={{ padding: "2rem" }}>Loading dashboard...</p>
        ) : (
          <>
            {/* TOP SUMMARY */}
            <div className="dashboard-summary">
              <div className="summary-card total">
                <h3>Total Reports <GiBookCover className="icon" /></h3>
                <p>{summary?.total_reports ?? 0}</p>
              </div>
              <div className="summary-card pending">
                <h3>Resolved <IoMdCheckmarkCircleOutline className="icon" /></h3>
                <p>{summary?.completed ?? 0}</p>
              </div>
              <div className="summary-card progress">
                <h3>Critical Reports <FaExclamationCircle className="icon" /></h3>
                <p>{summary?.pending ?? 0}</p>
              </div>
              <div className="summary-card completed">
                <h3>Active Users <FaExclamation className="icon" /></h3>
                <p>{summary?.active_users ?? 0}</p>
              </div>
            </div>

            {/* GRID PANELS */}
            <div className="dashboard-grid">
              <div className="dashboard-panel">
                <h3>Status Summary <IoBarChart className="icon" /></h3>
                <ResponsiveContainer width="95%" height={200}>
                  <BarChart data={statusStats}>
                    <XAxis dataKey="status" tick={{ fill: "#444", fontSize: 12 }} axisLine tickLine={false} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#155318" radius={[20, 20, 0, 0]} barSize={120} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="dashboard-panel">
                <h3>Recent Activities <LuActivity className="icon" /></h3>
                <ul className="activity-list">
                  {recentActivities.length > 0 ? (
                    recentActivities.map((item, index) => (
                      <li key={index} className="activity-card">
                        <FaRegCircleDot className="activity-icon" />
                        {item}
                      </li>
                    ))
                  ) : (
                    <li className="activity-card">No recent activity yet.</li>
                  )}
                </ul>
              </div>

              <div className="dashboard-panel-damagecategories">
                <h3>Damage Categories <FaChartPie className="icon" /></h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={damageStats} dataKey="value" nameKey="name" cx="50%" cy="35%" outerRadius={75}>
                      {damageStats.map((_, index) => (
                        <Cell key={index} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="top" align="left" />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="dashboard-panel-submissiontrends">
                <div className="panel-header">
                  <h3>Submission Trends</h3>
                  <select value={trendRange} onChange={(e) => setTrendRange(e.target.value)}>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
                <ResponsiveContainer width="90%" height={150}>
                  <LineChart data={monthlyData}>
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="Reports" stroke="#087218" strokeWidth={4} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default Dashboard;