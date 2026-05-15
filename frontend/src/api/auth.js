import { api } from "./client";

export const login = async (email, password) => {
  const res = await api.post("/auth/login", { email, password });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const register = async (payload) => {
  const res = await api.post("/auth/register", payload);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

// ── NEW: Login 2FA ──
export const verifyLoginOTP = async (email, code) => {
  const res = await api.post("/auth/verify-login-otp", { email, code });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const resendLoginOTP = async (email) => {
  const res = await api.post("/auth/resend-login-otp", { email });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};
// ─────────────────────

export const requestOtp = async (email, purpose) => {
  const res = await api.post("/auth/otp/request", { email, purpose });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const verifyOtp = async (email, code, purpose) => {
  const res = await api.post("/auth/otp/verify", { email, code, purpose });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const resetPassword = async (email, code, new_password) => {
  const res = await api.post("/auth/password-reset", { email, code, new_password });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const getMe = async () => {
  const res = await api.get("/auth/me");
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const logout = async () => {
  const res = await api.post("/auth/logout");
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};