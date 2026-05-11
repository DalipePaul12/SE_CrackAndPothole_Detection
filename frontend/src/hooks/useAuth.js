import { useState, useEffect, useRef, useCallback } from "react";
import { api, tokenStorage } from "../api/client";

// ─────────────────────────────────────────────────────────────────────────────
// useAuth.js  —  FIXED (handles 500 from /auth/refresh gracefully)
//
// NEW PROBLEM SEEN IN SCREENSHOT:
//   /auth/refresh → 500 (backend crash)
//   All analytics → 403 (no valid token after failed refresh)
//   Dashboard shows "Failed to load" banner
//   User sees Admin-style dashboard layout (role read from stale localStorage)
//
// FIXES:
//   1. If refresh returns 500 (server error), don't logout immediately —
//      try to use the existing access token if it's still valid.
//   2. If access token is still valid (not expired), keep the session alive
//      and let the user work. Only force logout when BOTH tokens are dead.
//   3. isLoading always resolves so the app never hangs on a spinner.
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_BUFFER_MS = 2 * 60 * 1000;

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
  return payload.exp * 1000;
}

function isExpiredOrExpiringSoon(token) {
  const expiry = getTokenExpiryMs(token);
  if (!expiry) return true;
  return Date.now() >= expiry - REFRESH_BUFFER_MS;
}

function isHardExpired(token) {
  const expiry = getTokenExpiryMs(token);
  if (!expiry) return true;
  return Date.now() >= expiry;
}

// ─────────────────────────────────────────────────────────────────────────────
export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => tokenStorage.getAccess());

  // ✅ Starts true — app waits for auth to resolve before rendering data pages
  const [isLoading, setIsLoading] = useState(true);

  const timerRef = useRef(null);

  const saveLogin = useCallback((access_token, refresh_token, userData) => {
    tokenStorage.setAccess(access_token);
    tokenStorage.setRefresh(refresh_token);
    localStorage.setItem("user", JSON.stringify(userData));
    setToken(access_token);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    tokenStorage.clear();
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setIsLoading(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // ── Silent refresh — with 500 resilience ────────────────────────────────
  const silentRefresh = useCallback(
    async ({ finallySetLoading = false } = {}) => {
      const refreshToken = tokenStorage.getRefresh();

      if (!refreshToken) {
        logout();
        if (finallySetLoading) setIsLoading(false);
        return;
      }

      try {
        const res = await api.post("/auth/refresh", { refresh_token: refreshToken });

        if (res?.success && res.data?.access_token) {
          // ✅ Happy path: rotation succeeded
          saveLogin(
            res.data.access_token,
            res.data.refresh_token ?? refreshToken,
            res.data.user
          );
        } else {
          // Backend returned non-success (400/401)
          throw new Error(res?.error || "Refresh failed");
        }
      } catch (err) {
        const isServerError = err?.message?.includes("500") ||
                              err?.message?.includes("server");

        const currentAccess = tokenStorage.getAccess();

        if (isServerError && currentAccess && !isHardExpired(currentAccess)) {
          // ✅ RESILIENCE: backend refresh is broken BUT access token is still
          //    valid. Don't log the user out — let them keep working.
          //    The next hard expiry will force a fresh login.
          console.warn(
            "[useAuth] Refresh endpoint returned 500. " +
            "Access token still valid — keeping session alive."
          );
          // Don't call logout() — user stays logged in
        } else {
          // Access token is also dead → must re-login
          logout();
        }
      } finally {
        if (finallySetLoading) setIsLoading(false);
      }
    },
    [saveLogin, logout]
  );

  // ── Mount: validate stored token before rendering anything ───────────────
  useEffect(() => {
    const accessToken  = tokenStorage.getAccess();
    const refreshToken = tokenStorage.getRefresh();

    if (!accessToken && !refreshToken) {
      setIsLoading(false);
      return;
    }

    if (!accessToken && refreshToken) {
      silentRefresh({ finallySetLoading: true });
      return;
    }

    if (accessToken && isExpiredOrExpiringSoon(accessToken)) {
      // Try to refresh; if the refresh endpoint is broken but token
      // isn't hard-expired yet, silentRefresh keeps the session
      silentRefresh({ finallySetLoading: true });
      return;
    }

    // Token is valid and not expiring soon → restore immediately
    setIsLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Proactive refresh timer ──────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) return;

    const delayMs = expiryMs - Date.now() - REFRESH_BUFFER_MS;
    if (delayMs <= 0) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => silentRefresh(), delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [token, silentRefresh]);

  return {
    user,
    token,
    isLoading,
    isAuthenticated: !!token && !!user,
    saveLogin,
    logout,
  };
}