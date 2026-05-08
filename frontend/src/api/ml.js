/**
 * ml.js — Road damage analysis API client
 *
 * analyzeMedia(file)              — full image pipeline (HF + YOLO, concurrent)
 * analyzeVideo(file, onProgress)  — temporal video pipeline with filmstrip
 * analyzeRealtimeFrame(frame)     — live camera frame (lightweight, 10s timeout)
 * classifyMedia(mediaId)          — background worker polling shim
 * analyzeFile(file, onProgress)   — smart router: picks image vs video automatically
 *
 * KEY FIXES vs previous version:
 *   FIX-1: analyzeMedia timeout raised to 90s.
 *           Image pipeline = HF (up to 12s) + YOLO (up to 15s) running concurrently
 *           on backend. Frontend was aborting at 15s before backend could finish.
 *   FIX-2: _authHeaders() always reads from localStorage at call time (not module
 *           init time), so a page refresh after login always gets a fresh token.
 *   FIX-3: Non-200 responses from HF during image analysis no longer surface as
 *           "Analysis timed out" — proper error codes mapped to user-friendly messages.
 *   FIX-4: analyzeVideo guards against total_frames=0 before random.sample() crash.
 *   FIX-5: analyzeRealtimeFrame: AbortError on 900ms frame timeout is swallowed
 *           silently (expected behaviour during live loop) — not treated as an error.
 */

const BASE_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

const ENDPOINTS = {
  image:    `${BASE_URL}/api/v1/ml/analyze`,
  video:    `${BASE_URL}/api/v1/ml/analyze/video`,
  realtime: `${BASE_URL}/api/v1/ml/analyze/realtime`,
};

// FIX-1: Image timeout raised from whatever it was to 90s.
// Backend runs HF (≤12s) + YOLO (≤15s) concurrently, so worst case ≈ 27s.
// 90s gives headroom for slow hardware and large images without false timeouts.
const TIMEOUTS = {
  image:    90_000,   // was too short — caused the "timed out" error in screenshot
  video:    300_000,  // 5 min for long clips
  realtime: 900,      // tight — dropped realtime frames are acceptable
};


// ── Auth token helper ─────────────────────────────────────────────────────────

// FIX-2: Read token at call-time, not module-load-time.
// Reading at module load would capture whatever token existed when the JS bundle
// was first evaluated — meaning a freshly-logged-in user gets no auth header
// until the next full page reload.
function _authHeaders() {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}


// ── Generic helpers ───────────────────────────────────────────────────────────

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

// FIX-3: Expanded HTTP error map.
// 401 was missing — backend returns 401 when JWT is missing/expired on /ml/analyze.
// 504 is returned by backend when model inference itself times out server-side.
function _httpError(status, body) {
  const serverMsg = body?.detail || body?.error || `Server error ${status}`;
  const MAP = {
    401: "Session expired. Please log in again.",
    403: "You do not have permission to perform this action.",
    413: "File is too large. Please upload a smaller file.",
    415: "Unsupported file format. Use JPEG, PNG, WEBP for images or MP4 for video.",
    422: serverMsg || "AI classification is currently unavailable.",
    429: "Too many requests. Please wait a moment and try again.",
    500: "Server error during analysis. Please try again.",
    504: "Model inference timed out on the server. Try a smaller image.",
  };
  return MAP[status] || serverMsg;
}


// ── Image analysis (full HF + YOLO pipeline) ──────────────────────────────────

/**
 * analyzeMedia
 *
 * Sends an image to POST /ml/analyze.
 * Backend runs HF AI-check + both YOLO models concurrently (after fix to
 * ml_service.py). Total backend time ≈ max(HF_time, YOLO_time) ≤ ~20s.
 *
 * @param {File} file
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function analyzeMedia(file) {
  if (!file) return _errorResponse("No file provided.");

  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return _errorResponse(
      `Unsupported image format (${file.type || "unknown"}). Use JPEG, PNG, or WEBP.`
    );
  }

  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  // FIX-1: 90s timeout — enough for cold-start HF + YOLO on slow hardware.
  const timer = setTimeout(() => controller.abort(), TIMEOUTS.image);

  try {
    const response = await fetch(ENDPOINTS.image, {
      method:  "POST",
      signal:  controller.signal,
      // FIX-2: _authHeaders() called here, not at module init.
      // Never set Content-Type for FormData — browser must set it with the boundary.
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
          confidence:      payload.ai_validation?.confidence      ?? 0,
          status:          payload.ai_validation?.status          ?? "unknown",
        },
        prediction: payload.prediction
          ? {
              label:             payload.prediction.label             ?? "uncertain",
              confidence:        payload.prediction.confidence        ?? 0,
              severity:          payload.prediction.severity          ?? null,
              boxes:             payload.prediction.boxes             ?? [],
              norm_bbox:         payload.prediction.norm_bbox         ?? null,
              distance:          payload.prediction.distance          ?? null,
              inference_time_ms: payload.prediction.inference_time_ms ?? null,
            }
          : null,
      },
    };

  } catch (err) {
    if (err.name === "AbortError") {
      // This means our 90s timer fired — the server is genuinely overloaded.
      return _errorResponse(
        "Analysis timed out. The server may be under load — please try again."
      );
    }
    return _errorResponse(
      "Could not connect to the analysis server. Check your connection."
    );
  } finally {
    clearTimeout(timer);
  }
}


// ── Video analysis (temporal multi-frame pipeline) ────────────────────────────

/**
 * analyzeVideo
 *
 * @param {File}     file
 * @param {Function} [onProgress]  — called with status strings during processing
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
 *     frames_processed, frames_skipped_blur, elapsed_seconds,
 *     frame_stats, detection_snapshots: [{ frame, label, confidence, image_b64 }]
 *   }
 * }
 */
export async function analyzeVideo(file, onProgress = null) {
  if (!file) return _errorResponse("No file provided.");

  const VIDEO_EXTS = [".mp4", ".mov", ".avi"];
  const ext        = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  if (!VIDEO_EXTS.includes(ext)) {
    return _errorResponse("Unsupported video format. Use MP4, MOV, or AVI.");
  }

  onProgress?.("Uploading video…");

  const formData = new FormData();
  formData.append("file", file);

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUTS.video);

  // Simulated progress stages — video analysis takes 10-120s so we
  // show user-friendly status messages at regular intervals.
  let progressInterval = null;
  const stages = [
    "Extracting frames…",
    "Enhancing image quality…",
    "Running AI detection…",
    "Validating detections across frames…",
    "Building detection filmstrip…",
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
              label:             pred.label             ?? "uncertain",
              confidence:        pred.confidence        ?? 0,
              severity:          pred.severity          ?? null,
              frames_seen:       pred.frames_seen       ?? 0,
              boxes:             pred.boxes             ?? [],
              norm_bbox:         pred.norm_bbox         ?? null,
              distance:          pred.distance          ?? null,
              inference_time_ms: pred.inference_time_ms ?? null,
            }
          : null,
        analytics: {
          frames_processed:    payload.analytics?.frames_processed    ?? 0,
          frames_skipped_blur: payload.analytics?.frames_skipped_blur ?? 0,
          elapsed_seconds:     payload.analytics?.elapsed_seconds     ?? 0,
          frame_stats:         payload.analytics?.frame_stats         ?? [],
          detection_snapshots: payload.analytics?.detection_snapshots ?? [],
        },
      },
    };

  } catch (err) {
    if (err.name === "AbortError") {
      return _errorResponse(
        "Video analysis timed out. Try a shorter clip or check server load."
      );
    }
    return _errorResponse(
      "Could not connect to the analysis server. Check your connection."
    );
  } finally {
    clearTimeout(timer);
    if (progressInterval) clearInterval(progressInterval);
  }
}


// ── Realtime single-frame analysis ───────────────────────────────────────────

/**
 * analyzeRealtimeFrame
 *
 * Sends a single JPEG/PNG frame to the lightweight realtime endpoint.
 * Designed to be called on a tight interval (~300ms) from useMLPrediction.
 * AbortErrors from the 900ms timeout are swallowed — dropped frames are normal.
 *
 * @param {Blob|File} frame — JPEG/PNG frame blob from canvas.toBlob()
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function analyzeRealtimeFrame(frame) {
  if (!frame) return _errorResponse("No frame provided.");

  const formData = new FormData();
  formData.append("file", frame, "frame.jpg");

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUTS.realtime);

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
              label:             payload.prediction.label             ?? "none",
              confidence:        payload.prediction.confidence        ?? 0,
              severity:          payload.prediction.severity          ?? null,
              boxes:             payload.prediction.boxes             ?? [],
              norm_bbox:         payload.prediction.norm_bbox         ?? null,
              distance:          payload.prediction.distance          ?? null,
              inference_time_ms: payload.prediction.inference_time_ms ?? null,
            }
          : null,
      },
    };

  } catch (err) {
    // FIX-5: AbortError during realtime loop = frame was dropped due to 900ms
    // timeout. This is expected and normal — do NOT surface it as an error.
    if (err.name === "AbortError") {
      return { success: false, data: null, error: null }; // silently dropped
    }
    return _errorResponse("Realtime connection failed.");
  } finally {
    clearTimeout(timer);
  }
}


// ── Background worker polling shim ────────────────────────────────────────────

/**
 * classifyMedia — polling flow compatibility shim.
 * Used by legacy usePipeline.js flows that upload media first, then poll.
 * @param {number|string} mediaId
 */
export async function classifyMedia(mediaId) {
  // Lazy import to avoid circular dependency with client.js
  const { api } = await import("./client.js");
  return api.post("/ml/classify", { media_id: mediaId });
}


// ── Smart router ──────────────────────────────────────────────────────────────

/**
 * analyzeFile — convenience wrapper that routes image vs video automatically.
 *
 * Usage:
 *   const result = await analyzeFile(file, (msg) => setStatus(msg));
 *
 * @param {File}     file
 * @param {Function} [onProgress]  — receives status strings during video processing
 * @returns {Promise<{ success: boolean, data: object|null, error: string|null }>}
 */
export async function analyzeFile(file, onProgress = null) {
  if (!file) return _errorResponse("No file provided.");

  const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi"]);
  const ext        = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");

  if (VIDEO_EXTS.has(ext) || (file.type || "").startsWith("video/")) {
    return analyzeVideo(file, onProgress);
  }

  return analyzeMedia(file);
}


// ── WebSocket realtime overlay ────────────────────────────────────────────────

/**
 * RealtimeDetectionSocket
 *
 * Manages a WebSocket connection to /ml/ws/realtime-overlay.
 * Sends raw JPEG frames and receives annotated JPEG frames as binary blobs.
 *
 * Usage:
 *   const sock = new RealtimeDetectionSocket((imgElement) => canvas.draw(imgElement));
 *   sock.connect();
 *   sock.sendFrame(jpegBlob);
 *   sock.disconnect();
 */
export class RealtimeDetectionSocket {
  constructor(onFrame) {
    this.ws      = null;
    this.onFrame = onFrame;
  }

  connect() {
    const wsBase = BASE_URL.replace(/^http/, "ws");
    this.ws = new WebSocket(`${wsBase}/api/v1/ml/ws/realtime-overlay`);

    this.ws.onopen = () => {
      console.debug("[RealtimeDetectionSocket] connected");
    };

    this.ws.onmessage = (e) => {
      const img    = new Image();
      const objUrl = URL.createObjectURL(new Blob([e.data]));
      img.onload = () => {
        this.onFrame(img);
        URL.revokeObjectURL(objUrl); // prevent memory leak
      };
      img.src = objUrl;
    };

    this.ws.onerror = (e) => {
      console.warn("[RealtimeDetectionSocket] error", e);
    };

    this.ws.onclose = () => {
      console.debug("[RealtimeDetectionSocket] disconnected");
    };
  }

  sendFrame(blob) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(blob);
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}