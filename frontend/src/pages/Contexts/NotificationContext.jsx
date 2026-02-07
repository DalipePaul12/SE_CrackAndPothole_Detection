import { createContext, useContext, useState } from "react";

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
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
  ]);

  const unreadCount = notifications.filter(n => n.unread).length;

  const markAsRead = (id) => {
    setNotifications(prev =>
      prev.map(n =>
        n.id === id ? { ...n, unread: false } : n
      )
    );
  };

  const markAllAsRead = () => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, unread: false }))
    );
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationContext);
