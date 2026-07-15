/**
 * frontend/src/api/settings.js
 *
 * Admin settings API — requires admin or superadmin role.
 *
 * GET  /api/v1/settings  → getSettings()
 * PUT  /api/v1/settings  → updateSettings(payload)
 *
 * Payload keys are snake_case (matching the backend schema).
 * The AdminSettings component converts camelCase ↔ snake_case via
 * fromApi() / toApi() helpers defined locally in the component.
 */

import { api } from "./client";

function parseApiError(err) {
  if (!err?.response) return err?.message ?? "Network error — please check your connection.";
  const { status, data } = err.response;
  const detail = data?.detail ?? data?.message;
  switch (status) {
    case 401: return "Your session has expired. Please log in again.";
    case 403: return "Admin access required to manage settings.";
    case 422: {
      if (Array.isArray(detail) && detail.length > 0) {
        return detail.map((e) => `${e.loc?.slice(-1)[0] ?? "field"}: ${e.msg}`).join(" · ");
      }
      return typeof detail === "string" ? detail : "Validation failed. Check your inputs.";
    }
    case 500: return "Server error. Please try again in a moment.";
    default:  return detail ?? `Unexpected error (HTTP ${status}).`;
  }
}

function handleError(err) {
  console.error("[Settings API Error]", err?.response?.data ?? err?.message ?? err);
  return { success: false, data: null, error: parseApiError(err) };
}

/**
 * Fetch current admin settings.
 * Creates the settings row with defaults on first call if it doesn't exist.
 *
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
export async function getSettings() {
  // api.get() already returns { success, data, error } — no further unwrapping needed.
  return api.get("/settings");
}

/**
 * Persist admin settings. Only supplied keys are written (partial update).
 *
 * @param {object} payload  snake_case settings fields
 * @returns {{ success: boolean, data: object|null, error: string|null }}
 */
export async function updateSettings(payload) {
  return api.put("/settings", payload);
}
