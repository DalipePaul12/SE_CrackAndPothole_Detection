const BASE = "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

export async function uploadMedia(reportId, file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE}/media/upload/${reportId}`, {
    method: "POST",
    headers: authHeader(), // no Content-Type — let browser set multipart boundary
    body: formData,
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function getMediaByReport(reportId) {
  const res = await fetch(`${BASE}/media/report/${reportId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function deleteMedia(mediaId) {
  const res = await fetch(`${BASE}/media/${mediaId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
}