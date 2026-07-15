import { useState, useEffect, useRef, useCallback } from "react";
import { api, tokenStorage } from "../api/client";

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

// New tokens have sub=UUID and role — no email or id in the token itself.
// We prefer the stored user object (set at login) over deriving from token.
function deriveUserFromToken(token) {
  const payload = parseJwt(token);
  if (!payload) return null;
  return {
    public_id: payload.sub,  // UUID
    role: payload.role,
  };
}

/**
 * Returns the default home route for a given role.
 * Used by ContractorRoute and any post-login redirect logic.
 */
export function getDefaultRoute(role) {
  if (role === "admin" || role === "superadmin") return "/adminpanel";
  if (role === "contractor")                     return "/contractorpanel/dashboard";
  return "/dashboard";
}

export function useAuth() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      if (stored) return JSON.parse(stored);
      const token = tokenStorage.getAccess();
      return token ? deriveUserFromToken(token) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState(() => tokenStorage.getAccess());
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef(null);

  const saveLogin = useCallback((access_token, refresh_token, userData) => {
    tokenStorage.setAccess(access_token);
    if (refresh_token) tokenStorage.setRefresh(refresh_token);

    // Prefer the full user object from the login response over deriving from token
    const resolvedUser = userData ?? deriveUserFromToken(access_token);
    localStorage.setItem("user", JSON.stringify(resolvedUser));
    setToken(access_token);
    setUser(resolvedUser);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — token expires naturally
    }
    tokenStorage.clear();
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
    setIsLoading(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const silentRefresh = useCallback(
    async ({ finallySetLoading = false } = {}) => {
      const refreshToken = tokenStorage.getRefresh();

      if (!refreshToken) {
        const currentAccess = tokenStorage.getAccess();
        if (!currentAccess || isHardExpired(currentAccess)) {
          logout();
        }
        if (finallySetLoading) setIsLoading(false);
        return;
      }

      try {
        const res = await api.post("/auth/refresh", { refresh_token: refreshToken });

        if (res?.success && res.data?.access_token) {
          saveLogin(
            res.data.access_token,
            res.data.refresh_token ?? refreshToken,
            res.data.user ?? null,
          );
        } else {
          throw new Error(res?.error || "Refresh failed");
        }
      } catch (err) {
        const isServerError =
          err?.message?.includes("500") || err?.message?.includes("server");
        const currentAccess = tokenStorage.getAccess();

        if (isServerError && currentAccess && !isHardExpired(currentAccess)) {
          console.warn("[useAuth] Refresh error but access token still valid — keeping session.");
        } else {
          logout();
        }
      } finally {
        if (finallySetLoading) setIsLoading(false);
      }
    },
    [saveLogin, logout]
  );

  useEffect(() => {
    const accessToken = tokenStorage.getAccess();
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
      silentRefresh({ finallySetLoading: true });
      return;
    }

    if (accessToken && !user) {
      const derived = deriveUserFromToken(accessToken);
      if (derived) setUser(derived);
    }

    setIsLoading(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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