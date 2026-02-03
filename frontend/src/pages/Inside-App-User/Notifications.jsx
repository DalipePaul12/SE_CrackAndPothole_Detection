import React, { useState } from "react";
import "./Notifications.css";

import Sidebar from "../../components/Sidebar.jsx";
import AppHeader from "../../components/AppHeader.jsx";
import { FaBell, FaExclamationCircle } from "react-icons/fa";

function Notifications() {
  const [notifications, setNotifications] = useState([
    {
      id: 1,
      title: "New Road Damage Report",
      message: "A new pothole was reported near EDSA.",
      time: "5 minutes ago",
      date: "2026-03-02",
      unread: true,
    },
    {
      id: 2,
      title: "Report Status Updated",
      message: "Your report has been marked as In Progress.",
      time: "1 hour ago",
      date: "2026-03-02",
      unread: true,
    },
    {
      id: 3,
      title: "Report Status Updated",
      message: "Your report has been marked as In Progress.",
      time: "1 hour ago",
      date: "2026-03-02",
      unread: false,
    },
  ]);

  //count unread notifications
  const unreadCount = notifications.filter(n => n.unread).length;

  //mark notification as read
  const handleRead = (id) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === id ? { ...notif, unread: false } : notif
      )
    );
  };

  //mark all as read
  const handleMarkAllRead = () => {
  setNotifications((prev) =>
    prev.map((notif) => ({ ...notif, unread: false }))
  );
};

  return (
    <>
      <Sidebar unreadCount={unreadCount} />
      <AppHeader />

      <div className="notifications-container">
        <div className="notifications-panel">
          <div className="notifications-header">
            <div className="notifications-header-left">
            <h1>Notifications</h1>
            <FaBell className="fabell-icon" />
            </div>

            {unreadCount > 0 && (
            <button className="mark-all-btn" onClick={handleMarkAllRead}>
                Mark all as read
            </button>
            )}
          </div>

          <div className="notifications-list">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`notification-card ${notif.unread ? "unread" : ""}`}
                onClick={() => handleRead(notif.id)}
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
