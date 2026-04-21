import { api } from "./client";

async function safeGet(path, fallback) {
  try {
    const body = await api.get(path);

    if (body && typeof body.success === "boolean") {
      return {
        success: body.success,
        data:    body.success ? (body.data ?? fallback) : fallback,
        error:   body.success ? null : (body.detail ?? "Server error"),
      };
    }

    return { success: true, data: body ?? fallback, error: null };
  } catch (err) {
    const msg =
      err?.response?.data?.detail ||
      err?.message ||
      "Network error";
    return { success: false, data: fallback, error: msg };
  }
}

export const getDashboardSummary  = () => safeGet("/analytics/dashboard-summary", null);
export const getDamageTypeStats   = () => safeGet("/analytics/damage-type-stats", {});
export const getReportStatusStats = () => safeGet("/analytics/report-status-stats", {});
export const getMonthlyReports    = () => safeGet("/analytics/monthly-reports", []);
export const getBarangayRanking   = () => safeGet("/analytics/barangay-ranking", []);
export const getSeverityStats     = () => safeGet("/analytics/severity-stats", {});