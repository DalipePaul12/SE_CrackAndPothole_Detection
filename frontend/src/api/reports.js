import { api } from "./client";

// ── Shared safe-call wrapper ───────────────────────────────────────────────────
// FIX: api.get() already returns { success, data, error } from client.js.
// Old version wrapped the entire result as `data`, causing double-nesting:
//   res.data → { success, data: { total, results }, error }   ← wrong
//   res.data → { total, results }                              ← correct
async function safeGet(path, fallback = null) {
  const result = await api.get(path);
  if (!result.success) {
    return { success: false, data: fallback, error: result.error || "Request failed" };
  }
  return { success: true, data: result.data ?? fallback, error: null };
}

async function safePost(path, payload) {
  const result = await api.post(path, payload);
  if (!result.success) {
    return { success: false, data: null, error: result.error || "Request failed" };
  }
  return { success: true, data: result.data ?? null, error: null };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildQuery(params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  return q.toString() ? `?${q.toString()}` : "";
}

// ── API functions ──────────────────────────────────────────────────────────────

export const getReports = (params = {}) =>
  safeGet(`/reports${buildQuery(params)}`, { total: 0, results: [] });

export const getMyReports = (params = {}) =>
  safeGet(`/reports/mine${buildQuery(params)}`, { total: 0, results: [] });

export const getReportById = (reportId) =>
  safeGet(`/reports/${reportId}`, null);

export const createReport = (payload) =>
  safePost("/reports", payload);

export const submitReport = createReport;

export const uploadReportMedia = async (reportId, file) => {
  const formData = new FormData();
  formData.append("file", file);
  const result = await api.upload(`/reports/${reportId}/media`, formData);
  if (!result.success) {
    return { success: false, data: null, error: result.error || "Upload failed" };
  }
  return { success: true, data: result.data ?? null, error: null };
};

export const updateReport = async (reportId, payload) => {
  const result = await api.patch(`/reports/${reportId}`, payload);
  if (!result.success) {
    return { success: false, data: null, error: result.error || "Update failed" };
  }
  return { success: true, data: result.data ?? null, error: null };
};

export const deleteReport = async (reportId) => {
  const result = await api.delete(`/reports/${reportId}`);
  if (!result.success) {
    return { success: false, data: null, error: result.error || "Delete failed" };
  }
  return { success: true, data: null, error: null };
};

export const toggleUpvote = (reportId) =>
  safePost(`/reports/${reportId}/upvote`, {});

export const addComment = async (reportId, content, parentCommentId = null) => {
  const result = await api.post(`/reports/${reportId}/comments`, {
    content,
    ...(parentCommentId ? { parent_comment_id: parentCommentId } : {}),
  });
  if (!result.success) {
    return { success: false, data: null, error: result.error || "Comment failed" };
  }
  return { success: true, data: result.data ?? null, error: null };
};

export const deleteComment = async (commentId) => {
  const result = await api.delete(`/reports/comments/${commentId}`);
  if (!result.success) {
    return { success: false, data: null, error: result.error || "Delete failed" };
  }
  return { success: true, data: null, error: null };
};