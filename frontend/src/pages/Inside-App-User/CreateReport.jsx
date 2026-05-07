/**
 * CreateReport.jsx — Merged with RealtimeDetection + PhotoCaptureGuide
 *                  + DetectionOverlay integrated across all three modes
 *
 * Overlay integration points:
 *   1. Upload preview (photo + video tabs) — static bbox after analysis
 *   2. Camera viewfinder (photo/video tabs) — replaces CSS bbox-overlay div
 *   3. Live scan tab — replaces rdCanvasRef + drawDetectionOverlay()
 */

import React, {
  useState, useRef, useEffect, useCallback,
} from "react";
import ReactDOM from "react-dom";
import "./CreateReport.css";
import {
  FaCamera, FaVideo, FaMapMarkerAlt, FaRegTrashAlt,
  FaTimes, FaExclamationCircle, FaCheckCircle,
  FaSpinner, FaExclamationTriangle, FaRedo, FaStop,
  FaMicrophone, FaMicrophoneSlash,
} from "react-icons/fa";
import { MdOutlineLocationOn, MdFiberManualRecord, MdRadar } from "react-icons/md";
import { useUser } from "../../hooks/useUser";
import { analyzeMedia, analyzeVideo } from "../../api/ml";
import { api } from "../../api/client";
import PhotoCaptureGuide from "../../components/PhotoCaptureGuide";
import { DetectionOverlay } from "../../components/DetectionOverlay"; // ← NEW
import {
  detectBarangay,
  NOMINATIM_URL,
  MALABON_BARANGAYS,
  DEFAULT_CITY,
  DEFAULT_BARANGAY,
} from "../../utils/geolocationUtils";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAMAGE_TYPE_BACKEND     = { POTHOLE: "pothole", CRACK: "crack" };
const SEVERITY_BACKEND        = { CRITICAL: "critical", "NON-CRITICAL": "low" };
const REALTIME_CONF_THRESHOLD = 0.40;
const AUTO_CONF_THRESHOLD     = 0.82;
const FRAME_INTERVAL_MS       = 600;
const MAX_REC_SECS            = 10;
const MAX_LOG_ENTRIES         = 50;

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
  "video/ogg",
  "application/octet-stream",
]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);

function isVideoFile(file) {
  if (!file) return false;
  if (VIDEO_MIME_TYPES.has((file.type || "").toLowerCase())) return true;
  const ext = "." + (file.name || "").split(".").pop().toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

const SEVERITY_COLORS = {
  critical: { stroke: "#ef4444", fill: "rgba(239,68,68,0.18)",  label: "SEVERE",   chip: "sev-severe"   },
  moderate: { stroke: "#f97316", fill: "rgba(249,115,22,0.18)", label: "MODERATE", chip: "sev-moderate" },
  low:      { stroke: "#eab308", fill: "rgba(234,179,8,0.15)",  label: "MINOR",    chip: "sev-minor"    },
};

function getSeverityStyle(severity) {
  return SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function normalizeDamageType(label) {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l === "pothole") return "POTHOLE";
  if (l === "crack")   return "CRACK";
  return null;
}

function normalizeSeverity(sev) {
  if (!sev) return null;
  const l = sev.toLowerCase();
  if (l === "critical") return "CRITICAL";
  if (["low", "non-critical", "moderate", "high"].includes(l)) return "NON-CRITICAL";
  return null;
}

async function snapFrameBlob(videoEl, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width  = w ?? videoEl.videoWidth  ?? 640;
  canvas.height = h ?? videoEl.videoHeight ?? 480;
  canvas.getContext("2d").drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

async function snapHighResBlob(videoEl) {
  const canvas = document.createElement("canvas");
  canvas.width  = videoEl.videoWidth  || 1280;
  canvas.height = videoEl.videoHeight || 720;
  canvas.getContext("2d").drawImage(videoEl, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
}

function distanceFeedback(bbox) {
  if (!bbox || bbox.length < 4) return { ok: false, text: "No object detected", area: 0 };
  const [x1, y1, x2, y2] = bbox;
  const area = Math.max(0, (x2 - x1) * (y2 - y1));
  if (area < 0.02) return { ok: false, text: "Too far — move closer (~10 m)", area };
  if (area > 0.40) return { ok: false, text: "Too close — step back (~10 m)", area };
  const est = area > 0 ? Math.round(10 / Math.sqrt(area)) : 0;
  return { ok: true, text: `~${est} m — good framing`, area };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RdConfidenceBar({ confidence }) {
  const pct = Math.round((confidence ?? 0) * 100);
  const cls  = confidence >= 0.7 ? "conf-high" : confidence >= 0.5 ? "conf-mid" : "conf-low";
  return (
    <div className="rd-conf-wrapper">
      <div className="rd-conf-header">
        <span>ML CONFIDENCE</span>
        <span className="rd-conf-pct" style={{ opacity: confidence ? 1 : 0.35 }}>
          {confidence ? `${pct}%` : "—"}
        </span>
      </div>
      <div className="rd-conf-track">
        <div className={`rd-conf-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RdSeverityChips({ severity }) {
  return (
    <div className="rd-sev-row" role="group" aria-label="Severity level">
      {[{ key: "low", label: "MINOR" }, { key: "moderate", label: "MODERATE" }, { key: "critical", label: "SEVERE" }]
        .map(({ key, label }) => (
          <div key={key} className={`rd-sev-chip rd-sev-${key}${severity === key ? " active" : ""}`}>
            {label}
          </div>
        ))}
    </div>
  );
}

function RdDetectionLog({ entries }) {
  return (
    <div className="rd-log" aria-label="Detection log" aria-live="polite">
      <div className="rd-log-title">DETECTION LOG</div>
      <div className="rd-log-list">
        {entries.length === 0 && <div className="rd-log-empty">No detections yet</div>}
        {entries.map((e) => (
          <div key={e.id} className={`rd-log-item rd-log-${e.type}`}>
            <span className="rd-log-time">{e.time}</span>
            <span>{e.type.toUpperCase()} · {e.conf}% · {e.sev}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function CreateReport({ onClose }) {
  const { profile } = useUser();

  const [showGuide, setShowGuide] = useState(true);
  const [activeTab,  setActiveTab]  = useState("photo");
  const [showCamera, setShowCamera] = useState(false);
  const [file,    setFile]    = useState(null);
  const [preview, setPreview] = useState(null);

  const [cameraActive,  setCameraActive]  = useState(false);
  const [cameraError,   setCameraError]   = useState(null);
  const [capturing,     setCapturing]     = useState(false);
  const [isRecording,   setIsRecording]   = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveDetection, setLiveDetection] = useState({
    detected: false, label: null, confidence: 0,
    bbox: null, distance: null, status: "idle",
  });

  const [rdCameraActive,  setRdCameraActive]  = useState(false);
  const [rdCameraError,   setRdCameraError]   = useState(null);
  const [rdCornerStatus,  setRdCornerStatus]  = useState("idle");
  const [rdPillStatus,    setRdPillStatus]    = useState("idle");
  const [rdPillLabel,     setRdPillLabel]     = useState("READY — TAP START");
  const [rdPrediction,    setRdPrediction]    = useState(null);
  const [rdConfidence,    setRdConfidence]    = useState(null);
  const [rdDistance,      setRdDistance]      = useState(null);
  const [rdLatency,       setRdLatency]       = useState(null);
  const [rdFps,           setRdFps]           = useState(null);
  const [rdAudio,         setRdAudio]         = useState(false);
  const [rdAutoCapture,   setRdAutoCapture]   = useState(false);
  const [rdCaptureFlash,  setRdCaptureFlash]  = useState(false);
  const [rdLogEntries,    setRdLogEntries]    = useState([]);
  const [rdNotification,  setRdNotification]  = useState(null);

  // ── NEW: overlay state ──────────────────────────────────────────────────────
  // Stores the raw prediction object from the last completed analysis so the
  // upload-preview overlay can render boxes independently of UI badge state.
  const [predictionResult, setPredictionResult] = useState(null);
  // Tracks display dimensions of the preview media element for canvas sizing.
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  // Tracks display dimensions of the photo/video camera viewfinder.
  const [viewfinderSize, setViewfinderSize] = useState({ width: 0, height: 0 });
  // Tracks display dimensions of the live-scan video element.
  const [rdVideoSize, setRdVideoSize] = useState({ width: 0, height: 0 });
  // ── END NEW ─────────────────────────────────────────────────────────────────

  const [isAnalyzing,      setIsAnalyzing]      = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [analyzeError,     setAnalyzeError]     = useState(null);
  const [hfStatus,         setHfStatus]         = useState(null);
  const [imageType,        setImageType]        = useState(null);
  const [damageType,       setDamageType]       = useState(null);
  const [severity,         setSeverity]         = useState(null);
  const [aiConfidence,     setAiConfidence]     = useState(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const [coords,          setCoords]          = useState(null);
  const [city,            setCity]            = useState(DEFAULT_CITY);
  const [barangay,        setBarangay]        = useState("");
  const [streetName,      setStreetName]      = useState("");
  const [locationLoading, setLocationLoading] = useState(false);

  const [reporterName,     setReporterName]    = useState("");
  const [additionalInfo,   setAdditionalInfo]  = useState("");
  const [formError,        setFormError]       = useState("");
  const [isSubmitting,     setIsSubmitting]    = useState(false);
  const [submitSuccess,    setSubmitSuccess]   = useState(false);
  const [showDiscardModal, setShowDiscardModal]= useState(false);
  const [showSubmitModal,  setShowSubmitModal] = useState(false);

  const fileRef          = useRef();
  const videoRef         = useRef();        // photo/video camera feed
  const streamRef        = useRef(null);
  const detectionLoopRef = useRef(null);
  const analysisIdRef    = useRef(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const recordTimerRef   = useRef(null);

  // ── NEW refs ────────────────────────────────────────────────────────────────
  const previewMediaRef  = useRef(null);   // img or video in the upload preview
  // ── END NEW ─────────────────────────────────────────────────────────────────

  const rdVideoRef       = useRef(null);
  // rdCanvasRef removed — replaced by <DetectionOverlay> component
  const rdStreamRef      = useRef(null);
  const rdIntervalRef    = useRef(null);
  const rdHasCapturedRef = useRef(false);
  const rdLastLabelRef   = useRef(null);
  const rdNotifTimerRef  = useRef(null);
  const rdFrameCountRef  = useRef(0);
  const rdFpsTimerRef    = useRef(null);
  const rdLogIdRef       = useRef(0);
  const rdAudioRef       = useRef(false);

  useEffect(() => { rdAudioRef.current = rdAudio; }, [rdAudio]);

  // ── Location ───────────────────────────────────────────────────────────────
  const fetchLocation = useCallback(async () => {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        const lat = c.latitude, lng = c.longitude;
        setCoords({ lat, lng });
        try {
          const res  = await fetch(NOMINATIM_URL(lat, lng));
          const data = await res.json();
          const addr = data.address || {};
          setCity(addr.city || addr.town || addr.municipality || DEFAULT_CITY);
          setBarangay(detectBarangay(lat, lng, addr));
          setStreetName(
            [addr.road || addr.street || addr.pedestrian || "", addr.house_number]
              .filter(Boolean).join(" ").trim() ||
            `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          );
        } catch {
          setCity(DEFAULT_CITY);
          setBarangay(detectBarangay(lat, lng));
          setStreetName(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        }
        setLocationLoading(false);
      },
      () => {
        setCity(DEFAULT_CITY);
        setBarangay(DEFAULT_BARANGAY);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  }, []);

  useEffect(() => {
    if (profile?.full_name) setReporterName(profile.full_name);
    fetchLocation();
  }, [profile, fetchLocation]);

  // ── Camera helpers ─────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    clearInterval(detectionLoopRef.current);
    clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current._discard = true;
      if (mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
    setShowCamera(false);
    setIsRecording(false);
    setRecordingTime(0);
    setLiveDetection({ detected: false, label: null, confidence: 0, bbox: null, distance: null, status: "idle" });
    setViewfinderSize({ width: 0, height: 0 }); // ← NEW: reset viewfinder size
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      detectionLoopRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const blob = await snapFrameBlob(videoRef.current);
          const fd   = new FormData();
          fd.append("file", blob, "frame.jpg");
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ml/analyze`, {
            method: "POST", body: fd,
            signal: AbortSignal.timeout(800),
            credentials: "include",
          });
          if (!res.ok) return;
          const { data } = await res.json();
          const pred = data?.prediction;
          if (!pred || pred.label === "none") {
            setLiveDetection((p) => ({ ...p, detected: false, status: "scanning", bbox: null }));
            return;
          }
          const conf     = pred.confidence ?? 0;
          const firstBox = pred.boxes?.[0];
          // Use norm_bbox from prediction object — backend returns it directly
          const normBox  = pred.norm_bbox ?? (
            firstBox
              ? [firstBox.x_norm, firstBox.y_norm,
                 firstBox.x_norm + firstBox.w_norm,
                 firstBox.y_norm + firstBox.h_norm]
              : null
          );
          const dist = distanceFeedback(normBox);
          setLiveDetection({
            detected:   conf >= REALTIME_CONF_THRESHOLD,
            label:      pred.label,
            confidence: conf,
            severity:   pred.severity,
            bbox:       normBox,
            boxes:      pred.boxes ?? [],  // ← NEW: keep full boxes for overlay
            distance:   dist,
            status:     conf >= REALTIME_CONF_THRESHOLD
              ? (dist.ok ? "detected" : "warning")
              : "scanning",
          });
          // ── NEW: update viewfinder size for overlay sizing ─────────────────
          if (videoRef.current) {
            setViewfinderSize({
              width:  videoRef.current.offsetWidth  || 640,
              height: videoRef.current.offsetHeight || 360,
            });
          }
        } catch {}
      }, 600);
    } catch (err) {
      setCameraError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow access in your browser settings."
          : "Could not access camera. Try uploading a photo instead."
      );
    }
  }, []);

  const openCamera = useCallback(() => { setShowCamera(true); startCamera(); }, [startCamera]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || capturing) return;
    setCapturing(true);
    const blob     = await snapFrameBlob(videoRef.current);
    const captured = new File([blob], "snap_capture.jpg", { type: "image/jpeg" });
    setFile(captured);
    setPreview(URL.createObjectURL(blob));
    stopCamera();
    setCapturing(false);
    await runFullAnalysis(captured); // eslint-disable-line
  }, [capturing, stopCamera]); // eslint-disable-line

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "video/mp4";
    const mr = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = async () => {
      if (mr._discard) return;
      clearInterval(recordTimerRef.current);
      setIsRecording(false);
      const blob     = new Blob(chunksRef.current, { type: "video/webm" });
      const captured = new File([blob], "snap_video.webm", { type: "video/webm" });
      setFile(captured);
      setPreview(URL.createObjectURL(blob));
      clearInterval(detectionLoopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
      setShowCamera(false);
      setLiveDetection({ detected: false, label: null, confidence: 0, bbox: null, distance: null, status: "idle" });
      await runFullAnalysis(captured); // eslint-disable-line
    };
    mr.start(100);
    setIsRecording(true);
    setRecordingTime(0);
    recordTimerRef.current = setInterval(() => {
      setRecordingTime((t) => {
        const next = t + 1;
        if (next >= MAX_REC_SECS) {
          clearInterval(recordTimerRef.current);
          if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
          return next;
        }
        return next;
      });
    }, 1000);
  }, []); // eslint-disable-line

  const stopRecordingEarly = useCallback(() => {
    clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }, []);

  useEffect(() => () => stopCamera(), []); // eslint-disable-line

  // ── RealtimeDetection helpers ──────────────────────────────────────────────
  const rdStopCamera = useCallback(() => {
    clearInterval(rdIntervalRef.current);
    clearInterval(rdFpsTimerRef.current);
    rdStreamRef.current?.getTracks().forEach((t) => t.stop());
    rdStreamRef.current = null;
    if (rdVideoRef.current) rdVideoRef.current.srcObject = null;
    setRdCameraActive(false);
    setRdPrediction(null); setRdConfidence(null); setRdDistance(null);
    setRdLatency(null); setRdFps(null);
    setRdCornerStatus("idle"); setRdPillStatus("idle");
    setRdPillLabel("READY — TAP START");
    rdLastLabelRef.current = null;
    setRdVideoSize({ width: 0, height: 0 }); // ← NEW
  }, []);

  const rdProcessFrame = useCallback(async () => {
    const video = rdVideoRef.current;
    if (!video || video.readyState < 2 || !rdStreamRef.current) return;
    rdFrameCountRef.current++;
    const t0   = performance.now();
    const blob = await snapFrameBlob(video, 320, 240);
    if (!blob) return;
    try {
      const fd  = new FormData();
      fd.append("file", blob, "frame.jpg");
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ml/analyze/realtime`, {
        method: "POST", body: fd,
        signal: AbortSignal.timeout(800),
        credentials: "include",
      });
      const latMs = Math.round(performance.now() - t0);
      setRdLatency(latMs);
      if (!res.ok) return;
      const result = await res.json();
      const data   = result?.data ?? result;

      if (!data?.detected || !data?.prediction) {
        setRdPrediction(null); setRdConfidence(null); setRdDistance(null);
        setRdCornerStatus("idle"); setRdPillStatus("scanning");
        setRdPillLabel("SCANNING FOR ROAD DAMAGE…");
        rdLastLabelRef.current = null;
        return;
      }

      const pred = data.prediction;
      if (pred.confidence < REALTIME_CONF_THRESHOLD) {
        setRdPrediction(null); setRdConfidence(null);
        setRdCornerStatus("idle"); setRdPillStatus("scanning");
        setRdPillLabel("SCANNING FOR ROAD DAMAGE…");
        return;
      }

      setRdPrediction(pred);
      setRdConfidence(pred.confidence);
      const dist = distanceFeedback(pred.norm_bbox);
      setRdDistance(dist);
      const isLocked = pred.confidence >= AUTO_CONF_THRESHOLD && dist.ok;
      setRdCornerStatus(isLocked ? "locked" : "detecting");
      const { label: sevLabel } = getSeverityStyle(pred.severity);
      setRdPillStatus(isLocked ? "locked" : "detecting");
      setRdPillLabel(`${pred.label.toUpperCase()} — ${sevLabel}`);

      // ── NEW: update live-scan video size for overlay ───────────────────────
      if (rdVideoRef.current) {
        setRdVideoSize({
          width:  rdVideoRef.current.offsetWidth  || 640,
          height: rdVideoRef.current.offsetHeight || 360,
        });
      }
      // ── END NEW ───────────────────────────────────────────────────────────

      if (pred.label !== rdLastLabelRef.current) {
        rdLastLabelRef.current = pred.label;
        const now = new Date();
        const t   = [now.getHours(), now.getMinutes(), now.getSeconds()]
          .map((n) => String(n).padStart(2, "0")).join(":");
        setRdLogEntries((prev) => {
          const entry = {
            id: ++rdLogIdRef.current, time: t, type: pred.label,
            conf: Math.round(pred.confidence * 100),
            sev: getSeverityStyle(pred.severity).label,
          };
          return [entry, ...prev].slice(0, MAX_LOG_ENTRIES);
        });
        if (!rdNotifTimerRef.current) {
          setRdNotification({ type: pred.label, label: pred.label.toUpperCase() });
          rdNotifTimerRef.current = setTimeout(() => {
            setRdNotification(null); rdNotifTimerRef.current = null;
          }, 2800);
        }
        if (rdAudioRef.current && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(`${pred.label} detected`);
          u.rate = 1.1; u.volume = 0.85;
          window.speechSynthesis.speak(u);
        }
      }
      if (rdAutoCapture && isLocked && !rdHasCapturedRef.current) {
        rdHasCapturedRef.current = true;
        rdTriggerCapture(true); // eslint-disable-line
      }
    } catch {}
  }, [rdAutoCapture]); // eslint-disable-line

  const rdTriggerCapture = useCallback(async (auto = false) => {
    const video = rdVideoRef.current;
    if (!video || !rdStreamRef.current) return;
    const blob     = await snapHighResBlob(video);
    const captured = new File([blob], `rd_${auto ? "auto" : "manual"}_${Date.now()}.jpg`, { type: "image/jpeg" });
    setRdCaptureFlash(true);
    setTimeout(() => setRdCaptureFlash(false), 300);
    setFile(captured);
    setPreview(URL.createObjectURL(blob));
    await runFullAnalysis(captured); // eslint-disable-line
  }, []); // eslint-disable-line

  const rdStartCamera = useCallback(async () => {
    setRdCameraError(null);
    rdHasCapturedRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      rdStreamRef.current = stream;
      if (rdVideoRef.current) {
        rdVideoRef.current.srcObject = stream;
        await rdVideoRef.current.play();
      }
      setRdCameraActive(true);
      setRdPillStatus("scanning");
      setRdPillLabel("SCANNING FOR ROAD DAMAGE…");
      rdFrameCountRef.current = 0;
      rdFpsTimerRef.current = setInterval(() => {
        setRdFps(rdFrameCountRef.current);
        rdFrameCountRef.current = 0;
      }, 1000);
      rdIntervalRef.current = setInterval(rdProcessFrame, FRAME_INTERVAL_MS);
    } catch (err) {
      setRdCameraError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow access in your browser settings."
          : "Could not access camera. Check your device settings."
      );
    }
  }, [rdProcessFrame]);

  useEffect(() => { if (activeTab !== "live") rdStopCamera(); }, [activeTab, rdStopCamera]);
  useEffect(() => () => { rdStopCamera(); }, []); // eslint-disable-line

  // ── Analysis ───────────────────────────────────────────────────────────────
  const resetAnalysis = useCallback(() => {
    setImageType(null); setHfStatus(null); setDamageType(null);
    setSeverity(null);  setAiConfidence(null); setAnalyzeError(null);
    setIsAnalyzing(false); setAnalysisComplete(false); setAnalysisProgress(null);
    setPredictionResult(null); // ← NEW
    setPreviewSize({ width: 0, height: 0 }); // ← NEW
  }, []);

  const runFullAnalysis = useCallback(async (f) => {
    const thisId = ++analysisIdRef.current;
    resetAnalysis();
    setIsAnalyzing(true);

    try {
      let result;

      if (isVideoFile(f)) {
        // ── VIDEO pipeline ────────────────────────────────────────────────────
        result = await analyzeVideo(f, (msg) => {
          if (analysisIdRef.current === thisId) setAnalysisProgress(msg);
        });

        if (analysisIdRef.current !== thisId) return;

        if (!result.success) {
          setAnalyzeError(result.error || "Video analysis failed.");
          setAnalysisComplete(true);
          return;
        }

        setHfStatus("skipped");
        setImageType("REAL");

        const prediction = result.data?.prediction;
        if (result.data?.detected && prediction) {
          const dt = normalizeDamageType(prediction.label);
          const sv = normalizeSeverity(prediction.severity);
          setDamageType(dt);
          setSeverity(sv);
          setAiConfidence(prediction.confidence ?? null);
          setPredictionResult(prediction); // ← NEW
          if (!dt) {
            setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
          }
        } else {
          setDamageType(null);
          setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
        }

      } else {
        // ── IMAGE pipeline ────────────────────────────────────────────────────
        result = await analyzeMedia(f);

        if (analysisIdRef.current !== thisId) return;

        if (!result.success) {
          setAnalyzeError(result.error || "Analysis failed.");
          setAnalysisComplete(true);
          return;
        }

        const { ai_validation, prediction } = result.data ?? {};
        if (ai_validation) {
          const hfStat = ai_validation.status;
          setHfStatus(hfStat);
          if (hfStat === "approved_for_classification" || hfStat === "skipped") {
            setImageType("REAL");
          } else if (hfStat === "rejected") {
            setImageType("AI-GENERATED");
          } else {
            setImageType(null);
            setAnalyzeError("AI authenticity check errored.");
          }
        }

        const hfBlocked = ai_validation?.status === "rejected";
        if (!hfBlocked && prediction) {
          const dt = normalizeDamageType(prediction.label);
          const sv = normalizeSeverity(prediction.severity);
          setDamageType(dt);
          setSeverity(sv);
          setAiConfidence(prediction.confidence ?? null);
          setPredictionResult(prediction); // ← NEW
          if (prediction.label === "none" || dt === null) {
            setAnalyzeError("No damage detected. Please upload a clearer photo of road damage.");
          }
        }
      }

    } catch {
      if (analysisIdRef.current !== thisId) return;
      setAnalyzeError("Analysis error — please try re-uploading.");
    } finally {
      if (analysisIdRef.current === thisId) {
        setIsAnalyzing(false);
        setAnalysisProgress(null);
        setAnalysisComplete(true);
      }
    }
  }, [resetAnalysis]);

  const handleFileChange = useCallback(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setFormError("");
    await runFullAnalysis(f);
  }, [runFullAnalysis]);

  const clearMedia = useCallback((e) => {
    e?.stopPropagation();
    analysisIdRef.current++;
    setFile(null);
    setPreview(null);
    resetAnalysis();
    if (fileRef.current) fileRef.current.value = "";
  }, [resetAnalysis]);

  // ── Form submit ────────────────────────────────────────────────────────────
  const validateForm = useCallback(() => {
    if (!file) { setFormError("Evidence required: Please upload or capture a photo/video."); return; }
    if (isAnalyzing) { setFormError("Please wait for AI analysis to complete."); return; }
    if (analysisComplete && imageType !== "AI-GENERATED" && damageType === null) {
      setFormError("No damage detected. Please upload a clear photo/video of road damage.");
      return;
    }
    if (!barangay) { setFormError("Please select a Barangay."); return; }
    if (!coords)   { setFormError("GPS coordinates required. Please allow location access."); return; }
    setFormError("");
    setShowSubmitModal(true);
  }, [file, isAnalyzing, analysisComplete, imageType, damageType, barangay, coords]);

  const handleSubmitConfirm = useCallback(async () => {
    setShowSubmitModal(false);
    setIsSubmitting(true);
    setFormError("");
    try {
      const is_flagged    = imageType === "AI-GENERATED";
      const reportPayload = {
        latitude:        coords.lat,
        longitude:       coords.lng,
        barangay,
        street_name:     streetName || null,
        description:     additionalInfo?.trim() || null,
        ai_damage_type:  DAMAGE_TYPE_BACKEND[damageType] ?? null,
        ai_severity:     SEVERITY_BACKEND[severity]      ?? null,
        ai_confidence:   aiConfidence ?? 0.0,
        is_flagged_fake: is_flagged,
        fake_confidence: is_flagged ? 0.9 : 0.0,
      };
      const reportRes = await api.post("/reports", reportPayload);
      if (!reportRes.success) throw new Error(reportRes.error || "Failed to create report.");
      const reportId = reportRes.data?.id ?? reportRes.data?.report_id;
      if (!reportId)  throw new Error("Server did not return a report ID.");
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await api.upload(`/reports/${reportId}/media`, formData);
      if (!uploadRes.success)
        setFormError(`Report #${reportId} saved, but media upload failed: ${uploadRes.error}.`);
      setSubmitSuccess(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setFormError(err.message || "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [imageType, coords, barangay, streetName, additionalInfo, damageType, severity, aiConfidence, file, onClose]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const canSubmit      = !isSubmitting && !isAnalyzing;
  const imageTypeBadge = hfStatus === "error" ? "HF-ERROR" : imageType;
  const recProgress    = (recordingTime / MAX_REC_SECS) * 100;
  const rdPred         = rdPrediction;
  const rdSevStyle     = rdPred ? getSeverityStyle(rdPred.severity) : null;

  // ── NEW: build normalised detection array for overlay ─────────────────────
  // Backend _infer_frame already returns x_norm/y_norm/w_norm/h_norm per box.
  const previewOverlayDetections = (predictionResult?.boxes ?? []).map((b) => ({
    label:      b.label,
    confidence: b.confidence,
    severity:   predictionResult.severity,
    x_norm:     b.x_norm,
    y_norm:     b.y_norm,
    w_norm:     b.w_norm,
    h_norm:     b.h_norm,
  }));

  const viewfinderOverlayDetections = (liveDetection.detected && liveDetection.boxes?.length)
    ? liveDetection.boxes.map((b) => ({
        label:      b.label,
        confidence: b.confidence,
        severity:   liveDetection.severity,
        x_norm:     b.x_norm,
        y_norm:     b.y_norm,
        w_norm:     b.w_norm,
        h_norm:     b.h_norm,
      }))
    : [];

  const rdOverlayDetections = (rdPred?.boxes ?? []).map((b) => ({
    label:      b.label,
    confidence: b.confidence,
    severity:   rdPred.severity,
    x_norm:     b.x_norm,
    y_norm:     b.y_norm,
    w_norm:     b.w_norm,
    h_norm:     b.h_norm,
  }));
  // ── END NEW ───────────────────────────────────────────────────────────────

  const switchTab = useCallback((id) => {
    clearMedia();
    setActiveTab(id);
    stopCamera();
    if (id !== "live") rdStopCamera();
  }, [clearMedia, stopCamera, rdStopCamera]);

  if (showGuide) {
    return <PhotoCaptureGuide onContinue={() => setShowGuide(false)} onClose={onClose} />;
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return ReactDOM.createPortal(
    <div className="snap-overlay">
      <div className="snap-modal">

        <button
          className="snap-close-icon"
          onClick={() => !isSubmitting && setShowDiscardModal(true)}
          disabled={isSubmitting || isAnalyzing}
          aria-label="Close report form">
          <FaTimes />
        </button>

        {/* ══ LEFT PANEL ══ */}
        <div className="snap-left">
          <h2>Visual Evidence</h2>

          {/* Tabs */}
          <div className="snap-tabs" role="tablist">
            {[
              { id: "photo", label: "Photo",     Icon: FaCamera },
              { id: "video", label: "Video",     Icon: FaVideo  },
              { id: "live",  label: "Live Scan", Icon: MdRadar  },
            ].map(({ id, label, Icon }) => (
              <button
                key={id} role="tab" aria-selected={activeTab === id}
                className={`snap-tab ${activeTab === id ? "active" : ""}`}
                onClick={() => switchTab(id)}
                disabled={isSubmitting}>
                <Icon className="tab-icon" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          {/* ── LIVE DETECTION TAB ── */}
          {activeTab === "live" && (
            <div className="rd-root">
              <div className="rd-viewport">
                <div className="rd-scan-grid" aria-hidden="true" />
                <div className="rd-scan-line"  aria-hidden="true" />
                {!rdCameraActive && !rdCameraError && (
                  <div className="rd-placeholder" aria-label="Camera inactive">
                    <div className="rd-placeholder-icon" aria-hidden="true"><FaVideo /></div>
                    <p>CAMERA INACTIVE</p>
                  </div>
                )}
                <video
                  ref={rdVideoRef}
                  className="rd-video"
                  autoPlay playsInline muted
                  style={{ display: rdCameraActive ? "block" : "none" }}
                  aria-label="Live camera feed"
                  onPlay={(e) => setRdVideoSize({
                    width:  e.target.offsetWidth  || 640,
                    height: e.target.offsetHeight || 360,
                  })}
                />

                {/* ── NEW: DetectionOverlay replaces rdCanvasRef + drawDetectionOverlay ── */}
                {rdCameraActive && rdVideoSize.width > 0 && (
                  <DetectionOverlay
                    mode="realtime"
                    detections={rdOverlayDetections}
                    width={rdVideoSize.width}
                    height={rdVideoSize.height}
                    frameCount={rdFps ?? 0}
                  />
                )}
                {/* ── END NEW ── */}

                {["tl","tr","bl","br"].map((pos) => (
                  <span key={pos} aria-hidden="true"
                    className={`rd-corner rd-corner-${pos} ${
                      rdCornerStatus === "locked"    ? "corner-locked"
                      : rdCornerStatus === "detecting" ? "corner-detecting"
                      : "corner-idle"
                    }`} />
                ))}
                <div className={`rd-status-pill rd-status-${rdPillStatus}`} role="status" aria-live="polite">
                  <span className="rd-pulse-dot" aria-hidden="true" />
                  <span>{rdPillLabel}</span>
                </div>
                {rdNotification && (
                  <div className={`rd-notification rd-notif-${rdNotification.type}`} role="alert" aria-live="assertive">
                    <FaExclamationTriangle aria-hidden="true" /> {rdNotification.label} DETECTED
                  </div>
                )}
                {rdCaptureFlash && <div className="rd-flash" aria-hidden="true" />}
                {rdCameraError && (
                  <div className="rd-error" role="alert">
                    <FaExclamationTriangle aria-hidden="true" />
                    <p>{rdCameraError}</p>
                    <button className="rd-btn-retry" onClick={rdStartCamera}>
                      <FaRedo aria-hidden="true" /> Retry
                    </button>
                  </div>
                )}
                {rdCameraActive && rdDistance && (
                  <div className={`rd-distance ${rdDistance.ok ? "dist-ok" : "dist-warn"}`}
                    aria-label={`Distance feedback: ${rdDistance.text}`}>
                    <span className={`rd-dist-dot ${rdDistance.ok ? "ok" : "warn"}`} aria-hidden="true" />
                    {rdDistance.text}
                  </div>
                )}
                <div className="rd-bottom-bar">
                  <RdConfidenceBar confidence={rdConfidence} />
                  <button
                    className={`rd-capture-btn${rdCaptureFlash ? " flashing" : ""}`}
                    onClick={() => rdTriggerCapture(false)}
                    disabled={!rdCameraActive}
                    aria-label="Capture current frame">
                    <span className="rd-capture-inner" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="rd-sidebar">
                <div className="rd-sidebar-header">
                  <span className="rd-sidebar-title">Detection Monitor</span>
                  <span className="rd-sidebar-sub">
                    {rdCameraActive ? "LIVE" : "OFFLINE"}
                    {rdFps    != null && ` · ${rdFps} FPS`}
                    {rdLatency != null && ` · ${rdLatency}ms`}
                  </span>
                </div>
                <div className={`rd-det-card${rdPred ? ` active-${rdPred.label}` : ""}`}>
                  <div className="rd-type-row">
                    <span className={`rd-type-badge${rdPred ? ` badge-${rdPred.label}` : " badge-none"}`}>
                      {rdPred ? rdPred.label.toUpperCase() : "NO DETECTION"}
                    </span>
                    {rdPred && <span className="rd-conf-chip">{Math.round(rdPred.confidence * 100)}%</span>}
                  </div>
                  <RdSeverityChips severity={rdPred?.severity ?? null} />
                  <div className="rd-stat-grid">
                    {[
                      { label: "CONFIDENCE", val: rdPred ? `${Math.round(rdPred.confidence * 100)}%` : "—" },
                      { label: "LATENCY",    val: rdLatency != null ? `${rdLatency}ms` : "—" },
                      { label: "SEVERITY",   val: rdSevStyle ? rdSevStyle.label : "—", color: rdSevStyle?.stroke },
                      { label: "FPS",        val: rdFps ?? "—" },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="rd-stat">
                        <div className="rd-stat-label">{label}</div>
                        <div className="rd-stat-val" style={{ color }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  {rdPred?.inference_time_ms != null && (
                    <div className="rd-infer-time">Model inference: {Math.round(rdPred.inference_time_ms)} ms</div>
                  )}
                </div>
                <div className="rd-dist-card">
                  <div className="rd-dist-title">DISTANCE GUIDANCE</div>
                  <div className="rd-dist-bar-track">
                    <div className="rd-dist-bar-fill" style={{
                      width: rdDistance
                        ? rdDistance.area < 0.02 ? "10%"
                        : rdDistance.area > 0.40 ? "95%"
                        : `${Math.min(85, ((rdDistance.area - 0.02) / 0.38) * 70 + 15)}%`
                        : "0%",
                      background: rdDistance?.ok ? "#22c55e" : rdDistance ? "#f59e0b" : "#374151",
                    }} />
                    <div className="rd-dist-optimal" aria-label="Optimal zone marker" />
                  </div>
                  <div className="rd-dist-ticks">
                    <span>CLOSE</span><span>OPTIMAL (~10m)</span><span>FAR</span>
                  </div>
                  <div className={`rd-dist-zone ${rdDistance?.ok ? "zone-ok" : rdDistance ? "zone-warn" : ""}`}>
                    {rdDistance ? rdDistance.text : "Position camera ~10 m from road damage"}
                  </div>
                </div>
                <RdDetectionLog entries={rdLogEntries} />
                <div className="rd-controls">
                  {!rdCameraActive ? (
                    <button className="rd-ctrl-btn rd-btn-start" onClick={rdStartCamera}>
                      <FaCamera aria-hidden="true" /> Start Camera
                    </button>
                  ) : (
                    <button className="rd-ctrl-btn rd-btn-stop" onClick={rdStopCamera}>
                      <FaStop aria-hidden="true" /> Stop
                    </button>
                  )}
                  <button
                    className={`rd-ctrl-btn rd-btn-icon${rdAudio ? " active" : ""}`}
                    onClick={() => setRdAudio((v) => !v)}
                    aria-pressed={rdAudio} title="Toggle audio feedback">
                    {rdAudio ? <FaMicrophone aria-hidden="true" /> : <FaMicrophoneSlash aria-hidden="true" />}
                  </button>
                  <button
                    className={`rd-ctrl-btn rd-btn-auto${rdAutoCapture ? " active" : ""}`}
                    onClick={() => { setRdAutoCapture((v) => !v); rdHasCapturedRef.current = false; }}
                    aria-pressed={rdAutoCapture} title="Toggle auto-capture">
                    <MdFiberManualRecord aria-hidden="true" /> AUTO
                  </button>
                </div>
                {preview && file && (
                  <div className="rd-captured-preview">
                    <div className="rd-captured-label">
                      <FaCheckCircle aria-hidden="true" /> Frame captured — ready to submit
                      <button className="rd-clear-btn" onClick={clearMedia} aria-label="Remove capture">
                        <FaRegTrashAlt />
                      </button>
                    </div>
                    <img src={preview} alt="Captured frame" className="rd-captured-img" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PHOTO / VIDEO CAMERA VIEWFINDER ── */}
          {activeTab !== "live" && showCamera && (
            <div className="snap-camera-wrapper">
              {cameraError ? (
                <div className="camera-error">
                  <FaExclamationTriangle aria-hidden="true" />
                  <p>{cameraError}</p>
                  <button className="btn-retry" onClick={startCamera}><FaRedo /> Retry</button>
                </div>
              ) : (
                <div
                  className={`camera-viewport${isRecording ? " recording" : ""}`}
                  style={{ position: "relative" }}
                >
                  <video
                    ref={videoRef}
                    className="camera-video"
                    autoPlay playsInline muted
                    onPlay={(e) => setViewfinderSize({
                      width:  e.target.offsetWidth  || 640,
                      height: e.target.offsetHeight || 360,
                    })}
                  />

                  {["tl","tr","bl","br"].map((pos) => (
                    <span key={pos} aria-hidden="true"
                      className={`guide-corner corner-${pos} ${
                        liveDetection.status === "detected" ? "green"
                        : isRecording ? "rec-red" : "red"
                      }`} />
                  ))}

                  {cameraActive && (
                    <div className={`detection-pill pill-${liveDetection.status}`} role="status" aria-live="polite">
                      <span className="dot-pulse" aria-hidden="true" />
                      {liveDetection.status === "detected"
                        ? `${liveDetection.label?.charAt(0).toUpperCase()}${liveDetection.label?.slice(1)} detected — ${Math.round(liveDetection.confidence * 100)}%`
                        : liveDetection.status === "warning"
                        ? liveDetection.distance?.text || "Adjust distance to ~10 m"
                        : "Scanning for road damage…"}
                    </div>
                  )}

                  {/* ── NEW: DetectionOverlay replaces CSS bbox-overlay div ── */}
                  {cameraActive && viewfinderSize.width > 0 && viewfinderOverlayDetections.length > 0 && (
                    <DetectionOverlay
                      mode="realtime"
                      detections={viewfinderOverlayDetections}
                      width={viewfinderSize.width}
                      height={viewfinderSize.height}
                    />
                  )}
                  {/* ── END NEW ── */}

                  {cameraActive && liveDetection.distance && (
                    <div className={`distance-indicator ${liveDetection.distance.ok ? "ok" : "warn"}`} aria-hidden="true">
                      <span className={`dist-dot ${liveDetection.distance.ok ? "" : "red"}`} />
                      {liveDetection.distance.text}
                    </div>
                  )}
                  {cameraActive && !isRecording && (
                    <p className="guidance-text" aria-hidden="true">
                      {activeTab === "video"
                        ? `Up to ${MAX_REC_SECS}s · maintain ~10 m from damage`
                        : "Focus camera · maintain ~10 m distance from damage"}
                    </p>
                  )}
                  {isRecording && (
                    <div className="rec-progress-track" aria-hidden="true">
                      <div className="rec-progress-fill" style={{ width: `${recProgress}%` }} />
                    </div>
                  )}
                </div>
              )}
              {cameraActive && !cameraError && (
                <div className="camera-controls">
                  {activeTab === "photo" ? (
                    <>
                      <button className="btn-capture" onClick={capturePhoto} disabled={capturing} aria-label="Capture photo">
                        {capturing
                          ? <><FaSpinner className="spin-icon" aria-hidden="true" /> Capturing…</>
                          : <><FaCamera /> Capture Photo</>}
                      </button>
                      <button className="btn-stop-cam" onClick={stopCamera}>Stop Camera</button>
                    </>
                  ) : isRecording ? (
                    <>
                      <div className="recording-indicator" role="status" aria-live="polite">
                        <span className="rec-pulse-dot" aria-hidden="true" />
                        REC {recordingTime}s / {MAX_REC_SECS}s
                      </div>
                      <button className="btn-stop-rec" onClick={stopRecordingEarly} aria-label="Stop recording">
                        <FaStop aria-hidden="true" /> Stop
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-capture" onClick={startRecording} aria-label="Start video recording">
                        <FaVideo aria-hidden="true" /> Start Recording
                      </button>
                      <button className="btn-stop-cam" onClick={stopCamera}>Stop Camera</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── UPLOAD BOX ── */}
          {activeTab !== "live" && !showCamera && (
            <div
              className={`snap-upload-box ${isAnalyzing ? "analyzing" : ""}`}
              onClick={() => !preview && !isSubmitting && !isAnalyzing && fileRef.current.click()}
              role="button" aria-label="Upload evidence file"
              tabIndex={preview ? -1 : 0}
              onKeyDown={(e) => e.key === "Enter" && !preview && fileRef.current.click()}
            >
              {preview ? (
                <div className="preview-container" style={{ position: "relative" }}>
                  {activeTab === "video" || (file && isVideoFile(file))
                    ? (
                      <video
                        ref={previewMediaRef}
                        src={preview}
                        className="preview-img"
                        muted autoPlay loop playsInline controls
                        onLoadedMetadata={(e) => setPreviewSize({
                          width:  e.target.offsetWidth,
                          height: e.target.offsetHeight,
                        })}
                      />
                    ) : (
                      <img
                        ref={previewMediaRef}
                        src={preview}
                        alt="Uploaded evidence"
                        className="preview-img"
                        onLoad={(e) => setPreviewSize({
                          width:  e.target.offsetWidth,
                          height: e.target.offsetHeight,
                        })}
                      />
                    )}

                  {/* ── NEW: static overlay after analysis completes ── */}
                  {analysisComplete && previewSize.width > 0 && previewOverlayDetections.length > 0 && (
                    <DetectionOverlay
                      mode="image"
                      detections={previewOverlayDetections}
                      width={previewSize.width}
                      height={previewSize.height}
                      finalResult={{
                        detected:   !!predictionResult && predictionResult.label !== "none",
                        prediction: predictionResult,
                      }}
                    />
                  )}
                  {/* ── END NEW ── */}

                  {!isSubmitting && !isAnalyzing && (
                    <button className="trash-btn" onClick={clearMedia} aria-label="Remove file">
                      <FaRegTrashAlt aria-hidden="true" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="upload-placeholder">
                  <div className="icon-circle" aria-hidden="true">
                    {activeTab === "photo" ? <FaCamera /> : <FaVideo />}
                  </div>
                  <h3>{activeTab === "photo" ? "Upload Photo" : "Upload Video"}</h3>
                  <p>{activeTab === "video" ? "MP4, MOV, or AVI · up to 10s recommended" : "Tap to select a file"}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "photo" && !showCamera && !preview && (
            <button className="btn-use-camera" onClick={openCamera} disabled={isSubmitting || isAnalyzing}>
              <FaCamera aria-hidden="true" /> Use Camera
            </button>
          )}
          {activeTab === "video" && !showCamera && !preview && (
            <button className="btn-use-camera" onClick={openCamera} disabled={isSubmitting || isAnalyzing}>
              <FaVideo aria-hidden="true" /> Record Video
            </button>
          )}

          <input
            ref={fileRef} type="file" hidden
            accept={
              activeTab === "photo"
                ? "image/jpeg,image/jpg,image/png,image/webp"
                : "video/mp4,video/webm,video/quicktime,video/x-msvideo,.mp4,.webm,.mov,.avi"
            }
            onChange={handleFileChange}
            aria-hidden="true"
          />

          {/* AI badges — Photo/Video tabs */}
          {activeTab !== "live" && (
            <div className="ai-classification-bottom">
              {isAnalyzing ? (
                <div className="analyzing-row" role="status" aria-live="polite">
                  <FaSpinner className="spin-icon" aria-hidden="true" />
                  <span className="analyzing-text">
                    {analysisProgress || (activeTab === "video" ? "Analyzing video…" : "Analyzing image…")}
                  </span>
                </div>
              ) : (
                <label id="image-type-label">
                  {activeTab === "video" ? "MEDIA TYPE (AI CLASSIFIED)" : "IMAGE TYPE (AI CLASSIFIED)"}
                </label>
              )}
              <div className="classification-buttons" role="group" aria-labelledby="image-type-label">
                <button className={`class-btn ${imageTypeBadge === "REAL" ? "active-real" : ""} ${imageTypeBadge === "HF-ERROR" ? "active-hf-error" : ""}`}
                  disabled aria-pressed={imageType === "REAL"}>REAL</button>
                <button className={`class-btn ${imageTypeBadge === "AI-GENERATED" ? "active-ai" : ""}`}
                  disabled aria-pressed={imageType === "AI-GENERATED"}>AI-GENERATED</button>
              </div>
              {imageType === "AI-GENERATED" && (
                <p className="flagged-note" role="alert">Flagged — held for admin review before publishing.</p>
              )}
              {analyzeError && !isAnalyzing && (
                <p className={damageType === null && analysisComplete && imageType !== "AI-GENERATED"
                    ? "analyze-error" : "analyze-warning"} role="alert">
                  <FaExclamationTriangle aria-hidden="true" style={{ marginRight: 4 }} />
                  {analyzeError}
                </p>
              )}
              {aiConfidence !== null && !isAnalyzing && (
                <div className="confidence-bar-wrapper" aria-label={`ML confidence: ${Math.round(aiConfidence * 100)}%`}>
                  <div className="confidence-bar-header">
                    <span>ML Confidence</span>
                    <span className="confidence-pct">{Math.round(aiConfidence * 100)}%</span>
                  </div>
                  <div className="confidence-bar-track">
                    <div className="confidence-bar-fill" style={{ width: `${aiConfidence * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI badges — Live tab */}
          {activeTab === "live" && file && (
            <div className="ai-classification-bottom" style={{ marginTop: 12 }}>
              {isAnalyzing ? (
                <div className="analyzing-row" role="status" aria-live="polite">
                  <FaSpinner className="spin-icon" aria-hidden="true" />
                  <span className="analyzing-text">Analyzing captured frame…</span>
                </div>
              ) : (
                <label id="image-type-label-live">IMAGE TYPE (AI CLASSIFIED)</label>
              )}
              <div className="classification-buttons" role="group" aria-labelledby="image-type-label-live">
                <button className={`class-btn ${imageTypeBadge === "REAL" ? "active-real" : ""}`} disabled>REAL</button>
                <button className={`class-btn ${imageTypeBadge === "AI-GENERATED" ? "active-ai" : ""}`} disabled>AI-GENERATED</button>
              </div>
              {analyzeError && !isAnalyzing && (
                <p className="analyze-warning" role="alert">
                  <FaExclamationTriangle aria-hidden="true" style={{ marginRight: 4 }} />{analyzeError}
                </p>
              )}
              {aiConfidence !== null && !isAnalyzing && (
                <div className="confidence-bar-wrapper">
                  <div className="confidence-bar-header">
                    <span>ML Confidence</span>
                    <span className="confidence-pct">{Math.round(aiConfidence * 100)}%</span>
                  </div>
                  <div className="confidence-bar-track">
                    <div className="confidence-bar-fill" style={{ width: `${aiConfidence * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div className="snap-right">
          <div className="top-classifications">
            <div className="class-group">
              <label id="damage-type-label">
                DAMAGE TYPE (AI CLASSIFIED)
                {isAnalyzing && <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 6 }} />}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="damage-type-label">
                <button className={`class-btn ${damageType === "POTHOLE" ? "active-pothole" : ""}`}
                  disabled aria-pressed={damageType === "POTHOLE"}>POTHOLE</button>
                <button className={`class-btn ${damageType === "CRACK" ? "active-crack" : ""}`}
                  disabled aria-pressed={damageType === "CRACK"}>CRACK</button>
              </div>
            </div>
            <div className="class-group">
              <label id="severity-label">
                SEVERITY (AI CLASSIFIED)
                {isAnalyzing && <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 6 }} />}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="severity-label">
                <button className={`class-btn ${severity === "NON-CRITICAL" ? "active-non-critical" : ""}`}
                  disabled aria-pressed={severity === "NON-CRITICAL"}>NON-CRITICAL</button>
                <button className={`class-btn ${severity === "CRITICAL" ? "active-critical" : ""}`}
                  disabled aria-pressed={severity === "CRITICAL"}>CRITICAL</button>
              </div>
            </div>
          </div>

          <div className="snap-location-block">
            <div className="snap-location-header">
              <label>LOCATION &amp; BARANGAY</label>
              <button className="btn-refresh-loc" onClick={fetchLocation} disabled={locationLoading} aria-label="Refresh location">
                {locationLoading ? <FaSpinner className="spin-icon" aria-hidden="true" /> : <FaRedo aria-hidden="true" />}
              </button>
            </div>
            <div className="input-with-icons">
              <MdOutlineLocationOn className="input-icon-left" aria-hidden="true" />
              <input id="location-input" type="text"
                value={coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : locationLoading ? "Fetching location…" : ""}
                readOnly placeholder="Fetching location…" aria-label="GPS coordinates (auto-detected)" />
              <div className="input-icon-right" aria-hidden="true"><FaMapMarkerAlt /></div>
            </div>
            <div className="snap-form-row" style={{ marginTop: 8 }}>
              <div className="snap-form-group half">
                <label htmlFor="city-input">CITY</label>
                <input id="city-input" type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="snap-form-group half">
                <label htmlFor="street-input">STREET / LANDMARK</label>
                <input id="street-input" type="text" value={streetName}
                  onChange={(e) => setStreetName(e.target.value)}
                  placeholder="Auto-detected from GPS" disabled={isSubmitting} />
              </div>
            </div>
          </div>

          <div className="snap-form-row">
            <div className="snap-form-group half">
              <label htmlFor="reporter-name">REPORTER'S NAME</label>
              <input id="reporter-name" type="text" placeholder="Enter your name"
                value={reporterName} onChange={(e) => setReporterName(e.target.value)} disabled={isSubmitting} />
            </div>
            <div className="snap-form-group half">
              <label htmlFor="barangay-select">BARANGAY <span style={{ color: "red" }} aria-hidden="true">*</span></label>
              <select id="barangay-select" value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                className={!barangay ? "placeholder-select" : "black-text"}
                disabled={isSubmitting} aria-required="true">
                <option value="" disabled hidden>Select Barangay</option>
                {MALABON_BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="snap-form-group">
            <label htmlFor="additional-info">ADDITIONAL INFORMATION</label>
            <textarea id="additional-info" rows="3" maxLength={1000}
              placeholder="Describe the damage (e.g., traffic impact, depth, visibility risk)"
              value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} disabled={isSubmitting} />
          </div>

          {formError && (
            <div className="error-message" role="alert">
              <FaExclamationCircle aria-hidden="true" style={{ marginRight: 6 }} />{formError}
            </div>
          )}
          {submitSuccess && (
            <div className="success-message" role="status">
              <FaCheckCircle aria-hidden="true" style={{ marginRight: 6 }} />Report submitted successfully!
            </div>
          )}

          <div className="snap-actions">
            <button className="btn-discard" onClick={() => setShowDiscardModal(true)}
              disabled={isSubmitting || isAnalyzing}>Discard</button>
            <button className="btn-submit" onClick={validateForm} disabled={!canSubmit} aria-busy={isSubmitting}>
              {isSubmitting
                ? <><FaSpinner className="spin-icon" aria-hidden="true" style={{ marginRight: 6 }} />Submitting…</>
                : isAnalyzing
                ? <><FaSpinner className="spin-icon" aria-hidden="true" style={{ marginRight: 6 }} />Analyzing…</>
                : "Submit Final Record"}
            </button>
          </div>
        </div>

        {/* Discard modal */}
        {showDiscardModal && (
          <div className="popup-overlay" role="dialog" aria-modal="true" aria-labelledby="discard-title">
            <div className="popup-modal">
              <div className="popup-icon red-icon" aria-hidden="true"><FaExclamationCircle /></div>
              <h3 id="discard-title">Discard Report?</h3>
              <p>Are you sure?<br />All progress on this report will be lost.</p>
              <div className="popup-buttons">
                <button className="btn-popup-cancel" onClick={() => setShowDiscardModal(false)}>Cancel</button>
                <button className="btn-popup-red" onClick={() => { setShowDiscardModal(false); onClose(); }}>Discard</button>
              </div>
            </div>
          </div>
        )}

        {/* Submit confirm modal */}
        {showSubmitModal && (
          <div className="popup-overlay" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <div className="popup-modal">
              <div className="popup-icon green-icon" aria-hidden="true"><FaCheckCircle /></div>
              <h3 id="submit-title">Confirm Submission</h3>
              <p>
                Ready to send this report?
                {imageType === "AI-GENERATED" && (
                  <><br /><strong style={{ color: "#ef4444" }}>This will be flagged for admin review.</strong></>
                )}
                <br />You cannot edit after posting.
              </p>
              <div className="popup-buttons">
                <button className="btn-popup-cancel" onClick={() => setShowSubmitModal(false)}>Cancel</button>
                <button className="btn-popup-green" onClick={handleSubmitConfirm}>Yes, Submit</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

export default CreateReport;