const ENDPOINTS = {
  image:    `/api/v1/ml/analyze`,
  video:    `/api/v1/ml/analyze/video`,
  realtime: `/api/v1/ml/analyze/realtime`,
};

const TIMEOUTS = {
  image:    90_000,
  video:    300_000,
  realtime: 900,
};

function _authHeaders() {
  const token = localStorage.getItem("access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
          confidence:      payload.ai_validation?.confidence      ?? 0,
          status:          payload.ai_validation?.status          ?? "unknown",
          model:           payload.ai_validation?.model           ?? null,
          raw_scores:      payload.ai_validation?.raw_scores      ?? {},
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
        all_detections: payload.all_detections ?? [],
      },
    };

  } catch (err) {
    if (err.name === "AbortError") {
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
        all_detections: payload.all_detections ?? [],
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
        all_detections: payload.all_detections ?? [],
      },
    };

  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, data: null, error: null };
    }
    return _errorResponse("Realtime connection failed.");
  } finally {
    clearTimeout(timer);
  }
}

export async function classifyMedia(mediaId) {
  const { api } = await import("./client.js");
  return api.post("/ml/classify", { media_id: mediaId });
}

export async function analyzeFile(file, onProgress = null) {
  if (!file) return _errorResponse("No file provided.");

  const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi"]);
  const ext        = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");

  if (VIDEO_EXTS.has(ext) || (file.type || "").startsWith("video/")) {
    return analyzeVideo(file, onProgress);
  }

  return analyzeMedia(file);
}

export class RealtimeDetectionSocket {
  constructor(onFrame) {
    this.ws      = null;
    this.onFrame = onFrame;
  }

  connect() {
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    const wsBase  = `${wsProto}://${window.location.host}`;
    this.ws = new WebSocket(`${wsBase}/api/v1/ml/ws/realtime-overlay`);

    this.ws.onopen = () => {
      console.debug("[RealtimeDetectionSocket] connected");
    };

    this.ws.onmessage = (e) => {
      const img    = new Image();
      const objUrl = URL.createObjectURL(new Blob([e.data]));
      img.onload = () => {
        this.onFrame(img);
        URL.revokeObjectURL(objUrl);
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