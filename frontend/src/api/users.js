import { api } from "./client";

// ── Internal helpers (mirroring reports.js pattern) ───────────────────────────

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && v !== "All"
    )
  );
}

function buildQS(params = {}) {
  const cleaned = cleanParams(params);
  const qs = new URLSearchParams(cleaned).toString();
  return qs ? `?${qs}` : "";
}

function unwrap(res) {
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
}

export const getMyProfile = async () => {
  return unwrap(await api.get("/users/me"));
};

export const updateMyProfile = async (payload) => {
  return unwrap(await api.patch("/users/me", payload));
};

export const changePassword = async (current_password, new_password) => {
  return unwrap(await api.post("/users/me/password", { current_password, new_password }));
};

export const deleteMyAccount = async (current_password) => {
  return unwrap(await api.delete("/users/me", { current_password }));
};

// ── Admin: user management ────────────────────────────────────────────────────

/**
 * List all users (admin).
 * @param {{ page?, page_size?, role?, is_active?, search? }} params
 */
export const listAllUsers = async (params = {}) => {
  return unwrap(await api.get(`/users${buildQS(params)}`));
};

/**
 * Change a user's role (admin — with server-side privilege-escalation guards).
 * @param {string} publicId
 * @param {string} role  — "citizen" | "contractor" | "admin" | "superadmin"
 */
export const adminChangeUserRole = async (publicId, role) => {
  // FastAPI interprets `role: UserRole` as a query param on PATCH endpoints
  return unwrap(await api.patch(`/users/${publicId}/role?role=${encodeURIComponent(role)}`));
};

/**
 * Toggle a user's suspension (admin).
 * @param {string} publicId
 */
export const toggleUserSuspension = async (publicId) => {
  return unwrap(await api.patch(`/users/${publicId}/suspend`));
};

/**
 * Hard-delete a user (superadmin only).
 * @param {string} publicId
 */
export const adminDeleteUser = async (publicId) => {
  return unwrap(await api.delete(`/users/${publicId}`));
};