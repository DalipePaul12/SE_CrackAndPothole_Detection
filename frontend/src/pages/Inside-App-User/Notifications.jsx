import React, { useState } from "react";
import "./Notifications.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { FaBell, FaExclamationCircle, FaTrash } from "react-icons/fa";

import { useNotificationContext } from "../Contexts/NotificationContext.jsx";

function Notifications() {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    remove,
  } = useNotificationContext();

  const [sidebarOpen, setSidebarOpen] = useState(false);

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

      <div className="notifications-container">
        <div className="notifications-panel">

          <div className="notifications-header">
            <div className="notifications-header-left">
              <h1>Notifications</h1>
              <FaBell className="fabell-icon" />
              {unreadCount > 0 && (
                <span className="notif-badge">{unreadCount}</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button className="mark-all-btn" onClick={markAllAsRead}>
                Mark all as read
              </button>
            )}
          </div>

          {loading && (
            <p className="notif-status">Loading notifications...</p>
          )}

          {error && (
            <p className="notif-status notif-error">{error}</p>
          )}

          {!loading && !error && notifications.length === 0 && (
            <p className="notif-status">You have no notifications yet.</p>
          )}

          <div className="notifications-list">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`notification-card ${!notif.is_read ? "unread" : ""}`}
                onClick={() => !notif.is_read && markAsRead(notif.id)}
              >
                <div className="notification-icon">
                  <FaExclamationCircle />
                </div>

                <div className="notification-content">
                  <h3>{notif.title ?? "Notification"}</h3>
                  <p>{notif.message}</p>
                  <span className="notification-time">
                    {notif.created_at
                      ? new Date(notif.created_at).toLocaleString()
                      : ""}
                  </span>
                </div>

                <button
                  className="notif-delete-btn"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(notif.id);
                  }}
                >
                  <FaTrash />
                </button>
              </div>
            ))}
          </div>

        </div>
      </div>
    </>
  );
}

export default Notifications;