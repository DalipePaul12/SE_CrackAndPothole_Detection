import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import "./Notifications.css";
import { useNotifications } from "../../hooks/useNotifications.js";
import { getReport } from "../../api/reports";

import {
  Bell,
  CheckCheck,
  Settings,
  X,
  Clock,
  ShieldCheck,
  ShieldX,
  Wrench,
  CircleCheck,
  MessageSquare,
  AlertTriangle,
  Info,
  Eye,
  Trash2,
} from "lucide-react";

const TYPE_CONFIG = {
  verified:    { icon: ShieldCheck,    label: "Verified",    cls: "type-verified"    },
  success:     { icon: ShieldCheck,    label: "Verified",    cls: "type-verified"    },
  declined:    { icon: ShieldX,        label: "Declined",    cls: "type-declined"    },
  warning:     { icon: ShieldX,        label: "Declined",    cls: "type-declined"    },
  inprogress:  { icon: Wrench,         label: "In Progress", cls: "type-inprogress"  },
  in_progress: { icon: Wrench,         label: "In Progress", cls: "type-inprogress"  },
  resolved:    { icon: CircleCheck,    label: "Resolved",    cls: "type-resolved"    },
  comment:     { icon: MessageSquare,  label: "Comment",     cls: "type-comment"     },
  deleted:     { icon: Trash2,         label: "Removed",     cls: "type-deleted"     },
  pending:     { icon: Clock,          label: "Pending",     cls: "type-pending"     },
  info:        { icon: Info,           label: "Update",      cls: "type-info"        },
  update:      { icon: MessageSquare,  label: "Update",      cls: "type-info"        },
  system:      { icon: Info,           label: "System",      cls: "type-system"      },
};

const FILTER_TABS = [
  { key: "all",        label: "All"        },
  { key: "unread",     label: "Unread"     },
  { key: "verified",   label: "Verified"   },
  { key: "inprogress", label: "In Progress"},
  { key: "resolved",   label: "Resolved"   },
  { key: "declined",   label: "Declined"   },
  { key: "comment",    label: "Comments"   },
  { key: "deleted",    label: "Removed"    },
];

const STATUS_STEPS = ["PENDING", "VERIFIED", "IN_PROGRESS", "RESOLVED"];

function normalizeType(raw = "") {
  return raw.replace(/[\u{1F300}-\u{1FFFF}]/gu, "").toLowerCase().replace(/[\s_\-]/g, "");
}

function resolveTypeKey(raw = "") {
  const normalized = normalizeType(raw);
  if (TYPE_CONFIG[normalized]) return normalized;
  for (const key of Object.keys(TYPE_CONFIG)) {
    if (normalized.includes(key)) return key;
  }
  return "system";
}

function resolveTypeKeyFromNotif(notif) {
  const baseKey = resolveTypeKey(notif?.type ?? "");
  if (baseKey !== "info" && baseKey !== "system") return baseKey;

  const haystack = `${notif?.title ?? ""} ${notif?.message ?? ""}`.toLowerCase();
  if (haystack.includes("verified"))    return "verified";
  if (haystack.includes("declined"))    return "declined";
  if (haystack.includes("resolved"))    return "resolved";
  if (haystack.includes("in progress")) return "inprogress";
  if (haystack.includes("comment"))     return "comment";
  if (haystack.includes("deleted") || haystack.includes("removed")) return "deleted";
  return baseKey;
}

function formatTime(dateString) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)  return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days  = Math.floor(hours / 24);
  if (days < 7)   return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useToasts() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((title, message, type = "system") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, addToast, removeToast };
}

function Toast({ toasts, onRemove }) {
  return (
    <div className="notif-toast-container">
      {toasts.map(toast => {
        const key  = resolveTypeKeyFromNotif(toast);
        const cfg  = TYPE_CONFIG[key];
        const Icon = cfg.icon;
        return (
          <div key={toast.id} className={`notif-toast ${cfg.cls}`}>
            <div className="notif-toast-icon-wrap"><Icon size={18} /></div>
            <div className="notif-toast-body">
              <p className="notif-toast-title">{toast.title}</p>
              <p className="notif-toast-message">{toast.message}</p>
            </div>
            <button className="notif-toast-close" onClick={() => onRemove(toast.id)}>
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function NotifCard({ notif, onView, onMarkRead, onDelete }) {
  const key  = resolveTypeKeyFromNotif(notif);
  const cfg  = TYPE_CONFIG[key];
  const Icon = cfg.icon;

  return (
    <div
      className={`notif-card ${cfg.cls} ${notif.is_read ? "is-read" : "is-unread"}`}
      onClick={() => { onView(notif); if (!notif.is_read) onMarkRead(notif.id); }}
    >
      <div className="notif-accent-bar" />
      <div className="notif-card-icon-wrap"><Icon size={18} /></div>
      <div className="notif-card-body">
        <div className="notif-card-top">
          <span className="notif-card-title">{notif.title}</span>
          <span className="notif-type-chip">{cfg.label}</span>
        </div>
        <p className="notif-card-message">{notif.message}</p>
        <div className="notif-card-time"><Clock size={11} /><span>{formatTime(notif.created_at)}</span></div>
      </div>
      <div className="notif-card-actions">
        <button className="notif-action-btn btn-view"   onClick={e => { e.stopPropagation(); onView(notif); }}><Eye size={12} /></button>
        {!notif.is_read && (
          <button className="notif-action-btn btn-mark" onClick={e => { e.stopPropagation(); onMarkRead(notif.id); }}><CheckCheck size={12} /></button>
        )}
        <button className="notif-action-btn btn-delete" onClick={e => { e.stopPropagation(); onDelete(notif.id); }}><Trash2 size={12} /></button>
      </div>
    </div>
  );
}

function EmptyState({ activeFilter }) {
  return (
    <div className="notif-empty-state">
      <div className="notif-empty-icon"><Bell size={32} /></div>
      <h3>{activeFilter === "all" ? "No Notifications Yet" : `No ${activeFilter} notifications`}</h3>
      <p>When your reports get updates, they will appear here.</p>
    </div>
  );
}

function ReportDetailModal({ report, loading, onClose }) {
  if (!report && !loading) return null;

  return (
    <div className="notif-modal-overlay" onClick={onClose}>
      <div className="notif-modal" onClick={e => e.stopPropagation()}>
        <button className="notif-modal-close" onClick={onClose}><X size={20} /></button>

        {loading ? (
          <div className="notif-modal-loading">Loading report…</div>
        ) : (
          <>
            <div className="notif-modal-header">
              <h3>Report #{String(report.id).padStart(3, "0")}</h3>
              <span className={`notif-modal-status st-${report.status?.toLowerCase()}`}>
                {report.status}
              </span>
            </div>

            <div className="notif-modal-timeline">
              {STATUS_STEPS.map((s, i) => {
                const currentIdx = STATUS_STEPS.indexOf(report.status?.toUpperCase());
                const done   = i <= currentIdx;
                const active = i === currentIdx;
                return (
                  <React.Fragment key={s}>
                    <div className={`notif-tl-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                      <div className="notif-tl-dot">
                        {done ? <CircleCheck size={12} /> : i + 1}
                      </div>
                      <span className="notif-tl-label">
                        {s === "IN_PROGRESS"
                          ? "In Progress"
                          : s.charAt(0) + s.slice(1).toLowerCase()}
                      </span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && (
                      <div className={`notif-tl-line ${done && i < currentIdx ? "done" : ""}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="notif-modal-body">
              <div className="notif-modal-row">
                <span className="notif-modal-label">Location</span>
                <span>{report.barangay ?? "—"}</span>
              </div>
              <div className="notif-modal-row">
                <span className="notif-modal-label">Damage Type</span>
                <span style={{ textTransform: "capitalize" }}>
                  {report.ai_damage_type ?? report.damage_type ?? "—"}
                </span>
              </div>
              <div className="notif-modal-row">
                <span className="notif-modal-label">Severity</span>
                <span style={{ textTransform: "capitalize" }}>
                  {report.ai_severity ?? report.severity ?? "—"}
                </span>
              </div>
              <div className="notif-modal-row">
                <span className="notif-modal-label">Submitted</span>
                <span>{report.created_at ? new Date(report.created_at).toLocaleDateString() : "—"}</span>
              </div>
              {report.decline_reason && (
                <div className="notif-modal-row">
                  <span className="notif-modal-label">Reason</span>
                  <span style={{ color: "#e74c3c" }}>{report.decline_reason}</span>
                </div>
              )}
            </div>

            {report.media_attachments?.[0]?.file_url && (
              <div className="notif-modal-photo">
                <img
                  src={`${import.meta.env.VITE_API_URL || ""}${report.media_attachments[0].file_url}`}
                  alt="Report"
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Notifications() {
  const navigate = useNavigate();

  const [activeFilter,  setActiveFilter]  = useState("all");
  const [showSettings,  setShowSettings]  = useState(false);

  const [reportModal,   setReportModal]   = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    remove,
    refetch,
  } = useNotifications();

  const { toasts, addToast, removeToast } = useToasts();

  const filteredNotifications = useMemo(() => {
    return notifications.filter(notif => {
      if (activeFilter === "all")    return true;
      if (activeFilter === "unread") return !notif.is_read;
      return resolveTypeKeyFromNotif(notif) === activeFilter;
    });
  }, [notifications, activeFilter]);

  const tabBadges = useMemo(() => {
    return FILTER_TABS.reduce((acc, tab) => {
      if (tab.key === "unread") {
        acc[tab.key] = unreadCount;
      } else if (tab.key !== "all") {
        acc[tab.key] = notifications.filter(
          n => !n.is_read && resolveTypeKeyFromNotif(n) === tab.key
        ).length;
      }
      return acc;
    }, {});
  }, [notifications, unreadCount]);

  const handleView = useCallback(async (notif) => {
    markAsRead(notif.id);

    if (!notif.report_id) return;

    const typeKey = resolveTypeKeyFromNotif(notif);

    if (typeKey === "deleted") {
      setReportLoading(true);
      setReportModal(null);
      const res = await getReport(notif.report_id);
      setReportLoading(false);
      if (res.success) setReportModal(res.data);
      else addToast("Could not load report", res.error ?? "Unknown error", "warning");
      return;
    }

    const STATUS_CHANGE_TYPES = ["verified", "inprogress", "in_progress", "resolved", "declined"];
    if (STATUS_CHANGE_TYPES.includes(typeKey)) {
      navigate(`/dashboard/submissions?report_id=${notif.report_id}&tab=timeline`);
    } else {
      navigate(`/dashboard/submissions?report_id=${notif.report_id}&tab=messages`);
    }
  }, [markAsRead, addToast, navigate]);

  const renderContent = () => {
    if (loading) {
      return Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ));
    }
    if (error) {
      return (
        <div className="notif-status-msg is-error">
          <AlertTriangle size={16} />
          {error}
          <button onClick={refetch}>Retry</button>
        </div>
      );
    }
    if (filteredNotifications.length === 0) {
      return <EmptyState activeFilter={activeFilter} />;
    }
    return filteredNotifications.map(notif => (
      <NotifCard
        key={notif.id}
        notif={notif}
        onView={handleView}
        onMarkRead={markAsRead}
        onDelete={remove}
      />
    ));
  };

  return (
    <>
      <Toast toasts={toasts} onRemove={removeToast} />

      <div className="notifications-page">
        <div className="notifications-inner">

          <div className="notif-page-header">
            <div className="notif-page-title-group">
              <div className="notif-page-icon-wrap"><Bell size={22} /></div>
              <div>
                <h1 className="notif-page-title">Notifications</h1>
                <p className="notif-page-subtitle">Stay updated on your reports</p>
              </div>
              {unreadCount > 0 && (
                <span className="notif-count-pill">
                  <Bell size={11} /> {unreadCount} unread
                </span>
              )}
            </div>

            <div className="notif-header-actions">
              {unreadCount > 0 && (
                <button
                  className="notif-mark-all-btn"
                  onClick={async () => {
                    await markAllAsRead();
                    addToast("All Caught Up", "All notifications marked as read.", "system");
                  }}
                >
                  <CheckCheck size={15} /><span>Mark all read</span>
                </button>
              )}
              <button
                className={`notif-settings-btn ${showSettings ? "active" : ""}`}
                onClick={() => setShowSettings(v => !v)}
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          <div className="notif-filter-bar">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                className={`notif-filter-tab ${activeFilter === tab.key ? "active" : ""}`}
                onClick={() => setActiveFilter(tab.key)}
              >
                {tab.label}
                {(tabBadges[tab.key] ?? 0) > 0 && (
                  <span className="notif-tab-badge">{tabBadges[tab.key]}</span>
                )}
              </button>
            ))}
          </div>

          <div className="notif-list">
            {renderContent()}
          </div>

        </div>
      </div>

      <ReportDetailModal
        report={reportModal}
        loading={reportLoading}
        onClose={() => { setReportModal(null); setReportLoading(false); }}
      />
    </>
  );
}