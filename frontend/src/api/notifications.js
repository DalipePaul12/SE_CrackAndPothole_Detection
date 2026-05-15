// src/api/notifications.js
import { api } from "./client";

const handleError = (error) => ({
  success: false,
  data: null,
  error:
    error?.response?.data?.detail ||
    error?.response?.data?.error ||
    error?.message ||
    "Something went wrong.",
});

export const getNotifications = async (limit = 50) => {
  try {
    const res = await api.get(`/notifications?limit=${limit}`);
    const list = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
    return { success: true, data: list, error: null };
  } catch (error) {
    return handleError(error);
  }
};

export const markAsRead = async (notificationId) => {
  try {
    const res = await api.patch(`/notifications/${notificationId}/read`);
    return { success: true, data: res.data, error: null };
  } catch (error) {
    return handleError(error);
  }
};

export const markAllAsRead = async () => {
  try {
    const res = await api.patch("/notifications/read-all");
    return { success: true, data: res.data, error: null };
  } catch (error) {
    return handleError(error);
  }
};

export const deleteNotification = async (notificationId) => {
  try {
    await api.delete(`/notifications/${notificationId}`);
    return { success: true, data: null, error: null };
  } catch (error) {
    return handleError(error);
  }
};

export const clearAllNotifications = async () => {
  try {
    await api.delete("/notifications/clear-all");
    return { success: true, data: null, error: null };
  } catch (error) {
    return handleError(error);
  }
};

export const sendNotification = async ({ user_id, report_id, title, message, type = "info" }) => {
  try {
    const res = await api.post("/notifications/send", {
      user_id,
      report_id,
      title,
      message,
      type,
    });
    return { success: true, data: res.data, error: null };
  } catch (error) {
    return handleError(error);
  }
};