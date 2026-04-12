const BASE = "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");
const authHeader = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

export async function getCctvList(activeOnly = false, barangay = null) {
  let url = `${BASE}/cctv?active_only=${activeOnly}`;
  if (barangay) url += `&barangay=${barangay}`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function getCctvById(cctvId) {
  const res = await fetch(`${BASE}/cctv/${cctvId}`, { headers: authHeader() });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function createCctv(data) {
  const res = await fetch(`${BASE}/cctv`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function updateCctv(cctvId, data) {
  const res = await fetch(`${BASE}/cctv/${cctvId}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function deleteCctv(cctvId) {
  const res = await fetch(`${BASE}/cctv/${cctvId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
}