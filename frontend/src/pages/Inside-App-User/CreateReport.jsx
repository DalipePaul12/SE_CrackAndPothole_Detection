/**
 * CreateReport.jsx — Fully fixed production version
 *
 * FIXES APPLIED:
 *   1. Completed truncated JSX (barangay select, textarea, summary, disclaimer, modals)
 *   2. Re-ordered hooks so no const is referenced before declaration
 *   3. Added missing MALABON_BARANGAYS options and default option
 *   4. Fixed capturePhoto / startRecording to use stable refs for runFullAnalysis
 *   5. Added missing closing tags for snap-right, snap-modal, snap-overlay, Portal
 *   6. Ensured all aria-labels and role attributes are complete
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
import PhotoCaptureGuide from "../../components/PhotoCaptureGuide";
import DetectionOverlay from "../../components/DetectionOverlay";

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

const REALTIME_CONF_THRESHOLD = 0.60;
const REVIEW_CONF_THRESHOLD   = 0.85;

const MAX_REC_SECS = 10;

const ANGLE_MIN = 45;
const ANGLE_MAX = 75;

const VIDEO_MIME_TYPES = new Set([
  "video/mp4", "video/webm", "video/quicktime",
  "video/x-msvideo", "video/x-matroska", "video/ogg",
  "application/octet-stream",
]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);

function isVideoFile(file) {
  if (!file) return false;
  if (VIDEO_MIME_TYPES.has((file.type || "").toLowerCase())) return true;
  const ext = "." + (file.name || "").split(".").pop().toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
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
  if (["critical", "high", "severe"].includes(l))                    return "CRITICAL";
  if (["low", "non-critical", "moderate", "medium"].includes(l))     return "NON-CRITICAL";
  return null;
}

async function snapFrameBlob(videoEl, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width  = w ?? videoEl.videoWidth  ?? 640;
  canvas.height = h ?? videoEl.videoHeight ?? 480;
  canvas.getContext("2d").drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

// Distance feedback calibrated for ~1.5m phone-to-subject distance.
function distanceFeedback(bbox) {
  if (!bbox || bbox.length < 4) return { ok: false, text: "No object detected", area: 0 };
  const [x1, y1, x2, y2] = bbox;
  const area = Math.max(0, (x2 - x1) * (y2 - y1));
  if (area < 0.03) return { ok: false, text: "Too far — move closer (~1.5 m)", area };
  if (area > 0.35) return { ok: false, text: "Too close — step back (~1.5 m)", area };
  const est = area > 0 ? Math.round(1.5 / Math.sqrt(area / 0.12)) : 0;
  return { ok: true, text: `~${est} m — good framing`, area };
}

// ─── Segmentation Mask ────────────────────────────────────────────────────────

function SegmentationMask({ boxes, imageSize, label }) {
  if (!boxes || boxes.length === 0 || !imageSize.width) return null;

  const maskColor = label === "crack"
    ? { fill: "rgba(59,130,246,0.22)", glow: "#3b82f6" }
    : { fill: "rgba(249,115,22,0.22)", glow: "#f97316" };

  const filterId = `seg-glow-${label ?? "default"}`;

  return (
    <svg
      className="seg-mask-svg"
      viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="mask" />
          <feComposite in="SourceGraphic" in2="mask" operator="atop" />
        </filter>
        <filter id={`${filterId}-edge`}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {boxes.map((b, i) => {
        const x  = (b.x_norm ?? 0) * imageSize.width;
        const y  = (b.y_norm ?? 0) * imageSize.height;
        const bw = (b.w_norm ?? 0) * imageSize.width;
        const bh = (b.h_norm ?? 0) * imageSize.height;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={bh}
              fill={maskColor.fill} rx="6" ry="6"
              filter={`url(#${filterId}-edge)`} />
            <rect x={x} y={y} width={bw} height={bh}
              fill="none" stroke={maskColor.glow} strokeWidth="1.5"
              strokeDasharray="6 3" rx="6" ry="6" opacity="0.7"
              className="seg-dash-anim" />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Reference capture circle overlay ────────────────────────────────────────

function ReferenceCaptureCircle() {
  return (
    <div className="capture-reference-circle" aria-hidden="true">
      <div className="capture-reference-text">
        Keep damage inside circle · Stand ~1.5m back
      </div>
    </div>
  );
}

// ─── Angle HUD overlay ────────────────────────────────────────────────────────

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

// ─── Detection Filmstrip with lightbox ───────────────────────────────────────

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

// ─── HF Confidence Bar ────────────────────────────────────────────────────────

function HFConfidenceBar({ confidence, status }) {
  if (confidence === null || confidence === undefined) return null;
  const pct  = Math.round(confidence * 100);
  const isAI = status === "rejected";
  const fill = isAI
    ? "linear-gradient(90deg, #ef4444, #dc2626)"
    : "linear-gradient(90deg, #22c55e, #16a34a)";

  return (
    <div className="hf-confidence-bar-wrapper"
      aria-label={`AI authenticity confidence: ${pct}%`}>
      <div className="hf-confidence-bar-header">
        <span>AI Authenticity Confidence</span>
        <span className="hf-confidence-pct" style={{ color: isAI ? "#ef4444" : "#22c55e" }}>
          {pct}%
        </span>
      </div>
      <div className="hf-bar-track">
        <div className="hf-bar-fill" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}

// ─── Liability Disclaimer (interactive checkbox) ──────────────────────────────

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
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onToggle(e.target.checked)}
            aria-required="true"
          />
          <span>I confirm this is authentic evidence</span>
        </label>
      </div>
    </div>
  );
}

// ─── Review Warning (only shown for AI-GENERATED) ─────────────────────────────

function ReviewWarning({ reason }) {
  if (!reason) return null;
  return (
    <div className="review-warning" role="alert">
      <FaExclamationTriangle aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <span>This report will be flagged for admin review: {reason}</span>
    </div>
  );
}

// ─── AI Analysis Summary ──────────────────────────────────────────────────────

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
    : riskScore >= 70 ? "high"
    : riskScore >= 40 ? "medium"
    : "low";

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
              {
                label: "Type",
                value: damageType ?? (isAnalyzing ? "…" : "—"),
                cls: damageType === "CRACK" ? "val-crack" : damageType === "POTHOLE" ? "val-pothole" : "",
              },
              {
                label: "Severity",
                value: severity ?? (isAnalyzing ? "…" : "—"),
                cls: severity === "CRITICAL" ? "val-critical" : severity === "NON-CRITICAL" ? "val-safe" : "",
              },
              {
                label: "Conf.",
                value: aiConfidence != null ? `${Math.round(aiConfidence * 100)}%` : (isAnalyzing ? "…" : "—"),
                cls: aiConfidence >= 0.7 ? "val-safe" : aiConfidence >= 0.4 ? "val-warn" : "",
              },
              {
                label: "Auth",
                value: imageType ?? (isAnalyzing ? "…" : "—"),
                cls: imageType === "REAL" ? "val-safe" : imageType === "AI-GENERATED" ? "val-critical" : "",
              },
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
                  {ok   && <FaCheckCircle style={{ color: "#22c55e", fontSize: 9, flexShrink: 0 }} />}
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

// ─── Main component ───────────────────────────────────────────────────────────

function CreateReport({ onClose }) {
  const { profile } = useUser();

  // Instant name derivation — never shows "loading"
  const reporterName = useMemo(() => {
    return profile?.full_name || profile?.name || profile?.display_name || profile?.username || profile?.email || "Reporter";
  }, [profile]);

  const userId = useMemo(() => {
    return profile?.id || profile?.user_id || profile?.uid || null;
  }, [profile]);

  const [showGuide,    setShowGuide]    = useState(true);
  const [activeTab,    setActiveTab]    = useState("photo");
  const [showCamera,   setShowCamera]   = useState(false);
  const [file,         setFile]         = useState(null);
  const [preview,      setPreview]      = useState(null);

  // Camera state
  const [cameraActive,  setCameraActive]  = useState(false);
  const [cameraError,   setCameraError]   = useState(null);
  const [capturing,     setCapturing]     = useState(false);
  const [isRecording,   setIsRecording]   = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveDetection, setLiveDetection] = useState({
    detected: false, label: null, confidence: 0,
    bbox: null, distance: null, status: "idle",
  });

  // Angle validation
  const [phoneAngle, setPhoneAngle] = useState(null);
  const [angleValid, setAngleValid] = useState(false);

  // Preview sizes
  const [previewSize,    setPreviewSize]    = useState({ width: 0, height: 0 });
  const [viewfinderSize, setViewfinderSize] = useState({ width: 0, height: 0 });

  const [detectionSnapshots, setDetectionSnapshots] = useState([]);

  // AI analysis state
  const [isAnalyzing,      setIsAnalyzing]      = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [analyzeError,     setAnalyzeError]     = useState(null);
  const [hfStatus,         setHfStatus]         = useState(null);
  const [hfConfidence,     setHfConfidence]     = useState(null);
  const [hfModel,          setHfModel]          = useState(null);
  const [imageType,        setImageType]        = useState(null);
  const [damageType,       setDamageType]       = useState(null);
  const [severity,         setSeverity]         = useState(null);
  const [aiConfidence,     setAiConfidence]     = useState(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);

  // Review flag — ONLY triggered by AI-GENERATED detection
  const [requiresReview, setRequiresReview] = useState(false);
  const [reviewReason,   setReviewReason]   = useState(null);

  // Video hybrid fields
  const [isHybrid,        setIsHybrid]        = useState(false);
  const [secondaryDamage, setSecondaryDamage] = useState(null);
  const [detectionNote,   setDetectionNote]   = useState(null);

  // Location
  const [coords,          setCoords]          = useState(null);
  const [city,            setCity]            = useState(DEFAULT_CITY);
  const [barangay,        setBarangay]        = useState("");
  const [streetName,      setStreetName]      = useState("");
  const [locationLoading, setLocationLoading] = useState(false);

  // Form state
  const [additionalInfo,    setAdditionalInfo]   = useState("");
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  const [formError,         setFormError]        = useState("");
  const [isSubmitting,      setIsSubmitting]     = useState(false);
  const [submitSuccess,     setSubmitSuccess]    = useState(false);
  const [showDiscardModal,  setShowDiscardModal] = useState(false);
  const [showSubmitModal,   setShowSubmitModal]  = useState(false);

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

  // ── Analysis ───────────────────────────────────────────────────────────────
  const resetAnalysis = useCallback(() => {
    setImageType(null);
    setHfStatus(null);
    setHfConfidence(null);
    setHfModel(null);
    setDamageType(null);
    setSeverity(null);
    setAiConfidence(null);
    setAnalyzeError(null);
    setIsAnalyzing(false);
    setAnalysisComplete(false);
    setAnalysisProgress(null);
    setPredictionResult(null);
    setPreviewSize({ width: 0, height: 0 });
    setDetectionSnapshots([]);
    setIsHybrid(false);
    setSecondaryDamage(null);
    setDetectionNote(null);
    setRequiresReview(false);
    setReviewReason(null);
  }, []);

  const runFullAnalysis = useCallback(async (f) => {
    const thisId = ++analysisIdRef.current;
    resetAnalysis();
    setIsAnalyzing(true);

    try {
      let result;

      if (isVideoFile(f)) {
        result = await analyzeVideo(f, (msg) => {
          if (analysisIdRef.current === thisId) setAnalysisProgress(msg);
        });

        if (analysisIdRef.current !== thisId) return;

        if (!result.success) {
          setAnalyzeError(result.error || "Video analysis failed.");
          setAnalysisComplete(true);
          return;
        }

        const vidAIVal = result.data?.ai_validation;
        if (vidAIVal) {
          const vidHfStat = vidAIVal.status ?? "skipped";
          setHfStatus(vidHfStat);
          setHfConfidence(vidAIVal.confidence ?? null);
          setHfModel(vidAIVal.model ?? null);
          if (vidHfStat === "approved_for_classification" || vidHfStat === "skipped") {
            setImageType("REAL");
          } else if (vidHfStat === "rejected") {
            setImageType("AI-GENERATED");
            setRequiresReview(true);
            setReviewReason("AI-generated image detected");
          } else {
            setImageType(null);
          }
        } else {
          setHfStatus("skipped");
          setImageType("REAL");
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
          if (!dt) {
            setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
          }
        } else {
          setDamageType(null);
          setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
        }

      } else {
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
          setHfConfidence(ai_validation.confidence ?? null);
          setHfModel(ai_validation.model ?? null);

          if (hfStat === "approved_for_classification" || hfStat === "skipped") {
            setImageType("REAL");
            setRequiresReview(false);
            setReviewReason(null);
          } else if (hfStat === "rejected") {
            setImageType("AI-GENERATED");
            setRequiresReview(true);
            setReviewReason("AI-generated image detected");
          } else {
            setImageType(null);
            setAnalyzeError("AI authenticity check failed. Please re-upload.");
          }
        }

        if (prediction) {
          const dt   = normalizeDamageType(prediction.label);
          const sv   = normalizeSeverity(prediction.severity);
          const conf = prediction.confidence ?? null;
          setDamageType(dt);
          setSeverity(sv);
          setAiConfidence(conf);
          setPredictionResult(prediction);

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
          const pred = data?.prediction;
          if (!pred || pred.label === "none") {
            setLiveDetection((p) => ({ ...p, detected: false, status: "scanning", bbox: null }));
            return;
          }
          const conf    = pred.confidence ?? 0;
          const firstBox = pred.boxes?.[0];
          const normBox = pred.norm_bbox ?? (
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
            boxes:      pred.boxes ?? [],
            distance:   dist,
            status:     conf >= REALTIME_CONF_THRESHOLD
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

  // ── Device orientation for angle validation ────────────────────────────────
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
    fetchLocation();
  }, [fetchLocation]);

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
    setDisclaimerAccepted(false);
    resetAnalysis();
    if (fileRef.current) fileRef.current.value = "";
  }, [resetAnalysis]);

  // ── Form validation ────────────────────────────────────────────────────────
  const validateForm = useCallback(() => {
    if (!file) {
      setFormError("Evidence required: Please upload or capture a photo/video.");
      return;
    }
    if (isAnalyzing) {
      setFormError("Please wait for AI analysis to complete.");
      return;
    }
    if (analysisComplete && (hfStatus === "error" || imageType === null)) {
      setFormError("AI authenticity check failed or is inconclusive. Please re-upload your media.");
      return;
    }
    if (analysisComplete && damageType === null) {
      setFormError("No damage detected. Please upload a clear photo/video of road damage.");
      return;
    }
    if (!barangay) {
      setFormError("Please select a Barangay.");
      return;
    }
    if (!coords) {
      setFormError("GPS coordinates required. Please allow location access.");
      return;
    }
    if (!disclaimerAccepted) {
      setFormError("Please accept the legal disclaimer to proceed.");
      return;
    }
    setFormError("");
    setShowSubmitModal(true);
  }, [
    file, isAnalyzing, analysisComplete, hfStatus,
    imageType, damageType, barangay, coords, disclaimerAccepted,
  ]);

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmitConfirm = useCallback(async () => {
    if (isSubmitting) return;

    setShowSubmitModal(false);
    setIsSubmitting(true);
    setFormError("");

    try {
      const is_flagged = imageType === "AI-GENERATED";
      const isVideo    = file && isVideoFile(file);

      const reportPayload = {
        user_id:          userId,
        reporter_name:    reporterName,
        latitude:         coords.lat,
        longitude:        coords.lng,
        barangay,
        street_name:      streetName || null,
        description:      additionalInfo?.trim() || null,
        ai_damage_type:   DAMAGE_TYPE_BACKEND[damageType] ?? null,
        ai_severity:      SEVERITY_BACKEND[severity]      ?? null,
        ai_confidence:    aiConfidence ?? 0.0,
        is_flagged_fake:  is_flagged,
        fake_confidence:  hfConfidence ?? 0.0,
        report_type:      isVideo ? "video" : "image",
        is_hybrid:        isHybrid,
        secondary_damage: secondaryDamage ?? null,
        detection_note:   detectionNote   ?? null,

        ai_validation_status:     hfStatus     ?? null,
        ai_validation_confidence: hfConfidence ?? null,
        ai_validation_model:      hfModel      ?? null,

        requires_admin_review: requiresReview,
        review_reason:         reviewReason ?? null,

        disclaimer_accepted: disclaimerAccepted,

        capture_metadata: {
          angle_degrees:           phoneAngle !== null ? Math.round(phoneAngle) : null,
          angle_valid:             angleValid,
          estimated_distance_text: predictionResult?.distance?.text ?? null,
          distance_method:         "bbox_area_estimation",
        },
      };

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
      setFormError(err.message || "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting, imageType, coords, barangay, streetName, additionalInfo,
    damageType, severity, aiConfidence, hfConfidence, hfStatus, hfModel,
    requiresReview, reviewReason, isHybrid, secondaryDamage, detectionNote,
    file, onClose, phoneAngle, angleValid, predictionResult,
    disclaimerAccepted, reporterName, userId,
  ]);

  // ── Derived values ─────────────────────────────────────────────────────────
  const canSubmit      = !isSubmitting && !isAnalyzing;
  const imageTypeBadge = hfStatus === "error" ? "HF-ERROR" : imageType;
  const recProgress    = (recordingTime / MAX_REC_SECS) * 100;
  const showAngleHUD   = cameraActive && phoneAngle !== null;

  const viewfinderOverlayDetections = (liveDetection.detected && liveDetection.boxes?.length)
    ? liveDetection.boxes.map((b) => ({
        label: b.label, confidence: b.confidence, severity: liveDetection.severity,
        x_norm: b.x_norm, y_norm: b.y_norm, w_norm: b.w_norm, h_norm: b.h_norm,
      }))
    : [];

  const maskBoxes = predictionResult?.boxes ?? [];
  const maskLabel = predictionResult?.label ?? null;

  const switchTab = useCallback((id) => {
    clearMedia();
    setActiveTab(id);
    stopCamera();
  }, [clearMedia, stopCamera]);

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
              { id: "photo", label: "Photo", Icon: FaCamera },
              { id: "video", label: "Video", Icon: FaVideo  },
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
                  <video
                    ref={videoRef} className="camera-video"
                    autoPlay playsInline muted
                    onPlay={(e) => setViewfinderSize({
                      width:  e.target.offsetWidth  || 640,
                      height: e.target.offsetHeight || 360,
                    })}
                  />

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
                    <DetectionOverlay
                      mode="realtime"
                      detections={viewfinderOverlayDetections}
                      width={viewfinderSize.width}
                      height={viewfinderSize.height}
                    />
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
                      <button
                        className="btn-capture"
                        onClick={capturePhoto}
                        disabled={capturing || (showAngleHUD && !angleValid)}
                        aria-label="Capture photo"
                        title={showAngleHUD && !angleValid
                          ? `Tilt phone to ${ANGLE_MIN}°–${ANGLE_MAX}° first`
                          : undefined}>
                        {capturing
                          ? <><FaSpinner className="spin-icon" aria-hidden="true" /> Capturing…</>
                          : <><FaCamera /> Capture Photo</>}
                      </button>
                      <button className="btn-stop-cam" onClick={stopCamera}>
                        Stop Camera
                      </button>
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
                      <button
                        className="btn-capture"
                        onClick={startRecording}
                        disabled={showAngleHUD && !angleValid}
                        aria-label="Start video recording"
                        title={showAngleHUD && !angleValid
                          ? `Tilt phone to ${ANGLE_MIN}°–${ANGLE_MAX}° first`
                          : undefined}>
                        <FaVideo aria-hidden="true" /> Start Recording
                      </button>
                      <button className="btn-stop-cam" onClick={stopCamera}>
                        Stop Camera
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── UPLOAD BOX ── */}
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
                  {file && isVideoFile(file) ? (
                    <video
                      ref={previewMediaRef}
                      src={preview}
                      className="preview-img"
                      muted autoPlay loop playsInline controls
                      onLoadedMetadata={(e) => setPreviewSize({
                        width: e.target.offsetWidth, height: e.target.offsetHeight,
                      })}
                    />
                  ) : (
                    <img
                      ref={previewMediaRef}
                      src={preview}
                      alt="Uploaded evidence"
                      className="preview-img"
                      onLoad={(e) => {
                        const el = e.target;
                        requestAnimationFrame(() => setPreviewSize({
                          width: el.offsetWidth, height: el.offsetHeight,
                        }));
                      }}
                    />
                  )}

                  {analysisComplete && previewSize.width > 0 && maskBoxes.length > 0 && !isVideoFile(file) && (
                    <SegmentationMask boxes={maskBoxes} imageSize={previewSize} label={maskLabel} />
                  )}

                  {analysisComplete && damageType && (
                    <div className="preview-result-badge">
                      <span className={`preview-badge-type type-${maskLabel}`}>{damageType}</span>
                      {severity && (
                        <span className={`preview-badge-sev sev-${severity?.toLowerCase()}`}>
                          {severity}
                        </span>
                      )}
                      {aiConfidence && (
                        <span className="preview-badge-conf">
                          {Math.round(aiConfidence * 100)}%
                        </span>
                      )}
                    </div>
                  )}

                  {!isSubmitting && !isAnalyzing && (
                    <button className="trash-btn" onClick={clearMedia} aria-label="Remove file">
                      <FaRegTrashAlt aria-hidden="true" />
                    </button>
                  )}

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

          {/* Camera / Record buttons */}
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
              <button
                className={`class-btn ${imageTypeBadge === "REAL" ? "active-real" : ""} ${imageTypeBadge === "HF-ERROR" ? "active-hf-error" : ""}`}
                disabled aria-pressed={imageType === "REAL"}>REAL</button>
              <button
                className={`class-btn ${imageTypeBadge === "AI-GENERATED" ? "active-ai" : ""}`}
                disabled aria-pressed={imageType === "AI-GENERATED"}>AI-GENERATED</button>
            </div>

            {imageType === "AI-GENERATED" && (
              <p className="flagged-note" role="alert">
                Flagged — held for admin review before publishing.
              </p>
            )}

            {hfConfidence !== null && !isAnalyzing && (
              <HFConfidenceBar confidence={hfConfidence} status={hfStatus} />
            )}

            {analyzeError && !isAnalyzing && (
              <p className={
                damageType === null && analysisComplete && imageType !== "AI-GENERATED"
                  ? "analyze-error" : "analyze-warning"
              } role="alert">
                <FaExclamationTriangle aria-hidden="true" style={{ marginRight: 4 }} />
                {analyzeError}
              </p>
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

          {/* Liability Disclaimer — moved to left panel */}
          <LiabilityDisclaimer
            accepted={disclaimerAccepted}
            onToggle={setDisclaimerAccepted}
          />

          {/* Form error — moved to left panel under disclaimer */}
          {formError && (
            <div className="error-message-left" role="alert">
              <FaExclamationCircle aria-hidden="true" style={{ marginRight: 6 }} />
              {formError}
            </div>
          )}

          {/* Review Warning — moved to left panel */}
          <ReviewWarning reason={reviewReason} />
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div className="snap-right">

          {/* Damage type + Severity */}
          <div className="top-classifications">
            <div className="class-group">
              <label id="damage-type-label">
                DAMAGE TYPE
                {isAnalyzing && (
                  <FaSpinner className="spin-icon" aria-hidden="true"
                    style={{ marginLeft: 5 }} />
                )}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="damage-type-label">
                <button
                  className={`class-btn ${damageType === "POTHOLE" ? "active-pothole" : ""}`}
                  disabled aria-pressed={damageType === "POTHOLE"}>POTHOLE</button>
                <button
                  className={`class-btn ${damageType === "CRACK" ? "active-crack" : ""}`}
                  disabled aria-pressed={damageType === "CRACK"}>CRACK</button>
              </div>
            </div>
            <div className="class-group">
              <label id="severity-label">
                SEVERITY
                {isAnalyzing && (
                  <FaSpinner className="spin-icon" aria-hidden="true"
                    style={{ marginLeft: 5 }} />
                )}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="severity-label">
                <button
                  className={`class-btn ${severity === "NON-CRITICAL" ? "active-non-critical" : ""}`}
                  disabled aria-pressed={severity === "NON-CRITICAL"}>NON-CRITICAL</button>
                <button
                  className={`class-btn ${severity === "CRITICAL" ? "active-critical" : ""}`}
                  disabled aria-pressed={severity === "CRITICAL"}>CRITICAL</button>
              </div>
            </div>
          </div>

          {/* Location */}
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
              <div className="loc-pin-icon">
                <MdOutlineLocationOn />
              </div>
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

          {/* Reporter + Barangay */}
          <div className="snap-form-row">
            <div className="snap-form-group half">
              <label htmlFor="reporter-name">REPORTER'S NAME</label>
              <div className="reporter-chip-compact">
                <div className="reporter-avatar-compact">
                  {reporterName.charAt(0).toUpperCase()}
                </div>
                <div className="reporter-info-compact">
                  <div className="reporter-name-compact">{reporterName}</div>
                </div>
              </div>
              <input id="reporter-name" type="hidden" value={reporterName} />
            </div>
            <div className="snap-form-group half">
              <label htmlFor="barangay-select">
                BARANGAY <span style={{ color: "red" }} aria-hidden="true">*</span>
              </label>
              <select
                id="barangay-select"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                className={!barangay ? "placeholder" : ""}
                disabled={isSubmitting}
                required
              >
                <option value="" disabled>Select Barangay</option>
                {MALABON_BARANGAYS?.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Additional Info */}
          <div className="snap-form-group">
            <label htmlFor="additional-info">ADDITIONAL INFORMATION</label>
            <textarea
              id="additional-info"
              rows={3}
              placeholder="Describe the damage, nearby landmarks, or safety concerns…"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* AI Analysis Summary */}
          <AIAnalysisSummary
            damageType={damageType}
            severity={severity}
            aiConfidence={aiConfidence}
            coords={coords}
            barangay={barangay}
            file={file}
            analysisComplete={analysisComplete}
            imageType={imageType}
            isAnalyzing={isAnalyzing}
          />





          {/* Actions — at bottom of right panel */}
          <div className="snap-actions">
            <button
              className="btn-discard"
              onClick={() => setShowDiscardModal(true)}
              disabled={isSubmitting}
              type="button"
            >
              Discard
            </button>
            <button
              className="btn-submit"
              onClick={validateForm}
              disabled={!canSubmit || submitSuccess}
              aria-busy={isSubmitting}
            >
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

        {/* ══ MODALS ══ */}
        {showDiscardModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-box modal-box-discard" role="dialog" aria-modal="true" aria-labelledby="discard-title">
              <div className="modal-icon modal-icon-red"><FaExclamationTriangle /></div>
              <h3 id="discard-title">Discard report?</h3>
              <p>Any captured media and analysis will be lost.</p>
              <div className="modal-actions">
                <button className="btn-modal-secondary" onClick={() => setShowDiscardModal(false)}>
                  Keep Editing
                </button>
                <button className="btn-modal-danger" onClick={onClose}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {showSubmitModal && (
          <div className="modal-backdrop" role="presentation">
            <div className="modal-box modal-box-confirm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
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