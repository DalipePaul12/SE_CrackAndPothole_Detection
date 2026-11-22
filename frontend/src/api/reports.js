// src/api/reports.js
import { api } from '../api/client.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([key, v]) => v !== undefined && v !== null && v !== "" && (key === "search" || v !== "All")
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

function handleError(err) {
  console.error("[API Error]", err?.response?.data ?? err?.message ?? err);
  return { success: false, data: null, error: parseApiError(err) };
}

function buildQS(params = {}) {
  const cleaned = cleanParams(params);
  const qs = new URLSearchParams(cleaned).toString();
  return qs ? `?${qs}` : "";
}

function unwrap(res) {
  if (res?.success === false) {
    return { success: false, data: null, status: res.status, detail: res.detail, error: res.error ?? "Request failed." };
  }
  return { success: true, data: res?.data ?? res, error: null };
}


// ── Report CRUD ───────────────────────────────────────────────────────────────

export async function createReport(data) {
  const res = await api.post("/reports", data);
  return unwrap(res);
}

export async function checkNearbyDuplicates(payload) {
  const params = new URLSearchParams({ latitude: payload.latitude, longitude: payload.longitude });
  const labels = [payload.ai_damage_type, payload.secondary_damage,
    ...(payload.detection_snapshots ?? []).map(({ label }) => label)];
  const types = new Set(labels.flatMap((label) => (label ?? "").toLowerCase().split("+").map((part) => part.trim())));
  for (const type of ["crack", "pothole"]) {
    if (types.has(type)) params.append("damage_types", type);
  }
  return unwrap(await api.get(`/reports/nearby-duplicates?${params}`));
}

// Alias for backwards compatibility
export const submitReport = createReport;


export async function getReports(params = {}) {
  const qs = buildQS({
    status:      params.status,
    barangay:    params.barangay,
    damage_type: params.damage_type,
    severity:    params.severity,
    search:      params.search,
    awaiting_repair_review: params.awaiting_repair_review,
    low_confidence: params.low_confidence,
    past_sla:     params.past_sla,
    include_repeat_damage: params.include_repeat_damage,
    possible_repeat_damage: params.possible_repeat_damage,
    created_from: params.created_from,
    created_before: params.created_before,
    sort_by:     params.sort_by,
    sort_dir:    params.sort_dir,
    page:        params.page      ?? 1,
    page_size:   params.page_size ?? 15,
  });
  const res = await api.get(`/reports${qs}`);
  return unwrap(res);
}

// Alias for backwards compatibility
export const fetchReports = getReports;

export async function getAdminReportSummary() {
  return unwrap(await api.get("/reports/admin-summary"));
}

export async function getReportsForExport(params) {
  const rows = [];
  const pageSize = 100;
  let total;
  for (let page = 1; ; page++) {
    const res = await getReports({ ...params, page, page_size: pageSize });
    if (!res.success) throw new Error(res.error || "Could not load reports.");
    total ??= res.data.total;
    if (res.data.total !== total) throw new Error("Reports changed during export.");
    rows.push(...res.data.results);
    if (page * pageSize >= total) break;
  }
  if (rows.length !== total || new Set(rows.map(row => row.id)).size !== total) {
    throw new Error("Reports changed during export.");
  }
  return rows;
}


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

export async function getPriorRepairs(reportId) {
  return unwrap(await api.get(`/reports/${reportId}/prior-repairs`));
}

// Alias for backwards compatibility
export const fetchReport = getReport;


/**
 * Update report status.
 * CRITICAL: Status must be lowercase to match backend enum values.
 * Valid values: pending, verified, assigned, in_progress, resolved, declined
 */
export async function updateReport(reportId, data) {
  const payload = cleanParams(data);

  // ── Status: always lowercase string ─────────────────────────────────
  if (payload.status != null) {
    payload.status = String(payload.status?.value ?? payload.status)
      .toLowerCase()
      .trim();
  }

  // ── assigned_to: preserve numbers, stringify everything else ────
  // If the backend schema expects int (user-id), we must NOT wrap it in String().
  if (payload.assigned_to != null) {
    const raw = payload.assigned_to?.value ?? payload.assigned_to;
    payload.assigned_to =
      typeof raw === "number" ? raw : String(raw).trim();
  }

  // Log the exact JSON payload so 422s are easy to debug
  console.log(`[API] PATCH /reports/${reportId}`, JSON.stringify(payload, null, 2));

  const res = await api.patch(`/reports/${reportId}`, payload);
  return unwrap(res);
}


export async function deleteReport(reportId) {
  const res = await api.delete(`/reports/${reportId}`);
  return { success: res?.success ?? true, data: null, error: res?.error ?? null };
}


// ── Media upload ──────────────────────────────────────────────────────────────

export async function uploadMedia(reportId, file, _onProgress, uploadId) {
  const formData = new FormData();
  formData.append("file", file);
  if (uploadId) formData.append("upload_id", uploadId);

  const res = await api.upload(`/reports/${reportId}/media`, formData);
  return unwrap(res);
}

export async function reconcileReport(payload) {
  const key = payload.capture_metadata?.submission_id;
  if (!key) return createReport(payload);
  const endpoint = `/reports/submission/${key}`;
  const known = await api.get(endpoint);
  if (known.success) return known;
  if (known.status !== 404) {
    return { success: false, error: "Could not verify whether your report was saved. Reconnect and check again before retrying." };
  }

  const created = await createReport(payload);
  if (created.success || created.detail?.code === "nearby_duplicate_confirmation_required") return created;
  const confirmed = await api.get(endpoint);
  if (confirmed.success) return confirmed;
  if (confirmed.status === 404) return created;
  return { success: false, error: "Could not confirm whether your report was saved. Check again before retrying." };
}

export async function reconcileMedia(reportId, file, uploadId) {
  if (!uploadId) return uploadMedia(reportId, file);
  const matches = (report) => report?.media_attachments?.find(({ file_url }) =>
    file_url?.includes(`/${reportId}/${uploadId.replaceAll("-", "")}_`));
  const known = await getReport(reportId);
  if (!known.success) return { success: false, error: "Could not check the report’s saved evidence. Check again before retrying." };
  const attachment = matches(known.data);
  if (attachment) return { success: true, data: attachment };

  const uploaded = await uploadMedia(reportId, file, null, uploadId);
  if (uploaded.success) return uploaded;
  const confirmed = await getReport(reportId);
  if (!confirmed.success) return { success: false, error: "Could not confirm whether the photo was saved. Check again before retrying." };
  const saved = matches(confirmed.data);
  return saved ? { success: true, data: saved } : uploaded;
}

// Alias for backwards compatibility
export const uploadReportMedia = uploadMedia;

export async function resolveReport(reportId, { photo, note } = {}) {
  const form = new FormData();
  if (photo) form.append("photo", photo);
  if (note) form.append("note", note);
  return unwrap(await api.upload(`/reports/${reportId}/resolve`, form));
}

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


// ── Notifications ─────────────────────────────────────────────────────────────

export async function getNotifications(limit = 50, unreadOnly = false) {
  const params = { limit: String(limit) };
  // Only send unread_only when true. Some backends reject explicit "false"
  // strings on strict bool query params, causing 422s.
  if (unreadOnly) params.unread_only = "true";

  const qs = new URLSearchParams(params).toString();
  const res = await api.get(`/notifications?${qs}`);
  return unwrap(res);
}

export async function getNotificationCount() {
  const res = await api.get("/notifications/count");
  return unwrap(res);
}

export async function markAllNotificationsRead() {
  const res = await api.patch("/notifications/read-all");
  return unwrap(res);
}

export async function markNotificationRead(notificationId) {
  const res = await api.patch(`/notifications/${notificationId}/read`);
  return unwrap(res);
}

export async function clearAllNotifications() {
  const res = await api.delete("/notifications/clear-all");
  return { success: res?.success ?? true, data: null, error: res?.error ?? null };
}

export async function deleteNotification(notificationId) {
  const res = await api.delete(`/notifications/${notificationId}`);
  return { success: res?.success ?? true, data: null, error: res?.error ?? null };
}

export async function generateReportSummary(reportId) {
  const res = await api.post(`/reports/${reportId}/summary`);
  return unwrap(res);
}

export async function getMyReportStats() {
  const res = await api.get("/reports/mine/stats");
  return unwrap(res);
}

/**
 * GET /reports/{reportId}/project
 * Returns the project associated with this report.
 * Accessible by the report owner, assigned contractor, or admin.
 */
export const getReportProject = async (reportId) => {
  const res = await api.get(`/reports/${reportId}/project`);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};
