import React, { useState } from "react";
import "./Settings.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";

import { useUser } from "../../hooks/useUser";

function Settings() {
  const { updatePassword } = useUser();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  const [settings, setSettings] = useState({
    pushNotifications: false,
    emailSummaries: false,
    systemAlerts: true,
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const toggleSetting = (key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
  };

  const validatePassword = () => {
    if (!passwordData.currentPassword) {
      setMessage("Please enter your current password.");
      setMessageType("error");
      return false;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage("New passwords do not match.");
      setMessageType("error");
      return false;
    }
    if (passwordData.newPassword.length < 8) {
      setMessage("Password must be at least 8 characters.");
      setMessageType("error");
      return false;
    }
    return true;
  };

  const handleChangePassword = async () => {
    try {
      await updatePassword(passwordData.currentPassword, passwordData.newPassword);
      setMessage("Password updated successfully!");
      setMessageType("success");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setMessage(err?.detail || "Failed to update password. Check your current password.");
      setMessageType("error");
    }
    setShowConfirm(false);
  };

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />

      {sidebarOpen && (
        <div
          className="sidebar-overlay active"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="settings-container">
        <div className="settings-header">
          <h1>Preferences</h1>
          <p>Customize your Snap2Fix experience.</p>
        </div>

        <div className="settings-card">
          <h2>Notifications</h2>
          <p>How do you want to be notified?</p>

          {[
            { key: "pushNotifications", label: "Push Notifications",  desc: "Receive instant updates directly on your device." },
            { key: "emailSummaries",    label: "Email Summaries",     desc: "Get daily or weekly activity summaries via email." },
            { key: "systemAlerts",      label: "System Alerts",       desc: "Important alerts about account and system changes." },
          ].map(({ key, label, desc }) => (
            <div key={key} className="setting-item">
              <div><h4>{label}</h4><p>{desc}</p></div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={() => toggleSetting(key)}
                />
                <span className="slider"></span>
              </label>
            </div>
          ))}
        </div>

        <div className="settings-card">
          <h2>Privacy & Security</h2>
          <p>Change Password</p>

          <div className="password-section">
            <label>Current Password</label>
            <input
              type="password"
              name="currentPassword"
              placeholder="Current Password"
              value={passwordData.currentPassword}
              onChange={handlePasswordChange}
            />

            <label>New Password</label>
            <input
              type="password"
              name="newPassword"
              placeholder="New Password"
              value={passwordData.newPassword}
              onChange={handlePasswordChange}
            />

            <label>Confirm New Password</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm New Password"
              value={passwordData.confirmPassword}
              onChange={handlePasswordChange}
            />
          </div>

          {message && (
            <p
              className="settings-message"
              style={{ color: messageType === "error" ? "red" : "green" }}
            >
              {message}
            </p>
          )}

          <div className="password-actions">
            <button
              className="save-btn"
              onClick={() => { if (validatePassword()) setShowConfirm(true); }}
              disabled={
                !passwordData.currentPassword &&
                !passwordData.newPassword &&
                !passwordData.confirmPassword
              }
            >
              Update Password
            </button>
          </div>
        </div>

        <div className="settings-card app-info-card">
          <div className="app-info-content">
            <img src="/snap.jpg" alt="App Logo" className="app-logo" />
            <h2 className="app-name">Snap2Fix PH</h2>
            <span className="version-badge">Version 1.0.0</span>
            <p className="app-description">
              An AI-powered road damage reporting system that helps communities
              identify, report, and monitor infrastructure issues efficiently.
            </p>
            <div className="app-meta">
              <h3 className="team-title">Developed By</h3>
              <div className="team-list">
                <span>Paul Angelo Dalipe</span>
                <span>Brian Dapito</span>
                <span>Mave Rick Sandoval</span>
                <span>Krislyn Sayat</span>
                <span>John Carlo Trajico</span>
              </div>
            </div>
          </div>
        </div>

        {showConfirm && (
          <ConfirmChangesModal
            title="Change Password?"
            message="Before changing your password, make sure it's something secure and memorable."
            confirmText="Change Password"
            variant="danger"
            onCancel={() => setShowConfirm(false)}
            onConfirm={handleChangePassword}
          />
        )}
      </div>
    </>
  );
}

export default Settings;