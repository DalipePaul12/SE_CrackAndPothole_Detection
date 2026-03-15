import "./AppHeader.css";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { FaUserCircle, FaSignOutAlt, FaBars } from "react-icons/fa";

import ConfirmChangesModal from "../pages/PopUps/ConfirmChangesModal";

function AppHeader() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    navigate("/");
  };

  const toggleSidebar = () => {
    document.querySelector(".app-sidebar").classList.toggle("active");
    document.querySelector(".sidebar-overlay").classList.toggle("active");
  };

  return (
    <header className="app-header">

      {/* LEFT SIDE */}
      <div className="app-header-left">

        {/* BURGER BUTTON */}
        <button className="burger-btn" onClick={toggleSidebar}>
          <FaBars />
        </button>

        <h2>Snap2Fix</h2>
      </div>

      {/* RIGHT SIDE */}
      <div className="app-header-right">
        <span className="user-name">User</span>

        <img 
          src="/snap.jpg"
          alt="Profile"
          className="profile-image"
        />

        <button className="logout-btn" onClick={() => setShowLogoutConfirm(true)}>
          <FaSignOutAlt />
          Logout
        </button>
      </div>

      {showLogoutConfirm && (
        <ConfirmChangesModal
          title="Log Out?"
          message="Are you sure you want to log out of your account?"
          confirmText="Log Out"
          variant="danger"
          onCancel={() => setShowLogoutConfirm(false)}
          onConfirm={handleLogout}
        />
      )}

    </header>
  );
}

export default AppHeader;