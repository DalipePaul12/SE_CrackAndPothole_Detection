/**
 * CreateReport.jsx — Refactored with YOLOv11 Segmentation Mask Support
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   1. Replaced old SegmentationMask (rect-only) with new polygon-based renderer
 *   2. Added useNaturalSize hook so masks scale correctly with the actual image
 *   3. normalizePrediction() maps backend payload → standard shape for overlay
 *   4. predictionResult.all_detections (multi-mask) supported
 *   5. Added scanning animation grid + scan-line during analysis
 *   6. Multi-detection badge row replaces single preview-result-badge
 *   7. All other logic, hooks, modals, location, video flow — UNCHANGED
 */

import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import ReactDOM from "react-dom";
import "./CreateReport.css";
import {
  FaCamera, FaVideo, FaMapMarkerAlt, FaRegTrashAlt,
  FaTimes, FaExclamationCircle, FaCheckCircle,
  FaSpinner, FaExclamationTriangle, FaRedo, FaStop,
  FaFilm, FaShieldAlt, FaBolt, FaLayerGroup,
  FaChevronDown, FaChevronUp, FaExpand,
} from "react-icons/fa";
import { MdOutlineLocationOn } from "react-icons/md";
import { useUser } from "../../hooks/useUser";
import { analyzeMedia, analyzeVideo } from "../../api/ml";
import { createReport, uploadMedia } from "../../api/reports";
import { useOfflineQueue, enqueueOfflineReport } from "../../hooks/useOfflineQueue";
import PhotoCaptureGuide from "../../components/PhotoCaptureGuide";
import DetectionOverlay from "../../components/DetectionOverlay";

// ─── NEW: Import the refactored segmentation overlay ──────────────────────────
import SegmentationMask, {
  useNaturalSize,
  normalizePrediction,
} from "../../components/SegmentationMask";
import "../../components/SegmentationMask.css";

import {
  detectBarangay,
  NOMINATIM_URL,
  MALABON_BARANGAYS,
  DEFAULT_CITY,
  DEFAULT_BARANGAY,
} from "../../utils/geolocationUtils";

// ─── Constants (UNCHANGED) ────────────────────────────────────────────────────
const DAMAGE_TYPE_BACKEND     = { POTHOLE: "pothole", CRACK: "crack" };
const SEVERITY_BACKEND = {
  critical:     "critical",
  non_critical: "non_critical",
}
const REALTIME_CONF_THRESHOLD = 0.60;
const MAX_REC_SECS            = 10;
const MAX_ANALYSIS_RETRIES    = 3;
const ANGLE_MIN               = 45;
const ANGLE_MAX               = 75;

const VIDEO_MIME_TYPES = new Set([
  "video/mp4","video/webm","video/quicktime",
  "video/x-msvideo","video/x-matroska","video/ogg","application/octet-stream",
]);
const VIDEO_EXTENSIONS = new Set([".mp4",".webm",".mov",".avi",".mkv"]);

function isVideoFile(file) {
  if (!file) return false;
  if (VIDEO_MIME_TYPES.has((file.type || "").toLowerCase())) return true;
  const ext = "." + (file.name || "").split(".").pop().toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

// ─── Shared helpers (UNCHANGED) ───────────────────────────────────────────────
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
  if (["critical","high","severe"].includes(l))                    return "CRITICAL";
  if (["low","non_critical","moderate","medium"].includes(l))      return "NON_CRITICAL";
  return null;
}

async function snapFrameBlob(videoEl, w, h) {
  const canvas   = document.createElement("canvas");
  canvas.width   = w ?? videoEl.videoWidth  ?? 640;
  canvas.height  = h ?? videoEl.videoHeight ?? 480;
  canvas.getContext("2d").drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

function distanceFeedback(bbox) {
  if (!bbox || bbox.length < 4) return { ok: false, text: "No object detected", area: 0 };
  const [x1, y1, x2, y2] = bbox;
  const area = Math.max(0, (x2 - x1) * (y2 - y1));
  if (area < 0.03) return { ok: false, text: "Too far — move closer (~1.5 m)", area };
  if (area > 0.35) return { ok: false, text: "Too close — step back (~1.5 m)", area };
  const est = area > 0 ? Math.round(1.5 / Math.sqrt(area / 0.12)) : 0;
  return { ok: true, text: `~${est} m — good framing`, area };
}

// ─── ReferenceCaptureCircle (UNCHANGED) ───────────────────────────────────────
function ReferenceCaptureCircle() {
  return (
    <div className="capture-reference-circle" aria-hidden="true">
      <div className="capture-reference-text">
        Keep damage inside circle · Stand ~1.5m back
      </div>
    </div>
  );
}

// ─── AngleHUD (UNCHANGED) ─────────────────────────────────────────────────────
function AngleHUD({ angle, valid }) {
  if (angle === null) return null;
  return (
    <div className={`angle-hud ${valid ? "good" : "bad"}`}
      aria-label={`Phone angle: ${Math.round(angle)}°`}>
      <span className="angle-hud-value">{Math.round(angle)}°</span>
      <span className="angle-hud-label">
        {valid ? "Angle OK" : `Aim ${ANGLE_MIN}°–${ANGLE_MAX}°`}
      </span>
    </div>
  );
}

// ─── DetectionFilmstrip (UNCHANGED) ───────────────────────────────────────────
function DetectionFilmstrip({ snapshots }) {
  const [lightbox, setLightbox] = useState(null);
  if (!snapshots || snapshots.length === 0) return null;
  return (
    <>
      <div className="filmstrip-wrapper">
        <div className="filmstrip-header">
          <FaFilm className="filmstrip-icon" aria-hidden="true" />
          <span>Detection Frames</span>
          <span className="filmstrip-count">
            {snapshots.length} frame{snapshots.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="filmstrip-gallery">
          {snapshots.map((snap, i) => (
            <button key={i} className="filmstrip-card" onClick={() => setLightbox(i)}
              aria-label={`Frame ${snap.frame}: ${snap.label} at ${Math.round(snap.confidence * 100)}%`}>
              <div className="filmstrip-card-img-wrap">
                <img src={`data:image/jpeg;base64,${snap.image_b64}`}
                  alt={`${snap.label} frame ${snap.frame}`} className="filmstrip-card-img" />
                <div className="filmstrip-card-expand"><FaExpand /></div>
              </div>
              <div className="filmstrip-card-meta">
                <span className={`filmstrip-card-type type-${snap.label}`}>
                  {snap.label.toUpperCase()}
                </span>
                <span className="filmstrip-card-conf">{Math.round(snap.confidence * 100)}%</span>
                <span className="filmstrip-card-frame">#{snap.frame}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {lightbox !== null && snapshots[lightbox] && ReactDOM.createPortal(
        <div className="filmstrip-lightbox" role="dialog" aria-modal="true"
          onClick={() => setLightbox(null)}>
          <div className="filmstrip-lb-inner" onClick={(e) => e.stopPropagation()}>
            <button className="filmstrip-lb-close" onClick={() => setLightbox(null)} aria-label="Close">
              <FaTimes />
            </button>
            <div className="filmstrip-lb-meta">
              <span className={`filmstrip-card-type type-${snapshots[lightbox].label}`}>
                {snapshots[lightbox].label.toUpperCase()}
              </span>
              <span className="filmstrip-lb-conf">
                {Math.round(snapshots[lightbox].confidence * 100)}% confidence
              </span>
              <span className="filmstrip-lb-frame">Frame #{snapshots[lightbox].frame}</span>
            </div>
            <img src={`data:image/jpeg;base64,${snapshots[lightbox].image_b64}`}
              alt="Expanded detection frame" className="filmstrip-lb-img" />
            <div className="filmstrip-lb-nav">
              <button className="filmstrip-lb-btn"
                onClick={() => setLightbox((p) => Math.max(0, p - 1))}
                disabled={lightbox === 0}>← Prev</button>
              <span className="filmstrip-lb-pos">{lightbox + 1} / {snapshots.length}</span>
              <button className="filmstrip-lb-btn"
                onClick={() => setLightbox((p) => Math.min(snapshots.length - 1, p + 1))}
                disabled={lightbox === snapshots.length - 1}>Next →</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function HFConfidenceBar({ confidence, status, rawScores }) {
  if (confidence === null || confidence === undefined) return null;
  
  const isAI = status === "rejected";
  
  // FIXED: Use the correct scores from backend
  // Backend sends:
  // - confidence = artificial_score when AI, real_score when REAL
  // - rawScores._artificial_score = raw AI score
  // - rawScores._real_score = raw real score
  
  const artificialScore = rawScores?._artificial_score ?? 0;
  const realScore = rawScores?._real_score ?? 0;
  
  // Display: show the relevant score based on status
  const displayPct = isAI 
    ? Math.round(artificialScore * 100)   // AI: show AI confidence in red
    : Math.round(realScore * 100);        // REAL: show real confidence in green
  
  const fill = isAI
    ? "linear-gradient(90deg,#ef4444,#dc2626)"   // Red = AI
    : "linear-gradient(90deg,#22c55e,#16a34a)";  // Green = Real
  
  const labelText = isAI 
    ? `AI-Generated Confidence`
    : `Authenticity Confidence`;

  return (
    <div className="hf-confidence-bar-wrapper"
      aria-label={`${labelText}: ${displayPct}%`}>
      <div className="hf-confidence-bar-header">
        <span>{labelText}</span>
        <span className="hf-confidence-pct" style={{ color: isAI ? "#ef4444" : "#22c55e" }}>
          {displayPct}%
        </span>
      </div>
      <div className="hf-bar-track">
        <div className="hf-bar-fill" style={{ 
          width: `${displayPct}%`, 
          background: fill 
        }} />
      </div>
      {isAI && (
        <p className="flagged-note" style={{ color: "#ef4444", fontSize: 12, marginTop: 4 }}>
           This image appears to be AI-generated
        </p>
      )}
    </div>
  );
}

// ─── LiabilityDisclaimer (UNCHANGED) ─────────────────────────────────────────
function LiabilityDisclaimer({ accepted, onToggle }) {
  return (
    <div className="liability-disclaimer" role="group" aria-labelledby="liability-title">
      <FaExclamationTriangle className="liability-icon" aria-hidden="true" />
      <div className="liability-body">
        <strong id="liability-title" className="liability-title">Legal Disclaimer</strong>
        <p className="liability-text">
          By submitting, you confirm this photo/video accurately depicts real road damage
          in your location. False or misleading reports may result in account suspension.
          Report data may be shared with local government units for road repair.
        </p>
        <label className="liability-check">
          <input type="checkbox" checked={accepted}
            onChange={(e) => onToggle(e.target.checked)} aria-required="true" />
          <span>I confirm this is authentic evidence</span>
        </label>
      </div>
    </div>
  );
}

// ─── ReviewWarning (UNCHANGED) ────────────────────────────────────────────────
function ReviewWarning({ reason }) {
  if (!reason) return null;
  return (
    <div className="review-warning" role="alert">
      <FaExclamationTriangle aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>This report will be flagged for admin review: {reason}</span>
    </div>
  );
}

// ─── AIAnalysisSummary (UNCHANGED) ────────────────────────────────────────────
function AIAnalysisSummary({
  damageType, severity, aiConfidence, coords,
  barangay, file, analysisComplete, imageType, isAnalyzing,
}) {
  const [expanded, setExpanded] = useState(true);
  const riskScore = useMemo(() => {
    if (!analysisComplete || !damageType || aiConfidence == null) return null;
    let score = aiConfidence * 100;
    if (severity === "CRITICAL")  score = Math.min(100, score * 1.30);
    if (damageType === "POTHOLE") score = Math.min(100, score * 1.10);
    return Math.round(score);
  }, [damageType, severity, aiConfidence, analysisComplete]);

  const riskLevel = riskScore == null ? null
    : riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low";

  const RISK_LABELS = { high: "HIGH RISK", medium: "MODERATE", low: "LOW RISK" };
  const RISK_COLORS = { high: "#ef4444",   medium: "#f59e0b",  low: "#22c55e"  };

  const checks = [
    { label: "Media uploaded",  ok: !!file,                             warn: false },
    { label: "GPS acquired",    ok: !!coords,                           warn: false },
    { label: "Street selected", ok: !!barangay,                         warn: false },
    { label: "Damage detected", ok: analysisComplete && !!damageType,   warn: analysisComplete && !damageType },
    {
      label: imageType === "AI-GENERATED" ? "Flagged — admin review" : "Authenticity verified",
      ok: imageType === "REAL",
      warn: imageType === "AI-GENERATED",
    },
  ];
  const readyCount = checks.filter((c) => c.ok).length;
  const readyPct   = Math.round((readyCount / checks.length) * 100);
  const allReady   = readyCount === checks.length;

  if (!isAnalyzing && !file) return null;
  return (
    <div className="ais-card">
      <button className="ais-header" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <div className="ais-header-left">
          <FaBolt className="ais-header-icon" aria-hidden="true" />
          <span className="ais-header-title">AI Analysis Summary</span>
        </div>
        <div className="ais-header-right">
          {isAnalyzing ? (
            <div className="ais-header-badge ais-badge-scanning">
              <FaSpinner className="spin-icon" aria-hidden="true" /> Scanning
            </div>
          ) : allReady ? (
            <div className="ais-header-badge ais-badge-ready">Ready</div>
          ) : (
            <div className="ais-header-badge ais-badge-pending">{readyCount}/{checks.length}</div>
          )}
          {riskScore != null && (
            <span className="ais-risk-chip" style={{ color: RISK_COLORS[riskLevel] }}>
              {riskScore}/100
            </span>
          )}
          <span className="ais-toggle-icon">
            {expanded ? <FaChevronUp /> : <FaChevronDown />}
          </span>
        </div>
      </button>
      {expanded && (
        <div className="ais-body">
          <div className="ais-metrics-row">
            {[
              { label: "Type",     value: damageType ?? (isAnalyzing ? "…" : "—"), cls: damageType === "CRACK" ? "val-crack" : damageType === "POTHOLE" ? "val-pothole" : "" },
              { label: "Severity", value: severity ?? (isAnalyzing ? "…" : "—"),   cls: severity === "CRITICAL" ? "val-critical" : severity === "NON_CRITICAL" ? "val-safe" : "" },
              { label: "Conf.",    value: aiConfidence != null ? `${Math.round(aiConfidence * 100)}%` : (isAnalyzing ? "…" : "—"), cls: aiConfidence >= 0.7 ? "val-safe" : aiConfidence >= 0.4 ? "val-warn" : "" },
              { label: "Auth",     value: imageType ?? (isAnalyzing ? "…" : "—"),  cls: imageType === "REAL" ? "val-safe" : imageType === "AI-GENERATED" ? "val-critical" : "" },
            ].map(({ label, value, cls }) => (
              <div key={label} className="ais-metric-compact">
                <span className="ais-metric-label">{label}</span>
                <span className={`ais-metric-value ${cls}`}>{value}</span>
              </div>
            ))}
          </div>
          {riskScore != null && (
            <div className="ais-risk-compact">
              <div className="ais-risk-row">
                <span className="ais-risk-label">
                  <FaShieldAlt style={{ marginRight: 4 }} aria-hidden="true" />Risk
                </span>
                <span className="ais-risk-value" style={{ color: RISK_COLORS[riskLevel] }}>
                  {riskScore}/100 · {RISK_LABELS[riskLevel]}
                </span>
              </div>
              <div className="ais-risk-track">
                <div className="ais-risk-fill" style={{
                  width: `${riskScore}%`,
                  background: riskLevel === "high"
                    ? "linear-gradient(90deg,#f59e0b,#ef4444)"
                    : riskLevel === "medium"
                    ? "linear-gradient(90deg,#22c55e,#f59e0b)"
                    : "linear-gradient(90deg,#22c55e,#86efac)",
                }} />
              </div>
            </div>
          )}
          <div className="ais-readiness-compact">
            <div className="ais-readiness-row">
              <span className="ais-readiness-label">
                <FaLayerGroup style={{ marginRight: 4 }} aria-hidden="true" />Readiness
              </span>
              <span className="ais-readiness-pct"
                style={{ color: allReady ? "#22c55e" : "var(--cr-text-muted)" }}>
                {readyPct}%
              </span>
            </div>
            <div className="ais-readiness-track">
              <div className="ais-readiness-fill" style={{
                width: `${readyPct}%`,
                background: allReady ? "#22c55e" : "var(--cr-primary)",
              }} />
            </div>
          </div>
          <div className="ais-checklist-compact">
            {checks.map(({ label, ok, warn }) => {
              const dot = ok ? "#22c55e" : warn ? "#f59e0b" : "var(--cr-border)";
              return (
                <div key={label}
                  className={`ais-check-item-compact ${ok ? "ais-ok" : warn ? "ais-warn" : "ais-pend"}`}>
                  <span className="ais-check-dot" style={{ background: dot }} />
                  <span className="ais-check-label">{label}</span>
                  {ok   && <FaCheckCircle   style={{ color: "#22c55e", fontSize: 9, flexShrink: 0 }} />}
                  {warn && <FaExclamationTriangle style={{ color: "#f59e0b", fontSize: 9, flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ─── Main Component ───────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════

function CreateReport({ onClose }) {
  const { profile } = useUser();

  const reporterName = useMemo(() => {
    return profile?.full_name || profile?.name || profile?.display_name
      || profile?.username || profile?.email || "Reporter";
  }, [profile]);

  const userId = useMemo(() => {
    return profile?.id || profile?.user_id || profile?.uid || null;
  }, [profile]);

  // ── State (UNCHANGED except allDetections) ─────────────────────────────────
  const [showGuide,    setShowGuide]    = useState(true);
  const [activeTab,    setActiveTab]    = useState("photo");
  const [showCamera,   setShowCamera]   = useState(false);
  const [file,         setFile]         = useState(null);
  const [preview,      setPreview]      = useState(null);

  const [cameraActive,  setCameraActive]  = useState(false);
  const [cameraError,   setCameraError]   = useState(null);
  const [capturing,     setCapturing]     = useState(false);
  const [isRecording,   setIsRecording]   = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveDetection, setLiveDetection] = useState({
    detected: false, label: null, confidence: 0,
    bbox: null, distance: null, status: "idle",
  });

  const [phoneAngle, setPhoneAngle] = useState(null);
  const [angleValid, setAngleValid] = useState(false);
  const [previewSize,    setPreviewSize]    = useState({ width: 0, height: 0 });
  const [viewfinderSize, setViewfinderSize] = useState({ width: 0, height: 0 });
  const [detectionSnapshots, setDetectionSnapshots] = useState([]);

  const [isAnalyzing,      setIsAnalyzing]      = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [analyzeError,     setAnalyzeError]     = useState(null);
  const [retryCount,       setRetryCount]       = useState(0);
  const [hfStatus,         setHfStatus]         = useState(null);
  const [hfConfidence,     setHfConfidence]     = useState(null);
  const [hfModel,          setHfModel]          = useState(null);
  const [hfRawScores,      setHfRawScores]      = useState(null);
  const [imageType,        setImageType]        = useState(null);
  const [damageType,       setDamageType]       = useState(null);
  const [severity,         setSeverity]         = useState(null);
  const [aiConfidence,     setAiConfidence]     = useState(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);

  // ── NEW: all detections array for multi-mask overlay ──────────────────────
  const [allDetections, setAllDetections] = useState([]);

  const [requiresReview, setRequiresReview] = useState(false);
  const [reviewReason,   setReviewReason]   = useState(null);
  // ── Manual-review fallback: unlocked after MAX_ANALYSIS_RETRIES failed
  // retries, lets the user bypass the AI-analysis requirement instead of
  // being stuck unable to submit at all when the AI/YOLO service is down.
  const [manualReviewOverride, setManualReviewOverride] = useState(false);
  const [isHybrid,        setIsHybrid]        = useState(false);
  const [secondaryDamage, setSecondaryDamage] = useState(null);
  const [detectionNote,   setDetectionNote]   = useState(null);

  const [coords,          setCoords]          = useState(null);
  const [city,            setCity]            = useState(DEFAULT_CITY);
  const [barangay,        setBarangay]        = useState("");
  const [streetName,      setStreetName]      = useState("");
  const [locationLoading, setLocationLoading] = useState(false);

  const [additionalInfo,    setAdditionalInfo]    = useState("");
  const [disclaimerAccepted,setDisclaimerAccepted]= useState(false);
  const [formError,         setFormError]         = useState("");
  const [isSubmitting,      setIsSubmitting]      = useState(false);
  const [submitSuccess,     setSubmitSuccess]     = useState(false);
  const [showDiscardModal,  setShowDiscardModal]  = useState(false);
  const [showSubmitModal,   setShowSubmitModal]   = useState(false);

  // ── Offline queue toasts ─────────────────────────────────────────────────
  const [offlineToasts, setOfflineToasts] = useState([]);
  const pushOfflineToast = useCallback((toast) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setOfflineToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setOfflineToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const { isOnline } = useOfflineQueue({
    onResult: ({ success, error, reportId, partial }) => {
      if (success) {
        pushOfflineToast({ type: "success", message: `Queued report #${reportId} submitted successfully.` });
      } else if (partial) {
        // Report was created, but its photo/video still needs to upload —
        // distinct from a full submission failure.
        pushOfflineToast({
          type: "warning",
          message: `Report #${reportId} was submitted, but the photo/video upload failed. It will keep retrying — the report itself is saved.`,
        });
      } else {
        pushOfflineToast({ type: "error", message: error || "A queued report failed to submit." });
      }
    },
  });

  // ── Refs ────────────────────────────────────────────────────────────────────
  const fileRef          = useRef();
  const videoRef         = useRef();
  const streamRef        = useRef(null);
  const detectionLoopRef = useRef(null);
  const analysisIdRef    = useRef(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const recordTimerRef   = useRef(null);
  const previewMediaRef  = useRef(null);
  const angleRef         = useRef(null);

  // ── NEW: natural image size via hook (for correct mask scaling) ────────────
  // ── NEW: natural image size via hook (for correct mask scaling) ────────────
  const naturalSize = useNaturalSize(previewMediaRef);

  // ── FIX: ResizeObserver for reliable previewSize regardless of load timing ─
  useEffect(() => {
    const el = previewMediaRef.current;
    if (!el || !preview) return;
    
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setPreviewSize({ width, height });
      }
    });
    
    ro.observe(el);
    return () => ro.disconnect();
  }, [preview]);

  // ── Analysis reset ─────────────────────────────────────────────────────────
  const resetAnalysis = useCallback(() => {
    setImageType(null);
    setHfStatus(null);
    setHfConfidence(null);
    setHfModel(null);
    setHfRawScores(null);
    setDamageType(null);
    setSeverity(null);
    setAiConfidence(null);
    setAnalyzeError(null);
    setIsAnalyzing(false);
    setAnalysisComplete(false);
    setAnalysisProgress(null);
    setPredictionResult(null);
    setAllDetections([]);
    setPreviewSize({ width: 0, height: 0 });
    setDetectionSnapshots([]);
    setIsHybrid(false);
    setSecondaryDamage(null);
    setDetectionNote(null);
    setRequiresReview(false);
    setReviewReason(null);
  }, []);

  // ── runFullAnalysis — CHANGED: extract allDetections from backend ──────────
  const runFullAnalysis = useCallback(async (f) => {
    const thisId = ++analysisIdRef.current;
    resetAnalysis();
    setIsAnalyzing(true);

    try {
      let result;

      if (isVideoFile(f)) {
        // ── VIDEO PATH (unchanged logic, added allDetections extract) ──────
        result = await analyzeVideo(f, (msg) => {
          if (analysisIdRef.current === thisId) setAnalysisProgress(msg);
        });
        if (analysisIdRef.current !== thisId) return;
        if (!result.success) {
          setAnalyzeError(result.error || "Video analysis failed.");
          setAnalysisComplete(true); return;
        }

        const vidAIVal = result.data?.ai_validation;
        if (vidAIVal) {
          const s = vidAIVal.status ?? "skipped";
          setHfStatus(s);
          setHfConfidence(vidAIVal.confidence ?? null);
          setHfModel(vidAIVal.model ?? null);
          if (s === "approved_for_classification" || s === "skipped") {
            setImageType("REAL");
          } else if (s === "rejected") {
            setImageType("AI-GENERATED");
            setRequiresReview(true);
            setReviewReason("AI-generated image detected");
          }
        } else {
          setHfStatus("skipped"); setImageType("REAL");
        }

        setDetectionSnapshots(result.data?.analytics?.detection_snapshots ?? []);
        setIsHybrid(result.data?.is_hybrid ?? false);
        setSecondaryDamage(result.data?.secondary_damage ?? null);
        setDetectionNote(result.data?.detection_note ?? null);

        const prediction = result.data?.prediction;
        if (result.data?.detected && prediction) {
          const dt   = normalizeDamageType(prediction.label);
          const sv   = normalizeSeverity(prediction.severity);
          const conf = prediction.confidence ?? null;
          setDamageType(dt);
          setSeverity(sv);
          setAiConfidence(conf);
          setPredictionResult(prediction);

          // ── NEW: normalise detections for mask overlay ─────────────────
          const rawDets = result.data?.all_detections ?? [];
          console.log('[DEBUG] all_detections:', JSON.stringify(rawDets, null, 2));
          setAllDetections(rawDets.map(normalizePrediction).filter(Boolean));

          if (!dt) setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
        } else {
          setDamageType(null);
          setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
        }

      } else {
        // ── IMAGE PATH ────────────────────────────────────────────────────
        result = await analyzeMedia(f);
        if (analysisIdRef.current !== thisId) return;
        if (!result.success) {
          setAnalyzeError(result.error || "Analysis failed.");
          setAnalysisComplete(true); return;
        }

        const { ai_validation, prediction } = result.data ?? {};

if (ai_validation && typeof ai_validation === "object") {
  const hfStat = ai_validation.status;

  setHfStatus(hfStat ?? null);
  setHfConfidence(ai_validation.confidence ?? null);
  setHfModel(ai_validation.model ?? null);
  setHfRawScores(ai_validation.raw_scores ?? null);
  // Reset only review flags here, NOT analyzeError
  setRequiresReview(false);
  setReviewReason(null);

  switch (hfStat) {
    case "approved_for_classification":
      setImageType("REAL");
      break;

    case "skipped":
      // HF unavailable / token missing — treat as real, don't block submission
      setImageType("REAL");
      break;

    case "rejected":
      setImageType("AI-GENERATED");
      setRequiresReview(true);
      setReviewReason("AI-generated image detected");
      break;

    case "pending":
    case "processing":
      setImageType(null);
      setAnalyzeError("AI check is still processing. Please wait and re-upload.");
      break;

    case "error":
    case "failed":
    case "unavailable":
      // Soft-fail: let user submit but flag for review
      setImageType("REAL");
      setRequiresReview(true);
      setReviewReason("AI authenticity check unavailable — flagged for manual review");
      break;

    default:
      console.warn("[HF] Unexpected ai_validation.status:", hfStat, ai_validation);
      // Don't block — fall back to treating as real
      setImageType("REAL");
      break;
  }
} else {
  // No ai_validation at all — soft-fail, don't block the user
  setHfStatus(null);
  setHfConfidence(null);
  setHfModel(null);
  setImageType("REAL");
  setRequiresReview(false);
  setReviewReason(null);
}

        if (prediction) {
          const dt   = normalizeDamageType(prediction.label);
          const sv   = normalizeSeverity(prediction.severity);
          const conf = prediction.confidence ?? null;
          setDamageType(dt);
          setSeverity(sv);
          setAiConfidence(conf);
          setPredictionResult(prediction);

          const rawDets = result.data?.all_detections ?? [];
          setAllDetections(rawDets.map(normalizePrediction).filter(Boolean));

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

  // ── Retry handler — re-runs analysis on the same file, tracks attempt count ─
  const handleRetryAnalysis = useCallback(() => {
    if (!file || isAnalyzing) return;   // guard: ignore clicks while already running
    setRetryCount((c) => c + 1);
    runFullAnalysis(file);
  }, [file, isAnalyzing, runFullAnalysis]);

  // ── Camera helpers (UNCHANGED) ─────────────────────────────────────────────
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
    setViewfinderSize({ width: 0, height: 0 });
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
          const res = await fetch(`/api/v1/ml/analyze`, {
            method: "POST", body: fd,
            signal: AbortSignal.timeout(800),
            credentials: "include",
          });
          if (!res.ok) return;
          const { data } = await res.json();
          const allDets = data?.all_detections ?? [];
          const pred = data?.prediction;
          
          if (allDets.length === 0 && (!pred || pred.label === "none")) {
            setLiveDetection((p) => ({ ...p, detected: false, status: "scanning", bbox: null, boxes: [] }));
            return;
          }
          
          const best = allDets[0] ?? pred;
          const conf = best?.confidence ?? 0;
          const normBox = best?.norm_bbox ?? null;
          const dist = distanceFeedback(normBox);
          
          setLiveDetection({
            detected:   allDets.length > 0 && conf >= REALTIME_CONF_THRESHOLD,
            label:      best?.class ?? best?.label ?? null,
            confidence: conf,
            severity:   best?.severity,
            bbox:       normBox,
            boxes:      allDets,
            distance:   dist,
            status:     allDets.length > 0 && conf >= REALTIME_CONF_THRESHOLD
              ? (dist.ok ? "detected" : "warning")
              : "scanning",
          });
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

  const openCamera = useCallback(() => {
    setShowCamera(true);
    startCamera();
  }, [startCamera]);

  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || capturing) return;
    setCapturing(true);
    setRetryCount(0);
    const blob     = await snapFrameBlob(videoRef.current);
    const captured = new File([blob], "snap_capture.jpg", { type: "image/jpeg" });
    setFile(captured);
    setPreview(URL.createObjectURL(blob));
    stopCamera();
    setCapturing(false);
    await runFullAnalysis(captured);
  }, [capturing, stopCamera, runFullAnalysis]);

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
      setRetryCount(0);
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
      await runFullAnalysis(captured);
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
  }, [runFullAnalysis]);

  const stopRecordingEarly = useCallback(() => {
    clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // ── Device orientation (UNCHANGED) ────────────────────────────────────────
  useEffect(() => {
    function handleOrientation(e) {
      const beta = e.beta != null ? Math.abs(e.beta) : null;
      angleRef.current = beta;
      setPhoneAngle(beta);
      setAngleValid(beta !== null && beta >= ANGLE_MIN && beta <= ANGLE_MAX);
    }
    if (typeof DeviceOrientationEvent !== "undefined") {
      window.addEventListener("deviceorientation", handleOrientation, { passive: true });
    }
    return () => window.removeEventListener("deviceorientation", handleOrientation);
  }, []);

  // ── Location (UNCHANGED) ──────────────────────────────────────────────────
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

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  const handleFileChange = useCallback(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setRetryCount(0);
    setManualReviewOverride(false);
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
    setDisclaimerAccepted(false);
    setRetryCount(0);
    setManualReviewOverride(false);
    resetAnalysis();
    if (fileRef.current) fileRef.current.value = "";
    stopCamera(); // ← FIX: ensure camera stream is killed
  }, [resetAnalysis, stopCamera]);

  // ── Form validation ────────────────────────────────────────────────────────
  // manualReviewOverride (unlocked after MAX_ANALYSIS_RETRIES failed retries)
  // bypasses the AI-analysis requirement so a down AI/YOLO service can't
  // block the core "submit a report" action entirely.
  const validateForm = useCallback(() => {
    if (!file)        { setFormError("Evidence required: Please upload or capture a photo/video."); return; }
    if (isAnalyzing)  { setFormError("Please wait for AI analysis to complete."); return; }
    if (!manualReviewOverride) {
      if (analysisComplete && (hfStatus === "error" || imageType === null))
        { setFormError("AI authenticity check failed or is inconclusive. Please re-upload."); return; }
      if (analysisComplete && damageType === null)
        { setFormError("No damage detected. Please upload a clear photo/video of road damage."); return; }
    }
    if (!barangay)    { setFormError("Please select a Barangay."); return; }
    if (!coords)      { setFormError("GPS coordinates required. Please allow location access."); return; }
    if (!disclaimerAccepted) { setFormError("Please accept the legal disclaimer to proceed."); return; }
    setFormError("");
    setShowSubmitModal(true);
  }, [file, isAnalyzing, analysisComplete, hfStatus, imageType, damageType, barangay, coords, disclaimerAccepted, manualReviewOverride]);

  // ── Submit (UNCHANGED) ────────────────────────────────────────────────────
  const handleSubmitConfirm = useCallback(async () => {
    if (isSubmitting) return;
    setShowSubmitModal(false);
    setIsSubmitting(true);
    setFormError("");
    let reportPayload = null;
    try {
      const is_flagged = imageType === "AI-GENERATED";
      const isVideo    = file && isVideoFile(file);
      reportPayload = {
        user_id: userId, reporter_name: reporterName,
        latitude: coords.lat, longitude: coords.lng,
        barangay, street_name: streetName || null,
        description: additionalInfo?.trim() || null,
        ai_damage_type:   DAMAGE_TYPE_BACKEND[damageType]  ?? null,
        ai_severity:      SEVERITY_BACKEND[severity]       ?? null,
        ai_confidence:    aiConfidence                     ?? 0.0,
        is_flagged_fake:  is_flagged,
        fake_confidence:  hfConfidence                     ?? 0.0,
        report_type:      isVideo ? "video" : "image",
        is_hybrid:        isHybrid,
        secondary_damage: secondaryDamage ?? null,
        detection_note:   detectionNote   ?? null,
        ai_validation_status:     hfStatus     ?? null,
        ai_validation_confidence: hfConfidence ?? null,
        ai_validation_model:      hfModel      ?? null,
        requires_admin_review: requiresReview,
        review_reason:         reviewReason ?? null,
        disclaimer_accepted:   disclaimerAccepted,
        capture_metadata: {
          angle_degrees:           phoneAngle !== null ? Math.round(phoneAngle) : null,
          angle_valid:             angleValid,
          estimated_distance_text: predictionResult?.distance?.text ?? null,
          distance_method:         "bbox_area_estimation",
        },
      };
      if (!isOnline) {
        // ── Offline: queue instead of failing silently ─────────────────────
        await enqueueOfflineReport(reportPayload, file);
        pushOfflineToast({
          type: "info",
          message: "You're offline — report saved and will submit automatically once you're back online.",
        });
        setSubmitSuccess(true);
        setTimeout(() => onClose(), 2000);
        return;
      }

      const reportRes = await createReport(reportPayload);
      if (!reportRes.success) throw new Error(reportRes.error);
      const reportId = reportRes.data?.id ?? reportRes.data?.report_id;
      if (!reportId) throw new Error("Server did not return a report ID.");
      const uploadRes = await uploadMedia(reportId, file);
      if (!uploadRes.success) {
        setFormError(`Report #${reportId} saved, but media upload failed: ${uploadRes.error}.`);
      }
      setSubmitSuccess(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      // ── Network dropped mid-submit: fall back to the offline queue ────────
      if (!navigator.onLine && reportPayload) {
        try {
          await enqueueOfflineReport(reportPayload, file);
          pushOfflineToast({
            type: "info",
            message: "Connection lost — report saved and will submit automatically once you're back online.",
          });
          setSubmitSuccess(true);
          setTimeout(() => onClose(), 2000);
          return;
        } catch {
          // fall through to generic error handling below
        }
      }
      setFormError(err.message || "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, imageType, coords, barangay, streetName, additionalInfo,
    damageType, severity, aiConfidence, hfConfidence, hfStatus, hfModel,
    requiresReview, reviewReason, isHybrid, secondaryDamage, detectionNote,
    file, onClose, phoneAngle, angleValid, predictionResult,
    disclaimerAccepted, reporterName, userId, isOnline, pushOfflineToast,
  ]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const canSubmit      = !isSubmitting && !isAnalyzing;
  const imageTypeBadge = hfStatus === "error" ? "HF-ERROR" : imageType;
  const recProgress    = (recordingTime / MAX_REC_SECS) * 100;
  const showAngleHUD   = cameraActive && phoneAngle !== null;

  const viewfinderOverlayDetections = (liveDetection.detected && liveDetection.boxes?.length)
    ? liveDetection.boxes.map((b) => ({
        label: b.class ?? b.label, 
        confidence: b.confidence, 
        severity: b.severity ?? liveDetection.severity,
        x_norm: b.x_norm ?? (b.norm_bbox?.[0] ?? 0), 
        y_norm: b.y_norm ?? (b.norm_bbox?.[1] ?? 0), 
        w_norm: b.w_norm ?? ((b.norm_bbox?.[2] ?? 0) - (b.norm_bbox?.[0] ?? 0)), 
        h_norm: b.h_norm ?? ((b.norm_bbox?.[3] ?? 0) - (b.norm_bbox?.[1] ?? 0)),
      }))
    : [];

  // ── NEW: Derived mask data ─────────────────────────────────────────────────
  // Use allDetections (multi-mask) when available; fall back to predictionResult
const maskDetections = useMemo(() => allDetections, [allDetections]);

// FIXED — use either previewSize OR naturalSize; add ResizeObserver fallback
const effectiveSize = useMemo(() => {
  if (previewSize.width > 0 && previewSize.height > 0) return previewSize;
  if (naturalSize.width > 0 && naturalSize.height > 0) return naturalSize;
  return null;
}, [previewSize, naturalSize]);

const showMask = analysisComplete &&
  maskDetections.length > 0 &&
  effectiveSize !== null &&
  !isVideoFile(file);

  const switchTab = useCallback((id) => {
    stopCamera();
    clearMedia();
    setActiveTab(id);
  }, [clearMedia, stopCamera]);

  if (showGuide) {
    return <PhotoCaptureGuide onContinue={() => setShowGuide(false)} onClose={onClose} />;
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return ReactDOM.createPortal(
    <div className="snap-overlay">
      <div className="snap-modal">

        <button className="snap-close-icon"
          onClick={() => !isSubmitting && setShowDiscardModal(true)}
          disabled={isSubmitting || isAnalyzing}
          aria-label="Close report form">
          <FaTimes />
        </button>

        {!isOnline && (
          <div className="offline-banner" role="status">
            <FaExclamationTriangle aria-hidden="true" />
            <span>You're offline — submitting will save this report and send it automatically once you're back online.</span>
          </div>
        )}

        {offlineToasts.length > 0 && (
          <div className="offline-toast-stack" role="status" aria-live="polite">
            {offlineToasts.map((t) => (
              <div key={t.id} className={`offline-toast offline-toast--${t.type}`}>
                {t.type === "success" ? <FaCheckCircle aria-hidden="true" /> : <FaExclamationTriangle aria-hidden="true" />}
                <span>{t.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* ══ LEFT PANEL ══ */}
        <div className="snap-left">
          <h2>Visual Evidence</h2>

          {/* Tabs */}
          <div className="snap-tabs" role="tablist">
            {[
              { id: "photo", label: "Photo", Icon: FaCamera },
              { id: "video", label: "Video", Icon: FaVideo  },
            ].map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={activeTab === id}
                className={`snap-tab ${activeTab === id ? "active" : ""}`}
                onClick={() => switchTab(id)} disabled={isSubmitting}>
                <Icon className="tab-icon" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          {/* ── CAMERA VIEWFINDER ── */}
          {showCamera && (
            <div className="snap-camera-wrapper">
              {cameraError ? (
                <div className="camera-error">
                  <FaExclamationTriangle aria-hidden="true" />
                  <p>{cameraError}</p>
                  <button className="btn-retry" onClick={startCamera}>
                    <FaRedo /> Retry
                  </button>
                </div>
              ) : (
                <div className={`camera-viewport${isRecording ? " recording" : ""}`}>
                  <video ref={videoRef} className="camera-video"
                    autoPlay playsInline muted
                    onPlay={(e) => setViewfinderSize({
                      width:  e.target.offsetWidth  || 640,
                      height: e.target.offsetHeight || 360,
                    })} />
                  <ReferenceCaptureCircle />
                  {showAngleHUD && <AngleHUD angle={phoneAngle} valid={angleValid} />}
                  {["tl","tr","bl","br"].map((pos) => (
                    <span key={pos} aria-hidden="true"
                      className={`guide-corner corner-${pos} ${
                        liveDetection.status === "detected" ? "green"
                        : isRecording ? "rec-red" : "red"
                      }`} />
                  ))}
                  {cameraActive && (
                    <div className={`detection-pill pill-${liveDetection.status}`}
                      role="status" aria-live="polite">
                      <span className="dot-pulse" aria-hidden="true" />
                      {liveDetection.status === "detected"
                        ? `${liveDetection.label?.charAt(0).toUpperCase()}${liveDetection.label?.slice(1)} detected — ${Math.round(liveDetection.confidence * 100)}%`
                        : liveDetection.status === "warning"
                        ? liveDetection.distance?.text || "Adjust distance to ~1.5 m"
                        : "Scanning for road damage…"}
                    </div>
                  )}
                  {cameraActive && viewfinderSize.width > 0 && (
                    <DetectionOverlay mode="realtime"
                      detections={viewfinderOverlayDetections}
                      width={viewfinderSize.width}
                      height={viewfinderSize.height} />
                  )}
                  {cameraActive && liveDetection.distance && (
                    <div className={`distance-indicator ${liveDetection.distance.ok ? "ok" : "warn"}`}
                      aria-hidden="true">
                      <span className={`dist-dot ${liveDetection.distance.ok ? "" : "red"}`} />
                      {liveDetection.distance.text}
                    </div>
                  )}
                  {cameraActive && !isRecording && (
                    <p className="guidance-text" aria-hidden="true">
                      {activeTab === "video"
                        ? `Up to ${MAX_REC_SECS}s · stand ~1.5 m from damage · tilt phone 45°–75°`
                        : "Focus camera · stand ~1.5 m from damage · tilt phone 45°–75°"}
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
                      <button className="btn-capture" onClick={capturePhoto}
                        disabled={capturing || (showAngleHUD && !angleValid)}
                        aria-label="Capture photo">
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
                      <button className="btn-stop-rec" onClick={stopRecordingEarly}
                        aria-label="Stop recording">
                        <FaStop aria-hidden="true" /> Stop
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-capture" onClick={startRecording}
                        disabled={showAngleHUD && !angleValid}
                        aria-label="Start video recording">
                        <FaVideo aria-hidden="true" /> Start Recording
                      </button>
                      <button className="btn-stop-cam" onClick={stopCamera}>Stop Camera</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── UPLOAD / PREVIEW BOX ── */}
          {!showCamera && (
            <div
              className={`snap-upload-box ${isAnalyzing ? "analyzing" : ""}`}
              onClick={() => !preview && !isSubmitting && !isAnalyzing && fileRef.current.click()}
              role="button" aria-label="Upload evidence file"
              tabIndex={preview ? -1 : 0}
              onKeyDown={(e) => e.key === "Enter" && !preview && fileRef.current.click()}
            >
              {preview ? (
                <div className="preview-container">
                  {/* ── Media element ── */}
                  {file && isVideoFile(file) ? (
                    <video ref={previewMediaRef} src={preview}
                      className="preview-img" muted autoPlay loop playsInline controls
                      onLoadedMetadata={(e) => setPreviewSize({
                        width: e.target.offsetWidth, height: e.target.offsetHeight,
                      })} />
                  ) : (
<img
  ref={previewMediaRef}
  src={preview}
  alt="Uploaded evidence"
  className="preview-img"
  onLoad={(e) => {
    setPreviewSize({
      width: e.target.offsetWidth,
      height: e.target.offsetHeight,
    });
  }}
/>
                  )}

                  {/* ── Scan animation while analysing ── */}
                  {isAnalyzing && (
                    <>
                      <div className="seg-scan-grid"  aria-hidden="true" />
                      <div className="seg-scan-line"  aria-hidden="true" />
                    </>
                  )}

                  {/* ══════════════════════════════════════════════════════════
                      NEW: True YOLOv11 polygon segmentation mask overlay
                      Replaces the old <SegmentationMask boxes=…> rect renderer
                  ══════════════════════════════════════════════════════════ */}
                  {showMask && (
                    <SegmentationMask
                      predictions={maskDetections}
                      imageSize={effectiveSize}
                      naturalSize={naturalSize.width > 0 ? naturalSize : effectiveSize}
                      showBoundingBox={true}
                      showLabels={true}
                      smoothPasses={1}
                    />
                  )}

                  {/* ── Multi-detection badges ── */}
                  {analysisComplete && maskDetections.length > 0 && (
                    <>
                      {maskDetections.length > 1 && (
                        <div className="preview-det-count" aria-hidden="true">
                          {maskDetections.length} detections
                        </div>
                      )}
                      <div className="preview-result-badges">
                        {maskDetections.map((det, i) => {
                          const sev = (det.severity ?? "non_critical").toLowerCase();
                          const isCrit = ["critical","high","severe"].includes(sev);
                          return (
                            <div key={i}
                              className={`preview-det-badge ${isCrit ? "det-badge-critical" : "det-badge-non_critical"}`}
                              style={{ animationDelay: `${i * 60}ms` }}>
                              <span className="det-badge-type">
                                {(det.class ?? "DAMAGE").toUpperCase()}
                              </span>
                              <span className="det-badge-sev">
                                {isCrit ? "CRIT" : "LOW"}
                              </span>
                              {det.confidence != null && (
                                <span className="det-badge-conf">
                                  {Math.round(det.confidence * 100)}%
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Trash button */}
                  {!isSubmitting && !isAnalyzing && (
                    <button className="trash-btn" onClick={clearMedia} aria-label="Remove file">
                      <FaRegTrashAlt aria-hidden="true" />
                    </button>
                  )}

                  {/* Analyzing overlay */}
                  {isAnalyzing && (
                    <div className="preview-analyzing-overlay" aria-live="polite">
                      <FaSpinner className="spin-icon" aria-hidden="true" />
                      <span>{analysisProgress || "Analyzing…"}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="upload-placeholder">
                  <div className="icon-circle" aria-hidden="true">
                    {activeTab === "photo" ? <FaCamera /> : <FaVideo />}
                  </div>
                  <h3>{activeTab === "photo" ? "Upload Photo" : "Upload Video"}</h3>
                  <p>
                    {activeTab === "video"
                      ? "MP4, MOV, or AVI · up to 10s recommended"
                      : "Tap to select a file"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Filmstrip */}
          {activeTab === "video" && analysisComplete && detectionSnapshots.length > 0 && (
            <DetectionFilmstrip snapshots={detectionSnapshots} />
          )}

          {/* Open camera buttons */}
          {!showCamera && !preview && activeTab === "photo" && (
            <button className="btn-use-camera" onClick={openCamera}
              disabled={isSubmitting || isAnalyzing}>
              <FaCamera aria-hidden="true" /> Use Camera
            </button>
          )}
          {!showCamera && !preview && activeTab === "video" && (
            <button className="btn-use-camera" onClick={openCamera}
              disabled={isSubmitting || isAnalyzing}>
              <FaVideo aria-hidden="true" /> Record Video
            </button>
          )}

          <input ref={fileRef} type="file" hidden
            accept={
              activeTab === "photo"
                ? "image/jpeg,image/jpg,image/png,image/webp"
                : "video/mp4,video/webm,video/quicktime,video/x-msvideo,.mp4,.webm,.mov,.avi"
            }
            onChange={handleFileChange} aria-hidden="true" />

          {/* AI classification badges */}
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
              <p className="flagged-note" role="alert">
                Flagged — held for admin review before publishing.
              </p>
            )}
                       {hfConfidence !== null && !isAnalyzing && (
              <HFConfidenceBar 
                confidence={hfConfidence} 
                status={hfStatus} 
                rawScores={hfRawScores || {}}  // ← FIXED: use hfRawScores, not predictionResult
              />
            )}
            {analyzeError && !isAnalyzing && (
              <div className="analyze-error-block">
                <p className={
                  damageType === null && analysisComplete && imageType !== "AI-GENERATED"
                    ? "analyze-error" : "analyze-warning"
                } role="alert">
                  <FaExclamationTriangle aria-hidden="true" style={{ marginRight: 4 }} />
                  {analyzeError}
                </p>
                {file && retryCount < MAX_ANALYSIS_RETRIES ? (
                  <button
                    className="btn-retry-analysis"
                    onClick={handleRetryAnalysis}
                    type="button"
                    aria-label={`Retry analysis, ${MAX_ANALYSIS_RETRIES - retryCount} attempts remaining`}
                  >
                    <FaRedo aria-hidden="true" />
                    Retry Analysis
                    <span className="retry-attempts-left">
                      {MAX_ANALYSIS_RETRIES - retryCount} left
                    </span>
                  </button>
                ) : file && retryCount >= MAX_ANALYSIS_RETRIES ? (
                  <div className="retry-exhausted-block">
                    <p className="retry-exhausted-msg" role="alert">
                      <FaExclamationCircle aria-hidden="true" style={{ marginRight: 4 }} />
                      Analysis failed after {MAX_ANALYSIS_RETRIES} retries. Please retake the photo
                      with better lighting or a clearer angle, then upload again.
                    </p>
                    {!manualReviewOverride ? (
                      <button
                        className="btn-manual-review"
                        type="button"
                        onClick={() => {
                          setManualReviewOverride(true);
                          setRequiresReview(true);
                          setReviewReason(
                            reviewReason ||
                              "AI analysis unavailable after repeated retries — submitted for manual review"
                          );
                          setFormError("");
                        }}
                      >
                        Submit for Manual Review Instead
                      </button>
                    ) : (
                      <p className="manual-review-note" role="status">
                        Manual review unlocked — an admin will verify this report by hand. You can
                        now press Submit.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            )}
            {aiConfidence !== null && !isAnalyzing && (
              <div className="confidence-bar-wrapper"
                aria-label={`ML confidence: ${Math.round(aiConfidence * 100)}%`}>
                <div className="confidence-bar-header">
                  <span>ML Confidence</span>
                  <span className="confidence-pct">{Math.round(aiConfidence * 100)}%</span>
                </div>
                <div className="confidence-bar-track">
                  <div className="confidence-bar-fill"
                    style={{ width: `${aiConfidence * 100}%` }} />
                </div>
              </div>
            )}
          </div>

          <LiabilityDisclaimer accepted={disclaimerAccepted} onToggle={setDisclaimerAccepted} />
          {formError && (
            <div className="error-message-left" role="alert">
              <FaExclamationCircle aria-hidden="true" style={{ marginRight: 6 }} />
              {formError}
            </div>
          )}
          <ReviewWarning reason={reviewReason} />
        </div>

        {/* ══ RIGHT PANEL (UNCHANGED) ══ */}
        <div className="snap-right">
          <div className="top-classifications">
            <div className="class-group">
              <label id="damage-type-label">
                DAMAGE TYPE
                {isAnalyzing && <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 5 }} />}
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
                SEVERITY
                {isAnalyzing && <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 5 }} />}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="severity-label">
              <button className={`class-btn ${severity === "NON_CRITICAL" ? "active-non-critical" : ""}`}                  disabled aria-pressed={severity === "NON_CRITICAL"}>NON_CRITICAL</button>
                <button className={`class-btn ${severity === "CRITICAL" ? "active-critical" : ""}`}
                  disabled aria-pressed={severity === "CRITICAL"}>CRITICAL</button>
              </div>
            </div>
          </div>

          <div className="snap-location-block">
            <div className="snap-location-header">
              <label>LOCATION &amp; BARANGAY</label>
              <button className="btn-refresh-loc" onClick={fetchLocation}
                disabled={locationLoading} aria-label="Refresh location">
                {locationLoading
                  ? <FaSpinner className="spin-icon" aria-hidden="true" />
                  : <FaRedo aria-hidden="true" />}
              </button>
            </div>
            <div className="location-coordinate-chip">
              <div className="loc-pin-icon"><MdOutlineLocationOn /></div>
              <div className="loc-coordinate-text">
                <div className="loc-coordinate-label">GPS Coordinates</div>
                <div className="loc-coordinate-value">
                  {coords
                    ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                    : locationLoading ? "Acquiring satellite lock…" : "—"}
                </div>
              </div>
              <div className={`loc-status ${coords ? "locked" : "searching"}`}>
                {coords ? <FaMapMarkerAlt /> : <FaSpinner className="spin-icon" />}
              </div>
            </div>
            <div className="snap-form-row" style={{ marginTop: 6 }}>
              <div className="snap-form-group half">
                <label htmlFor="city-input">CITY</label>
                <input id="city-input" type="text" value={city}
                  onChange={(e) => setCity(e.target.value)} disabled={isSubmitting} />
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
              <label htmlFor="reporter-name">{reporterName}</label>
              <div className="reporter-chip-compact">
                <div className="reporter-avatar-compact">
                  {reporterName.charAt(0).toUpperCase()}
                </div>
                <div className="reporter-info-compact">
                  <div className="reporter-name-compact">Reporter</div>
                </div>
              </div>
              <input id="reporter-name" type="hidden" value={reporterName} />
            </div>
            <div className="snap-form-group half">
              <label htmlFor="barangay-select">
                BARANGAY <span style={{ color: "red" }} aria-hidden="true">*</span>
              </label>
              <select id="barangay-select" value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                className={!barangay ? "placeholder" : ""}
                disabled={isSubmitting} required>
                <option value="" disabled>Select Barangay</option>
                {MALABON_BARANGAYS?.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="snap-form-group">
            <label htmlFor="additional-info">ADDITIONAL INFORMATION</label>
            <textarea id="additional-info" rows={3}
              placeholder="Describe the damage, nearby landmarks, or safety concerns…"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              disabled={isSubmitting} />
          </div>

          <AIAnalysisSummary
            damageType={damageType} severity={severity}
            aiConfidence={aiConfidence} coords={coords}
            barangay={barangay} file={file}
            analysisComplete={analysisComplete}
            imageType={imageType} isAnalyzing={isAnalyzing}
          />

          <div className="snap-actions">
            <button className="btn-discard" onClick={() => setShowDiscardModal(true)}
              disabled={isSubmitting} type="button">
              Discard
            </button>
            <button className="btn-submit" onClick={validateForm}
              disabled={!canSubmit || submitSuccess} aria-busy={isSubmitting}>
              {isSubmitting ? (
                <><FaSpinner className="spin-icon" aria-hidden="true" /> Submitting…</>
              ) : submitSuccess ? (
                <><FaCheckCircle aria-hidden="true" /> Submitted!</>
              ) : (
                "Submit Report"
              )}
            </button>
          </div>
        </div>

        {/* ══ MODALS (UNCHANGED) ══ */}
        {showDiscardModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-box modal-box-discard" role="dialog" aria-modal="true"
              aria-labelledby="discard-title">
              <div className="modal-icon modal-icon-red"><FaExclamationTriangle /></div>
              <h3 id="discard-title">Discard report?</h3>
              <p>Any captured media and analysis will be lost.</p>
              <div className="modal-actions">
                <button className="btn-modal-secondary" onClick={() => setShowDiscardModal(false)}>
                  Keep Editing
                </button>
                <button className="btn-modal-danger" onClick={onClose}>Discard</button>
              </div>
            </div>
          </div>
        )}

        {showSubmitModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-box modal-box-confirm" role="dialog" aria-modal="true"
              aria-labelledby="confirm-title">
              <div className="modal-icon modal-icon-green"><FaCheckCircle /></div>
              <h3 id="confirm-title">Confirm Submission</h3>
              <p>
                You are about to submit a {damageType?.toLowerCase() ?? "road damage"} report
                {barangay ? ` for ${barangay}` : ""}.
                {requiresReview && (
                  <span className="modal-review-note">
                    <FaExclamationTriangle /> This will be flagged for admin review.
                  </span>
                )}
              </p>
              <div className="modal-actions">
                <button className="btn-modal-secondary" onClick={() => setShowSubmitModal(false)}>
                  Go Back
                </button>
                <button className="btn-modal-primary" onClick={handleSubmitConfirm}>
                  Confirm &amp; Submit
                </button>
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