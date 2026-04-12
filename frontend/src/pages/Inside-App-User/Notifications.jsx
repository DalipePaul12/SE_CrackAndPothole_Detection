// frontend/src/pages/Inside-App-User/Notifications.jsx

import React from "react";
import "./Notifications.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { FaBell, FaExclamationCircle, FaTrash } from "react-icons/fa";

// Uses context (fed by NotificationProvider in App.jsx/main.jsx)
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

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div
        className="sidebar-overlay"
        onClick={() => {
          document.querySelector(".app-sidebar")?.classList.remove("active");
          document.querySelector(".sidebar-overlay")?.classList.remove("active");
        }}
      />

      <div className="notifications-container">
        <div className="notifications-panel">

          {/* HEADER */}
          <div className="notifications-header">
            <div className="notifications-header-left">
              <h1>Notifications</h1>
              <FaBell />
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

          {/* STATES */}
          {loading && (
            <p className="notif-status">Loading notifications...</p>
          )}

          {error && (
            <p className="notif-status notif-error">{error}</p>
          )}

          {!loading && !error && notifications.length === 0 && (
            <p className="notif-status">You have no notifications yet.</p>
          )}

          {/* LIST — is_read is the backend field */}
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

                {/* Delete button */}
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