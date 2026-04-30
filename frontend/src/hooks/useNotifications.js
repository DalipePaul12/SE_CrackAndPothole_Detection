import { useState, useEffect, useCallback, useRef } from "react";
import {
  getNotifications,
  markAsRead as markAsReadApi,
  markAllAsRead as markAllAsReadApi,
  deleteNotification as deleteApi,
} from "../api/notifications";

export function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState(null);

  const abortRef        = useRef(false);
  const pausePollingRef = useRef(false); // pause refetch briefly after bulk actions

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Fetch (with merge: never revert locally-read notifications) ───────────
  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;

    // Don't overwrite state mid-action (e.g. right after mark-all-read)
    if (pausePollingRef.current) return;

    setLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      const res = await getNotifications();

      if (!res?.success) throw new Error(res?.error || "Failed to load notifications");

      const fetched = Array.isArray(res.data) ? res.data : [];

      if (!abortRef.current) {
        // Merge: if a notification is already marked read locally, keep it read
        // even if the server (due to caching/race) still returns it as unread.
        setNotifications((prev) => {
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
        setNotifications([]);
      }
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    return () => { abortRef.current = true; };
  }, [fetchNotifications]);

  // ── Mark one as read ──────────────────────────────────────────────────────
  const markAsRead = async (id) => {
    const prev = notifications;

    // Optimistic update
    setNotifications((curr) =>
      curr.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );

    try {
      const res = await markAsReadApi(id); // PATCH /notifications/{id}/read
      if (!res?.success) throw new Error(res?.error || "Failed to update");
    } catch {
      setNotifications(prev); // revert on failure
    }
  };

  // ── Mark all as read ──────────────────────────────────────────────────────
  const markAllAsRead = async () => {
    const prev = notifications;

    // 1. Optimistic update immediately
    setNotifications((curr) => curr.map((n) => ({ ...n, is_read: true })));

    // 2. Pause polling for 5s so refetch doesn't overwrite us
    pausePollingRef.current = true;
    setTimeout(() => { pausePollingRef.current = false; }, 5000);

    try {
      const res = await markAllAsReadApi(); // PATCH /notifications/read-all
      if (!res?.success) throw new Error(res?.error || "Failed to update");
    } catch {
      setNotifications(prev); // revert on failure
      pausePollingRef.current = false;
    }
  };

  // ── Delete one ────────────────────────────────────────────────────────────
  const remove = async (id) => {
    const prev = notifications;

    // Optimistic update
    setNotifications((curr) => curr.filter((n) => n.id !== id));

    try {
      const res = await deleteApi(id); // DELETE /notifications/{id}
      if (!res?.success) throw new Error(res?.error || "Delete failed");
    } catch {
      setNotifications(prev); // revert on failure
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