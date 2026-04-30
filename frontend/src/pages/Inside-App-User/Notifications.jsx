import React, { useState, useEffect, useRef, useCallback } from "react";
import "./Notifications.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../hooks/useNotifications"; // ← your hook

import {
  FaBell,
  FaTrash,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaCheckDouble,
  FaCog,
  FaExclamationCircle,
  FaEnvelopeOpen,
  FaComment,
  FaChevronDown,
  FaChevronUp,
  FaEye,
  FaCheck,
  FaInbox,
  FaFilter,
  FaTimes,
  FaSlidersH,
} from "react-icons/fa";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getTypeConfig(type, title = "") {
  const t  = (type  || "").toLowerCase();
  const tl = (title || "").toLowerCase();
  if (t === "verified"    || tl.includes("verified"))   return { label: "Verified",    className: "type-verified",    icon: <FaCheckCircle /> };
  if (t === "declined"    || tl.includes("declined"))   return { label: "Declined",    className: "type-declined",    icon: <FaTimesCircle /> };
  if (t === "in_progress" || t === "in-progress" || tl.includes("progress")) return { label: "In Progress", className: "type-inprogress", icon: <FaClock /> };
  if (t === "resolved"    || tl.includes("resolved"))   return { label: "Resolved",    className: "type-resolved",    icon: <FaCheckDouble /> };
  if (t === "system"      || tl.includes("system"))     return { label: "System",      className: "type-system",      icon: <FaCog /> };
  if (t === "comment"     || tl.includes("comment"))    return { label: "Comment",     className: "type-comment",     icon: <FaComment /> };
  if (t === "admin"       || tl.includes("admin") || tl.includes("message")) return { label: "Admin", className: "type-admin", icon: <FaEnvelopeOpen /> };
  return { label: "Update", className: "type-system", icon: <FaExclamationCircle /> };
}

const TABS = ["All", "Unread", "Verified", "Declined", "Resolved", "Comments"];

function matchesTab(notif, tab) {
  if (tab === "All")    return true;
  if (tab === "Unread") return !notif.is_read;
  const { label } = getTypeConfig(notif.type, notif.title);
  if (tab === "Comments") return label === "Comment" || label === "Admin";
  return label === tab;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => {
        const cfg = getTypeConfig(t.type, t.title);
        return (
          <div key={t.toastId} className={`toast-item ${cfg.className}`}>
            <span className="toast-icon">{cfg.icon}</span>
            <div className="toast-body">
              <strong>{t.title}</strong>
              <p>{t.message}</p>
            </div>
            <button className="toast-close" onClick={() => onDismiss(t.toastId)}>
              <FaTimes />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ prefs, onChange, onClose }) {
  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h3><FaSlidersH /> Notification Preferences</h3>
        <button className="settings-close" onClick={onClose}><FaTimes /></button>
      </div>
      <div className="settings-body">
        {[
          { key: "report_updates", label: "Report Updates",       desc: "Verified, declined, and resolved reports" },
          { key: "comments",       label: "Comments & Messages",  desc: "Admin messages and comments on your posts" },
          { key: "system",         label: "System Notifications", desc: "App updates and announcements" },
        ].map(({ key, label, desc }) => (
          <label key={key} className="settings-toggle">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">{label}</span>
              <span className="settings-toggle-desc">{desc}</span>
            </div>
            <div
              className={`toggle-switch ${prefs[key] ? "on" : ""}`}
              onClick={() => onChange(key, !prefs[key])}
              role="switch"
              aria-checked={prefs[key]}
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onChange(key, !prefs[key])}
            >
              <span className="toggle-knob" />
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─── Notification Card ────────────────────────────────────────────────────────

function NotificationCard({ notif, onRead, onDelete, onNavigate, compact }) {
  const cfg = getTypeConfig(notif.type, notif.title);
  return (
    <div
      className={`notification-card ${cfg.className} ${!notif.is_read ? "unread" : "read"} ${compact ? "compact" : ""}`}
      onClick={() => {
        if (!notif.is_read) onRead(notif.id);
        if (notif.report_id) onNavigate(notif.report_id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && (!notif.is_read ? onRead(notif.id) : null)}
    >
      <span className="notif-type-bar" aria-hidden="true" />
      <span className="notification-icon">{cfg.icon}</span>

      <div className="notification-content">
        <div className="notif-top-row">
          <h3 className="notif-title">{notif.title ?? "Notification"}</h3>
          <span className="notif-type-badge">{cfg.label}</span>
        </div>
        <p className="notif-message">{notif.message}</p>
        <span className="notification-time">{timeAgo(notif.created_at)}</span>
      </div>

      <div className="notif-actions" onClick={(e) => e.stopPropagation()}>
        {notif.report_id && (
          <button className="notif-action-btn view" title="View Report" onClick={() => onNavigate(notif.report_id)}>
            <FaEye /><span>View</span>
          </button>
        )}
        {!notif.is_read && (
          <button className="notif-action-btn mark" title="Mark as read" onClick={() => onRead(notif.id)}>
            <FaCheck /><span>Read</span>
          </button>
        )}
        <button className="notif-action-btn delete" title="Delete" onClick={() => onDelete(notif.id)}>
          <FaTrash />
        </button>
      </div>
    </div>
  );
}

// ─── Grouped Card ─────────────────────────────────────────────────────────────

function GroupedCard({ group, onRead, onDelete, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = getTypeConfig(group[0].type, group[0].title);
  const unreadInGroup = group.filter((n) => !n.is_read).length;

  if (group.length === 1) {
    return <NotificationCard notif={group[0]} onRead={onRead} onDelete={onDelete} onNavigate={onNavigate} />;
  }

  return (
    <div className={`group-card ${cfg.className}`}>
      <div
        className="group-header"
        onClick={() => setExpanded((p) => !p)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((p) => !p)}
      >
        <span className="group-type-icon">{cfg.icon}</span>
        <div className="group-info">
          <strong>{group.length} {cfg.label} notifications</strong>
          {unreadInGroup > 0 && <span className="group-unread-badge">{unreadInGroup} unread</span>}
        </div>
        <button className="group-expand-btn">
          {expanded ? <FaChevronUp /> : <FaChevronDown />}
        </button>
      </div>
      {expanded && (
        <div className="group-children">
          {group.map((notif) => (
            <NotificationCard
              key={notif.id}
              notif={notif}
              onRead={onRead}
              onDelete={onDelete}
              onNavigate={onNavigate}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }) {
  return (
    <div className="empty-state">
      <div className="empty-icon-wrap"><FaInbox className="empty-icon" /></div>
      <h3>You&apos;re all caught up!</h3>
      <p>
        {tab === "Unread" ? "No unread notifications."
          : tab === "All" ? "No notifications yet."
          : `No ${tab.toLowerCase()} notifications.`}
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const POLL_INTERVAL = 30_000; // 30 seconds — adjust as needed

function Notifications() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    remove,
    refetch,
  } = useNotifications(); // ← directly using your hook, no context needed

  const navigate = useNavigate();
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [activeTab,     setActiveTab]     = useState("All");
  const [toasts,        setToasts]        = useState([]);
  const [showSettings,  setShowSettings]  = useState(false);
  const [prefs, setPrefs] = useState({ report_updates: true, comments: true, system: true });

  // ── Polling: re-fetch from backend every 30s ───────────────────────────────
  useEffect(() => {
    const id = setInterval(refetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [refetch]);

  // ── Toast: only fire when unread count genuinely increases after first load ─
  const prevCountRef  = useRef(-1);   // -1 = not yet seeded
  const initialLoaded = useRef(false);

  useEffect(() => {
    // Wait until the first successful load (loading done, data present)
    if (loading) return;

    if (!initialLoaded.current) {
      // Seed baseline on first load — no toast
      prevCountRef.current  = unreadCount;
      initialLoaded.current = true;
      return;
    }

    if (unreadCount > prevCountRef.current) {
      const newest = notifications.find((n) => !n.is_read);
      if (newest) {
        const toastId = Date.now();
        setToasts((prev) => [{ ...newest, toastId }, ...prev.slice(0, 2)]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.toastId !== toastId)), 5000);
      }
    }

    prevCountRef.current = unreadCount;
  }, [loading, unreadCount, notifications]);

  const dismissToast     = useCallback((id) => setToasts((p) => p.filter((t) => t.toastId !== id)), []);
  const handleNavigate   = useCallback((reportId) => navigate(`/report/${reportId}`), [navigate]);
  const handlePrefChange = useCallback((key, val) => setPrefs((p) => ({ ...p, [key]: val })), []);

  // ── Filter + Group ─────────────────────────────────────────────────────────
  const filtered = notifications.filter((n) => matchesTab(n, activeTab));

  const grouped = [];
  const seen    = new Map();
  for (const n of filtered) {
    const { label } = getTypeConfig(n.type, n.title);
    if (!seen.has(label)) { seen.set(label, []); grouped.push(seen.get(label)); }
    seen.get(label).push(n);
  }

  return (
    <>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />

      {sidebarOpen && (
        <div className="sidebar-overlay active" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />

      <div className="notifications-container">
        <div className="notifications-panel">

          {/* ── Header ── */}
          <div className="notifications-header">
            <div className="notifications-header-left">
              <FaBell className="fabell-icon" />
              <h1>Notifications</h1>
              {unreadCount > 0 && <span className="notif-badge">{unreadCount}</span>}
            </div>
            <div className="notifications-header-right">
              {unreadCount > 0 && (
                <button className="mark-all-btn" onClick={markAllAsRead}>
                  <FaCheckDouble /> <span>Mark all read</span>
                </button>
              )}
              <button
                className={`settings-btn ${showSettings ? "active" : ""}`}
                onClick={() => setShowSettings((p) => !p)}
                title="Notification settings"
              >
                <FaSlidersH />
              </button>
            </div>
          </div>

          {/* ── Settings ── */}
          {showSettings && (
            <SettingsPanel prefs={prefs} onChange={handlePrefChange} onClose={() => setShowSettings(false)} />
          )}

          {/* ── Filter Tabs ── */}
          <div className="filter-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`filter-tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "Comments" && <FaComment    className="tab-icon" />}
                {tab === "Verified" && <FaCheckCircle className="tab-icon" />}
                {tab === "Declined" && <FaTimesCircle className="tab-icon" />}
                {tab === "Resolved" && <FaCheckDouble  className="tab-icon" />}
                {tab === "Unread"   && <FaFilter        className="tab-icon" />}
                <span>{tab}</span>
                {tab === "Unread" && unreadCount > 0 && (
                  <span className="tab-badge">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {loading && <p className="notif-status">Loading notifications…</p>}
          {error   && <p className="notif-status notif-error">{error}</p>}

          {/* ── List ── */}
          <div className="notifications-list">
            {!loading && !error && filtered.length === 0 && <EmptyState tab={activeTab} />}
            {grouped.map((group, i) => (
              <GroupedCard
                key={i}
                group={group}
                onRead={markAsRead}
                onDelete={remove}
                onNavigate={handleNavigate}
              />
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

export default Notifications;