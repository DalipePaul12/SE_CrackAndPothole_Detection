const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const ANALYZE_ENDPOINT = `${BASE_URL}/api/v1/ml/analyze`;

// Timeout for the full pipeline (HF cold start + YOLO on CPU can be slow)
const ANALYZE_TIMEOUT_MS = 90_000;

/**
 * analyzeMedia
 * @param {File} file  — The File object from the file input
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function analyzeMedia(file) {
  if (!file) {
    return { success: false, data: null, error: "No file provided." };
  }

  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const token = localStorage.getItem("access_token");

    const response = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: {
        // ⚠️  Do NOT set Content-Type manually for FormData.
        //     The browser must set it (with the multipart boundary) automatically.
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON body (e.g. 502 from proxy) — treat as server error
      body = null;
    }

    // ── HTTP error (4xx / 5xx) ───────────────────────────────────────────────
    if (!response.ok) {
      const message =
        body?.detail ||
        body?.error ||
        `Server error ${response.status}: ${response.statusText}`;

      // 413 = file too large — give user-friendly message
      if (response.status === 413) {
        return {
          success: false,
          data: null,
          error: "File is too large. Please upload a smaller image or video.",
        };
      }

      // 415 = wrong MIME type
      if (response.status === 415) {
        return {
          success: false,
          data: null,
          error: "Unsupported file format. Use JPEG, PNG, WEBP, or MP4.",
        };
      }

      // 422 = AI disabled or model not loaded
      if (response.status === 422) {
        return {
          success: false,
          data: null,
          error: message || "AI classification is currently unavailable.",
        };
      }

      // 429 = rate limited
      if (response.status === 429) {
        return {
          success: false,
          data: null,
          error: "Too many analysis requests. Please wait a moment and try again.",
        };
      }

      return { success: false, data: null, error: message };
    }

    // ── Success — normalize the response ────────────────────────────────────
    // body.data is the object we pass through; body.success is from the backend
    const payload = body?.data ?? body;

    if (!payload || typeof payload !== "object") {
      return {
        success: false,
        data: null,
        error: "Unexpected response from server. Please try again.",
      };
    }

    // Guarantee the shape even if backend fields are missing
    const normalized = {
      ai_validation: {
        is_ai_generated: payload.ai_validation?.is_ai_generated ?? false,
        confidence: payload.ai_validation?.confidence ?? 0,
        status: payload.ai_validation?.status ?? "unknown",
      },
      // prediction is intentionally null when is_ai_generated === true
      prediction: payload.prediction
        ? {
            label: payload.prediction.label ?? "uncertain",
            confidence: payload.prediction.confidence ?? 0,
            severity: payload.prediction.severity ?? null,
            boxes: payload.prediction.boxes ?? [],
            inference_time_ms: payload.prediction.inference_time_ms ?? null,
          }
        : null,
    };

    return { success: true, data: normalized, error: null };

  } catch (err) {
    if (err.name === "AbortError") {
      return {
        success: false,
        data: null,
        error:
          "Analysis timed out. The server may be under load — please try again.",
      };
    }
    // Network unreachable, CORS, etc.
    return {
      success: false,
      data: null,
      error: "Could not connect to the analysis server. Check your connection.",
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * classifyMedia — kept for any existing callers that use the polling flow.
 * @param {number|string} mediaId
 */
export async function classifyMedia(mediaId) {
  const { api } = await import("./client.js");
  return api.post("/ml/classify", { media_id: mediaId });
}