// frontend/src/hooks/useNotifications.js

import { useState, useEffect, useCallback } from "react";
import {
  getNotifications,
  markAsRead      as markAsReadApi,
  markAllAsRead   as markAllAsReadApi,
  deleteNotification as deleteApi,
} from "../api/notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    // Don't fetch if user is not logged in — avoids 401 on landing page
    const token = localStorage.getItem("access_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    try {
      const data = await getNotifications();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[useNotifications] fetch error:", err);
      setError(err?.detail || "Failed to load notifications.");
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Optimistic update — mark one as read locally, sync with backend
  const markAsRead = async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await markAsReadApi(id);
    } catch {
      fetchNotifications(); // roll back on failure
    }
  };

  // Optimistic update — mark all as read
  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await markAllAsReadApi();
    } catch {
      fetchNotifications();
    }
  };

  // Remove immediately, then delete on backend
  const remove = async (id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await deleteApi(id);
    } catch {
      fetchNotifications();
    }
  };

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    remove,
    refetch: fetchNotifications,
  };
}