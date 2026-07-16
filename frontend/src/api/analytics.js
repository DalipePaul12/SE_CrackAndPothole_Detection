
import { api } from "./client";

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
export const getPriorityFlags          = () => safeGet("/analytics/priority-flags",          null);
export const getContractorPerformance  = () => safeGet("/analytics/contractor-performance", []);