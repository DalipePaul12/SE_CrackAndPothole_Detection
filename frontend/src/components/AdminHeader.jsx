import React, { useEffect, useRef, useState } from "react";
import { Bell, Menu, X } from "lucide-react";
import { useDarkMode } from "../hooks/useDarkMode";
import { useNotifications } from "../hooks/useNotifications";
import "./AdminHeader.css";

export default function AdminHeader({ title = "Admin Panel", onMenuClick, isCollapsed, isSidebarOpen }) {
  const { isDark } = useDarkMode();
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const recent = notifications.slice(0, 5);

  return (
    <header className={`admin-header${isCollapsed ? " collapsed" : ""}`}>
      {/* LEFT — hamburger + title */}
      <div className="admin-header-left">
        {onMenuClick && (
          <button
            className="ah-hamburger"
            onClick={onMenuClick}
            aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
          >
            {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        )}
        <h2 className="admin-header-title">{title}</h2>
      </div>

      <div className="admin-header-right">
        {/* Bell notification button */}
        <div className="ah-bell-wrap" ref={dropdownRef}>
          <button
            className="ah-bell-btn"
            onClick={() => setOpen((p) => !p)}
            aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
          >
            <Bell size={20} strokeWidth={1.8} />
            {unreadCount > 0 && (
              <span className="ah-bell-badge">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="ah-notif-dropdown">
              <div className="ah-notif-header">
                <span className="ah-notif-title">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    className="ah-notif-mark-all"
                    onClick={() => markAllAsRead()}
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="ah-notif-list">
                {recent.length === 0 ? (
                  <p className="ah-notif-empty">No notifications yet.</p>
                ) : (
                  recent.map((n) => (
                    <button
                      key={n.id}
                      className={`ah-notif-item${n.is_read ? "" : " unread"}`}
                      onClick={() => {
                        if (!n.is_read) markAsRead(n.id);
                      }}
                    >
                      {!n.is_read && <span className="ah-notif-dot" />}
                      <div className="ah-notif-body">
                        <span className="ah-notif-item-title">{n.title}</span>
                        <span className="ah-notif-item-msg">{n.message}</span>
                        <span className="ah-notif-time">
                          {new Date(n.created_at).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
