import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "./AdminSidebar.css";

import { MdDashboard, MdReport, MdMap, MdManageAccounts } from "react-icons/md";
import { FaClipboardList, FaRoad } from "react-icons/fa";
import { IoLogOut } from "react-icons/io5";

const NAV_ITEMS = [
  { to: "/adminpanel",               label: "Dashboard",       icon: <MdDashboard /> },
  { to: "/adminpanel/reports",       label: "All Reports",     icon: <MdReport /> },
  { to: "/adminpanel/map",           label: "Map View",        icon: <MdMap /> },
  { to: "/adminpanel/requests",      label: "Manage Requests", icon: <FaClipboardList /> },
  { to: "/adminpanel/managereports", label: "Manage Reports",  icon: <MdManageAccounts /> },
  { to: "/adminpanel/managestreets", label: "Manage Streets",  icon: <FaRoad /> },
];

function AdminSidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <div className="admin-sidebar-logo">
          <img src="/logo.png" alt="Snap2Fix" onError={(e) => { e.target.style.display = "none"; }} />
        </div>
        <span className="admin-sidebar-appname">Snap2Fix</span>
        <span className="admin-sidebar-role-badge">ADMIN</span>
      </div>

      <p className="admin-sidebar-section-label">ADMIN DASHBOARD</p>

      <nav className="admin-sidebar-nav">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/adminpanel"}
            className={({ isActive }) =>
              `admin-sidebar-link${isActive ? " active" : ""}`
            }
          >
            <span className="admin-sidebar-link-icon">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <button className="admin-sidebar-logout" onClick={handleLogout}>
        <IoLogOut />
        Logout
      </button>
    </aside>
  );
}

export default AdminSidebar;