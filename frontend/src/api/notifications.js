import { api } from "./client";

export const getNotifications = async (limit = 50) => {
  const res = await api.get(`/notifications?limit=${limit}`);
  if (!res?.success) {
    return { success: false, data: null, error: res?.error || "Failed to load notifications." };
  }
  const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
  return { success: true, data: list, error: null };
};

export const markAsRead = async (notificationId) => {
  const res = await api.patch(`/notifications/${notificationId}/read`);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.success ? null : (res?.error || "Failed to mark as read."),
  };
};

export const markAllAsRead = async () => {
  const res = await api.patch("/notifications/read-all");
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.success ? null : (res?.error || "Failed to mark all as read."),
  };
};

export const deleteNotification = async (notificationId) => {
  const res = await api.delete(`/notifications/${notificationId}`);
  return {
    success: res?.success ?? false,
    data: null,
    error: res?.success ? null : (res?.error || "Failed to delete notification."),
  };
};

export const clearAllNotifications = async () => {
  const res = await api.delete("/notifications/clear-all");
  return {
    success: res?.success ?? false,
    data: null,
    error: res?.success ? null : (res?.error || "Failed to clear notifications."),
  };
};

export const sendNotification = async ({ user_id, report_id, title, message, type = "info" }) => {
  const res = await api.post("/notifications/send", { user_id, report_id, title, message, type });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.success ? null : (res?.error || "Failed to send notification."),
  };
};