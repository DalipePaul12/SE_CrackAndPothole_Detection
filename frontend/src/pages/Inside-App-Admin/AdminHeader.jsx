/**
 * AdminHeader.jsx
 * Top navigation bar for all admin pages.
 * Includes global dark-mode toggle — uses CSS vars, fully token-driven.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Moon, Sun, Bell } from "lucide-react";
import { useDarkMode } from "../hooks/useDarkMode";
import "./AdminHeader.css";

export default function AdminHeader() {
  const navigate    = useNavigate();
  const { isDark, toggle } = useDarkMode();

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.clear();
    navigate("/login");
  }

  return (
    <header className="adm-header">
      <div className="adm-header-brand">
        <div className="adm-header-logo" aria-hidden="true">
          {/* logo icon placeholder — replace with <img> if needed */}
          <span className="adm-header-logo-inner" />
        </div>
        <span className="adm-header-name">Snap2Fix</span>
        <span className="adm-header-role-pill">Admin</span>
      </div>

      <div className="adm-header-title">Admin Panel</div>

      <div className="adm-header-actions">
        {/* Dark mode toggle */}
        <button
          className="adm-theme-toggle adm-hdr-icon-btn"
          onClick={toggle}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark
            ? <Sun size={17} strokeWidth={2} />
            : <Moon size={17} strokeWidth={2} />
          }
        </button>

        {/* Notifications (placeholder — wire up as needed) */}
        <button className="adm-hdr-icon-btn adm-hdr-notif-btn" aria-label="Notifications">
          <Bell size={17} strokeWidth={2} />
          <span className="adm-hdr-notif-dot" aria-hidden="true" />
        </button>

        {/* User info + logout */}
        <div className="adm-hdr-user">
          <div className="adm-hdr-avatar" aria-hidden="true" />
          <span className="adm-hdr-username">Admin</span>
        </div>

        <button className="adm-hdr-logout-btn" onClick={handleLogout}>
          <LogOut size={15} strokeWidth={2} />
          Logout
        </button>
      </div>
    </header>
  );
}