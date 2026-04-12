// frontend/src/api/users.js
// Uses VITE_API_URL from .env — falls back to localhost for development.
// This fixes the CORS error caused by hitting the deployed render.com URL.

const BASE = `${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}/api/v1`;
const getToken = () => localStorage.getItem("access_token");

// GET /users/me
export async function getMyProfile() {
  const res = await fetch(`${BASE}/users/me`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// PATCH /users/me
export async function updateMyProfile(data) {
  const res = await fetch(`${BASE}/users/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// POST /users/me/change-password
export async function changePassword(current_password, new_password) {
  const res = await fetch(`${BASE}/users/me/change-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ current_password, new_password }),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}