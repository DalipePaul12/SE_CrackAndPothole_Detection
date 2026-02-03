import "./Sidebar.css";
import { Link, useLocation } from "react-router-dom";

//Icons Import
import { FaHome, FaMapMarkedAlt, FaUser } from "react-icons/fa";
import { IoAddCircleOutline } from "react-icons/io5";
import { IoSettingsSharp } from "react-icons/io5";
import { IoNotifications } from "react-icons/io5";
import { RiCompassDiscoverFill } from "react-icons/ri";
import { GiBookshelf } from "react-icons/gi";

function Sidebar({unreadCount = 0}) {
  const location = useLocation();

  return (
    <aside className="app-sidebar">
      {/* LOGO */}
      <div className="sidebar-logo">
        <img src="/snap.jpg" alt="Snap2Fix Logo" />
        <h2>Snap2Fix PH</h2>
      </div>

      {/* NAV LINKS */}
      <nav className="sidebar-nav">
        <div className="sidebar-main-section">
        <button to="/dashboard" className="sidebar-reports-button">
          <IoAddCircleOutline className="addreport-icon" /> Report Road Damage
        </button>

      {/* Main Menu */}
        <label 
            className="sidebar-section-label">Main Menu
        </label>


        <Link to="/dashboard"  className={`sidebar-link ${location.pathname === "/dashboard" ? "active" : ""}`}>
            <FaHome /> Dashboard
        </Link>


        <Link to="/dashboard/reports" className={`sidebar-link ${location.pathname === "/dashboard/reports" ? "active" : ""}`}>
          <GiBookshelf /> All Reports
        </Link>

        <Link to="/dashboard/mapview" className={`sidebar-link ${location.pathname === "/dashboard/mapview" ? "active" : ""}`}>
          <FaMapMarkedAlt /> Map View
        </Link>

      {/* Personal */}
         <label 
            className="sidebar-section-label">Personal
        </label>

        <Link to="/dashboard/profile" className={`sidebar-link ${location.pathname === "/dashboard/profile" ? "active" : ""}`}>
          <FaUser /> My Profile
        </Link>

        <Link to="/dashboard/submissions" className={`sidebar-link ${location.pathname === "/dashboard/submissions" ? "active" : ""}`}>
          <RiCompassDiscoverFill className="submissions-icon"/> My Submissions
        </Link>
        </div>



      {/* Others */}
      <div className="sidebar-other-section">
        <Link to="/dashboard/notifications" className={`sidebar-link-others ${location.pathname === "/dashboard/notifications" ? "active" : ""}`}>
          <IoNotifications /> Notifications
          {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
        </Link>

        <Link to="/dashboard/settings" className={`sidebar-link-others ${location.pathname === "/dashboard/settings" ? "active" : ""}`}>
          <IoSettingsSharp /> Settings
        </Link>
      </div>

      </nav>
    </aside>
  );
}

export default Sidebar;
