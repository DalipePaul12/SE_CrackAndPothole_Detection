const BASE = "http://127.0.0.1:8000/api/v1";

const getToken = () => localStorage.getItem("access_token");

export async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw await res.json();
  return res.json(); // { access_token, refresh_token, user }
}

export async function register(data) {
  // data: { email, password, full_name, contact_number, city, barangay }
  const res = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw await res.json();
  return res.json();
}

export async function requestOtp(email, purpose) {
  // purpose: "email_verify" | "password_reset"
  const res = await fetch(`${BASE}/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, purpose }),
  });
  if (!res.ok) throw await res.json();
}

export async function verifyOtp(email, code, purpose) {
  const res = await fetch(`${BASE}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, purpose }),
  });
  if (!res.ok) throw await res.json();
}

export async function resetPassword(email, code, new_password) {
  const res = await fetch(`${BASE}/auth/password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, new_password }),
  });
  if (!res.ok) throw await res.json();
}

export async function logout(refresh_token) {
  await fetch(`${BASE}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ refresh_token }),
  });
}