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

  const toggleSetting = (key) => {
    setSettings((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };


  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const hasChanges =
    JSON.stringify(settings) !== JSON.stringify(originalSettings) ||
    passwordData.currentPassword ||
    passwordData.newPassword ||
    passwordData.confirmPassword;

const handleSave = () => {
  setMessage(""); // clear old message first

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

  setPasswordData({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  setMessage("Password updated successfully!");
};


/*
  const handleLogout = () => {
    localStorage.clear();
    window.location.href = "/";
  };
*/

useEffect(() => {
  if (originalSettings !== settings) {
    console.log("Notification settings saved:", settings);
    setOriginalSettings(settings);
  }
}, [settings]);


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

    {message && <p className="settings-message">{message}</p>}

          <div className="password-actions">
            <button
                className="save-btn"
                onClick={handleSave}
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

        {/* ---------------- App Info ---------------- */}
<div className="settings-card app-info-card">
  <div className="app-info-content">
    <img 
      src="/snap.jpg"
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

        {/*}
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
        */}

      </div>
    </>
  );
}

export default Settings;