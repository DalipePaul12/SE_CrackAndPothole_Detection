import { api } from "./client";

export const getNotifications = async () => {
  const res = await api.get("/notifications");
  return {
    success: res?.success ?? false,
    data: Array.isArray(res?.data) ? res.data : [],
    error: res?.error ?? null,
  };
};

// ✅ PATCH /notifications/{id}/read  (was PUT — wrong method)
export const markAsRead = async (id) => {
  const res = await api.patch(`/notifications/${id}/read`);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

// ✅ PATCH /notifications/read-all  (was PUT /notifications/read-all — wrong method)
export const markAllAsRead = async () => {
  const res = await api.patch("/notifications/read-all");
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

// ✅ DELETE /notifications/{id}  (correct)
export const deleteNotification = async (id) => {
  const res = await api.delete(`/notifications/${id}`);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

// ✅ DELETE /notifications/clear-all  (bonus: clear all)
export const clearAllNotifications = async () => {
  const res = await api.delete("/notifications/clear-all");
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};