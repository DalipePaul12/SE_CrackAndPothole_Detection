import React, { useMemo } from "react";
import { FaBell } from "react-icons/fa";
import "./NotificationSummary.css";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusLabel(status) {
  const map = {
    pending:     "submitted",
    verified:    "moved to Verified",
    in_progress: "moved to In Progress",
    resolved:    "resolved",
    declined:    "declined",
  };
  return map[status?.toLowerCase()] ?? "updated";
}

function kindClass(status) {
  const s = status?.toLowerCase();
  if (s === "resolved")    return "notif-resolved";
  if (s === "verified")    return "notif-verified";
  if (s === "in_progress") return "notif-progress";
  if (s === "declined")    return "notif-declined";
  return "notif-new";
}

function NotificationSummary({ reports, loading }) {
  const notifications = useMemo(() => {
    if (!reports || reports.length === 0) return [];
    return [...reports]
      .sort((a, b) => new Date(b.updated_at ?? b.created_at) - new Date(a.updated_at ?? a.created_at))
      .slice(0, 4)
      .map(r => ({
        id:        r.id,
        status:    r.status,
        label:     statusLabel(r.status),
        timeAgo:   timeAgo(r.updated_at ?? r.created_at),
        kindClass: kindClass(r.status),
      }));
  }, [reports]);

  if (loading) {
    return (
      <div className="dashboard-panel notification-panel">
        <h3>Recent Updates <FaBell className="icon" /></h3>
        <div className="skeleton-panel-inner">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton-line" style={{ marginBottom: 8, width: `${70 + i * 8}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-panel notification-panel">
      <h3>Recent Updates <FaBell className="icon" /></h3>

      {notifications.length === 0 ? (
        <p className="empty-state">No new updates.</p>
      ) : (
        <ul className="notif-list">
          {notifications.map((n, i) => (
            <li key={`${n.id}-${i}`} className={`notif-item ${n.kindClass}`}>
              <span className="notif-dot" />
              <span className="notif-text">
                Report <strong>#{n.id}</strong> {n.label}
              </span>
              <span className="notif-time">{n.timeAgo}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationSummary;