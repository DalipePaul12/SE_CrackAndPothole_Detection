import React, { useEffect, useState } from "react";
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
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import "./AdminSettings.css";
import { getSettings, updateSettings } from "../../api/settings";

// ── snake_case (API) ↔ camelCase (component state) ───────────────────────────

function fromApi(d) {
  return {
    orgName:                  d.org_name,
    municipality:             d.municipality,
    timezone:                 d.timezone,
    contactEmail:             d.contact_email,
    defaultSeverity:          d.default_severity,
    autoAssign:               d.auto_assign,
    responseTimeHours:        d.response_time_hours,
    escalateAfterHours:       d.escalate_after_hours,
    defaultLat:               d.default_lat,
    defaultLng:               d.default_lng,
    defaultZoom:              d.default_zoom,
    mapProvider:              d.map_provider,
    emailAlerts:              d.email_alerts,
    smsAlerts:                d.sms_alerts,
    pushAlerts:               d.push_alerts,
    digestFrequency:          d.digest_frequency,
    criticalAlertSound:       d.critical_alert_sound,
    require2FA:               d.require_2fa,
    passwordMinLength:        d.password_min_length,
    sessionTimeout:           d.session_timeout,
    dataRetentionDays:        d.data_retention_days,
    allowPublicRegistration:  d.allow_public_registration,
    maintenanceMode:          d.maintenance_mode,
    maintenanceMessage:       d.maintenance_message,
    allowedAdminIPs:          d.allowed_admin_ips,
    apiKey:                   d.api_key,
  };
}

function toApi(s) {
  return {
    org_name:                  s.orgName,
    municipality:              s.municipality,
    timezone:                  s.timezone,
    contact_email:             s.contactEmail,
    default_severity:          s.defaultSeverity,
    auto_assign:               s.autoAssign,
    response_time_hours:       s.responseTimeHours,
    escalate_after_hours:      s.escalateAfterHours,
    default_lat:               s.defaultLat,
    default_lng:               s.defaultLng,
    default_zoom:              s.defaultZoom,
    map_provider:              s.mapProvider,
    email_alerts:              s.emailAlerts,
    sms_alerts:                s.smsAlerts,
    push_alerts:               s.pushAlerts,
    digest_frequency:          s.digestFrequency,
    critical_alert_sound:      s.criticalAlertSound,
    require_2fa:               s.require2FA,
    password_min_length:       s.passwordMinLength,
    session_timeout:           s.sessionTimeout,
    data_retention_days:       s.dataRetentionDays,
    allow_public_registration: s.allowPublicRegistration,
    maintenance_mode:          s.maintenanceMode,
    maintenance_message:       s.maintenanceMessage,
    allowed_admin_ips:         s.allowedAdminIPs,
    api_key:                   s.apiKey,
  };
}

// ── Hard-coded defaults — shown while the GET is in flight ────────────────────
const DEFAULTS = {
  orgName: "Snap2Fix", municipality: "Panghulo", timezone: "Asia/Manila",
  contactEmail: "admin@snap2fix.gov", defaultSeverity: "medium",
  autoAssign: true, responseTimeHours: 24, escalateAfterHours: 72,
  defaultLat: 14.5995, defaultLng: 120.9842, defaultZoom: 13,
  mapProvider: "google", emailAlerts: true, smsAlerts: false,
  pushAlerts: true, digestFrequency: "daily", criticalAlertSound: true,
  require2FA: false, passwordMinLength: 8, sessionTimeout: 60,
  dataRetentionDays: 365, allowPublicRegistration: false,
  maintenanceMode: false,
  maintenanceMessage: "System under maintenance. Please check back shortly.",
  allowedAdminIPs: "", apiKey: "",
};

const AdminSettings = () => {
  const [activeTab,   setActiveTab]   = useState("general");
  const [settings,    setSettings]    = useState(DEFAULTS);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [saveError,   setSaveError]   = useState(null);
  const [resetDialog, setResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");

  // ── Load settings on mount ─────────────────────────────────────────────────
  useEffect(() => {
    getSettings().then((res) => {
      if (res.success) {
        setSettings(fromApi(res.data));
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    });
  }, []);

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setSaveError(null);
  };

  const handleResetAllStatuses = () => {
    if (resetConfirmText !== "RESET") return;
    // TODO: wire to backend once POST /api/v1/admin/reports/reset-statuses exists
    setResetDialog(false);
    setResetConfirmText("");
  };

  // ── Persist to backend ────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    const res = await updateSettings(toApi(settings));
    if (res.success) {
      setSettings(fromApi(res.data));   // sync with server-confirmed values
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
    } else {
      setSaveError(res.error);
    }
    setSaving(false);
  };

  const tabs = [
    { id: "general",      label: "General",            icon: Settings     },
    { id: "reports",      label: "Reports & SLA",      icon: ClipboardList },
    { id: "map",          label: "Map & Location",     icon: Map          },
    { id: "notifications",label: "Notifications",      icon: Bell         },
    { id: "security",     label: "Security & Privacy", icon: Lock         },
    { id: "maintenance",  label: "System & Maintenance",icon: Wrench      },
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
            <span className="save-indicator save-indicator--success">
              <CheckCircle size={14} strokeWidth={2} /> Changes saved
            </span>
          )}
          {saveError && (
            <span className="save-indicator save-indicator--error">
              <AlertCircle size={14} strokeWidth={2} /> {saveError}
            </span>
          )}
          <button
            className="adm-btn adm-btn-ghost"
            onClick={() => window.location.reload()}
            disabled={saving}
          >
            <RotateCcw size={14} strokeWidth={2} /> Reset
          </button>
          <button
            className="adm-btn adm-btn-primary"
            onClick={handleSave}
            disabled={saving || loading}
          >
            <Save size={14} strokeWidth={2} />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Load error banner */}
      {loadError && (
        <div className="adm-alert adm-alert--error">
          <AlertCircle size={16} />
          <span>Could not load settings: {loadError} — showing defaults.</span>
        </div>
      )}

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

        <main className={`settings-content${loading ? " settings-content--loading" : ""}`}>
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
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Municipality / Coverage Area</label>
                  <input
                    className="adm-input"
                    type="text"
                    value={settings.municipality}
                    onChange={(e) => handleChange("municipality", e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Timezone</label>
                  <select
                    className="adm-select"
                    value={settings.timezone}
                    onChange={(e) => handleChange("timezone", e.target.value)}
                    disabled={loading}
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
                    onChange={(e) => handleChange("contactEmail", e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </section>
          )}

          {/* REPORTS & SLA */}
          {activeTab === "reports" && (
            <section className="adm-card settings-section">
              <h2>Reports &amp; SLA Governance</h2>
              <div className="settings-grid">
                <div className="form-group">
                  <label>Default Severity for New Reports</label>
                  <select
                    className="adm-select"
                    value={settings.defaultSeverity}
                    onChange={(e) => handleChange("defaultSeverity", e.target.value)}
                    disabled={loading}
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
                    onChange={(e) => handleChange("responseTimeHours", Number(e.target.value))}
                    disabled={loading}
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
                    onChange={(e) => handleChange("escalateAfterHours", Number(e.target.value))}
                    disabled={loading}
                  />
                </div>
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.autoAssign}
                      onChange={(e) => handleChange("autoAssign", e.target.checked)}
                      disabled={loading}
                    />
                    <span className="toggle-slider"></span>
                    Enable Auto-Assignment by Street/Barangay
                  </label>
                  <span className="field-hint">
                    Routes reports to the admin responsible for the reported location
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
                  <button
                    className="adm-btn adm-btn-danger"
                    onClick={() => { setResetConfirmText(""); setResetDialog(true); }}
                  >
                    Reset All
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* MAP */}
          {activeTab === "map" && (
            <section className="adm-card settings-section">
              <h2>Map &amp; Geolocation</h2>
              <div className="settings-grid">
                <div className="form-group">
                  <label>Default Latitude</label>
                  <input
                    className="adm-input"
                    type="number"
                    step="0.0001"
                    value={settings.defaultLat}
                    onChange={(e) => handleChange("defaultLat", Number(e.target.value))}
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Default Longitude</label>
                  <input
                    className="adm-input"
                    type="number"
                    step="0.0001"
                    value={settings.defaultLng}
                    onChange={(e) => handleChange("defaultLng", Number(e.target.value))}
                    disabled={loading}
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
                    onChange={(e) => handleChange("defaultZoom", Number(e.target.value))}
                    disabled={loading}
                  />
                </div>
                <div className="form-group">
                  <label>Map Provider</label>
                  <select
                    className="adm-select"
                    value={settings.mapProvider}
                    onChange={(e) => handleChange("mapProvider", e.target.value)}
                    disabled={loading}
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
                      onChange={(e) => handleChange("emailAlerts", e.target.checked)}
                      disabled={loading}
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
                      onChange={(e) => handleChange("smsAlerts", e.target.checked)}
                      disabled={loading}
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
                      onChange={(e) => handleChange("pushAlerts", e.target.checked)}
                      disabled={loading}
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
                      onChange={(e) => handleChange("criticalAlertSound", e.target.checked)}
                      disabled={loading}
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
                    onChange={(e) => handleChange("digestFrequency", e.target.value)}
                    disabled={loading}
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
              <h2>Security &amp; Data Privacy</h2>
              <div className="settings-grid">
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.require2FA}
                      onChange={(e) => handleChange("require2FA", e.target.checked)}
                      disabled={loading}
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
                    onChange={(e) => handleChange("passwordMinLength", Number(e.target.value))}
                    disabled={loading}
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
                    onChange={(e) => handleChange("sessionTimeout", Number(e.target.value))}
                    disabled={loading}
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
                    onChange={(e) => handleChange("dataRetentionDays", Number(e.target.value))}
                    disabled={loading}
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
                      onChange={(e) => handleChange("allowPublicRegistration", e.target.checked)}
                      disabled={loading}
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
              <h2>System &amp; Maintenance</h2>
              <div className="settings-grid">
                <div className="form-group full-width">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={settings.maintenanceMode}
                      onChange={(e) => handleChange("maintenanceMode", e.target.checked)}
                      disabled={loading}
                    />
                    <span className="toggle-slider"></span>
                    Enable Maintenance Mode
                  </label>
                  <span className="field-hint">
                    Only admins can access the panel. Public reporting is paused.
                  </span>
                </div>
                <div className="form-group full-width">
                  <label>Maintenance Message</label>
                  <textarea
                    className="adm-input"
                    rows="3"
                    value={settings.maintenanceMessage}
                    onChange={(e) => handleChange("maintenanceMessage", e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Allowed Admin IP Addresses (Optional)</label>
                  <input
                    className="adm-input"
                    type="text"
                    placeholder="e.g. 192.168.1.1, 10.0.0.5"
                    value={settings.allowedAdminIPs}
                    onChange={(e) => handleChange("allowedAdminIPs", e.target.value)}
                    disabled={loading}
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
                      disabled={loading || saving}
                      onClick={() =>
                        handleChange(
                          "apiKey",
                          "sk_live_" + Math.random().toString(36).substr(2, 18)
                        )
                      }
                    >
                      <RefreshCw size={14} strokeWidth={2} /> Regenerate
                    </button>
                  </div>
                  <span className="field-hint">
                    Click Regenerate, then Save Changes to rotate the key.
                  </span>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Reset confirmation dialog */}
      {resetDialog && (
        <div className="modal-overlay" onClick={() => setResetDialog(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title danger">
              <ShieldAlert size={18} strokeWidth={2} /> Confirm Status Reset
            </h3>
            <p className="modal-body">
              This will mark <strong>every in-progress report</strong> as
              pending. This action is <strong>irreversible</strong>.
            </p>
            <p className="modal-body">
              Type <strong>RESET</strong> to confirm:
            </p>
            <input
              className="adm-input"
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="Type RESET here"
              autoFocus
            />
            <div className="modal-actions">
              <button
                className="adm-btn adm-btn-ghost"
                onClick={() => setResetDialog(false)}
              >
                Cancel
              </button>
              <button
                className="adm-btn adm-btn-danger"
                disabled={resetConfirmText !== "RESET"}
                onClick={handleResetAllStatuses}
              >
                Reset All Statuses
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
