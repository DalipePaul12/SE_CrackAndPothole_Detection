import "./AdminSidebar.css";
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

// Icons
import { FaHome, FaMapMarkedAlt, FaClipboardList } from "react-icons/fa";
import { IoSettingsSharp } from "react-icons/io5";
import { MdAdminPanelSettings } from "react-icons/md";
import { GiBookshelf } from "react-icons/gi";
import { IoBook } from "react-icons/io5";
import { FaStreetView } from "react-icons/fa6";

function AdminSidebar() {
  const location = useLocation();
  const [activeSection, setActiveSection] = useState("");

  return (
    <aside className="admin-sidebar">
      {/* LOGO */}
      <div className="admin-sidebar-logo">
        <img src="/snap.jpg" alt="Snap2Fix Logo" />
        <h2>Snap2Fix</h2>
        <span className="admin-badge">ADMIN</span>
      </div>

      {/* NAVIGATION */}
      <nav className="admin-sidebar-nav">

        {/* Main Section */}
        <div className="admin-sidebar-main-section">

        <label className="admin-sidebar-section-label">
          Admin Dashboard
        </label>

        <Link
          to="/adminpanel"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel" ? "active" : ""
          }`}
        >
          <FaHome /> Dashboard
        </Link>

        <Link
          to="/adminpanel/reports"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel/reports" ? "active" : ""
          }`}
        >
          <GiBookshelf /> All Reports
        </Link>

        <Link
          to="/adminpanel/map"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel/map" ? "active" : ""
          }`}
        >
          <FaMapMarkedAlt /> Map View
        </Link>

        <Link
          to="/adminpanel/requests"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel/requests" ? "active" : ""
          }`}
        >
          <FaClipboardList /> Manage Requests
        </Link>

        <Link
          to="/adminpanel/managereports"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel/managereports" ? "active" : ""
          }`}
        >
          <IoBook /> Manage Reports
        </Link>

        <Link
          to="/adminpanel/managestreets"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel/managestreets" ? "active" : ""
          }`}
        >
          <FaStreetView /> Manage Streets
        </Link>
        </div>


        {/* System Section */}
        {/*}
        <div className="admin-sidebar-others-section">
          System
        </div>

        <Link
          to="/adminpanel/notif"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel/notif" ? "active" : ""
          }`}
        >
          <IoSettingsSharp /> Notifications
        </Link>

        <Link
          to="/adminpanel/adminsettings"
          className={`admin-sidebar-link ${
            location.pathname === "/adminpanel/adminsettings" ? "active" : ""
          }`}
        >
          <MdAdminPanelSettings /> Settings
        </Link>
*/}
      </nav>
    </aside>
  );
}

export default AdminSidebar;