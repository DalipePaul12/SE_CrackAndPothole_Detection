import "./ContractorBottomNav.css";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useDarkMode } from "../hooks/useDarkMode";
import { useNotifications } from "../hooks/useNotifications";
import { tokenStorage } from "../api/client";

import {
  LayoutDashboard, ClipboardList, CheckSquare, Bell,
  MoreHorizontal, UserCircle, Sun, Moon, LogOut, X,
} from "lucide-react";

const navItems = [
  { to: "/contractorpanel/dashboard",     icon: LayoutDashboard, label: "Dashboard"     },
  { to: "/contractorpanel/projects",      icon: ClipboardList,   label: "Projects"      },
  { to: "/contractorpanel/completed",     icon: CheckSquare,     label: "Completed"     },
  { to: "/contractorpanel/notifications", icon: Bell,            label: "Notifications" },
];

function ContractorBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isDark, toggle } = useDarkMode();
  const { unreadCount } = useNotifications();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = isMoreOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isMoreOpen]);

  const isMoreActive = location.pathname.startsWith("/contractorpanel/profile");

  const handleLogout = () => {
    tokenStorage.clear();
    localStorage.removeItem("user");
    sessionStorage.clear();
    navigate("/", { replace: true });
  };

  return (
    <>
      <nav className="contractor-bottom-nav" aria-label="Contractor navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;
          const showBadge = item.to === "/contractorpanel/notifications" && unreadCount > 0;

          return (
            <Link
              key={item.to}
              to={item.to}
              className={`contractor-bottom-nav-item ${isActive ? "active" : ""}`}
            >
              <span className="contractor-bottom-nav-icon-wrap">
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {showBadge && (
                  <span className="contractor-bottom-nav-badge">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className={`contractor-bottom-nav-item ${isMoreActive || isMoreOpen ? "active" : ""}`}
          onClick={() => setIsMoreOpen(true)}
        >
          <MoreHorizontal size={22} strokeWidth={isMoreActive || isMoreOpen ? 2.5 : 2} />
          <span>More</span>
        </button>
      </nav>

      {isMoreOpen && (
        <>
          <div
            className="contractor-bottom-sheet-backdrop"
            onClick={() => setIsMoreOpen(false)}
            aria-hidden="true"
          />
          <div className="contractor-bottom-sheet" role="dialog" aria-label="More options">
            <div className="contractor-bottom-sheet-header">
              <span>More</span>
              <button
                type="button"
                className="contractor-bottom-sheet-close"
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <Link to="/contractorpanel/profile" className="contractor-bottom-sheet-item">
              <UserCircle size={20} />
              <span>My Profile</span>
            </Link>

            <button type="button" className="contractor-bottom-sheet-item" onClick={toggle}>
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
              <span>{isDark ? "Light Mode" : "Dark Mode"}</span>
            </button>

            <button
              type="button"
              className="contractor-bottom-sheet-item contractor-bottom-sheet-logout"
              onClick={handleLogout}
            >
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

export default ContractorBottomNav;