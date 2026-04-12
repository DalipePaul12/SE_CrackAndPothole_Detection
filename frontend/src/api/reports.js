// frontend/src/api/reports.js

const BASE = "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

// POST /reports — JSON body (step 1 of 2-step flow)
export async function createReport(data) {
  const res = await fetch(`${BASE}/reports`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// POST /reports/{id}/media — FormData file upload (step 2)
export async function uploadReportMedia(reportId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/reports/${reportId}/media`, {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// GET /reports — all reports (admin/public view)
export async function getReports(params = {}) {
  const query = new URLSearchParams();
  if (params.status)   query.set("status",   params.status);
  if (params.barangay) query.set("barangay", params.barangay);
  if (params.page)     query.set("page",     params.page);
  const res = await fetch(`${BASE}/reports?${query}`, { headers: authHeader() });
  if (!res.ok) throw await res.json();
  const data = await res.json();
  // Handle both { results: [...] } and plain array responses
  return Array.isArray(data) ? data : (data.results ?? []);
}

// GET /reports/mine — current user's own reports
export async function getMyReports() {
  const res = await fetch(`${BASE}/reports/mine`, { headers: authHeader() });
  if (!res.ok) throw await res.json();
  const data = await res.json();
  return Array.isArray(data) ? data : (data.results ?? []);
}

// GET /reports/{id}
export async function getReportById(reportId) {
  const res = await fetch(`${BASE}/reports/${reportId}`, { headers: authHeader() });
  if (!res.ok) throw await res.json();
  return res.json();
}

// PATCH /reports/{id} — admin/contractor status update
export async function updateReport(reportId, data) {
  const res = await fetch(`${BASE}/reports/${reportId}`, {
    method: "PATCH",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// POST /reports — FormData (used by CreateReport.jsx for single-step upload)
export async function submitReport(formData) {
  const res = await fetch(`${BASE}/reports`, {
    method: "POST",
    headers: authHeader(), // NO Content-Type — browser sets multipart boundary
    body: formData,
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// DELETE /reports/{id}
export async function deleteReport(reportId) {
  const res = await fetch(`${BASE}/reports/${reportId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
}

// POST /reports/{id}/upvote
export async function toggleUpvote(reportId) {
  const res = await fetch(`${BASE}/reports/${reportId}/upvote`, {
    method: "POST",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// POST /comments
export async function addComment(reportId, content, parentCommentId = null) {
  const res = await fetch(`${BASE}/comments`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({
      report_id: reportId,
      content,
      parent_comment_id: parentCommentId,
    }),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

// DELETE /comments/{id}
export async function deleteComment(commentId) {
  const res = await fetch(`${BASE}/comments/${commentId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
}