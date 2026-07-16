import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Settings.css";
import ConfirmChangesModal from "../PopUps/ConfirmChangesModal.jsx";
import { useUser } from "../../hooks/useUser";
import { useTheme } from "../Contexts/ThemeContext";
import { useAuthContext } from "../Contexts/AuthContext.jsx";
import { deleteMyAccount } from "../../api/users";
import {
  Bell,
  Shield,
  Eye,
  EyeOff,
  Moon,
  Sun,
  Monitor,
  Globe,
  Trash2,
  LogOut,
  Download,
  Smartphone,
  Mail,
  Volume2,
  VolumeX,
  Check,
  X,
  Lock,
  KeyRound,
  UserCog,
  AlertTriangle,
  Info,
  Save,
} from "lucide-react";

function Toast({ toasts, removeToast }) {
  return (
    <div className="st-toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`st-toast st-toast--${t.type} ${t.hiding ? "st-toast--hiding" : ""}`}
        >
          {t.type === "success" && <Check size={16} />}
          {t.type === "error" && <AlertTriangle size={16} />}
          {t.type === "info" && <Info size={16} />}
          <span>{t.message}</span>
          <button className="st-toast__close" onClick={() => removeToast(t.id)}>
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, ariaLabel }) {
  return (
    <label className="st-toggle" aria-label={ariaLabel}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="st-toggle__slider" />
    </label>
  );
}

function SettingRow({ icon, title, desc, children, danger }) {
  return (
    <div className={`st-row${danger ? " st-row--danger" : ""}`}>
      <div className="st-row__icon" aria-hidden="true">{icon}</div>
      <div className="st-row__text">
        <h4>{title}</h4>
        {desc && <p>{desc}</p>}
      </div>
      <div className="st-row__action">{children}</div>
    </div>
  );
}

function Settings() {
  const { updatePassword } = useUser();
  const { theme, setTheme } = useTheme();
  const { logout } = useAuthContext();
  const navigate = useNavigate();

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const [toasts, setToasts] = useState([]);
  const showToast = (message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type, hiding: false }]);
    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, hiding: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
    }, 3500);
  };
  const removeToast = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const [activeTheme, setActiveTheme] = useState(theme || "dark");
  const [language, setLanguage] = useState("en");

  const [notifs, setNotifs] = useState({
    push: false,
    email: false,
    system: true,
    sound: true,
    marketing: false,
  });

  const toggleNotif = (key) => {
    setNotifs((prev) => ({ ...prev, [key]: !prev[key] }));
    showToast(`${key.replace(/_/g, " ")} notifications ${notifs[key] ? "disabled" : "enabled"}.`, "info");
  };

  const [pwData, setPwData] = useState({ current: "", new: "", confirm: "" });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [pwError, setPwError] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [twoFactor, setTwoFactor] = useState(false);
  const [profileVisible, setProfileVisible] = useState(true);

  const validatePassword = () => {
    if (!pwData.current) return "Enter your current password.";
    if (pwData.new.length < 8) return "New password must be at least 8 characters.";
    if (pwData.new !== pwData.confirm) return "New passwords do not match.";
    return "";
  };

  const handleChangePassword = async () => {
    const err = validatePassword();
    if (err) { setPwError(err); showToast(err, "error"); return; }
    setPwError("");
    setPwLoading(true);
    try {
      await updatePassword(pwData.current, pwData.new);
      showToast("Password updated successfully!", "success");
      setPwData({ current: "", new: "", confirm: "" });
    } catch (err) {
      const msg = err?.message || err?.detail || "Failed to update password.";
      setPwError(msg);
      showToast(msg, "error");
    } finally {
      setPwLoading(false);
      setShowConfirm(false);
    }
  };

  const handleExportData = () => {
    showToast("Your data export request has been queued. Check your email.", "info");
  };

  const handleDeleteAccount = () => {
    setConfirmAction("delete");
    setShowConfirm(true);
  };

  const confirmDelete = async () => {
    const res = await deleteMyAccount();
    if (!res.success) {
      showToast(res.error || "Failed to delete account. Please try again.", "error");
      setShowConfirm(false);
      setConfirmAction(null);
      return;
    }
    setShowConfirm(false);
    setConfirmAction(null);
    await logout();
    navigate("/", { replace: true });
  };

  useEffect(() => {
    if (activeTheme !== theme) setTheme(activeTheme);
  }, [activeTheme]);

  return (
    <>
      <Toast toasts={toasts} removeToast={removeToast} />

      <div className="st-container">
        <header className="st-header">
          <h1>Settings</h1>
          <p>Manage your preferences, security, and account details.</p>
        </header>

        <section className="st-card">
          <div className="st-card__head">
            <Monitor size={18} />
            <h2>Appearance</h2>
          </div>

          <div className="st-card__body">
            <SettingRow
              icon={<Sun size={18} />}
              title="Theme"
              desc="Choose how Snap2Fix looks for you."
            >
              <div className="st-seg">
                {[
                  { key: "light", label: "Light", icon: <Sun size={14} /> },
                  { key: "dark", label: "Dark", icon: <Moon size={14} /> },
                  { key: "auto", label: "Auto", icon: <Monitor size={14} /> },
                ].map((t) => (
                  <button
                    key={t.key}
                    className={`st-seg__btn${activeTheme === t.key ? " st-seg__btn--active" : ""}`}
                    onClick={() => setActiveTheme(t.key)}
                    aria-pressed={activeTheme === t.key}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow
              icon={<Globe size={18} />}
              title="Language"
              desc="Select your preferred language."
            >
              <select
                className="st-select"
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  showToast("Language preference saved.", "success");
                }}
              >
                <option value="en">English</option>
                <option value="tl">Filipino</option>
                <option value="es">Spanish</option>
              </select>
            </SettingRow>
          </div>
        </section>

        <section className="st-card">
          <div className="st-card__head">
            <Bell size={18} />
            <h2>Notifications</h2>
          </div>
          <div className="st-card__body">
            <SettingRow
              icon={<Smartphone size={18} />}
              title="Push Notifications"
              desc="Instant alerts on your device."
            >
              <Toggle checked={notifs.push} onChange={() => toggleNotif("push")} ariaLabel="Push notifications" />
            </SettingRow>

            <SettingRow
              icon={<Mail size={18} />}
              title="Email Summaries"
              desc="Daily or weekly digest emails."
            >
              <Toggle checked={notifs.email} onChange={() => toggleNotif("email")} ariaLabel="Email summaries" />
            </SettingRow>

            <SettingRow
              icon={<Bell size={18} />}
              title="System Alerts"
              desc="Important account & system changes."
            >
              <Toggle checked={notifs.system} onChange={() => toggleNotif("system")} ariaLabel="System alerts" />
            </SettingRow>

            <SettingRow
              icon={notifs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
              title="Notification Sound"
              desc="Play a sound when notifications arrive."
            >
              <Toggle checked={notifs.sound} onChange={() => toggleNotif("sound")} ariaLabel="Notification sound" />
            </SettingRow>

            <SettingRow
              icon={<Mail size={18} />}
              title="Marketing & Updates"
              desc="New features, tips, and community news."
            >
              <Toggle checked={notifs.marketing} onChange={() => toggleNotif("marketing")} ariaLabel="Marketing emails" />
            </SettingRow>
          </div>
        </section>

        <section className="st-card">
          <div className="st-card__head">
            <Shield size={18} />
            <h2>Privacy & Security</h2>
          </div>

          <div className="st-card__body">
            <SettingRow
              icon={<Eye size={18} />}
              title="Profile Visibility"
              desc="Allow others to see your report history."
            >
              <Toggle
                checked={profileVisible}
                onChange={() => {
                  setProfileVisible((v) => !v);
                  showToast(`Profile is now ${profileVisible ? "private" : "public"}.`, "info");
                }}
                ariaLabel="Profile visibility"
              />
            </SettingRow>

            <SettingRow
              icon={<KeyRound size={18} />}
              title="Two-Factor Authentication"
              desc="Add an extra layer of security."
            >
              <button
                className="st-btn st-btn--small st-btn--outline"
                onClick={() => {
                  setTwoFactor((v) => !v);
                  showToast(twoFactor ? "2FA disabled." : "2FA setup started — check your email.", "info");
                }}
              >
                {twoFactor ? "Disable" : "Enable"}
              </button>
            </SettingRow>

            <div className="st-password-block">
              <div className="st-password-block__title">
                <Lock size={16} />
                <span>Change Password</span>
              </div>

              {pwError && (
                <div className="st-inline-error">
                  <AlertTriangle size={14} />
                  <span>{pwError}</span>
                </div>
              )}

              <div className="st-field">
                <label>Current Password</label>
                <div className="st-input-wrap">
                  <input
                    type={showPw.current ? "text" : "password"}
                    value={pwData.current}
                    onChange={(e) => {
                      setPwData((p) => ({ ...p, current: e.target.value }));
                      setPwError("");
                    }}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    className="st-input__eye"
                    onClick={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                  >
                    {showPw.current ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="st-field">
                <label>New Password</label>
                <div className="st-input-wrap">
                  <input
                    type={showPw.new ? "text" : "password"}
                    value={pwData.new}
                    onChange={(e) => {
                      setPwData((p) => ({ ...p, new: e.target.value }));
                      setPwError("");
                    }}
                    placeholder="Min 8 characters"
                  />
                  <button
                    type="button"
                    className="st-input__eye"
                    onClick={() => setShowPw((s) => ({ ...s, new: !s.new }))}
                  >
                    {showPw.new ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="st-field">
                <label>Confirm New Password</label>
                <div className="st-input-wrap">
                  <input
                    type={showPw.confirm ? "text" : "password"}
                    value={pwData.confirm}
                    onChange={(e) => {
                      setPwData((p) => ({ ...p, confirm: e.target.value }));
                      setPwError("");
                    }}
                    placeholder="Re-enter new password"
                  />
                  <button
                    type="button"
                    className="st-input__eye"
                    onClick={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                  >
                    {showPw.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="st-password-block__actions">
                <button
                  className="st-btn st-btn--small st-btn--primary"
                  onClick={() => {
                    const err = validatePassword();
                    if (err) { setPwError(err); showToast(err, "error"); return; }
                    setPwError("");
                    setConfirmAction("password");
                    setShowConfirm(true);
                  }}
                  disabled={pwLoading}
                >
                  <Save size={14} />
                  {pwLoading ? "Updating…" : "Update Password"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="st-card">
          <div className="st-card__head">
            <UserCog size={18} />
            <h2>Data & Account</h2>
          </div>

          <div className="st-card__body">
            <SettingRow
              icon={<Download size={18} />}
              title="Export Your Data"
              desc="Download a copy of your reports and profile data."
            >
              <button className="st-btn st-btn--small st-btn--outline" onClick={handleExportData}>
                Export
              </button>
            </SettingRow>

            <SettingRow
              icon={<LogOut size={18} />}
              title="Log Out"
              desc="Sign out from all devices."
            >
              <button
                className="st-btn st-btn--small st-btn--outline"
                onClick={() => {
                  setConfirmAction("logout");
                  setShowConfirm(true);
                }}
              >
                Log Out
              </button>
            </SettingRow>

            <SettingRow
              icon={<Trash2 size={18} />}
              title="Delete Account"
              desc="Permanently remove your account and all data."
              danger
            >
              <button className="st-btn st-btn--small st-btn--danger" onClick={handleDeleteAccount}>
                Delete
              </button>
            </SettingRow>
          </div>
        </section>

        <section className="st-card st-card--center">
          <div className="st-about">
            <img src="/snap.jpg" alt="Snap2Fix Logo" className="st-about__logo" />
            <h3>Snap2Fix PH</h3>
            <span className="st-about__badge">Version 1.0.0</span>
            <p className="st-about__desc">
              An AI-powered road damage reporting system that helps communities
              identify, report, and monitor infrastructure issues efficiently.
            </p>

            <div className="st-about__team">
              <p className="st-about__team-title">Developed By</p>
              <div className="st-about__team-list">
                {["Paul Angelo Dalipe", "Brian Dapito", "Mave Rick Sandoval", "Krislyn Sayat", "John Carlo Trajico"].map((n) => (
                  <span key={n} className="st-about__chip">{n}</span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {showConfirm && (
        <ConfirmChangesModal
          title={
            confirmAction === "password"
              ? "Update Password?"
              : confirmAction === "delete"
              ? "Delete Account?"
              : "Log Out?"
          }
          message={
            confirmAction === "password"
              ? "Your new password will take effect immediately on all devices."
              : confirmAction === "delete"
              ? "This action is irreversible. All your reports and data will be permanently removed."
              : "You will be signed out from this session."
          }
          confirmText={
            confirmAction === "password"
              ? "Update"
              : confirmAction === "delete"
              ? "Delete"
              : "Log Out"
          }
          variant={confirmAction === "delete" ? "danger" : "primary"}
          onCancel={() => { setShowConfirm(false); setConfirmAction(null); }}
          onConfirm={
            confirmAction === "password"
              ? handleChangePassword
              : confirmAction === "delete"
              ? confirmDelete
              : async () => {
                  setShowConfirm(false);
                  setConfirmAction(null);
                  await logout();
                  navigate("/", { replace: true });
                }
          }
        />
      )}
    </>
  );
}

export default Settings;