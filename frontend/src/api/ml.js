/**
 * ml.js — Road damage analysis API client
 *
 * analyzeMedia(file)         — full image pipeline (HF + YOLO)
 * analyzeVideo(file, onProgress) — temporal video pipeline  ← NEW
 * analyzeRealtimeFrame(file) — live camera frame (lightweight)
 * classifyMedia(mediaId)     — background worker polling
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const ENDPOINTS = {
  image:    `${BASE_URL}/api/v1/ml/analyze`,
  video:    `${BASE_URL}/api/v1/ml/analyze/video`,
  realtime: `${BASE_URL}/api/v1/ml/analyze/realtime`,
};

const TIMEOUTS = {
  image:    90_000,   // HF cold start can be slow
  video:    300_000,  // video processing can take minutes on CPU
  realtime: 10_000,
};

// ── Auth token helper ────────────────────────────────────────────────────────

function _authHeaders() {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Generic error normaliser ────────────────────────────────────────────────

function _errorResponse(message) {
  return { success: false, data: null, error: message };
}

async function _parseBody(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function _httpError(status, body) {
  const message = body?.detail || body?.error || `Server error ${status}`;
  const MAP = {
    413: "File is too large. Please upload a smaller file.",
    415: "Unsupported file format. Use JPEG, PNG, WEBP for images or MP4 for video.",
    422: message || "AI classification is currently unavailable.",
    429: "Too many requests. Please wait a moment and try again.",
  };
  return MAP[status] || message;
}

// ── Image analysis (full HF + YOLO pipeline) ────────────────────────────────

/**
 * analyzeMedia
 * @param {File} file
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function analyzeMedia(file) {
  if (!file) return _errorResponse("No file provided.");

  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.image);

  try {
    const response = await fetch(ENDPOINTS.image, {
      method:  "POST",
      signal:  controller.signal,
      headers: _authHeaders(),
      body:    formData,
    });

    const body = await _parseBody(response);

    if (!response.ok) {
      return _errorResponse(_httpError(response.status, body));
    }

    const payload = body?.data ?? body;
    if (!payload || typeof payload !== "object") {
      return _errorResponse("Unexpected response from server.");
    }

    return {
      success: true,
      error:   null,
      data: {
        ai_validation: {
          is_ai_generated: payload.ai_validation?.is_ai_generated ?? false,
          confidence:      payload.ai_validation?.confidence ?? 0,
          status:          payload.ai_validation?.status ?? "unknown",
        },
        prediction: payload.prediction
          ? {
              label:             payload.prediction.label ?? "uncertain",
              confidence:        payload.prediction.confidence ?? 0,
              severity:          payload.prediction.severity ?? null,
              boxes:             payload.prediction.boxes ?? [],
              norm_bbox:         payload.prediction.norm_bbox ?? null,
              distance:          payload.prediction.distance ?? null,
              inference_time_ms: payload.prediction.inference_time_ms ?? null,
            }
          : null,
      },
    };

  } catch (err) {
    if (err.name === "AbortError") {
      return _errorResponse("Analysis timed out. The server may be under load — please try again.");
    }
    return _errorResponse("Could not connect to the analysis server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
}

// ── Video analysis (temporal multi-frame pipeline) ───────────────────────────

/**
 * analyzeVideo
 * @param {File}     file
 * @param {Function} [onProgress]  — called with status strings during upload/processing
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 *
 * data shape on success:
 * {
 *   detected: boolean,
 *   prediction: {
 *     label, confidence, severity, frames_seen,
 *     boxes, norm_bbox, distance, inference_time_ms
 *   } | null,
 *   analytics: {
 *     frames_processed, frames_skipped_blur, elapsed_seconds, frame_stats
 *   }
 * }
 */
export async function analyzeVideo(file, onProgress = null) {
  if (!file) return _errorResponse("No file provided.");

  const VIDEO_EXTS = [".mp4", ".mov", ".avi"];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!VIDEO_EXTS.includes(`.${ext}`)) {
    return _errorResponse("Unsupported video format. Use MP4, MOV, or AVI.");
  }

  onProgress?.("Uploading video…");

  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.video);

  // Simulate progress stages while waiting for the server
  let progressInterval = null;
  const stages = [
    "Extracting frames…",
    "Enhancing image quality…",
    "Running AI detection…",
    "Validating detections across frames…",
    "Finalising results…",
  ];
  let stageIdx = 0;
  if (onProgress) {
    progressInterval = setInterval(() => {
      if (stageIdx < stages.length) {
        onProgress(stages[stageIdx++]);
      }
    }, 8_000);
  }

  try {
    const response = await fetch(ENDPOINTS.video, {
      method:  "POST",
      signal:  controller.signal,
      headers: _authHeaders(),
      body:    formData,
    });

    const body = await _parseBody(response);

    if (!response.ok) {
      return _errorResponse(_httpError(response.status, body));
    }

    const payload = body?.data ?? body;
    if (!payload || typeof payload !== "object") {
      return _errorResponse("Unexpected response from server.");
    }

    onProgress?.("Done.");

    const pred = payload.prediction;

    return {
      success: true,
      error:   null,
      data: {
        detected: payload.detected ?? false,
        prediction: pred
          ? {
              label:             pred.label ?? "uncertain",
              confidence:        pred.confidence ?? 0,
              severity:          pred.severity ?? null,
              frames_seen:       pred.frames_seen ?? 0,
              boxes:             pred.boxes ?? [],
              norm_bbox:         pred.norm_bbox ?? null,
              distance:          pred.distance ?? null,
              inference_time_ms: pred.inference_time_ms ?? null,
            }
          : null,
        analytics: {
          frames_processed:    payload.analytics?.frames_processed ?? 0,
          frames_skipped_blur: payload.analytics?.frames_skipped_blur ?? 0,
          elapsed_seconds:     payload.analytics?.elapsed_seconds ?? 0,
          frame_stats:         payload.analytics?.frame_stats ?? [],
        },
      },
    };

  } catch (err) {
    if (err.name === "AbortError") {
      return _errorResponse(
        "Video analysis timed out. Try a shorter clip or check server load."
      );
    }
    return _errorResponse("Could not connect to the analysis server. Check your connection.");
  } finally {
    clearTimeout(timer);
    if (progressInterval) clearInterval(progressInterval);
  }
}

// ── Realtime single-frame analysis ───────────────────────────────────────────

/**
 * analyzeRealtimeFrame
 * @param {Blob|File} frame — JPEG/PNG frame blob from camera
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function analyzeRealtimeFrame(frame) {
  if (!frame) return _errorResponse("No frame provided.");

  const formData = new FormData();
  formData.append("file", frame, "frame.jpg");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.realtime);

  try {
    const response = await fetch(ENDPOINTS.realtime, {
      method:  "POST",
      signal:  controller.signal,
      headers: _authHeaders(),
      body:    formData,
    });

    const body = await _parseBody(response);

    if (!response.ok) {
      return _errorResponse(_httpError(response.status, body));
    }

    const payload = body?.data ?? body;
    if (!payload || typeof payload !== "object") {
      return _errorResponse("Unexpected frame response.");
    }

    return {
      success: true,
      error:   null,
      data: {
        detected: payload.detected ?? false,
        prediction: payload.prediction
          ? {
              label:             payload.prediction.label ?? "none",
              confidence:        payload.prediction.confidence ?? 0,
              severity:          payload.prediction.severity ?? null,
              boxes:             payload.prediction.boxes ?? [],
              norm_bbox:         payload.prediction.norm_bbox ?? null,
              distance:          payload.prediction.distance ?? null,
              inference_time_ms: payload.prediction.inference_time_ms ?? null,
            }
          : null,
      },
    };

  } catch (err) {
    if (err.name === "AbortError") {
      return _errorResponse("Frame timed out.");
    }
    return _errorResponse("Realtime connection failed.");
  } finally {
    clearTimeout(timer);
  }
}

// ── Background worker polling (existing callers) ─────────────────────────────

/**
 * classifyMedia — polling flow compatibility shim.
 * @param {number|string} mediaId
 */
export async function classifyMedia(mediaId) {
  const { api } = await import("./client.js");
  return api.post("/ml/classify", { media_id: mediaId });
}

// ── Smart router: auto-detect file type and call correct endpoint ─────────────

/**
 * analyzeFile — convenience wrapper that routes image vs video automatically.
 * @param {File}     file
 * @param {Function} [onProgress]
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function analyzeFile(file, onProgress = null) {
  if (!file) return _errorResponse("No file provided.");

  const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi"]);
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");

  if (VIDEO_EXTS.has(ext) || (file.type || "").startsWith("video/")) {
    return analyzeVideo(file, onProgress);
  }

  return analyzeMedia(file);
}
// ADD AT END
export class RealtimeDetectionSocket {
  constructor(onFrame) {
    this.ws = null;
    this.onFrame = onFrame;
  }
  connect() {
    this.ws = new WebSocket(`${BASE_URL.replace('http','ws')}/api/v1/ml/ws/realtime-overlay`);
    this.ws.onmessage = (e) => {
      const img = new Image();
      img.onload = () => this.onFrame(img);
      img.src = URL.createObjectURL(new Blob([e.data]));
    };
  }
  sendFrame(blob) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(blob);
    }
  }
  disconnect() { this.ws?.close(); }
}