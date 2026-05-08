// src/api/notifications.js
import { api } from "./client";

// api/client.js already normalizes to { success, data, error }.
// Do NOT wrap with normalizeResponse() again — that creates data.data nesting.

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
    const res = await api.get(`/notifications`, { params: { limit } });
    // FastAPI returns a plain array for this endpoint
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
    // PATCH /notifications/read-all  (fixed path — works now after backend fix)
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
    // DELETE /notifications/clear-all  (fixed path — works now after backend fix)
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