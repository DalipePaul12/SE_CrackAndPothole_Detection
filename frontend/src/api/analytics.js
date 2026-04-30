/**
 * frontend/src/api/analytics.js
 *
 * ROOT CAUSE OF ZERO VALUES IN CHARTS
 * ─────────────────────────────────────────────────────────────────────────────
 * The backend wraps every response in  { success: true, data: <payload> }.
 * `api.get()` (axios-based) returns `response.data`, so the value arriving
 * in safeGet is already  { success: true, data: <payload> }.
 *
 * The old safeGet had this branch order:
 *   1. if "success" in body  → returned { success, data: body.data }   ✓ correct
 *   2. else                  → returned { success: true, data: body }  (fallback)
 *
 * That looks fine — BUT if api.get() does NOT strip the axios wrapper and
 * returns the full AxiosResponse, then body is { data: { success, data } }
 * and "success" is NOT a direct key, so branch 2 fires and `data` ends up
 * being the whole AxiosResponse object, causing every chart to get garbage.
 *
 * The fix: normalise before checking — try both body and body.data so the
 * helper works regardless of whether api.get() pre-unwraps axios or not.
 *
 * Additionally getBarangayRanking → getHotspots (/analytics/hotspots).
 */

import { api } from "./client";

/**
 * Normalise whatever api.get() returns into our standard envelope shape
 * { success: bool, data: any, error: string|null }.
 *
 * Handles:
 *   A) api.get() already unwrapped → body = { success, data }
 *   B) api.get() returned raw axios → body = { data: { success, data }, status, … }
 *   C) api.get() returned plain payload (no envelope at all)
 */
async function safeGet(path, fallback) {
  try {
    const raw = await api.get(path);

    // Resolve the actual server payload whether axios was pre-unwrapped or not
    const body = _resolveBody(raw);

    if (body !== null && typeof body === "object" && "success" in body) {
      if (body.success) {
        return { success: true, data: body.data ?? fallback, error: null };
      }
      return {
        success: false,
        data:    fallback,
        error:   body.detail ?? body.message ?? "Server error",
      };
    }

    // Plain payload — no envelope
    return { success: true, data: body ?? fallback, error: null };

  } catch (err) {
    const serverMsg =
      err?.response?.data?.detail ??
      err?.response?.data?.message ??
      err?.message ??
      "Network error";
    console.error(`[analytics] GET ${path} failed:`, serverMsg);
    return { success: false, data: fallback, error: serverMsg };
  }
}

/**
 * If raw looks like an AxiosResponse (has .data + .status), unwrap .data.
 * Otherwise return raw as-is.
 */
function _resolveBody(raw) {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "data" in raw &&
    "status" in raw &&
    typeof raw.status === "number"
  ) {
    return raw.data; // axios response — unwrap
  }
  return raw;        // already unwrapped by api client
}

// ── Endpoints ─────────────────────────────────────────────────────────────
export const getDashboardSummary  = () => safeGet("/analytics/dashboard-summary",  null);
export const getDamageTypeStats   = () => safeGet("/analytics/damage-type-stats",   {});
export const getReportStatusStats = () => safeGet("/analytics/report-status-stats", {});
export const getMonthlyReports    = () => safeGet("/analytics/monthly-reports",     []);
export const getSeverityStats     = () => safeGet("/analytics/severity-stats",      {});
export const getHotspots          = () => safeGet("/analytics/hotspots",            []);
export const getSLAStats          = () => safeGet("/analytics/sla-stats",           null);
export const getAIInsights        = () => safeGet("/analytics/ai-insights",         null);
export const getRecentReports     = (limit = 8)  =>
  safeGet(`/analytics/recent-reports?limit=${limit}`, []);
export const getActivityFeed      = (limit = 10) =>
  safeGet(`/analytics/activity-feed?limit=${limit}`,  []);
export const getPriorityFlags     = () => safeGet("/analytics/priority-flags",      null);