import "./UserSidebar.css";
import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { useTheme } from "../pages/Contexts/ThemeContext";
import { useNotifications } from "../hooks/useNotifications";
import CreateReport from "../pages/Inside-App-User/CreateReport";

import {
  LayoutDashboard, BookOpen, Map, User, Compass,
  Bell, Settings, Sun, Moon, PlusCircle,
  ChevronLeft, ChevronRight, LogOut
} from "lucide-react";

/* ── Inline logo ── */
function SnapLogo() {
  return (
    <div className="user-logo-fallback">
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="48" height="48" rx="14" fill="url(#lg)" />
        <circle cx="24" cy="24" r="12" stroke="#fff" strokeWidth="3" fill="none" />
        <path d="M24 12v6M24 30v6M12 24h6M30 24h6" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#4caf50" />
            <stop offset="1" stopColor="#2e7d32" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function UserSidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const { unreadCount } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [showReportModal, setShowReportModal] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const isDark = theme === "dark";

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (onClose) onClose();
  }, [location.pathname]);

  const mainNavItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/dashboard/reports", icon: BookOpen, label: "All Reports" },
    { to: "/dashboard/mapview", icon: Map, label: "Map View" },
  ];

  const personalNavItems = [
    { to: "/dashboard/profile", icon: User, label: "My Profile" },
    { to: "/dashboard/submissions", icon: Compass, label: "My Submissions" },
  ];

  const otherNavItems = [
    { to: "/dashboard/notifications", icon: Bell, label: "Notifications", badge: unreadCount },
    { to: "/dashboard/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <aside className={`user-sidebar ${isCollapsed ? "collapsed" : ""} ${isOpen ? "mobile-open" : ""}`}>

      <div className="user-sidebar-header">
        <div className={`user-sidebar-brand ${isCollapsed ? "hidden" : ""}`}>
          <SnapLogo />
          <h2>Snap2Fix</h2>
        </div>

        {!isMobile && (
          <button className="user-collapse-btn" onClick={onToggleCollapse}>
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
      </div>

      <button
        className={`user-report-btn ${isCollapsed ? "collapsed" : ""}`}
        onClick={() => { setShowReportModal(true); onClose?.(); }}
        title={isCollapsed ? "Report Damage" : ""}
      >
        <PlusCircle size={20} />
        <span className={isCollapsed ? "hidden" : ""}>Report Road Damage</span>
      </button>

      {showReportModal && <CreateReport onClose={() => setShowReportModal(false)} />}

      <nav className="user-sidebar-nav">
        {/* ── Main Menu ── */}
        <div className="user-nav-section">
          {!isCollapsed && <label className="user-section-label">Main Menu</label>}
          {isCollapsed && <div className="user-section-spacer" />}

          {mainNavItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`user-nav-link ${isActive ? "active" : ""}`}
                title={isCollapsed ? item.label : ""}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isCollapsed ? "hidden" : ""}>{item.label}</span>
                {/* Active dot when collapsed */}
                {isCollapsed && isActive && <span className="user-active-dot" />}
              </Link>
            );
          })}
        </div>

        {/* ── Personal ── */}
        <div className="user-nav-section">
          {!isCollapsed && <label className="user-section-label">Personal</label>}
          {isCollapsed && <div className="user-section-spacer" />}

          {personalNavItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`user-nav-link ${isActive ? "active" : ""}`}
                title={isCollapsed ? item.label : ""}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isCollapsed ? "hidden" : ""}>{item.label}</span>
                {/* Active dot when collapsed */}
                {isCollapsed && isActive && <span className="user-active-dot" />}
              </Link>
            );
          })}
        </div>

        {/* ── Others ── */}
        <div className="user-nav-section user-others-section">
          {otherNavItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`user-nav-link ${isActive ? "active" : ""}`}
                title={isCollapsed ? item.label : ""}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isCollapsed ? "hidden" : ""}>{item.label}</span>
                {item.badge > 0 && (
                <span className={`user-notification-badge ${isCollapsed ? "collapsed-badge" : ""}`}>
                  {item.badge}
                </span>
              )}
                {isCollapsed && isActive && <span className="user-active-dot" />}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="user-sidebar-footer">
        <button
          className="user-footer-btn"
          onClick={toggleTheme}
          title={isCollapsed ? (isDark ? "Light Mode" : "Dark Mode") : ""}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          <span className={isCollapsed ? "hidden" : ""}>{isDark ? "Light Mode" : "Dark Mode"}</span>
          {!isCollapsed && (
            <span className={`user-toggle-pill ${isDark ? "on" : ""}`}>
              <span className="user-toggle-knob" />
            </span>
          )}
        </button>

        <button className="user-footer-btn user-logout-btn" title={isCollapsed ? "Logout" : ""}>
          <LogOut size={18} />
          <span className={isCollapsed ? "hidden" : ""}>Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default UserSidebar;