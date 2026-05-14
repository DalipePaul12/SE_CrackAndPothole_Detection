import { api } from '../api/client.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && v !== "All"
    )
  );
}

function parseApiError(err) {
  if (!err || !err.response) {
    return err?.message ?? "Network error — please check your connection.";
  }

  const { status, data } = err.response;
  const detail = data?.detail ?? data?.message;

  switch (status) {
    case 400:  return detail ?? "Bad request.";
    case 401:  return "Your session has expired. Please log in again.";
    case 403:  return "You do not have permission to perform this action.";
    case 404:  return "Not found.";
    case 413:  return "File too large. Please upload a smaller image or video.";
    case 415:  return "Unsupported file type. Use JPEG, PNG, or MP4/WebM.";
    case 422: {
      if (Array.isArray(detail) && detail.length > 0) {
        return detail.map((e) => `${e.loc?.slice(-1)[0] ?? "field"}: ${e.msg}`).join(" · ");
      }
      return typeof detail === "string" ? detail : "Validation failed. Check your inputs.";
    }
    case 429:  return "Too many requests. Please wait and try again.";
    case 500:  return "Server error. Please try again in a moment.";
    default:   return detail ?? `Unexpected error (HTTP ${status}).`;
  }
}

// client.js returns { success, data, error } — not axios { data: ... }
// So we extract the data field from the response directly.
function handleError(err) {
  console.error("[API Error]", err?.response?.data ?? err?.message ?? err);
  return { success: false, data: null, error: parseApiError(err) };
}

function buildQS(params = {}) {
  const cleaned = cleanParams(params);
  const qs = new URLSearchParams(cleaned).toString();
  return qs ? `?${qs}` : "";
}

// client.js api.get/post returns { success, data, error } directly (not wrapped in .data)
function unwrap(res) {
  if (res?.success === false) {
    return { success: false, data: null, error: res.error ?? "Request failed." };
  }
  return { success: true, data: res?.data ?? res, error: null };
}


// ── Report CRUD ───────────────────────────────────────────────────────────────

export async function createReport(data) {
  const res = await api.post("/reports", data);
  return unwrap(res);
}

// Alias for backwards compatibility with CreateReport.jsx
export const submitReport = createReport;


export async function getReports(params = {}) {
  const qs = buildQS({
    status:    params.status,
    barangay:  params.barangay,
    page:      params.page      ?? 1,
    page_size: params.page_size ?? 200,
  });
  const res = await api.get(`/reports${qs}`);
  return unwrap(res);
}

// Alias for backwards compatibility
export const fetchReports = getReports;


export async function getMyReports(params = {}) {
  const qs = buildQS({
    status:    params.status,
    page:      params.page      ?? 1,
    page_size: params.page_size ?? 50,
  });
  const res = await api.get(`/reports/mine${qs}`);
  return unwrap(res);
}

// Alias for backwards compatibility
export const fetchMyReports = getMyReports;


export async function getReport(reportId) {
  const res = await api.get(`/reports/${reportId}`);
  return unwrap(res);
}

// Alias for backwards compatibility
export const fetchReport = getReport;


export async function updateReport(reportId, data) {
  const payload = cleanParams(data);
  const res = await api.patch(`/reports/${reportId}`, payload);
  return unwrap(res);
}


export async function deleteReport(reportId) {
  const res = await api.delete(`/reports/${reportId}`);
  return { success: res?.success ?? true, data: null, error: res?.error ?? null };
}


// ── Media upload ──────────────────────────────────────────────────────────────
// FIX: Use api.upload() (multipart/form-data) NOT api.post() (JSON)
// api.post() calls JSON.stringify() and sets Content-Type: application/json
// which corrupts FormData — files never reach the server.

export async function uploadMedia(reportId, file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);

  // api.upload() uses fetch with no Content-Type header set manually,
  // letting the browser set the correct multipart boundary automatically.
  const res = await api.upload(`/reports/${reportId}/media`, formData);
  return unwrap(res);
}

// Alias for backwards compatibility
export const uploadReportMedia = uploadMedia;


// ── Admin actions ─────────────────────────────────────────────────────────────

export async function validateReport(reportId) {
  const res = await api.put(`/reports/${reportId}/validate`);
  return unwrap(res);
}


export async function declineReport(reportId, reason) {
  const res = await api.put(`/reports/${reportId}/decline`, { reason });
  return unwrap(res);
}


// ── Comments ──────────────────────────────────────────────────────────────────

export async function getComments(reportId) {
  const res = await api.get(`/reports/${reportId}/comments`);
  return unwrap(res);
}

// Alias for backwards compatibility
export const fetchComments = getComments;


export async function addComment(reportId, content) {
  const res = await api.post(`/reports/${reportId}/comments`, { content });
  return unwrap(res);
}


export async function deleteComment(commentId) {
  const res = await api.delete(`/reports/comments/${commentId}`);
  return { success: res?.success ?? true, data: null, error: res?.error ?? null };
}


// ── Upvotes ───────────────────────────────────────────────────────────────────

export async function toggleUpvote(reportId) {
  const res = await api.post(`/reports/${reportId}/upvote`);
  return unwrap(res);
}