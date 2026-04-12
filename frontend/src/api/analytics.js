const BASE = "http://127.0.0.1:8000/api/v1";
const getToken = () => localStorage.getItem("access_token");
const authHeader = () => ({ Authorization: `Bearer ${getToken()}` });

export async function getDashboardSummary() {
  const res = await fetch(`${BASE}/analytics/dashboard-summary`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
  // returns: { total_reports, pending, validated, completed, active_users }
}

export async function getSeverityStats() {
  const res = await fetch(`${BASE}/analytics/severity-stats`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function getDamageTypeStats() {
  const res = await fetch(`${BASE}/analytics/damage-type-stats`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
  // returns: { pothole: N, crack: N }
}

export async function getReportStatusStats() {
  const res = await fetch(`${BASE}/analytics/report-status-stats`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function getMonthlyReports() {
  const res = await fetch(`${BASE}/analytics/monthly-reports`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
  // returns: [{ month: "2026-03", count: N }, ...]
}

export async function getBarangayRanking() {
  const res = await fetch(`${BASE}/analytics/barangay-ranking`, {
    headers: authHeader(),
  });
  if (!res.ok) throw await res.json();
  return res.json();
  // returns: [{ barangay: "...", count: N }, ...]
}