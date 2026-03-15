import React from "react";
import { useState } from "react";
import "./Dashboard.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

//Icons
import { GiBookCover } from "react-icons/gi";
import { IoMdCheckmarkCircleOutline } from "react-icons/io";
import { FaExclamationCircle } from "react-icons/fa";
import { FaExclamation } from "react-icons/fa";
import { FaRegCircleDot } from "react-icons/fa6";
import { IoBarChart } from "react-icons/io5";
import { LuActivity } from "react-icons/lu";
import { FaChartPie } from "react-icons/fa";

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
  /* BACKEND-READY (replace with API calls) */

  //this const is for null/undefined value na data
  const rawSummary = {
  total: 120,
  critical: null,
  noncritical: undefined,
  completed: 35,
};

const summary = {
  total: rawSummary.total ?? 0,
  critical: rawSummary.critical ?? 0,
  noncritical: rawSummary.noncritical ?? 0,
  completed: rawSummary.completed ?? 0,
};

  const damageData = [
    { name: "Crack", value: 45 },
    { name: "Pothole", value: 75 },
  ];

  const [trendRange, setTrendRange] = useState("Daily");

  const trendDataMap = {
    Daily: [
      { period: "Mon", Reports: 12 },
      { period: "Tue", Reports: 18 },
      { period: "Wed", Reports: 25 },
      { period: "Thu", Reports: 20 },
      { period: "Fri", Reports: 30 },
    ],
    Weekly: [
      { period: "W1", Reports: 80 },
      { period: "W2", Reports: 120 },
      { period: "W3", Reports: 95 },
      { period: "W4", Reports: 150 },
    ],
    Monthly: [
      { period: "Jan", Reports: 220 },
      { period: "Feb", Reports: 180 },
      { period: "Mar", Reports: 260 },
      { period: "Apr", Reports: 300 },
    ],
};

  const trendData = trendDataMap[trendRange];

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

  const COLORS = ["#2ba81d", "#134d05"];

  return (
    <>
      <AppHeader />
      <Sidebar />

      <div 
      className="sidebar-overlay"
      onClick={() => {
        document.querySelector(".app-sidebar").classList.remove("active");
        document.querySelector(".sidebar-overlay").classList.remove("active");
      }}
    ></div>

      <div className="dashboard-container">
        {/* TOP SUMMARY */}
        <div className="dashboard-summary">
          <div className="summary-card total">
            <h3>Total Reports <GiBookCover className="icon" /></h3>
            <p>{summary.total}</p>
          </div>

          <div className="summary-card pending">
            <h3>Resolved <IoMdCheckmarkCircleOutline className="icon" /></h3>
            <p>{summary.completed}</p>
          </div>

          <div className="summary-card progress">
            <h3>Critical Reports <FaExclamationCircle className="icon" /></h3>
            <p>{summary.critical}</p>
          </div>

          <div className="summary-card completed">
            <h3>Non-Critical Reports <FaExclamation className="icon" /></h3>
            <p>{summary.noncritical}</p>
          </div>
        </div>

        {/* GRID PANELS */}
        <div className="dashboard-grid">
          {/* STATUS SUMMARY */}
          <div className="dashboard-panel">
            <h3>Status Summary <IoBarChart className="icon" /></h3>
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
            <h3>Recent Activities <LuActivity className="icon" /></h3>

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
            <h3>Damage Categories <FaChartPie className="icon" /></h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={damageData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="35%"
                  outerRadius={75}
                >
                  {damageData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Legend verticalAlign="top" align="left"/>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* SUBMISSION TRENDS */}
          <div className="dashboard-panel-submissiontrends">
            <div className="panel-header">
              <h3>Submission Trends</h3>

              {/* BACKEND-READY FILTER */}
              <select
                value={trendRange}
                onChange={(e) => setTrendRange(e.target.value)}
              >
                <option value="Daily">Daily</option>
                <option value="Weekly">Weekly</option>
                <option value="Monthly">Monthly</option>
              </select>

            </div>

            <ResponsiveContainer width="90%" height={150}>
              <LineChart data={trendData}>
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="Reports"
                  stroke="#087218"
                  strokeWidth={4}
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
