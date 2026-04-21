import { api } from "./client";

export const getNotifications = async () => {
  const res = await api.get("/notifications");

  return {
    success: res?.success ?? false,
    data: Array.isArray(res?.data) ? res.data : [],
    error: res?.error ?? null,
  };
};

export const markAsRead = async (id) => {
  const res = await api.put(`/notifications/${id}/read`);

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const markAllAsRead = async () => {
  const res = await api.put("/notifications/read-all");

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const deleteNotification = async (id) => {
  const res = await api.delete(`/notifications/${id}`);

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};