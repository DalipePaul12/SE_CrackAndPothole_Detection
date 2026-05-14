import "./AdminSidebar.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDarkMode } from "../hooks/useDarkMode";

import {
  LayoutDashboard, BookOpen, Map, ClipboardList, BookText, GitBranch,
  Sun, Moon, ChevronLeft, ChevronRight, LogOut, Settings
} from "lucide-react";

/* ── Inline logo (no external file needed) ── */
function SnapLogo() {
  return (
    <div className="admin-logo-fallback">
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

function AdminSidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (onClose) onClose();
  }, [location.pathname]);

  const handleLogout = () => {
    // Clear auth tokens / session storage
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();
    // Navigate to landing page
    navigate("/", { replace: true });
  };

  const navItems = [
    { to: "/adminpanel", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/adminpanel/reports", icon: BookOpen, label: "All Reports" },
    { to: "/adminpanel/map", icon: Map, label: "Map View" },
    { to: "/adminpanel/requests", icon: ClipboardList, label: "Manage Requests" },
    { to: "/adminpanel/managereports", icon: BookText, label: "Manage Reports" },
    { to: "/adminpanel/managestreets", icon: GitBranch, label: "Manage Streets" },
  ];

  return (
    <aside className={`admin-sidebar ${isCollapsed ? "collapsed" : ""} ${isOpen ? "mobile-open" : ""}`}>

      <div className="admin-sidebar-header">
        <div className={`admin-sidebar-brand ${isCollapsed ? "hidden" : ""}`}>
          <SnapLogo />
          <div className="admin-brand-text">
            <h2>Snap2Fix</h2>
            <span className="admin-badge">ADMIN</span>
          </div>
        </div>

        {!isMobile && (
          <button
            className="admin-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
      </div>

      <nav className="admin-sidebar-nav">
        <div className="admin-nav-section">
          {!isCollapsed && <label className="admin-section-label">Admin Dashboard</label>}
          {isCollapsed && <div className="admin-section-spacer" />}

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`admin-nav-link ${isActive ? "active" : ""}`}
                title={isCollapsed ? item.label : ""}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isCollapsed ? "hidden" : ""}>{item.label}</span>
                {isCollapsed && isActive && <span className="admin-active-dot" />}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="admin-sidebar-footer">
        {!isCollapsed && <label className="admin-section-label">Preferences</label>}
        {isCollapsed && <div className="admin-section-spacer" />}

        <button
          className="admin-footer-btn"
          onClick={toggle}
          title={isCollapsed ? (isDark ? "Light Mode" : "Dark Mode") : ""}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          <span className={isCollapsed ? "hidden" : ""}>{isDark ? "Light Mode" : "Dark Mode"}</span>
          {!isCollapsed && (
            <span className={`admin-toggle-pill ${isDark ? "on" : ""}`}>
              <span className="admin-toggle-knob" />
            </span>
          )}
        </button>

        <Link
          to="/adminpanel/settings"
          className={`admin-footer-btn ${location.pathname === "/adminpanel/settings" ? "active" : ""}`}
          title={isCollapsed ? "Settings" : ""}
        >
          <Settings size={18} />
          <span className={isCollapsed ? "hidden" : ""}>Settings</span>
        </Link>

        <button
          className="admin-footer-btn admin-logout-btn"
          onClick={handleLogout}
          title={isCollapsed ? "Logout" : ""}
        >
          <LogOut size={18} />
          <span className={isCollapsed ? "hidden" : ""}>Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default AdminSidebar;