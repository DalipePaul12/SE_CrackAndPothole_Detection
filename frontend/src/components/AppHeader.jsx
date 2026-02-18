import "./AppHeader.css";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { FaUserCircle, FaSignOutAlt } from "react-icons/fa";

import ConfirmChangesModal from "../pages/PopUps/ConfirmChangesModal";

function AppHeader() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);


  const handleLogout = () => {
    navigate("/");
  };

  return (
    <header className="app-header">
      {/* LEFT SIDE*/}
      <div className="app-header-left">
        <h2>Snap2Fix PH</h2>
      </div>

      {/* RIGHT SIDE*/}
      <div className="app-header-right">
        <span className="user-name">User</span>

        <img 
          src="/snap.jpg"   // change this to your image path or state variable
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
