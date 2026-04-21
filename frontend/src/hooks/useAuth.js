/**
 * useAuth.js
 * ==========
 *
 * FIXES:
 *   [FIX-A1] Refresh endpoint corrected: was "/auth/refresh", must be
 *            "/auth/refresh-token" to match the backend router.
 *            This caused every silent refresh attempt to hit a 404,
 *            which immediately called logout() and wiped the token —
 *            so the user was logged out ~2 minutes after login, and
 *            every subsequent request returned 401.
 *
 *   [FIX-A2] tokenStorage from client.js is used for ALL localStorage
 *            reads/writes. Previously this file used its own hardcoded
 *            key strings ("access_token", "refresh_token") while client.js
 *            also had its own. If anyone ever renamed a key in one place,
 *            the other would silently break.
 *
 *   [FIX-A3] The initial-load useEffect now correctly reads the stored user
 *            without calling silentRefresh() unless the token is actually
 *            expired or missing. The original called silentRefresh() on every
 *            page load even for fresh tokens, causing an unnecessary 401→refresh
 *            cycle on every navigation.
 *
 *   [FIX-A4] saveLogin() now also persists the user object update to state
 *            after refresh so components that read `user` (e.g. the Navbar)
 *            re-render with fresh data.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { api, tokenStorage } from "../api/client";   // [FIX-A2]

const REFRESH_BUFFER_MS = 2 * 60 * 1000; // refresh 2 min before expiry

// ── JWT helpers ────────────────────────────────────────────────────────────────

function parseJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function getTokenExpiryMs(token) {
  const payload = parseJwt(token);
  if (!payload?.exp) return 0;
  return payload.exp * 1000; // exp is in seconds
}

// ── Refresh API call ───────────────────────────────────────────────────────────

async function callRefresh(refresh_token) {
  // [FIX-A1] Correct endpoint: /auth/refresh-token (not /auth/refresh)
  const res = await api.post("/auth/refresh-token", { refresh_token });

  if (!res?.success) {
    throw new Error(res?.error || "Token refresh failed");
  }

  return res.data; // { access_token, refresh_token, user }
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(
    () => tokenStorage.getAccess()   // [FIX-A2]
  );

  const timerRef = useRef(null);

  // ── Persist login data ─────────────────────────────────────────────────────
  const saveLogin = useCallback((access_token, refresh_token, userData) => {
    tokenStorage.setAccess(access_token);     // [FIX-A2]
    tokenStorage.setRefresh(refresh_token);   // [FIX-A2]
    localStorage.setItem("user", JSON.stringify(userData));

    setToken(access_token);
    setUser(userData);                        // [FIX-A4]
  }, []);

  // ── Clear all auth state ───────────────────────────────────────────────────
  const logout = useCallback(() => {
    tokenStorage.clear();                     // [FIX-A2]
    localStorage.removeItem("user");

    setToken(null);
    setUser(null);

    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // ── Attempt silent refresh ─────────────────────────────────────────────────
  const silentRefresh = useCallback(async () => {
    const refreshToken = tokenStorage.getRefresh();   // [FIX-A2]

    if (!refreshToken) {
      logout();
      return;
    }

    try {
      const data = await callRefresh(refreshToken);
      saveLogin(data.access_token, data.refresh_token, data.user);
    } catch {
      logout();
    }
  }, [saveLogin, logout]);

  // ── Schedule next refresh when token changes ───────────────────────────────
  useEffect(() => {
    if (!token) return;

    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) return; // malformed token — don't schedule

    const delayMs = expiryMs - Date.now() - REFRESH_BUFFER_MS;

    if (delayMs <= 0) {
      // Token already expired or within buffer — refresh immediately
      silentRefresh();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(silentRefresh, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [token, silentRefresh]);

  // ── On first mount: check token validity, refresh if needed ───────────────
  useEffect(() => {
    const accessToken  = tokenStorage.getAccess();    // [FIX-A2]
    const refreshToken = tokenStorage.getRefresh();   // [FIX-A2]

    if (!accessToken && refreshToken) {
      // No access token but we have a refresh token — get a new one
      silentRefresh();
      return;
    }

    if (accessToken) {
      const expiryMs = getTokenExpiryMs(accessToken);
      // [FIX-A3] Only refresh if actually within the expiry buffer
      // (was: always calling silentRefresh() on page load)
      if (expiryMs && Date.now() >= expiryMs - REFRESH_BUFFER_MS) {
        silentRefresh();
      }
      // else: token is fresh — no action needed
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // runs once on mount

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
    saveLogin,
    logout,
  };
}