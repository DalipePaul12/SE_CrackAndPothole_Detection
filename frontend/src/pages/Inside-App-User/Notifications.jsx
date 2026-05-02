import React, { useState, useEffect, useCallback, useRef } from "react";
import "./Notifications.css";
import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import {
  Bell, CheckCheck, Settings, X, Clock,
  ShieldCheck, ShieldX, Wrench, CircleCheck,
  MessageSquare, AlertTriangle, Info, ChevronDown,
  Eye, Trash2,
} from "lucide-react";

/* ──────────────────────────────────────────────────────────
   CONSTANTS & HELPERS
────────────────────────────────────────────────────────── */
const TYPE_CONFIG = {
  verified:   { icon: ShieldCheck, label: "Verified",    cls: "type-verified" },
  declined:   { icon: ShieldX,     label: "Declined",    cls: "type-declined" },
  inprogress: { icon: Wrench,      label: "In Progress", cls: "type-inprogress" },
  resolved:   { icon: CircleCheck, label: "Resolved",    cls: "type-resolved" },
  comment:    { icon: MessageSquare, label: "Comment",   cls: "type-comment" },
  admin:      { icon: ShieldCheck, label: "Admin",       cls: "type-admin" },
  system:     { icon: Info,        label: "System",      cls: "type-system" },
};

const FILTER_TABS = [
  { key: "all",       label: "All" },
  { key: "unread",    label: "Unread" },
  { key: "verified",  label: "Verified" },
  { key: "declined",  label: "Declined" },
  { key: "resolved",  label: "Resolved" },
  { key: "comment",   label: "Comments" },
];

const normalizeType = (t = "") => t.toLowerCase().replace(/[^a-z]/g, "");

function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "Just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7)   return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ──────────────────────────────────────────────────────────
   TOAST
────────────────────────────────────────────────────────── */
function Toast({ toasts, onRemove }) {
  return (
    <div className="notif-toast-container" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => {
        const cfg = TYPE_CONFIG[normalizeType(t.type)] ?? TYPE_CONFIG.system;
        const Icon = cfg.icon;
        return (
          <div key={t.id} className={`notif-toast ${cfg.cls}`} role="alert">
            <div className="notif-toast-icon-wrap">
              <Icon size={18} aria-hidden="true" />
            </div>
            <div className="notif-toast-body">
              <p className="notif-toast-title">{t.title}</p>
              <p className="notif-toast-message">{t.message}</p>
            </div>
            <button
              className="notif-toast-close"
              onClick={() => onRemove(t.id)}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function useToasts() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((title, message, type = "system") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

/* ──────────────────────────────────────────────────────────
   TOGGLE SWITCH
────────────────────────────────────────────────────────── */
function ToggleSwitch({ on, onToggle, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle-switch ${on ? "on" : ""}`}
      onClick={onToggle}
    >
      <span className="toggle-knob" />
    </button>
  );
}

/* ──────────────────────────────────────────────────────────
   SETTINGS PANEL
────────────────────────────────────────────────────────── */
function SettingsPanel({ settings, onToggle, onClose }) {
  const items = [
    { key: "push",   label: "Push Notifications",  desc: "Get alerts when your reports are updated" },
    { key: "email",  label: "Email Notifications",  desc: "Receive summaries via email" },
    { key: "sound",  label: "Notification Sounds",  desc: "Play a sound for new notifications" },
    { key: "grouped",label: "Group by Type",        desc: "Group similar notifications together" },
  ];

  return (
    <div className="notif-settings-panel">
      <div className="settings-panel-header">
        <div className="settings-panel-title">
          <Settings size={16} aria-hidden="true" />
          Notification Preferences
        </div>
        <button className="settings-panel-close" onClick={onClose} aria-label="Close settings">
          <X size={16} />
        </button>
      </div>
      <div className="settings-toggle-list">
        {items.map(({ key, label, desc }) => (
          <div key={key} className="settings-toggle-row">
            <div className="settings-toggle-info">
              <span className="settings-toggle-label">{label}</span>
              <span className="settings-toggle-desc">{desc}</span>
            </div>
            <ToggleSwitch
              on={settings[key]}
              onToggle={() => onToggle(key)}
              label={label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   NOTIFICATION CARD
────────────────────────────────────────────────────────── */
function NotifCard({ notif, onMarkRead, onDelete, onView }) {
  const type = normalizeType(notif.type);
  const cfg  = TYPE_CONFIG[type] ?? TYPE_CONFIG.system;
  const Icon = cfg.icon;

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onView(notif);
    }
  };

  return (
    <div
      className={`notif-card ${cfg.cls} ${notif.is_read ? "is-read" : "is-unread"}`}
      role="button"
      tabIndex={0}
      aria-label={`Notification: ${notif.title}`}
      onClick={() => { onView(notif); if (!notif.is_read) onMarkRead(notif.id); }}
      onKeyDown={handleKey}
    >
      <div className="notif-accent-bar" aria-hidden="true" />

      <div className="notif-card-icon-wrap" aria-hidden="true">
        <Icon size={18} />
      </div>

      <div className="notif-card-body">
        <div className="notif-card-top">
          <span className="notif-card-title">{notif.title}</span>
          <span className="notif-type-chip">{cfg.label}</span>
        </div>
        <p className="notif-card-message">{notif.message}</p>
        <div className="notif-card-time">
          <Clock size={11} aria-hidden="true" />
          <span>{fmtTime(notif.created_at)}</span>
        </div>
      </div>

      <div className="notif-card-actions" role="group" aria-label="Notification actions">
        <button
          className="notif-action-btn btn-view"
          onClick={(e) => { e.stopPropagation(); onView(notif); }}
          aria-label="View details"
        >
          <Eye size={12} />
        </button>
        {!notif.is_read && (
          <button
            className="notif-action-btn btn-mark"
            onClick={(e) => { e.stopPropagation(); onMarkRead(notif.id); }}
            aria-label="Mark as read"
          >
            <CheckCheck size={12} />
          </button>
        )}
        <button
          className="notif-action-btn btn-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(notif.id); }}
          aria-label="Delete notification"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   GROUP CARD
────────────────────────────────────────────────────────── */
function GroupCard({ groupKey, items, onMarkRead, onDelete, onView }) {
  const [open, setOpen] = useState(false);
  const type = normalizeType(groupKey);
  const cfg  = TYPE_CONFIG[type] ?? TYPE_CONFIG.system;
  const Icon = cfg.icon;
  const unreadCount = items.filter((n) => !n.is_read).length;

  return (
    <div className={`notif-group-card ${cfg.cls}`}>
      <div
        className="notif-group-header"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((o) => !o); }}
        aria-expanded={open}
      >
        <div className="notif-card-icon-wrap" aria-hidden="true">
          <Icon size={18} />
        </div>
        <div className="notif-group-info">
          <span className="notif-group-label">{cfg.label} — {items.length} notification{items.length !== 1 ? "s" : ""}</span>
          {unreadCount > 0 && (
            <span className="notif-group-unread">{unreadCount} unread</span>
          )}
        </div>
        <button className={`notif-group-expand ${open ? "open" : ""}`} aria-hidden="true" tabIndex={-1}>
          <ChevronDown size={16} />
        </button>
      </div>
      {open && (
        <div className="notif-group-children">
          {items.map((n) => (
            <NotifCard
              key={n.id}
              notif={n}
              onMarkRead={onMarkRead}
              onDelete={onDelete}
              onView={onView}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   EMPTY STATE
────────────────────────────────────────────────────────── */
function EmptyState({ activeFilter }) {
  return (
    <div className="notif-empty-state">
      <div className="notif-empty-icon">
        <Bell size={32} />
      </div>
      <h3>
        {activeFilter === "all"
          ? "No Notifications Yet"
          : `No ${activeFilter} notifications`}
      </h3>
      <p>
        {activeFilter === "all"
          ? "When your reports get updates, they'll appear here."
          : "Try switching to a different filter."}
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   MAIN COMPONENT
────────────────────────────────────────────────────────── */
function Notifications() {
  const [sidebarOpen, setSidebarOpen]     = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [activeFilter, setActiveFilter]   = useState("all");
  const [showSettings, setShowSettings]   = useState(false);
  const [settings, setSettings]           = useState({
    push: true, email: false, sound: false, grouped: false,
  });

  const { toasts, addToast, removeToast } = useToasts();

  /* Fetch notifications */
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("access_token");
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/v1/notifications`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to load notifications.");
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : data?.results ?? []);
    } catch (err) {
      setError(err.message || "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  /* Computed values */
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const filtered = notifications.filter((n) => {
    if (activeFilter === "all")    return true;
    if (activeFilter === "unread") return !n.is_read;
    return normalizeType(n.type) === activeFilter;
  });

  const tabBadges = FILTER_TABS.reduce((acc, tab) => {
    if (tab.key === "unread") acc[tab.key] = unreadCount;
    else if (tab.key !== "all") {
      acc[tab.key] = notifications.filter(
        (n) => !n.is_read && normalizeType(n.type) === tab.key
      ).length;
    }
    return acc;
  }, {});

  /* Actions */
  const markRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    addToast("All Caught Up", "All notifications marked as read.", "system");
  }, [addToast]);

  const deleteNotif = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const viewNotif = useCallback((notif) => {
    markRead(notif.id);
    addToast(notif.title, notif.message, notif.type);
  }, [markRead, addToast]);

  const toggleSetting = useCallback((key) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* Grouped render */
  const renderList = () => {
    if (loading) {
      return Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ height: 72, borderRadius: "var(--radius-xl)" }} />
      ));
    }
    if (error) {
      return (
        <div className="notif-status-msg is-error" role="alert">
          <AlertTriangle size={16} style={{ display: "inline", marginRight: 6 }} />
          {error}
        </div>
      );
    }
    if (filtered.length === 0) return <EmptyState activeFilter={activeFilter} />;

    if (settings.grouped && activeFilter === "all") {
      const groups = filtered.reduce((acc, n) => {
        const key = normalizeType(n.type);
        if (!acc[key]) acc[key] = [];
        acc[key].push(n);
        return acc;
      }, {});
      return Object.entries(groups).map(([key, items]) => (
        <GroupCard
          key={key}
          groupKey={key}
          items={items}
          onMarkRead={markRead}
          onDelete={deleteNotif}
          onView={viewNotif}
        />
      ));
    }

    return filtered.map((n) => (
      <NotifCard
        key={n.id}
        notif={n}
        onMarkRead={markRead}
        onDelete={deleteNotif}
        onView={viewNotif}
      />
    ));
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

      <Toast toasts={toasts} onRemove={removeToast} />

      <main className="notifications-page">
        <div className="notifications-inner">

          {/* ── Page Header ── */}
          <div className="notif-page-header">
            <div className="notif-page-title-group">
              <div className="notif-page-icon-wrap" aria-hidden="true">
                <Bell size={22} />
              </div>
              <div>
                <h1 className="notif-page-title">Notifications</h1>
                <p className="notif-page-subtitle">Stay updated on your reports</p>
              </div>
              {unreadCount > 0 && (
                <span className="notif-count-pill" aria-label={`${unreadCount} unread`}>
                  <Bell size={11} aria-hidden="true" />
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="notif-header-actions">
              {unreadCount > 0 && (
                <button className="notif-mark-all-btn" onClick={markAllRead}>
                  <CheckCheck size={15} aria-hidden="true" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                className={`notif-settings-btn ${showSettings ? "active" : ""}`}
                onClick={() => setShowSettings((s) => !s)}
                aria-label="Notification settings"
                aria-expanded={showSettings}
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* ── Settings Panel ── */}
          {showSettings && (
            <SettingsPanel
              settings={settings}
              onToggle={toggleSetting}
              onClose={() => setShowSettings(false)}
            />
          )}

          {/* ── Filter Tabs ── */}
          <div className="notif-filter-bar" role="tablist" aria-label="Notification filters">
            {FILTER_TABS.map(({ key, label }) => {
              const badge = tabBadges[key];
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={activeFilter === key}
                  className={`notif-filter-tab ${activeFilter === key ? "active" : ""}`}
                  onClick={() => setActiveFilter(key)}
                >
                  {label}
                  {badge > 0 && (
                    <span className="notif-tab-badge" aria-label={`${badge} unread`}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Notifications List ── */}
          <div
            className="notif-list"
            role="region"
            aria-label="Notifications"
            aria-live="polite"
          >
            {renderList()}
          </div>
        </div>
      </main>
    </>
  );
}

export default Notifications;