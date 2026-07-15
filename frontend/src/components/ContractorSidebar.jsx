import "./ContractorSidebar.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDarkMode } from "../hooks/useDarkMode";

import {
  LayoutDashboard, ClipboardList, CheckSquare,
  Sun, Moon, ChevronLeft, ChevronRight, LogOut,
} from "lucide-react";

/* ── Logo — same as AdminSidebar ── */
function SnapLogo() {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div className="contractor-logo-fallback">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="24" fill="url(#clg)" />
          <circle cx="24" cy="24" r="12" stroke="#2e7d32" strokeWidth="2" fill="none" opacity="0.5" />
          <path d="M24 12v6M24 30v6M12 24h6M30 24h6" stroke="#2e7d32" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
          <defs>
            <linearGradient id="clg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
              <stop stopColor="#4caf50" />
              <stop offset="1" stopColor="#2e7d32" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    );
  }

  return (
    <div className="contractor-logo-fallback">
      <img
        src="/snap.jpg"
        alt="Snap2Fix"
        className="contractor-sidebar-logo-img"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

function ContractorSidebar({ isOpen, onClose, isCollapsed, onToggleCollapse }) {
  const location = useLocation();
  const navigate  = useNavigate();
  const { isDark, toggle } = useDarkMode();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (onClose) onClose();
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();
    navigate("/", { replace: true });
  };

  const navItems = [
    { to: "/contractorpanel/dashboard",  icon: LayoutDashboard, label: "Dashboard"         },
    { to: "/contractorpanel/projects",   icon: ClipboardList,   label: "Assigned Projects" },
    { to: "/contractorpanel/completed",  icon: CheckSquare,     label: "Completed"         },
  ];

  return (
    <aside className={`contractor-sidebar ${isCollapsed ? "collapsed" : ""} ${isOpen ? "mobile-open" : ""}`}>

      <div className="contractor-sidebar-header">
        <div className={`contractor-sidebar-brand ${isCollapsed ? "hidden" : ""}`}>
          <SnapLogo />
          <div className="contractor-brand-text">
            <h2>Snap2Fix</h2>
            <span className="contractor-badge">CONTRACTOR</span>
          </div>
        </div>

        {!isMobile && (
          <button
            className="contractor-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
      </div>

      <nav className="contractor-sidebar-nav">
        <div className="contractor-nav-section">
          {!isCollapsed && <label className="contractor-section-label">Contractor Panel</label>}
          {isCollapsed  && <div className="contractor-section-spacer" />}

          {navItems.map((item) => {
            const Icon     = item.icon;
            const isActive = location.pathname === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`contractor-nav-link ${isActive ? "active" : ""}`}
                title={isCollapsed ? item.label : ""}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                <span className={isCollapsed ? "hidden" : ""}>{item.label}</span>
                {isCollapsed && isActive && <span className="contractor-active-dot" />}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="contractor-sidebar-footer">
        {!isCollapsed && <label className="contractor-section-label">Preferences</label>}
        {isCollapsed  && <div className="contractor-section-spacer" />}

        <button
          className="contractor-footer-btn"
          onClick={toggle}
          title={isCollapsed ? (isDark ? "Light Mode" : "Dark Mode") : ""}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
          <span className={isCollapsed ? "hidden" : ""}>{isDark ? "Light Mode" : "Dark Mode"}</span>
          {!isCollapsed && (
            <span className={`contractor-toggle-pill ${isDark ? "on" : ""}`}>
              <span className="contractor-toggle-knob" />
            </span>
          )}
        </button>

        <button
          className="contractor-footer-btn contractor-logout-btn"
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

export default ContractorSidebar;
