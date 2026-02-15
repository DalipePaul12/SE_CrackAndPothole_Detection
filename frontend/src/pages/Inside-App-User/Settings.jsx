import React, { useState, useEffect } from "react";
import "./Settings.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";

function Settings() {

  const [settings, setSettings] = useState({
    pushNotifications: false,
    emailSummaries: false,
    systemAlerts: true,
  });

  const [originalSettings, setOriginalSettings] = useState(settings);

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [message, setMessage] = useState("");

  // -------------------------
  // HANDLE TOGGLE
  // -------------------------

  const toggleSetting = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  // -------------------------
  // HANDLE PASSWORD INPUT
  // -------------------------

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // -------------------------
  // CHECK IF THERE ARE CHANGES
  // -------------------------

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(originalSettings) ||
    passwordData.currentPassword ||
    passwordData.newPassword ||
    passwordData.confirmPassword;

  // -------------------------
  // SAVE SETTINGS
  // -------------------------

  const handleSave = () => {
    // Password validation
    if (passwordData.newPassword || passwordData.confirmPassword) {
      if (!passwordData.currentPassword) {
        setMessage("Please enter your current password.");
        return;
      }

      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setMessage("New passwords do not match.");
        return;
      }

      if (passwordData.newPassword.length < 6) {
        setMessage("Password must be at least 6 characters.");
        return;
      }
    }

    // Save logic (later connect to backend)
    setOriginalSettings(settings);

    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });

    setMessage("Settings saved successfully!");
  };

  // -------------------------
  // LOGOUT
  // -------------------------

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div className="settings-container">
        <div className="settings-header">
            <h1>Preferences</h1>
            <p>Customize your Snap2Fix experience.</p>
        </div>

        {/* ---------------- Notifications ---------------- */}
        <div className="settings-card">
          <h2>Notifications</h2>
          <p>How do you want to be notified?</p>

          <div className="setting-item">
            <div>
              <h4>Push Notifications</h4>
              <p>Receive instant updates directly on your device.</p>
            </div>
           <label className="switch">
            <input
                type="checkbox"
                checked={settings.pushNotifications}
                onChange={() => toggleSetting("pushNotifications")}
            />
            <span className="slider"></span>
            </label>
          </div>

          <div className="setting-item">
            <div>
              <h4>Email Summaries</h4>
              <p>Get daily or weekly activity summaries via email.</p>
            </div>
            <label className="switch">
            <input
                type="checkbox"
                checked={settings.emailSummaries}
                onChange={() => toggleSetting("emailSummaries")}
            />
            <span className="slider"></span>
            </label>

          </div>

          <div className="setting-item">
            <div>
              <h4>System Alerts</h4>
              <p>Important alerts about account and system changes.</p>
            </div>
            <label className="switch">
            <input
                type="checkbox"
                checked={settings.systemAlerts}
                onChange={() => toggleSetting("systemAlerts")}
            />
            <span className="slider"></span>
            </label>
          </div>
        </div>

        {/* ---------------- Privacy & Security ---------------- */}
        <div className="settings-card">
          <h2>Privacy & Security</h2>
          <p> Change Password </p>

          <div className="password-section">
            <input
              type="password"
              name="currentPassword"
              placeholder="Current Password"
              value={passwordData.currentPassword}
              onChange={handlePasswordChange}
            />

            <input
              type="password"
              name="newPassword"
              placeholder="New Password"
              value={passwordData.newPassword}
              onChange={handlePasswordChange}
            />

            <input
              type="password"
              name="confirmPassword"
              placeholder="Confirm New Password"
              value={passwordData.confirmPassword}
              onChange={handlePasswordChange}
            />
          </div>
        </div>

        {/* ---------------- App Info ---------------- */}
<div className="settings-card app-info-card">
  <div className="app-info-content">
    <img 
      src="/snap.jpg"   // change to your logo path
      alt="App Logo"
      className="app-logo"
    />

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


        {/* ---------------- Buttons ---------------- */}
        {/*{message && <p className="settings-message">{message}</p>}*/}

        <div className="settings-actions">
          <button
            className="save-btn"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </button>

          <button
            className="logout-btn-page"
            onClick={handleLogout}
          >
            Log Out
          </button>
        </div>

      </div>
    </>
  );
}

export default Settings;
