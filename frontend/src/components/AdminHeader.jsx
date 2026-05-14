import React from "react";
import { useNavigate } from "react-router-dom";
import { useDarkMode } from "../hooks/useDarkMode";
import "./AdminHeader.css";

export default function AdminHeader({ title = "Admin Panel" }) {
  const { isDark } = useDarkMode();

  return (
    <header className="admin-header">
      <div className="admin-header-left">
        <h2 className="admin-header-title">{title}</h2>
      </div>

      {/* Right side intentionally left empty */}
      <div className="admin-header-right" />
    </header>
  );
}