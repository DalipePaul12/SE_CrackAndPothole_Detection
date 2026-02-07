import React, { useState } from "react";
import "./Notifications.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { FaBell, FaExclamationCircle } from "react-icons/fa";

import { useNotifications } from "../Contexts/NotificationContext.jsx";

function Notifications() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  return (
    <>
      <Sidebar />
      <AppHeader />

      <div className="notifications-container">
        <div className="notifications-panel">
          <div className="notifications-header">
            <div className="notifications-header-left">
              <h1>Notifications</h1>
              <FaBell />
            </div>

            {unreadCount > 0 && (
              <button className="mark-all-btn" onClick={markAllAsRead}>
                Mark all as read
              </button>
            )}
          </div>

          <div className="notifications-list">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`notification-card ${notif.unread ? "unread" : ""}`}
                onClick={() => markAsRead(notif.id)}
              >
                <span className="notification-date">{notif.date}</span>
                <div className="notification-icon">
                  <FaExclamationCircle />
                </div>
                <div className="notification-content">
                  <h3>{notif.title}</h3>
                  <p>{notif.message}</p>
                  <span className="notification-time">{notif.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export default Notifications;