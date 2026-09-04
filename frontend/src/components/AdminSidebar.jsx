import "./AdminSidebar.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDarkMode } from "../hooks/useDarkMode";
import { useAuthContext } from "../pages/Contexts/AuthContext.jsx";
import ConfirmChangesModal from "../pages/PopUps/ConfirmChangesModal.jsx";
import {
  LayoutDashboard, BookOpen, Map, ClipboardList, BookText, GitBranch,
  Sun, Moon, ChevronLeft, ChevronRight, LogOut, Settings, Users, ScrollText
} from "lucide-react";

/* ── Logo using /snap.jpg with SVG fallback ── */
function SnapLogo() {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    // Fallback SVG when /snap.jpg fails to load - green circle with subtle dark green strokes
    return (
      <div className="admin-logo-fallback">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="24" fill="url(#lg)" />
          <circle cx="24" cy="24" r="12" stroke="#2e7d32" strokeWidth="2" fill="none" opacity="0.5" />
          <path d="M24 12v6M24 30v6M12 24h6M30 24h6" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
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

  return (
    <div className="admin-logo-fallback">
      <img
        src="/snap.jpg"
        alt="Snap2Fix"
        className="admin-sidebar-logo-img"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

function AdminSidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();
  const { user } = useAuthContext();
  const isSuperAdmin = user?.role === "superadmin";
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (onClose) onClose();
  }, [location.pathname]);

  const confirmLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();
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

  {/* Superadmin-only section, with its own label */}
  {isSuperAdmin && (
    <div className="admin-nav-section">
      {!isCollapsed && <label className="admin-section-label">Superadmin</label>}
      {isCollapsed && <div className="admin-section-spacer" />}

      {(() => {
        const isActive = location.pathname === "/adminpanel/users";
        return (
          <Link
            to="/adminpanel/users"
            onClick={onClose}
            className={`admin-nav-link ${isActive ? "active" : ""}`}
            title={isCollapsed ? "User Management" : ""}
          >
            <Users size={20} strokeWidth={isActive ? 2.5 : 2} />
            <span className={isCollapsed ? "hidden" : ""}>User Management</span>
            {isCollapsed && isActive && <span className="admin-active-dot" />}
          </Link>
        );
      })()}

      {(() => {
        const isActive = location.pathname === "/adminpanel/audit-logs";
        return (
          <Link
            to="/adminpanel/audit-logs"
            onClick={onClose}
            className={`admin-nav-link ${isActive ? "active" : ""}`}
            title={isCollapsed ? "Audit Logs" : ""}
          >
            <ScrollText size={20} strokeWidth={isActive ? 2.5 : 2} />
            <span className={isCollapsed ? "hidden" : ""}>Audit Logs</span>
            {isCollapsed && isActive && <span className="admin-active-dot" />}
          </Link>
        );
      })()}
    </div>
  )}
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
          onClick={() => setShowLogoutConfirm(true)}
          title={isCollapsed ? "Logout" : ""}
        >
          <LogOut size={18} />
          <span className={isCollapsed ? "hidden" : ""}>Logout</span>
        </button>
      </div>

      {showLogoutConfirm && (
        <ConfirmChangesModal
          title="Log Out?"
          message="You will be signed out of this session."
          confirmText="Log Out"
          variant="info"
          hideCancel={false}
          onConfirm={() => { setShowLogoutConfirm(false); confirmLogout(); }}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
    </aside>
  );
}

export default AdminSidebar;