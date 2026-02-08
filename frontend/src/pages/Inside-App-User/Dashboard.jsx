import React from "react";
import "./Dashboard.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

//Icons
import { GiBookCover } from "react-icons/gi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { FaExclamationCircle } from "react-icons/fa";
import { FaExclamation } from "react-icons/fa";
import { FaRegCircleDot } from "react-icons/fa6";

// Charts
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

function Dashboard() {
  /* 🔌 BACKEND-READY DATA (replace with API calls later) */

  const summary = {
    total: 120,
    pending: 30,
    inProgress: 55,
    completed: 35,
  };

  const damageData = [
    { name: "Crack", value: 45 },
    { name: "Pothole", value: 75 },
  ];

  const trendData = [
    { period: "Mon", reports: 12 },
    { period: "Tue", reports: 18 },
    { period: "Wed", reports: 25 },
    { period: "Thu", reports: 20 },
    { period: "Fri", reports: 30 },
  ];

  const statusData = [
    { status: "PENDING", count: 30 },
    { status: "IN PROGRESS", count: 55 },
    { status: "COMPLETED", count: 35 },
  ];

  const recentActivities = [
    "New pothole reported in EDSA",
    "Report #023 marked as In Progress",
    "Crack repair completed in Quezon City",
  ];

  const COLORS = ["#f39c12", "#c0392b"];

  return (
    <>
      <AppHeader />
      <Sidebar />

      <div className="dashboard-container">
        {/* TOP SUMMARY */}
        <div className="dashboard-summary">
          <div className="summary-card total">
            <h3>Total Reports <GiBookCover className="icon" /></h3>
            <p>{summary.total}</p>
          </div>

          <div className="summary-card pending">
            <h3>Resolved <IoMdCheckmarkCircleOutline className="icon" /></h3>
            <p>{summary.pending}</p>
          </div>

          <div className="summary-card progress">
            <h3>Critical Reports <FaExclamationCircle className="icon" /></h3>
            <p>{summary.inProgress}</p>
          </div>

          <div className="summary-card completed">
            <h3>Non-Critical Reports <FaExclamation className="icon" /></h3>
            <p>{summary.completed}</p>
          </div>
        </div>

        {/* GRID PANELS */}
        <div className="dashboard-grid">
          {/* STATUS SUMMARY */}
          <div className="dashboard-panel">
            <h3>Status Summary</h3>
            <ResponsiveContainer width="95%" height={200}>
              <BarChart data={statusData}>
               <XAxis
                dataKey="status"
                tick={{ fill: "#444", fontSize: 12 }}
                axisLine={true}
                tickLine={false}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#155318" radius={[20, 20, 0, 0]} barSize={120}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

            {/* RECENT ACTIVITIES */} {/*ONLY 3 RECENT ACTIVITIES TO SHOW LANG}*/}
            <div className="dashboard-panel">
            <h3>Recent Activities</h3>

            <ul className="activity-list">
                {recentActivities.map((item, index) => (
                <li key={index} className="activity-card">
                    <FaRegCircleDot className="activity-icon" />
                    {item}
                </li>
                ))}
            </ul>
            </div>


          {/* DAMAGE CATEGORIES */}
          <div className="dashboard-panel-damagecategories">
            <h3>Damage Categories</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={damageData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={60}
                >
                  {damageData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* SUBMISSION TRENDS */}
          <div className="dashboard-panel">
            <div className="panel-header">
              <h3>Submission Trends</h3>

              {/* BACKEND-READY FILTER */}
              <select>
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </div>

            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="reports"
                  stroke="#1976d2"
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}

export default Dashboard;
