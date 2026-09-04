

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

/**
 * Bulk-reset all non-terminal report statuses (verified, assigned, in_progress)
 * back to "pending".  Terminal statuses (resolved, declined, etc.) are untouched.
 *
 * @returns {{ success: boolean, data: { affected_count: number }|null, error: string|null }}
 */
export async function resetReportStatuses() {
  return api.post("/settings/reset-report-statuses", {});
}

/**
 * Download the full audit log as a CSV file.
 * Uses api.download() for consistent auth-refresh behaviour with all other calls.
 *
 * @returns {{ success: boolean, blob: Blob, filename: string }|{ success: false, error: string }}
 */
export async function exportAuditLog() {
  const res = await api.download("/settings/audit-log/export");
  if (!res.success) return res;
  const filename = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
  return { success: true, blob: res.blob, filename };
}
