import { useState, useEffect, useCallback, useRef } from "react";
import {
  getNotifications,
  markAsRead as markAsReadApi,
  markAllAsRead as markAllAsReadApi,
  deleteNotification as deleteApi,
} from "../api/notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    setLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      const res = await getNotifications();

      if (!res?.success) {
        throw new Error(res?.error || "Failed to load notifications");
      }

      const data = Array.isArray(res.data) ? res.data : [];

      if (!abortRef.current) {
        setNotifications(data);
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err.message || "Failed to load notifications");
        setNotifications([]);
      }
    } finally {
      if (!abortRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    return () => {
      abortRef.current = true;
    };
  }, [fetchNotifications]);

  const markAsRead = async (id) => {
    const prev = notifications;

    setNotifications((curr) =>
      curr.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );

    try {
      const res = await markAsReadApi(id);

      if (!res?.success) {
        throw new Error(res?.error || "Failed to update");
      }
    } catch {
      setNotifications(prev);
    }
  };

  const markAllAsRead = async () => {
    const prev = notifications;

    setNotifications((curr) => curr.map((n) => ({ ...n, is_read: true })));

    try {
      const res = await markAllAsReadApi();

      if (!res?.success) {
        throw new Error(res?.error || "Failed to update");
      }
    } catch {
      setNotifications(prev);
    }
  };

  const remove = async (id) => {
    const prev = notifications;

    setNotifications((curr) => curr.filter((n) => n.id !== id));

    try {
      const res = await deleteApi(id);

      if (!res?.success) {
        throw new Error(res?.error || "Delete failed");
      }
    } catch {
      setNotifications(prev);
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