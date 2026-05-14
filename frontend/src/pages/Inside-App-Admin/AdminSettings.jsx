import React, { useState } from "react";
import {
  Settings,
  ClipboardList,
  Map,
  Bell,
  Lock,
  Wrench,
  Save,
  RotateCcw,
  ShieldAlert,
  Download,
  RefreshCw,
} from "lucide-react";
import "./AdminSettings.css";

const AdminSettings = () => {
  const [activeTab, setActiveTab] = useState("general");
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    orgName: "Snap2Fix",
    municipality: "Panghulo",
    timezone: "Asia/Manila",
    contactEmail: "admin@snap2fix.gov",
    defaultSeverity: "medium",
    autoAssign: true,
    responseTimeHours: 24,
    escalateAfterHours: 72,
    defaultLat: 14.5995,
    defaultLng: 120.9842,
    defaultZoom: 13,
    mapProvider: "google",
    emailAlerts: true,
    smsAlerts: false,
    pushAlerts: true,
    digestFrequency: "daily",
    criticalAlertSound: true,
    require2FA: false,
    passwordMinLength: 8,
    sessionTimeout: 60,
    dataRetentionDays: 365,
    allowPublicRegistration: false,
    maintenanceMode: false,
    maintenanceMessage: "System under maintenance. Please check back shortly.",
    allowedAdminIPs: "",
    apiKey: "sk_live_••••••••••••••••",
  });

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    console.log("Saving settings:", settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const tabs = [
    { id: "general", label: "General", icon: Settings },
    { id: "reports", label: "Reports & SLA", icon: ClipboardList },
    { id: "map", label: "Map & Location", icon: Map },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "security", label: "Security & Privacy", icon: Lock },
    { id: "maintenance", label: "System & Maintenance", icon: Wrench },
  ];

  return (
    <div className="admin-settings">
      <div className="settings-header">
        <div>
          <h1>System Settings</h1>
          <p className="settings-subtitle">
            Configure global preferences for Snap2Fix
          </p>
        </div>
        <div className="settings-actions">
          {saved && (
            <span className="save-indicator">
              <Save size={14} strokeWidth={2} /> Changes saved
            </span>
          )}
          <button
            className="adm-btn adm-btn-ghost"
            onClick={() => window.location.reload()}
          >
            <RotateCcw size={14} strokeWidth={2} /> Reset
          </button>
          <button className="adm-btn adm-btn-primary" onClick={handleSave}>
            <Save size={14} strokeWidth={2} /> Save Changes
          </button>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="settings-sidebar">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`settings-tab ${activeTab === id ? "active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              <span className="tab-icon">
                <Icon size={18} strokeWidth={1.8} />
              </span>
              <span className="tab-label">{label}</span>
            </button>
          ))}
        </aside>

        <main className="settings-content">
          {/* GENERAL */}
          {activeTab === "general" && (
            <section className="adm-card settings-section">
              <h2>General Configuration</h2>
              <div className="settings-grid">
                <div className="form-group">
                  <label>Organization Name</label>
                  <input
                    className="adm-input"
                    type="text"
                    value={settings.orgName}
                    onChange={(e) => handleChange("orgName", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Municipality / Coverage Area</label>
                  <input
                    className="adm-input"
                    type="text"
                    value={settings.municipality}
                    onChange={(e) =>
                      handleChange("municipality", e.target.value)
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Timezone</label>
                  <select
                    className="adm-select"
                    value={settings.timezone}
                    onChange={(e) => handleChange("timezone", e.target.value)}
                  >
                    <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>System Contact Email</label>
                  <input
                    className="adm-input"
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) =>
                      handleChange("contactEmail", e.target.value)
                    }
                  />
                </div>
              </div>
            </section>
          )}

          {/* REPORTS & SLA */}
          {activeTab === "reports" && (
            <section className="adm-card settings-section">
              <h2>Reports & SLA Governance</h2>
              <div className="settings-grid">
                <div className="form-group">
                  <label>Default Severity for New Reports</label>
                  <select
                    className="adm-select"
                    value={settings.defaultSeverity}
                    onChange={(e) =>
                      handleChange("defaultSeverity", e.target.value)
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Target Response Time (Hours)</label>
                  <input
                    className="adm-input"
                    type="number"
                    min="1"
                    max="168"
                    value={settings.responseTimeHours}
                    onChange={(e) =>
                      handleChange("responseTimeHours", Number(e.target.value))
                    }
                  />
                  <span className="field-hint">
                    SLA clock starts when a report is submitted
                  </span>
                </div>
                <div className="form-group">
                  <label>Auto-Escalate After (Hours)</label>
                  <input
                    className="adm-input"
                    type="number"
                    min="1"
                    max="720"
                    value={settings.escalateAfterHours}
                    onChange={(e) =>
                      handleChange("escalateAfterHours", Number(e.target.value))
                    }
                  />
                </div>
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.autoAssign}
                      onChange={(e) =>
                        handleChange("autoAssign", e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                    Enable Auto-Assignment by Street/Barangay
                  </label>
                  <span className="field-hint">
                    Routes reports to the admin responsible for the reported
                    location
                  </span>
                </div>
              </div>

              <div className="danger-zone">
                <h3>
                  <ShieldAlert size={16} strokeWidth={2} /> Danger Zone
                </h3>
                <div className="danger-item">
                  <div>
                    <strong>Reset All Report Statuses</strong>
                    <p>
                      This will mark every in-progress report as pending.
                      Irreversible.
                    </p>
                  </div>
                  <button className="adm-btn adm-btn-danger">Reset All</button>
                </div>
              </div>
            </section>
          )}

          {/* MAP */}
          {activeTab === "map" && (
            <section className="adm-card settings-section">
              <h2>Map & Geolocation</h2>
              <div className="settings-grid">
                <div className="form-group">
                  <label>Default Latitude</label>
                  <input
                    className="adm-input"
                    type="number"
                    step="0.0001"
                    value={settings.defaultLat}
                    onChange={(e) =>
                      handleChange("defaultLat", Number(e.target.value))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Default Longitude</label>
                  <input
                    className="adm-input"
                    type="number"
                    step="0.0001"
                    value={settings.defaultLng}
                    onChange={(e) =>
                      handleChange("defaultLng", Number(e.target.value))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Default Zoom Level</label>
                  <input
                    className="adm-input"
                    type="number"
                    min="1"
                    max="20"
                    value={settings.defaultZoom}
                    onChange={(e) =>
                      handleChange("defaultZoom", Number(e.target.value))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Map Provider</label>
                  <select
                    className="adm-select"
                    value={settings.mapProvider}
                    onChange={(e) =>
                      handleChange("mapProvider", e.target.value)
                    }
                  >
                    <option value="google">Google Maps</option>
                    <option value="osm">OpenStreetMap</option>
                    <option value="mapbox">Mapbox</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === "notifications" && (
            <section className="adm-card settings-section">
              <h2>Notification Channels</h2>
              <div className="settings-grid">
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.emailAlerts}
                      onChange={(e) =>
                        handleChange("emailAlerts", e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                    Email Alerts for Critical Reports
                  </label>
                </div>
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.smsAlerts}
                      onChange={(e) =>
                        handleChange("smsAlerts", e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                    SMS Alerts for Overdue SLA
                  </label>
                </div>
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.pushAlerts}
                      onChange={(e) =>
                        handleChange("pushAlerts", e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                    Browser Push Notifications
                  </label>
                </div>
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.criticalAlertSound}
                      onChange={(e) =>
                        handleChange("criticalAlertSound", e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                    Play Sound for Urgent Actions
                  </label>
                </div>
                <div className="form-group">
                  <label>Admin Digest Frequency</label>
                  <select
                    className="adm-select"
                    value={settings.digestFrequency}
                    onChange={(e) =>
                      handleChange("digestFrequency", e.target.value)
                    }
                  >
                    <option value="realtime">Real-time</option>
                    <option value="daily">Daily Summary</option>
                    <option value="weekly">Weekly Summary</option>
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* SECURITY */}
          {activeTab === "security" && (
            <section className="adm-card settings-section">
              <h2>Security & Data Privacy</h2>
              <div className="settings-grid">
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.require2FA}
                      onChange={(e) =>
                        handleChange("require2FA", e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                    Require 2FA for All Admin Accounts
                  </label>
                </div>
                <div className="form-group">
                  <label>Minimum Password Length</label>
                  <input
                    className="adm-input"
                    type="number"
                    min="6"
                    max="32"
                    value={settings.passwordMinLength}
                    onChange={(e) =>
                      handleChange("passwordMinLength", Number(e.target.value))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Session Timeout (Minutes)</label>
                  <input
                    className="adm-input"
                    type="number"
                    min="5"
                    max="1440"
                    value={settings.sessionTimeout}
                    onChange={(e) =>
                      handleChange("sessionTimeout", Number(e.target.value))
                    }
                  />
                </div>
                <div className="form-group">
                  <label>Data Retention (Days)</label>
                  <input
                    className="adm-input"
                    type="number"
                    min="30"
                    max="2555"
                    value={settings.dataRetentionDays}
                    onChange={(e) =>
                      handleChange("dataRetentionDays", Number(e.target.value))
                    }
                  />
                  <span className="field-hint">
                    Resolved reports auto-purged after this period
                  </span>
                </div>
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.allowPublicRegistration}
                      onChange={(e) =>
                        handleChange(
                          "allowPublicRegistration",
                          e.target.checked
                        )
                      }
                    />
                    <span className="toggle-slider"></span>
                    Allow Public User Registration
                  </label>
                </div>
              </div>

              <div className="adm-card settings-section-card">
                <h3>Audit Log</h3>
                <p className="field-hint">
                  Track every administrative change made in the panel.
                </p>
                <button
                  className="adm-btn adm-btn-ghost"
                  style={{ marginTop: 10 }}
                >
                  <Download size={14} strokeWidth={2} /> Export Audit Log (CSV)
                </button>
              </div>
            </section>
          )}

          {/* MAINTENANCE */}
          {activeTab === "maintenance" && (
            <section className="adm-card settings-section">
              <h2>System & Maintenance</h2>
              <div className="settings-grid">
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.maintenanceMode}
                      onChange={(e) =>
                        handleChange("maintenanceMode", e.target.checked)
                      }
                    />
                    <span className="toggle-slider"></span>
                    Enable Maintenance Mode
                  </label>
                  <span className="field-hint">
                    Only admins can access the panel. Public reporting is
                    paused.
                  </span>
                </div>
                <div className="form-group full-width">
                  <label>Maintenance Message</label>
                  <textarea
                    className="adm-input"
                    rows="3"
                    value={settings.maintenanceMessage}
                    onChange={(e) =>
                      handleChange("maintenanceMessage", e.target.value)
                    }
                  />
                </div>
                <div className="form-group full-width">
                  <label>Allowed Admin IP Addresses (Optional)</label>
                  <input
                    className="adm-input"
                    type="text"
                    placeholder="e.g. 192.168.1.1, 10.0.0.5"
                    value={settings.allowedAdminIPs}
                    onChange={(e) =>
                      handleChange("allowedAdminIPs", e.target.value)
                    }
                  />
                  <span className="field-hint">
                    Comma-separated. Leave blank to allow all IPs.
                  </span>
                </div>
                <div className="form-group full-width">
                  <label>API Key</label>
                  <div className="input-group">
                    <input
                      className="adm-input"
                      type="text"
                      value={settings.apiKey}
                      readOnly
                    />
                    <button
                      className="adm-btn adm-btn-ghost"
                      onClick={() =>
                        handleChange(
                          "apiKey",
                          "sk_live_" +
                            Math.random().toString(36).substr(2, 18)
                        )
                      }
                    >
                      <RefreshCw size={14} strokeWidth={2} /> Regenerate
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminSettings;