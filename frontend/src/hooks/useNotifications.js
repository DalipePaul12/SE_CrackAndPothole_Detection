import { useWebSocket } from "./useWebSocket";
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
  const [liveNotification, setLiveNotification] = useState(null);

  const abortRef        = useRef(false);
  const pausePollingRef = useRef(false);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const { lastMessage } = useWebSocket("/ws/notifications");

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

      const fetched = Array.isArray(res.data) ? res.data : [];

      if (!abortRef.current) {
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
      }
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 120_000);

    return () => {
      abortRef.current = true;
      clearInterval(interval);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (!lastMessage) return;
    try {
      const payload = JSON.parse(lastMessage.data);
      if (payload.event !== "notification") return;

      const newNotif = {
        id:         payload.id,
        title:      payload.title,
        message:    payload.message,
        type:       payload.type,
        report_id:  payload.report_id,
        is_read:    payload.is_read ?? false,
        created_at: payload.created_at,
      };

      setNotifications(prev => {
        if (prev.some(n => n.id === newNotif.id)) return prev;
        return [newNotif, ...prev];
      });
      setLiveNotification({ ...newNotif, _ts: Date.now() });
    } catch {
    }
  }, [lastMessage]);

  const markAsRead = useCallback(async (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      const res = await markAsReadApi(id);
      if (!res?.success) throw new Error(res?.error || "Failed to mark as read");
    } catch {
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
    liveNotification,
    markAsRead,
    markAllAsRead,
    remove,
    refetch: fetchNotifications,
  };
}