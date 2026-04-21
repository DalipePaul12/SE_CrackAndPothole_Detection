import React from "react";
import { useNavigate } from "react-router-dom";
import "./AdminHeader.css";
import { IoLogOut } from "react-icons/io5";

function AdminHeader() {
  const navigate = useNavigate();
  const stored = localStorage.getItem("user");
  const user = stored ? JSON.parse(stored) : null;
  const displayName = user?.full_name || user?.name || "Admin";

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <header className="admin-header">
      <h1 className="admin-header-title">Admin Panel</h1>

      <div className="admin-header-right">
        <span className="admin-header-name">{displayName}</span>

        <div className="admin-header-avatar">
          {displayName.charAt(0).toUpperCase()}
        </div>

        <button className="admin-header-logout-btn" onClick={handleLogout}>
          <IoLogOut />
          Logout
        </button>
      </div>
    </header>
  );
}

export default AdminHeader;