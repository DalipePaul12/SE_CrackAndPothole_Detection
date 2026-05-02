import "./Sidebar.css";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

import CreateReport from "../pages/Inside-App-User/CreateReport";
import { useNotifications } from "../hooks/useNotifications";
import { useTheme } from "../pages/Contexts/ThemeContext";

import { Moon, Sun } from "lucide-react";
import { FaHome, FaMapMarkedAlt, FaUser } from "react-icons/fa";
import { IoAddCircleOutline, IoSettingsSharp, IoNotifications } from "react-icons/io5";
import { RiCompassDiscoverFill } from "react-icons/ri";
import { GiBookshelf } from "react-icons/gi";

function Sidebar({ isOpen, onClose }) {
  const { unreadCount }        = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const location               = useLocation();
  const [showReportModal, setShowReportModal] = useState(false);

  const isDark = theme === "dark";

  return (
    <aside className={`app-sidebar ${isOpen ? "active" : ""}`}>

      {/* ── Logo ── */}
      <div className="sidebar-logo">
        <img src="/snap.jpg" alt="Snap2Fix Logo" />
        <h2>Snap2Fix</h2>
      </div>

      {/* ── Nav (scrollable middle) ── */}
      <nav className="sidebar-nav">
        <div className="sidebar-main-section">
          <button
            className="sidebar-reports-button"
            onClick={() => { setShowReportModal(true); onClose?.(); }}
          >
            <IoAddCircleOutline className="addreport-icon" />
            Report Road Damage
          </button>

          {showReportModal && (
            <CreateReport onClose={() => setShowReportModal(false)} />
          )}

          <label className="sidebar-section-label">Main Menu</label>

          <Link to="/dashboard" onClick={onClose}
            className={`sidebar-link ${location.pathname === "/dashboard" ? "active" : ""}`}>
            <FaHome /> Dashboard
          </Link>

          <Link to="/dashboard/reports" onClick={onClose}
            className={`sidebar-link ${location.pathname === "/dashboard/reports" ? "active" : ""}`}>
            <GiBookshelf /> All Reports
          </Link>

          <Link to="/dashboard/mapview" onClick={onClose}
            className={`sidebar-link ${location.pathname === "/dashboard/mapview" ? "active" : ""}`}>
            <FaMapMarkedAlt /> Map View
          </Link>

          <label className="sidebar-section-label">Personal</label>

          <Link to="/dashboard/profile" onClick={onClose}
            className={`sidebar-link ${location.pathname === "/dashboard/profile" ? "active" : ""}`}>
            <FaUser /> My Profile
          </Link>

          <Link to="/dashboard/submissions" onClick={onClose}
            className={`sidebar-link ${location.pathname === "/dashboard/submissions" ? "active" : ""}`}>
            <RiCompassDiscoverFill className="submissions-icon" /> My Submissions
          </Link>
        </div>

        {/* ── Other links ── */}
        <div className="sidebar-other-section">
          <Link to="/dashboard/notifications" onClick={onClose}
            className={`sidebar-link-others ${location.pathname === "/dashboard/notifications" ? "active" : ""}`}>
            <IoNotifications /> Notifications
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </Link>

          <Link to="/dashboard/settings" onClick={onClose}
            className={`sidebar-link-others ${location.pathname === "/dashboard/settings" ? "active" : ""}`}>
            <IoSettingsSharp /> Settings
          </Link>
        </div>
      </nav>

      {/* ── Footer: theme toggle pinned to bottom ── */}
      <div className="sidebar-footer">
        <button
          className="theme-toggle-btn"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {/* Sun / Moon icon on the left */}
          <span className={`theme-icon-wrap ${isDark ? "is-dark" : "is-light"}`}>
            {isDark
              ? <Sun  size={15} strokeWidth={2} className="theme-sun-icon"  />
              : <Moon size={15} strokeWidth={2} className="theme-moon-icon" />
            }
          </span>

          {/* Label */}
          <span className="theme-label">
            {isDark ? "Light Mode" : "Dark Mode"}
          </span>

          {/* Pill toggle on the right */}
          <span className={`theme-track ${isDark ? "track-dark" : "track-light"}`}>
            <span className={`theme-thumb ${isDark ? "thumb-right" : "thumb-left"}`} />
          </span>
        </button>
      </div>

    </aside>
  );
}

export default Sidebar;