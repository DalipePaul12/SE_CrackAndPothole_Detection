import { useState, useEffect, useCallback, useRef } from "react";
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

async function callRefresh(refresh_token) {
  const res = await api.post("/auth/refresh", { refresh_token });

  if (!res?.success) {
    throw new Error(res?.error || "Token refresh failed");
  }

  return res.data;
}

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
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const silentRefresh = useCallback(async () => {
    const refreshToken = tokenStorage.getRefresh();

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

  useEffect(() => {
    if (!token) return;

    const expiryMs = getTokenExpiryMs(token);
    if (!expiryMs) return;

    const delayMs = expiryMs - Date.now() - REFRESH_BUFFER_MS;

    if (delayMs <= 0) {
      silentRefresh();
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(silentRefresh, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [token, silentRefresh]);

  useEffect(() => {
    const accessToken  = tokenStorage.getAccess();
    const refreshToken = tokenStorage.getRefresh();

    if (!accessToken && refreshToken) {
      silentRefresh();
      return;
    }

    if (accessToken) {
      const expiryMs = getTokenExpiryMs(accessToken);
      if (expiryMs && Date.now() >= expiryMs - REFRESH_BUFFER_MS) {
        silentRefresh();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    user,
    token,
    isAuthenticated: !!token && !!user,
    saveLogin,
    logout,
  };
}