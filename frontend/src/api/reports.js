
import { api } from "./client";

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && v !== "All"
    )
  );
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
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ??
      err?.response?.data?.message ??
      err?.message ??
      "Unknown error";
    console.error("[getReports]", detail, err?.response?.data);
    return { success: false, error: String(detail) };
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
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    console.error("[getMyReports]", detail);
    return { success: false, error: String(detail) };
  }
}

// ─── Get single report ────────────────────────────────────────────────────────
export async function getReport(reportId) {
  try {
    const res = await api.get(`/reports/${reportId}`);
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    return { success: false, error: String(detail) };
  }
}

// ─── Create report ────────────────────────────────────────────────────────────
export async function createReport(data) {
  try {
    const res = await api.post("/reports", data);
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    return { success: false, error: String(detail) };
  }
}

// ─── Update report (status, assigned_to, etc.) ───────────────────────────────
export async function updateReport(reportId, data) {
  try {
    const payload = cleanParams(data);
    const res = await api.patch(`/reports/${reportId}`, payload);
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    console.error("[updateReport]", detail, err?.response?.data);
    return { success: false, error: String(detail) };
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
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Upload failed";
    return { success: false, error: String(detail) };
  }
}

// ─── Add comment ─────────────────────────────────────────────────────────────
export async function addComment(reportId, content) {
  try {
    const res = await api.post(`/reports/${reportId}/comments`, { content });
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Comment failed";
    return { success: false, error: String(detail) };
  }
}

// ─── Get comments ─────────────────────────────────────────────────────────────
export async function getComments(reportId) {
  try {
    const res = await api.get(`/reports/${reportId}/comments`);
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    return { success: false, error: String(detail) };
  }
}

// ─── Toggle upvote ────────────────────────────────────────────────────────────
export async function toggleUpvote(reportId) {
  try {
    const res = await api.post(`/reports/${reportId}/upvote`);
    return { success: true, data: res.data };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    return { success: false, error: String(detail) };
  }
}

// ─── Delete report (admin) ────────────────────────────────────────────────────
export async function deleteReport(reportId) {
  try {
    await api.delete(`/reports/${reportId}`);
    return { success: true };
  } catch (err) {
    const detail =
      err?.response?.data?.detail ?? err?.message ?? "Unknown error";
    return { success: false, error: String(detail) };
  }
}

export const getReport = async (id) => {
  try {
    const res = await api.get(`/reports/${id}`);
    return { success: true, data: res.data, error: null };
  } catch (error) {
    return handleError(error);
  }
};