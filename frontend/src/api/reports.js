import { api } from "./client";

// ─── Utility ──────────────────────────────────────────────────────────────────
function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && v !== "All"
    )
  );
}

function handleError(err) {
  const detail =
    err?.response?.data?.detail ??
    err?.response?.data?.message ??
    err?.message ??
    "Unknown error";
  return { success: false, data: null, error: String(detail) };
}

// ─── Get paginated reports (admin) ───────────────────────────────────────────
export async function getReports(params = {}) {
  try {
    const query = cleanParams({
      status:    params.status,
      barangay:  params.barangay,
      page:      params.page      ?? 1,
      page_size: params.page_size ?? 200,
    });

    const res = await api.get("/reports", { params: query });
    return { success: true, data: res.data, error: null };
  } catch (err) {
    console.error("[getReports]", err?.response?.data);
    return handleError(err);
  }
}

// ─── Get the current user's own reports ──────────────────────────────────────
export async function getMyReports(params = {}) {
  try {
    const query = cleanParams({
      status:    params.status,
      page:      params.page      ?? 1,
      page_size: params.page_size ?? 50,
    });

    const res = await api.get("/reports/mine", { params: query });
    return { success: true, data: res.data, error: null };
  } catch (err) {
    console.error("[getMyReports]", err?.response?.data);
    return handleError(err);
  }
}

// ─── Get single report ────────────────────────────────────────────────────────
// FIX: Was declared TWICE (as a function and as a const at line ~156),
//      causing "Identifier 'getReport' has already been declared" SyntaxError
//      that crashed the entire app on load. Merged into a single export.
export async function getReport(reportId) {
  try {
    const res = await api.get(`/reports/${reportId}`);
    return { success: true, data: res.data, error: null };
  } catch (err) {
    console.error("[getReport]", err?.response?.data);
    return handleError(err);
  }
}

// ─── Create report ────────────────────────────────────────────────────────────
export async function createReport(data) {
  try {
    const res = await api.post("/reports", data);
    return { success: true, data: res.data, error: null };
  } catch (err) {
    return handleError(err);
  }
}

// ─── Update report (status, assigned_to, decline_reason, etc.) ───────────────
// FIX: Standardised field name — frontend now always sends `decline_reason`
//      (not `rejection_reason`) to match the backend schema column.
export async function updateReport(reportId, data) {
  try {
    const payload = cleanParams(data);
    const res = await api.patch(`/reports/${reportId}`, payload);
    return { success: true, data: res.data, error: null };
  } catch (err) {
    console.error("[updateReport]", err?.response?.data);
    return handleError(err);
  }
}

// ─── Upload media attachment ──────────────────────────────────────────────────
export async function uploadReportMedia(reportId, file) {
  try {
    const form = new FormData();
    form.append("file", file);
    const res = await api.post(`/reports/${reportId}/media`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return { success: true, data: res.data, error: null };
  } catch (err) {
    return handleError(err);
  }
}

// ─── Add comment ─────────────────────────────────────────────────────────────
export async function addComment(reportId, content) {
  try {
    const res = await api.post(`/reports/${reportId}/comments`, { content });
    return { success: true, data: res.data, error: null };
  } catch (err) {
    return handleError(err);
  }
}

// ─── Get comments ─────────────────────────────────────────────────────────────
export async function getComments(reportId) {
  try {
    const res = await api.get(`/reports/${reportId}/comments`);
    return { success: true, data: res.data, error: null };
  } catch (err) {
    return handleError(err);
  }
}

// ─── Toggle upvote ────────────────────────────────────────────────────────────
export async function toggleUpvote(reportId) {
  try {
    const res = await api.post(`/reports/${reportId}/upvote`);
    return { success: true, data: res.data, error: null };
  } catch (err) {
    return handleError(err);
  }
}

// ─── Delete report (admin) ────────────────────────────────────────────────────
export async function deleteReport(reportId) {
  try {
    await api.delete(`/reports/${reportId}`);
    return { success: true, data: null, error: null };
  } catch (err) {
    return handleError(err);
  }
}