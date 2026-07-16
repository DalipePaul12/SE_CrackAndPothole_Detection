/**
 * ContractorProfile.jsx
 *
 * Shows the logged-in contractor's profile and lets them toggle their
 * availability for new project assignments.
 *
 * Data sources:
 *  - GET /users/me              → full profile (including is_available)
 *  - PATCH /contractor/availability → toggle is_available
 *  - useContractorProjects      → project counts for the stats strip
 */
import { useState, useEffect, useCallback } from "react";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShieldCheck,
  Wrench,
  CheckSquare,
  ClipboardList,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { getMyProfile } from "../../api/users";
import { updateAvailability } from "../../api/contractor";
import { useContractorProjects } from "../../hooks/useContractorProjects";
import "./ContractorProfile.css";

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "long" }) : "—";

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className={`cp-stat-card cp-stat-${accent}`}>
      <div className="cp-stat-icon"><Icon size={18} /></div>
      <div className="cp-stat-body">
        <span className="cp-stat-value">{value}</span>
        <span className="cp-stat-label">{label}</span>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="cp-info-row">
      <Icon size={15} className="cp-info-icon" />
      <span className="cp-info-label">{label}</span>
      <span className="cp-info-value">{value || "—"}</span>
    </div>
  );
}

export default function ContractorProfile() {
  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  // Optimistic toggle state — initialised once profile loads
  const [available, setAvailable] = useState(true);
  const [toggling,  setToggling]  = useState(false);
  const [toastMsg,  setToastMsg]  = useState(null);

  const { projects } = useContractorProjects();

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalProjects     = projects.length;
  const activeProjects    = projects.filter(p => p.status?.toUpperCase() === "IN_PROGRESS").length;
  const completedProjects = projects.filter(p => p.status?.toUpperCase() === "COMPLETED").length;

  // ── Load profile ───────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getMyProfile();
    setLoading(false);
    if (res.success) {
      setProfile(res.data);
      // NULL from API → treat as available
      setAvailable(res.data.is_available !== false);
    } else {
      setError(res.error ?? "Could not load profile.");
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // ── Show a transient toast ─────────────────────────────────────────────────
  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // ── Toggle availability ────────────────────────────────────────────────────
  const handleToggle = useCallback(async () => {
    if (toggling) return;
    const next = !available;
    setAvailable(next);     // optimistic
    setToggling(true);
    const res = await updateAvailability(next);
    setToggling(false);
    if (res?.success || res?.data?.is_available !== undefined) {
      showToast(next ? "You are now available for new projects." : "You are now marked as busy.");
    } else {
      setAvailable(!next);  // rollback
      showToast("Failed to update availability. Please try again.");
    }
  }, [available, toggling, showToast]);

  // ── Location string ────────────────────────────────────────────────────────
  const locationStr = profile
    ? [profile.street, profile.barangay, profile.city, profile.country]
        .filter(Boolean)
        .join(", ") || "—"
    : "—";

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="cp-page">
        <div className="cp-skeleton-block" />
        <div className="cp-skeleton-block short" />
        <div className="cp-skeleton-block" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cp-page">
        <div className="cp-error-state">
          <AlertCircle size={22} />
          <span>{error}</span>
          <button className="cp-retry-btn" onClick={loadProfile}>
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cp-page">
      {/* ── Transient toast ──────────────────────────────────────────────── */}
      {toastMsg && (
        <div className={`cp-toast ${available ? "cp-toast-success" : "cp-toast-warning"}`}>
          {toastMsg}
        </div>
      )}

      {/* ── Profile hero card ─────────────────────────────────────────────── */}
      <div className="cp-hero-card">
        <div className="cp-avatar">
          {profile?.profile_picture_url ? (
            <img src={profile.profile_picture_url} alt={profile.full_name} />
          ) : (
            <div className="cp-avatar-fallback">
              <User size={32} />
            </div>
          )}
        </div>

        <div className="cp-hero-info">
          <h1 className="cp-name">{profile?.full_name || "Contractor"}</h1>
          <div className="cp-role-badge">
            <ShieldCheck size={12} />
            <span>Contractor</span>
          </div>
          <p className="cp-member-since">
            Member since {fmtDate(profile?.created_at)}
          </p>
        </div>

        {/* ── Availability toggle ───────────────────────────────────────── */}
        <div className="cp-availability-block">
          <div className="cp-avail-label-row">
            <span className="cp-avail-label">Availability</span>
            <span className={`cp-avail-chip ${available ? "avail-on" : "avail-off"}`}>
              {available ? "Available" : "Busy"}
            </span>
          </div>
          <p className="cp-avail-hint">
            {available
              ? "Admins can assign you to new projects."
              : "You will not appear in the available-contractors list."}
          </p>
          <button
            className={`cp-toggle-btn ${available ? "on" : "off"}`}
            onClick={handleToggle}
            disabled={toggling}
            aria-label={available ? "Mark as busy" : "Mark as available"}
          >
            <span className="cp-toggle-knob" />
          </button>
        </div>
      </div>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <div className="cp-stats-strip">
        <StatCard icon={ClipboardList} label="Total Assigned"  value={totalProjects}     accent="primary" />
        <StatCard icon={Wrench}        label="In Progress"     value={activeProjects}     accent="warning" />
        <StatCard icon={CheckSquare}   label="Completed"       value={completedProjects}  accent="success" />
      </div>

      {/* ── Contact & location info ────────────────────────────────────────── */}
      <div className="cp-section-card">
        <h2 className="cp-section-title">Contact Information</h2>
        <div className="cp-info-list">
          <InfoRow icon={Mail}     label="Email"          value={profile?.email} />
          <InfoRow icon={Phone}    label="Contact Number" value={profile?.contact_number} />
          <InfoRow icon={MapPin}   label="Location"       value={locationStr} />
          <InfoRow icon={Calendar} label="Member Since"   value={fmtDate(profile?.created_at)} />
        </div>
      </div>

      {/* ── Account status ────────────────────────────────────────────────── */}
      <div className="cp-section-card">
        <h2 className="cp-section-title">Account Status</h2>
        <div className="cp-status-chips">
          <span className={`cp-status-chip ${profile?.is_active ? "chip-success" : "chip-danger"}`}>
            {profile?.is_active ? "Active" : "Inactive"}
          </span>
          <span className={`cp-status-chip ${profile?.is_verified ? "chip-success" : "chip-warning"}`}>
            {profile?.is_verified ? "Verified" : "Unverified"}
          </span>
          <span className={`cp-status-chip ${available ? "chip-success" : "chip-warning"}`}>
            {available ? "Available" : "Busy"}
          </span>
        </div>
        <p className="cp-status-note">
          To update your name, contact number, or location please contact your administrator.
        </p>
      </div>
    </div>
  );
}
