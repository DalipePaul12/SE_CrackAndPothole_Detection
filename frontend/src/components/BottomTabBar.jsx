import "./BottomTabBar.css";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, BookOpen, Map, PlusCircle, Menu } from "lucide-react";
import { useNotifications } from "../pages/Contexts/NotificationContext";
import CreateReport from "../pages/Inside-App-User/CreateReport";
import { useState } from "react";

function BottomTabBar({ onOpenMore, onReportModalChange }) {
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const [showReportModal, setShowReportModal] = useState(false);

  const tabs = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/dashboard/reports", icon: BookOpen, label: "Reports" },
  ];

  const tabsRight = [
    { to: "/dashboard/mapview", icon: Map, label: "Map" },
  ];

  return (
    <>
      <nav className="bottom-tab-bar">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.to;
          return (
            <Link key={tab.to} to={tab.to} className={`bottom-tab-link ${isActive ? "active" : ""}`}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span>{tab.label}</span>
            </Link>
          );
        })}

        <button
          className="bottom-tab-fab"
          onClick={() => { setShowReportModal(true); onReportModalChange?.(true); }}
          aria-label="Report Road Damage"
        >
          <PlusCircle size={28} />
        </button>

        {tabsRight.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.to;
          return (
            <Link key={tab.to} to={tab.to} className={`bottom-tab-link ${isActive ? "active" : ""}`}>
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span>{tab.label}</span>
            </Link>
          );
        })}

        <button className="bottom-tab-link bottom-tab-more" onClick={onOpenMore}>
          <div className="bottom-tab-more-icon">
            <Menu size={22} />
            {unreadCount > 0 && <span className="bottom-tab-more-badge" />}
          </div>
          <span>More</span>
        </button>
      </nav>

      {showReportModal && (
        <CreateReport onClose={() => { setShowReportModal(false); onReportModalChange?.(false); }} />
      )}
    </>
  );
}

export default BottomTabBar;