export const BASE_URL = import.meta.env.VITE_API_URL || "";
const API_PREFIX = "/api/v1";

// ── Token storage — single source of truth shared with useAuth.js ─────────────
const TOKEN_KEY   = "access_token";
const REFRESH_KEY = "refresh_token";

export const tokenStorage = {
  getAccess:  ()      => localStorage.getItem(TOKEN_KEY),
  getRefresh: ()      => localStorage.getItem(REFRESH_KEY),
  setAccess:  (token) => localStorage.setItem(TOKEN_KEY, token),
  setRefresh: (token) => localStorage.setItem(REFRESH_KEY, token),
  clear: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ── Redirect on session expiry ─────────────────────────────────────────────────
// NOTE: redirects to "/" not "/login" — App.jsx has no /login route.
function redirectToLogin() {
  tokenStorage.clear();
  localStorage.removeItem("user");
  if (!window.location.pathname.startsWith("/dashboard") &&
      !window.location.pathname.startsWith("/adminpanel")) return;
  window.location.href = "/";
}

// ── Token refresh queue (prevents concurrent refresh storms) ──────────────────
let isRefreshing       = false;
let refreshSubscribers = [];

function subscribeRefresh(cb) { refreshSubscribers.push(cb); }
function notifyRefreshDone(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function attemptTokenRefresh() {
  if (isRefreshing) return new Promise((res) => subscribeRefresh(res));
  isRefreshing = true;
  try {
    const rt = tokenStorage.getRefresh();
    if (!rt) return null;

    const res = await fetch(`${BASE_URL}${API_PREFIX}/auth/refresh`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ refresh_token: rt }),
    });

    if (!res.ok) { redirectToLogin(); return null; }

    const data     = await res.json();
    const newToken = data?.data?.access_token ?? data?.access_token;
    if (!newToken) { redirectToLogin(); return null; }

    tokenStorage.setAccess(newToken);
    notifyRefreshDone(newToken);
    return newToken;
  } catch {
    redirectToLogin();
    return null;
  } finally {
    isRefreshing = false;
  }
}

function authHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Core request ──────────────────────────────────────────────────────────────
async function request(endpoint, options = {}, _isRetry = false) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 30000);

  try {
    const token = tokenStorage.getAccess();
console.log(">>> FETCH", `${BASE_URL}${API_PREFIX}${endpoint}`, "token:", token ? "present" : "MISSING");
    const response = await fetch(`${BASE_URL}${API_PREFIX}${endpoint}`, {
      credentials: "include",
      ...options,
      signal:  controller.signal,
      headers: { ...authHeaders(token), ...options.headers },
    });

    let data = null;
    try { data = await response.json(); } catch { data = null; }

    if (response.status === 401 && !_isRetry) {
      // Auth endpoints (login, verify-otp, etc.) return 401 for wrong credentials —
      // that is NOT a session expiry. Only attempt refresh for protected endpoints.
      const isAuthEndpoint = endpoint.startsWith("/auth/");
      if (!isAuthEndpoint) {
        clearTimeout(timeout);
        const newToken = await attemptTokenRefresh();
        if (newToken) return request(endpoint, options, true);
        return { success: false, data: null, error: "Session expired. Please log in again." };
      }
      // For auth endpoints, fall through to the generic !response.ok handler below
      // so the real backend error (e.g. "Incorrect email or password.") is shown.
    }

    if (response.status === 403) {
      return {
        success: false,
        data:    null,
        error:   data?.detail || "You don't have permission to access this resource.",
      };
    }

    if (!response.ok) {
      // 🔍 DEBUG: always log the full error body so 422 details are visible
console.error(`[API Error ${response.status}] ${endpoint}:`, JSON.stringify(data, null, 2));
      const detail = data?.detail;
      return {
        success: false,
        data:    null,
        error:   data?.error || (typeof detail === "string" ? detail : detail?.message) || `Request failed (${response.status})`,
      };
    }

    return {
      success: data?.success ?? true,
      data:    data?.data ?? data,
      error:   data?.error ?? null,
    };
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, data: null, error: "Request timed out. Please try again." };
    }
    return { success: false, data: null, error: "Network error. Check that the backend is running." };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Raw request — for 202 polling (usePipeline) ───────────────────────────────
export async function requestRaw(endpoint, options = {}, _isRetry = false) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 30000);

  try {
    const token = tokenStorage.getAccess();

    const response = await fetch(`${BASE_URL}${API_PREFIX}${endpoint}`, {
      credentials: "include",
      ...options,
      signal:  controller.signal,
      headers: { ...authHeaders(token), ...options.headers },
    });

    let data = null;
    try { data = await response.json(); } catch { data = null; }

    const s = response.status;

    if (s === 401 && !_isRetry) {
      const isAuthEndpoint = endpoint.startsWith("/auth/");
      if (!isAuthEndpoint) {
        clearTimeout(timeout);
        const nt = await attemptTokenRefresh();
        if (nt) return requestRaw(endpoint, options, true);
        return { success: false, data: null, error: "Session expired.", status: 401, retryable: false };
      }
    }

    if (s === 202) {
      return { success: false, data: data?.data ?? null, error: data?.detail || "Processing…", status: s, retryable: true };
    }

    if (!response.ok) {
      return { success: false, data: null, error: data?.error || data?.detail || `Request failed (${s})`, status: s, retryable: false };
    }

    return { success: data?.success ?? true, data: data?.data ?? data, error: null, status: s, retryable: false };
  } catch (err) {
    return { success: false, data: null, error: err.name === "AbortError" ? "Request timed out." : "Network error", status: 0, retryable: false };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public api object ─────────────────────────────────────────────────────────
export const api = {
  get:    (url)               => request(url, { method: "GET" }),
  post: (url, body, h = {}) => {
    const isForm = body instanceof URLSearchParams;
    return request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...h },
      body: isForm ? body : JSON.stringify(body),
    });
  },
  put:    (url, body)         => request(url, { method: "PUT",   headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  patch:  (url, body)         => request(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  delete: (url, body)         => request(url, body
    ? { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { method: "DELETE" }),

  /**
   * download() — GET a binary response (blob) with full auth-refresh support.
   * Mirrors upload() exactly, substituting response.blob() for response.json().
   * Use for any endpoint that returns non-JSON (CSV, PDF, binary).
   */
  download: async (url, _isRetry = false) => {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 30000);

    try {
      const token = tokenStorage.getAccess();

      const response = await fetch(`${BASE_URL}${API_PREFIX}${url}`, {
        method:      "GET",
        credentials: "include",
        signal:      controller.signal,
        headers:     { ...authHeaders(token) },
      });

      if (response.status === 401 && !_isRetry) {
        clearTimeout(timeout);
        const nt = await attemptTokenRefresh();
        if (nt) return api.download(url, true);
        return { success: false, error: "Session expired. Please log in again." };
      }

      if (!response.ok) {
        let errMsg = `Download failed (${response.status})`;
        try {
          const errData = await response.json();
          errMsg = errData?.error || errData?.detail || errMsg;
        } catch { /* response body is not JSON — use status-based message */ }
        return { success: false, error: errMsg };
      }

      const blob = await response.blob();
      return { success: true, blob };
    } catch (err) {
      return {
        success: false,
        error:   err.name === "AbortError"
          ? "Download timed out. Please try again."
          : "Network error during download. Check backend connection.",
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  /**
   * upload() — multipart/form-data
   * 120s timeout: ML inference on CPU can take 30-90s on large images.
   * ⚠️ Never set Content-Type manually — browser sets it with the boundary.
   */
  upload: async (url, formData, _isRetry = false) => {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 120000);

    try {
      const token = tokenStorage.getAccess();

      const response = await fetch(`${BASE_URL}${API_PREFIX}${url}`, {
        method:      "POST",
        credentials: "include",
        signal:      controller.signal,
        headers:     { ...authHeaders(token) },
        body:        formData,
      });

      let data = null;
      try { data = await response.json(); } catch { data = null; }

      if (response.status === 401 && !_isRetry) {
        clearTimeout(timeout);
        const nt = await attemptTokenRefresh();
        if (nt) return api.upload(url, formData, true);
        return { success: false, data: null, error: "Session expired. Please log in again." };
      }

      if (!response.ok) {
        console.error(`[API Error ${response.status}] ${url}:`, data);
        return { success: false, data: null, error: data?.error || data?.detail || `Upload failed (${response.status})` };
      }

      return { success: true, data: data?.data ?? data, error: null };
    } catch (err) {
      return {
        success: false,
        data:    null,
        error:   err.name === "AbortError"
          ? "Upload timed out. The file may be too large or ML inference is slow."
          : "Network error during upload. Check backend connection.",
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};