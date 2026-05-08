/**
 * hooks/useNotifications.js
 * ──────────────────────────
 * Standalone polling hook for components that don't use NotificationProvider.
 *
 * If your app uses <NotificationProvider> in App.jsx, prefer
 * useNotificationContext() instead — it shares state across all components
 * and avoids duplicate network requests.
 *
 * This hook is kept for backward compatibility with Notifications.jsx which
 * imports it directly.
 *
 * FIX: response normalization was double-wrapping data.
 *   notifications.js api returns { success, data: [...], error }
 *   Previously code did res.data which after client.js normalization
 *   was already the array — but getNotifications() was re-wrapping it.
 *   Now we read res.data directly which is the array of notifications.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteNotification as deleteApi,
  getNotifications,
  markAllAsRead as markAllAsReadApi,
  markAsRead as markAsReadApi,
} from "../api/notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);

  const abortRef        = useRef(false);
  const pausePollingRef = useRef(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token || pausePollingRef.current) return;

    setLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      const res = await getNotifications();

      if (!res?.success) {
        throw new Error(res?.error || "Failed to load notifications");
      }

      // getNotifications() already returns { success, data: [...] }
      // where data is the plain array from FastAPI
      const fetched = Array.isArray(res.data) ? res.data : [];

      if (!abortRef.current) {
        setNotifications((prev) => {
          // Preserve optimistic is_read state for items already read locally
          const localReadIds = new Set(
            prev.filter((n) => n.is_read).map((n) => n.id)
          );
          return fetched.map((n) =>
            localReadIds.has(n.id) ? { ...n, is_read: true } : n
          );
        });
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err.message || "Failed to load notifications");
      }
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, []);

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);

    return () => {
      abortRef.current = true;
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const markAsRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      const res = await markAsReadApi(id);
      if (!res?.success) throw new Error(res?.error || "Failed to mark as read");
    } catch {
      // Rollback optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: false } : n))
      );
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));

    pausePollingRef.current = true;
    setTimeout(() => { pausePollingRef.current = false; }, 5_000);

    try {
      const res = await markAllAsReadApi();
      if (!res?.success) throw new Error(res?.error || "Failed to mark all as read");
    } catch {
      pausePollingRef.current = false;
      await fetchNotifications();
    }
  }, [fetchNotifications]);

  const remove = useCallback(async (id) => {
    const snapshot = notifications;
    setNotifications((prev) => prev.filter((n) => n.id !== id));

    try {
      const res = await deleteApi(id);
      if (!res?.success) throw new Error(res?.error || "Failed to delete");
    } catch {
      setNotifications(snapshot);
    }
  }, [notifications]);

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