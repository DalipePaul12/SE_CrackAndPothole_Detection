import "./AdminHeader.css";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { FaUserShield, FaSignOutAlt } from "react-icons/fa";

import ConfirmChangesModal from "../pages/PopUps/ConfirmChangesModal";

function AdminHeader() {
  const navigate = useNavigate();
  const [showAdminLogoutConfirm, setShowAdminLogoutConfirm] = useState(false);

  const handleAdminLogout = () => {
    navigate("/");
  };

  return (
    <header className="admin-header">
      {/* LEFT SIDE */}
      <div className="admin-header-left">
        <h2>Admin Panel</h2>
      </div>

      {/* RIGHT SIDE */}
      <div className="admin-header-right">
        <span className="admin-name">Admin</span>

        <img
          src="/snap.jpg"   // change to admin image if needed
          alt="Admin Profile"
          className="admin-profile-image"
        />

        <button
          className="admin-logout-btn"
          onClick={() => setShowAdminLogoutConfirm(true)}
        >
          <FaSignOutAlt />
          Logout
        </button>
      </div>

      {showAdminLogoutConfirm && (
        <ConfirmChangesModal
          title="Admin Log Out?"
          message="Are you sure you want to log out of the admin account?"
          confirmText="Log Out"
          variant="danger"
          onCancel={() => setShowAdminLogoutConfirm(false)}
          onConfirm={handleAdminLogout}
        />
      )}
    </header>
  );
}

export default AdminHeader;