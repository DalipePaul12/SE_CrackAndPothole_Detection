// frontend/src/pages/Contexts/NotificationContext.jsx

import React, { createContext, useContext } from "react";
import { useNotifications as useNotificationsHook } from "../../hooks/useNotifications";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const notif = useNotificationsHook();

  return (
    <NotificationContext.Provider value={notif}>
      {children}
    </NotificationContext.Provider>
  );
}

// Used by Notifications.jsx
export function useNotificationContext() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotificationContext must be used inside <NotificationProvider>");
  return ctx;
}

// Used by Sidebar.jsx — keeps existing import working without any changes
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationProvider>");
  return ctx;
}