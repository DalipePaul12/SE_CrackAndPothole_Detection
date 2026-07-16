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
  AlertCircle,
  CheckCircle,
} from "lucide-react";
import "./AdminSettings.css";
import { getSettings, updateSettings, resetReportStatuses, exportAuditLog } from "../../api/settings";

// ── snake_case (API) ↔ camelCase (component state) ───────────────────────────

function fromApi(d) {
  return {
    orgName:                  d.org_name,
    municipality:             d.municipality,
    timezone:                 d.timezone,
    contactEmail:             d.contact_email,
    defaultSeverity:          d.default_severity,
    defaultLat:               d.default_lat,
    defaultLng:               d.default_lng,
    defaultZoom:              d.default_zoom,
    emailAlerts:              d.email_alerts,
    pushAlerts:               d.push_alerts,
    digestFrequency:          d.digest_frequency,
    criticalAlertSound:       d.critical_alert_sound,
    require2FA:               d.require_2fa,
    passwordMinLength:        d.password_min_length,
    sessionTimeout:           d.session_timeout,
    allowPublicRegistration:  d.allow_public_registration,
    maintenanceMode:          d.maintenance_mode,
    maintenanceMessage:       d.maintenance_message,
    allowedAdminIPs:          d.allowed_admin_ips,
    updatedAt:                d.updated_at ?? null,
  };
}

function toApi(s) {
  return {
    org_name:                  s.orgName,
    municipality:              s.municipality,
    timezone:                  s.timezone,
    contact_email:             s.contactEmail,
    default_severity:          s.defaultSeverity,
    default_lat:               s.defaultLat,
    default_lng:               s.defaultLng,
    default_zoom:              s.defaultZoom,
    email_alerts:              s.emailAlerts,
    push_alerts:               s.pushAlerts,
    digest_frequency:          s.digestFrequency,
    critical_alert_sound:      s.criticalAlertSound,
    require_2fa:               s.require2FA,
    password_min_length:       s.passwordMinLength,
    session_timeout:           s.sessionTimeout,
    allow_public_registration: s.allowPublicRegistration,
    maintenance_mode:          s.maintenanceMode,
    maintenance_message:       s.maintenanceMessage,
    allowed_admin_ips:         s.allowedAdminIPs,
  };
}

// ── Hard-coded defaults — shown while the GET is in flight ────────────────────
const DEFAULTS = {
  orgName: "Snap2Fix", municipality: "Panghulo", timezone: "Asia/Manila",
  contactEmail: "admin@snap2fix.gov", defaultSeverity: "medium",
  defaultLat: 14.5995, defaultLng: 120.9842, defaultZoom: 13,
  emailAlerts: true, pushAlerts: true, digestFrequency: "daily", criticalAlertSound: true,
  require2FA: false, passwordMinLength: 8, sessionTimeout: 60,
  allowPublicRegistration: false,
  maintenanceMode: false,
  maintenanceMessage: "System under maintenance. Please check back shortly.",
  allowedAdminIPs: "", updatedAt: null,
};

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-PH", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

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
  const [resetting,   setResetting]   = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [exporting,   setExporting]   = useState(false);
  const [dirty,       setDirty]       = useState(false);

  // ── Load settings on mount ─────────────────────────────────────────────────
  useEffect(() => {
    getSettings().then((res) => {
      if (res.success) {
        setSettings(fromApi(res.data));
        setDirty(false);
      } else {
        setLoadError(res.error);
      }
      setLoading(false);
    });
  }, []);

  // ── Warn before navigating away / closing tab with unsaved changes ─────────
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
    setSaved(false);
    setSaveError(null);
    setDirty(true);
  };

  const handleResetAllStatuses = async () => {
    if (resetConfirmText !== "RESET") return;
    setResetting(true);
    const res = await resetReportStatuses();
    setResetting(false);
    setResetDialog(false);
    setResetConfirmText("");
    if (res.success) {
      const count = res.data?.affected_count ?? 0;
      setResetResult(`Reset complete — ${count} report(s) moved back to pending.`);
      setTimeout(() => setResetResult(null), 5000);
    } else {
      setSaveError(res.error || "Reset failed. Please try again.");
    }
  };

  const handleExportAuditLog = async () => {
    setExporting(true);
    const res = await exportAuditLog();
    setExporting(false);
    if (!res.success) {
      setSaveError(res.error || "Export failed. Please try again.");
      return;
    }
    const url = URL.createObjectURL(res.blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = res.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      setDirty(false);
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
          {resetResult && (
            <span className="save-indicator save-indicator--info">
              <CheckCircle size={14} strokeWidth={2} /> {resetResult}
            </span>
          )}
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
          {settings.updatedAt && (
            <span className="settings-last-saved">
              Last saved: {fmtDate(settings.updatedAt)}
            </span>
          )}
          <button
            className="adm-btn adm-btn-ghost"
            onClick={() => window.location.reload()}
            disabled={saving}
          >
            <RotateCcw size={14} strokeWidth={2} /> Discard Changes
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
              onClick={() => {
                if (dirty && activeTab !== id) {
                  if (!window.confirm("You have unsaved changes. Switch tabs and discard them?")) return;
                  setDirty(false);
                }
                setActiveTab(id);
              }}
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
                  <span className="field-hint">
                    Applied automatically when ML detection returns no severity result.
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
                  onClick={handleExportAuditLog}
                  disabled={exporting}
                >
                  <Download size={14} strokeWidth={2} />
                  {exporting ? "Exporting…" : "Export Audit Log (CSV)"}
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
                disabled={resetConfirmText !== "RESET" || resetting}
                onClick={handleResetAllStatuses}
              >
                {resetting ? "Resetting…" : "Reset All Statuses"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSettings;
