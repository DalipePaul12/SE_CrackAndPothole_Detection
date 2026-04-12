const BASE = "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");
const authHeader = () => ({
  Authorization: `Bearer ${getToken()}`,
  "Content-Type": "application/json",
});

export async function getProjects() {
  const res = await fetch(`${BASE}/projects/`, { headers: authHeader() });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function getProjectById(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function createProject(data) {
  // data: { report_id, priority, contractor, estimated_cost, start_date }
  const res = await fetch(`${BASE}/projects/`, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function updateProject(projectId, data) {
  const res = await fetch(`${BASE}/projects/${projectId}`, {
    method: "PATCH",
    headers: authHeader(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function deleteProject(projectId) {
  const res = await fetch(`${BASE}/projects/${projectId}`, {
    method: "DELETE",
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}