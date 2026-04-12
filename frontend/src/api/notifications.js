// frontend/src/api/notifications.js

const BASE = "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

// GET /notifications — current user's notifications
export async function getNotifications() {
  const res = await fetch(`${BASE}/notifications`, { headers: authHeader() });
  if (!res.ok) throw await res.json();
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results ?? []);
}

// PATCH /notifications/{id}/read
export async function markAsRead(id) {
  const res = await fetch(`${BASE}/notifications/${id}/read`, {
    method: "PATCH",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// PATCH /notifications/read-all
export async function markAllAsRead() {
  const res = await fetch(`${BASE}/notifications/read-all`, {
    method: "PATCH",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
}

// DELETE /notifications/{id}
export async function deleteNotification(id) {
  const res = await fetch(`${BASE}/notifications/${id}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
}