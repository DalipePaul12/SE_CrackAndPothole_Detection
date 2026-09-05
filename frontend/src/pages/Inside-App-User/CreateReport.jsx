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
 *
 * FIX (this pass): realtime camera detection loop was firing faster than the
 * backend's rate limit, and failures (429 / timeout / auth) were silently
 * swallowed with no visible signal — so the live bbox/mask overlay would
 * appear to "never work" after a short time, with no error shown. Fixed by
 * pacing the loop to REALTIME_FRAME_INTERVAL_MS, downscaling frames before
 * upload via snapRealtimeFrameBlob, and logging + surfacing repeated failures.
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
import { analyzeMedia, analyzeRealtimeFrame, analyzeVideo } from "../../api/ml";
import { createReport, uploadMedia } from "../../api/reports";
import { useOfflineQueue, enqueueOfflineReport } from "../../hooks/useOfflineQueue";
import { invalidateReportsCache } from "../../hooks/useReports";
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
} from "../../utils/geolocationUtils";
import { readExifGps } from "../../utils/exifUtils";

// ─── Constants (UNCHANGED except the 3 REALTIME_* additions below) ───────────
const DAMAGE_TYPE_BACKEND     = { POTHOLE: "pothole", CRACK: "crack" };
const SEVERITY_BACKEND = {
  CRITICAL:     "critical",
  NON_CRITICAL: "non_critical",
}
const MAX_REC_SECS            = 10;
const MAX_ANALYSIS_RETRIES    = 3;
const ANGLE_MIN               = 45;
const ANGLE_MAX               = 75;

// ── NEW: realtime loop pacing/downscale/failure-tracking constants ──────────
const REALTIME_FRAME_INTERVAL_MS = 350; // ~2.8 fps — stays safely under the backend's 300/min limit
const REALTIME_MAX_DIM           = 480; // downscale live frames before upload (bandwidth + latency)
const REALTIME_MAX_CONSEC_FAILS  = 6;   // consecutive failed/limited frames before surfacing a warning

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

// ─── Shared helpers (UNCHANGED, plus new snapRealtimeFrameBlob) ──────────────
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

// ── NEW: lightweight, downscaled capture used ONLY by the live detection
// loop. Photo/video capture still uses snapFrameBlob() at full resolution.
async function snapRealtimeFrameBlob(videoEl) {
  const vw = videoEl.videoWidth || 640;
  const vh = videoEl.videoHeight || 360;
  const scale = Math.min(1, REALTIME_MAX_DIM / Math.max(vw, vh));
  const w = Math.max(1, Math.round(vw * scale));
  const h = Math.max(1, Math.round(vh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(videoEl, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.7));
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
  return <div className="capture-reference-circle" aria-hidden="true" />;
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
// ─── FullscreenCamera — dedicated camera-only popup, rendered as its own
//     portal so it's never constrained by the form's scroll container ──────
function FullscreenCamera({
  activeTab, cameraError, liveDetectionError, videoRef, onVideoPlay, showAngleHUD, phoneAngle,
  angleValid, liveDetection, isRecording, cameraActive, viewfinderSize,
  viewfinderOverlayDetections, viewfinderMaskDetections, recProgress,
  capturing, onCapturePhoto, onStopCamera, onStartRecording, onStopRecordingEarly,
  recordingTime, onRetryCamera, MAX_REC_SECS,
}) {
  return ReactDOM.createPortal(
    <div className="fs-camera-overlay">
      <button className="fs-camera-close" onClick={onStopCamera} aria-label="Close camera">
        <FaTimes />
      </button>

      {cameraError ? (
        <div className="fs-camera-error">
          <FaExclamationTriangle aria-hidden="true" />
          <p>{cameraError}</p>
          <button className="btn-retry" onClick={onRetryCamera}>
            <FaRedo /> Retry
          </button>
        </div>
      ) : (
        <div className={`fs-camera-viewport${isRecording ? " recording" : ""}`}>
          <video ref={videoRef} className="fs-camera-video"
            autoPlay playsInline muted onPlay={onVideoPlay} />

          {liveDetectionError && (
            <div className="live-detection-warning" role="status" aria-live="polite">
              {liveDetectionError}
            </div>
          )}

          <div className="capture-reference-circle" aria-hidden="true" />
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

          {cameraActive && viewfinderSize.width > 0 && viewfinderMaskDetections.length > 0 && (
            <SegmentationMask
              predictions={viewfinderMaskDetections}
              imageSize={viewfinderSize}
              naturalSize={viewfinderSize}
              showBoundingBox={false}
              showLabels={false}
              smoothPasses={0}
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
                ? `Keep damage in circle · up to ${MAX_REC_SECS}s`
                : "Keep damage inside the circle"}
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
        <div className="fs-camera-controls">
          {activeTab === "photo" ? (
            <>
              <button className="fs-stop-link" onClick={onStopCamera}>Cancel</button>
              <button className="fs-shutter-btn" onClick={onCapturePhoto}
                disabled={capturing || (showAngleHUD && !angleValid)}
                aria-label="Capture photo">
                {capturing && <FaSpinner className="spin-icon" aria-hidden="true" />}
              </button>
              <span className="fs-controls-spacer" aria-hidden="true" />
            </>
          ) : isRecording ? (
            <>
              <div className="fs-rec-timer" role="status" aria-live="polite">
                <span className="rec-pulse-dot" aria-hidden="true" />
                {recordingTime}s / {MAX_REC_SECS}s
              </div>
              <button className="fs-shutter-btn fs-shutter-btn--stop" onClick={onStopRecordingEarly}
                aria-label="Stop recording">
                <FaStop />
              </button>
              <span className="fs-controls-spacer" aria-hidden="true" />
            </>
          ) : (
            <>
              <button className="fs-stop-link" onClick={onStopCamera}>Cancel</button>
              <button className="fs-shutter-btn" onClick={onStartRecording}
                disabled={showAngleHUD && !angleValid}
                aria-label="Start video recording">
                <FaVideo />
              </button>
              <span className="fs-controls-spacer" aria-hidden="true" />
            </>
          )}
        </div>
      )}
    </div>,
    document.body
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
                <span className="filmstrip-card-frame">
                  {snap.timestamp_seconds != null ? `${snap.timestamp_seconds.toFixed(1)}s` : `#${snap.frame}`}
                </span>
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
              <span className="filmstrip-lb-frame">
                {snapshots[lightbox].timestamp_seconds != null
                  ? `At ${snapshots[lightbox].timestamp_seconds.toFixed(1)}s`
                  : `Frame #${snapshots[lightbox].frame}`}
              </span>
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

  const artificialScore = rawScores?._artificial_score ?? 0;
  const realScore = rawScores?._real_score ?? 0;

  const displayPct = isAI
    ? Math.round(artificialScore * 100)
    : Math.round(realScore * 100);

  const fill = isAI
    ? "linear-gradient(90deg,#ef4444,#dc2626)"
    : "linear-gradient(90deg,#22c55e,#16a34a)";

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
  const [liveDetectionError, setLiveDetectionError] = useState(null);
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
  const [currentStage,     setCurrentStage]     = useState("idle");
  const [attemptWarning,   setAttemptWarning]   = useState(null);
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
  const [manualReviewOverride, setManualReviewOverride] = useState(false);
  const [isHybrid,        setIsHybrid]        = useState(false);
  const [secondaryDamage, setSecondaryDamage] = useState(null);
  const [detectionNote,   setDetectionNote]   = useState(null);

  const [coords,          setCoords]          = useState(null);
  const [locationSource,  setLocationSource]  = useState(null); // 'exif' | null
  const [city,            setCity]            = useState(DEFAULT_CITY);
  const [barangay,        setBarangay]        = useState("");
  const [streetName,      setStreetName]      = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationWarning, setLocationWarning] = useState("");

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
    }, toast.onRetry ? 15000 : 6000);
  }, []);

  const { isOnline } = useOfflineQueue({
    onResult: ({ success, error, reportId, partial }) => {
      if (success) {
        pushOfflineToast({ type: "success", message: `Queued report #${reportId} submitted successfully.` });
      } else if (partial) {
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
  const submittingRef    = useRef(false);
  const consecutiveAnalysisFailuresRef = useRef(0);
  const liveHistoryRef   = useRef([]);
  const liveConfirmedRef = useRef(null);
  const liveMissesRef    = useRef(0);

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
    setCurrentStage("idle");
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
  const runFullAnalysis = useCallback(async (f, { source = "upload" } = {}) => {
    const thisId = ++analysisIdRef.current;
    resetAnalysis();
    setIsAnalyzing(true);
    setCurrentStage("authenticity");
    setAnalysisProgress(isVideoFile(f) ? "Analyzing video…" : "Checking authenticity…");

    try {
      let result;

      if (isVideoFile(f)) {
        // ── VIDEO PATH (unchanged logic, added allDetections extract) ──────
        setCurrentStage("authenticity");
        setAnalysisProgress("Checking video authenticity…");
        result = await analyzeVideo(f, (msg) => {
          if (analysisIdRef.current === thisId) setAnalysisProgress(msg);
        }, { source });
        if (analysisIdRef.current !== thisId) return;
        if (!result.success) {
          setAnalyzeError(result.error || "Video analysis failed.");
          setAnalysisComplete(true); return;
        }
        const videoAuth = result.data?.ai_validation;
        if (videoAuth?.status === "flagged_for_review") {
          setImageType("AI-GENERATED");
          setHfStatus("rejected");
          setHfConfidence(videoAuth.confidence ?? null);
          setRequiresReview(true);
          setReviewReason("AI-generated or manipulated video detected — full classification retained for admin review");
        } else {
          setImageType("REAL");
          setHfStatus(videoAuth?.status ?? "skipped");
          setHfConfidence(videoAuth?.confidence ?? null);
        }
        setCurrentStage("classification");
        setAnalysisProgress("Classifying video damage and severity…");
        setCurrentStage("review");

        const vidAIVal = result.data?.ai_validation;
        if (vidAIVal) {
          const s = vidAIVal.status ?? "skipped";
          setHfStatus(s);
          setHfConfidence(vidAIVal.confidence ?? null);
          setHfModel(vidAIVal.model ?? null);
          // Video authenticity is an aggregate across sampled frames, so there's
          // no single _artificial_score/_real_score pair the way a single image
          // has. Synthesize one from the aggregate confidence + status so the
          // Authenticity Confidence bar reflects the real number instead of
          // defaulting to 0% (it reads from raw_scores, not hfConfidence directly).
          const aggConf = vidAIVal.confidence ?? 0;
          const isFlagged = s === "rejected" || s === "flagged_for_review";
          setHfRawScores({
            _artificial_score: isFlagged ? aggConf : 1 - aggConf,
            _real_score: isFlagged ? 1 - aggConf : aggConf,
          });
          if (s === "approved_for_classification" || s === "skipped") {
            setImageType("REAL");
          } else if (s === "rejected" || s === "flagged_for_review") {
            setImageType("AI-GENERATED");
            setRequiresReview(true);
            setReviewReason("AI-generated video detected across sampled frames");
          }
        } else {
          setHfStatus("skipped"); setImageType("REAL"); setHfRawScores(null);
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
        setCurrentStage("authenticity");
        setAnalysisProgress(source === "capture" ? "Verifying capture…" : "Checking authenticity…");
        result = await analyzeMedia(f, { source });
        if (analysisIdRef.current !== thisId) return;
        if (!result.success) {
          setAnalyzeError(result.error || "Analysis failed.");
          setAnalysisComplete(true); return;
        }

        const { ai_validation, prediction } = result.data ?? {};
        const pipelineStage = result.data?.stage ?? "passed";
        const pipelineStatus = result.data?.status ?? "pass";
        const pipelineReason = result.data?.reason ?? null;

        if (pipelineStage === "authenticity" && pipelineStatus === "fail") {
          consecutiveAnalysisFailuresRef.current += 1;
          setCurrentStage("review");
          setImageType("AI-GENERATED");
          setRequiresReview(false);
          setReviewReason(null);
          setAnalyzeError("This upload appears to be AI-generated or manipulated.");
          if (consecutiveAnalysisFailuresRef.current >= 3) {
            setAttemptWarning("Three authenticity checks failed. Check the lighting and capture a new, genuine road image.");
          }
          return;
        }

        setCurrentStage("presence");
        setAnalysisProgress("Checking for road damage…");

if (ai_validation && typeof ai_validation === "object") {
  const hfStat = ai_validation.status;

  setHfStatus(hfStat ?? null);
  setHfConfidence(ai_validation.confidence ?? null);
  setHfModel(ai_validation.model ?? null);
  setHfRawScores(ai_validation.raw_scores ?? null);
  setRequiresReview(false);
  setReviewReason(null);

  switch (hfStat) {
    case "approved_for_classification":
      setImageType("REAL");
      break;

    case "skipped":
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
      setImageType("REAL");
      setRequiresReview(true);
      setReviewReason("AI authenticity check unavailable — flagged for manual review");
      break;

    default:
      console.warn("[HF] Unexpected ai_validation.status:", hfStat, ai_validation);
      setImageType("REAL");
      break;
  }
} else {
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

        if (pipelineStage === "presence" && pipelineStatus === "fail") {
          consecutiveAnalysisFailuresRef.current += 1;
          setCurrentStage("review");
          setDamageType(null);
          setSeverity(null);
          setAiConfidence(result.data?.confidence ?? null);
          setAnalyzeError(pipelineReason === "no_damage"
            ? "No road damage detected. Please try again."
            : "The damage check could not confirm road damage.");
          if (consecutiveAnalysisFailuresRef.current >= 3) {
            setAttemptWarning("Three damage checks failed. Check the lighting, distance, and camera angle before trying again.");
          }
          return;
        }

        if (pipelineStatus === "flagged_for_review") {
          setRequiresReview(true);
          setReviewReason("AI-generated or manipulated media detected — full classification retained for admin review");
          setAnalyzeError(null);
        }

        setCurrentStage(pipelineStatus === "uncertain" ? "review" : "classification");
        setAnalysisProgress("Classifying damage and severity…");
        if (pipelineStatus === "uncertain") {
          setAnalyzeError("The damage classification is uncertain. Please capture a clearer image.");
          return;
        }
        consecutiveAnalysisFailuresRef.current = 0;
        setAttemptWarning(null);
        setCurrentStage("review");
      }

    } catch {
      if (analysisIdRef.current !== thisId) return;
      setAnalyzeError("Analysis error — please try re-uploading.");
    } finally {
      if (analysisIdRef.current === thisId) {
        setIsAnalyzing(false);
        setAnalysisProgress(null);
        setAnalysisComplete(true);
        setCurrentStage((stage) => stage === "idle" ? "review" : stage);
      }
    }
  }, [resetAnalysis]);

  // ── Retry handler — re-runs analysis on the same file, tracks attempt count ─
  const handleRetryAnalysis = useCallback(() => {
    if (!file || isAnalyzing) return;
    setRetryCount((c) => c + 1);
    runFullAnalysis(file);
  }, [file, isAnalyzing, runFullAnalysis]);

  // ── Camera helpers (UNCHANGED) ─────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    detectionLoopRef.current = false;
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
    setLiveDetectionError(null);
    setIsRecording(false);
    setRecordingTime(0);
    setLiveDetection({ detected: false, label: null, confidence: 0, bbox: null, distance: null, status: "idle" });
    setViewfinderSize({ width: 0, height: 0 });
    liveHistoryRef.current = [];
    liveConfirmedRef.current = null;
    liveMissesRef.current = 0;
  }, []);

  // ── startCamera — CHANGED: paced/downscaled realtime loop + failure logging
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setLiveDetectionError(null);
    try {
let stream;
try {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
} catch (firstError) {
  // Desktop WebViews may reject facingMode even when camera permission is granted.
  if (!['OverconstrainedError', 'NotFoundError', 'TypeError'].includes(firstError?.name)) {
    throw firstError;
  }
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
}
streamRef.current = stream;

// Wait for <video> to mount — fixes race where getUserMedia resolves
// before React commits the FullscreenCamera portal.
let attempts = 0;
while (!videoRef.current && attempts < 100) {
  await new Promise((r) => setTimeout(r, 20));
  attempts++;
}
if (videoRef.current) {
  videoRef.current.srcObject = stream;
  await videoRef.current.play();
} else {
  console.error("[camera] video element never mounted — could not attach stream");
  setCameraError("Camera view failed to load. Please retry.");
  return;
}
setCameraActive(true);
      // Self-pacing detection loop: the next frame is only sent after current
      // inference completes, so slow backend responses never cause overlapping
      // requests or queued-up fetches. detectionLoopRef acts as a stop flag.
      detectionLoopRef.current = true;
      (async () => {
        let consecFails = 0;
        while (detectionLoopRef.current) {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          try {
            const blob  = await snapRealtimeFrameBlob(videoRef.current);
            const result = await analyzeRealtimeFrame(blob);
            if (result.success) {
              consecFails = 0;
              setLiveDetectionError(null);
              const data = result.data ?? {};
              const allDets  = data?.all_detections ?? [];
              const backendDetected = data.detected === true;
              const currentLabel = allDets[0]?.class ?? allDets[0]?.label ?? data.prediction?.label ?? null;

              liveHistoryRef.current = [
                ...liveHistoryRef.current,
                { detected: backendDetected, label: currentLabel },
              ].slice(-3);

              if (backendDetected) {
                const matchingFrames = liveHistoryRef.current.filter(
                  (frame) => frame.detected && frame.label === currentLabel
                ).length;
                if (matchingFrames >= 2) {
                  liveConfirmedRef.current = { allDets, prediction: data.prediction, label: currentLabel };
                  liveMissesRef.current = 0;
                } else if (liveConfirmedRef.current?.label !== currentLabel) {
                  liveMissesRef.current += 1;
                }
              } else if (liveConfirmedRef.current) {
                liveMissesRef.current += 1;
                if (liveMissesRef.current > 3) {
                  liveConfirmedRef.current = null;
                  liveHistoryRef.current = [];
                }
              }

              const confirmed = liveConfirmedRef.current;
              if (!confirmed) {
                setLiveDetection((p) => ({ ...p, detected: false, status: "scanning", bbox: null, boxes: [] }));
              } else {
                const confirmedDets = confirmed.allDets ?? [];
                const best    = confirmedDets[0] ?? confirmed.prediction;
                const conf    = best?.confidence ?? 0;
                const normBox = best?.norm_bbox ?? null;
                const dist    = distanceFeedback(normBox);
                setLiveDetection({
                  detected:   true,
                  label:      best?.class ?? best?.label ?? null,
                  confidence: conf,
                  severity:   best?.severity,
                  bbox:       normBox,
                  boxes:      confirmedDets,
                  distance:   dist,
                  status:     dist.ok ? "detected" : "warning",
                });
              }
              if (videoRef.current) {
                setViewfinderSize({
                  width:  videoRef.current.offsetWidth  || 640,
                  height: videoRef.current.offsetHeight || 360,
                });
              }
            } else {
              // ── NEW: surface failures instead of swallowing them silently ──
              consecFails++;
              console.warn(`[realtime-detect] ${result.error || "frame request failed"} (consecutive fails: ${consecFails})`);
              if (consecFails >= REALTIME_MAX_CONSEC_FAILS) {
                setLiveDetectionError("Live detection is temporarily unavailable. You can still capture normally.");
              }
            }
          } catch (err) {
            // ── NEW: log instead of fully silent catch ──
            consecFails++;
            console.warn(`[realtime-detect] request error: ${err?.name ?? err} (consecutive fails: ${consecFails})`);
            if (consecFails >= REALTIME_MAX_CONSEC_FAILS) {
              setLiveDetectionError("Live detection is temporarily unavailable. You can still capture normally.");
            }
          }
          // Paced gap keeps us safely under the backend rate limit
          await new Promise((r) => setTimeout(r, REALTIME_FRAME_INTERVAL_MS));
        }
      })();
    } catch (err) {
      setCameraError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow access in your browser settings."
          : err.name === "NotFoundError"
          ? "No camera was found. Connect a camera and try again."
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
    await runFullAnalysis(captured, { source: "capture" });
  }, [capturing, stopCamera, runFullAnalysis]);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    try {
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
        const recordedType = mr.mimeType || mimeType;
        const recordedExtension = recordedType.toLowerCase().includes("mp4") ? "mp4" : "webm";
        const blob     = new Blob(chunksRef.current, { type: recordedType });
        const captured = new File([blob], `snap_video.${recordedExtension}`, { type: recordedType });
        setFile(captured);
        setPreview(URL.createObjectURL(blob));
        detectionLoopRef.current = false;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraActive(false);
        setShowCamera(false);
        setLiveDetection({ detected: false, label: null, confidence: 0, bbox: null, distance: null, status: "idle" });
        await runFullAnalysis(captured, { source: "capture" });
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
    } catch (err) {
      const msg =
        err.name === "NotAllowedError" || err.name === "SecurityError"
          ? "Camera or microphone permission was denied. Please allow access in your browser settings (usually the camera icon in the address bar), then try again."
          : err.name === "NotSupportedError"
          ? "Your browser or device doesn't support video recording. Try using Chrome or Edge and make sure your camera is connected."
          : "Could not start recording — your camera may have been disconnected or permissions were revoked. Please refresh and allow camera access.";
      setCameraError(msg);
    }
  }, [runFullAnalysis]);

  const stopRecordingEarly = useCallback(() => {
    clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Warm up the ML model as soon as this form mounts so the first camera frame
  // doesn't hit a cold model. Sends a 4×4 blank JPEG to /ml/analyze/realtime;
  // the backend loads model weights on first request, so subsequent frames are fast.
  // Fire-and-forget — failures are silently ignored.
  useEffect(() => {
    const warmupML = async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 4;
        canvas.height = 4;
        const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.5));
        if (!blob) return;
        await analyzeRealtimeFrame(blob);
      } catch {
        // best-effort — ignored
      }
    };
    warmupML();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const fetchLocation = useCallback(async (forceFresh = false) => {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    setLocationWarning("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        const lat = c.latitude, lng = c.longitude;
        setCoords({ lat, lng });
        setLocationSource(null);
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
        setBarangay("");
        setLocationWarning(
          "Location access was denied or unavailable — your barangay could not be detected automatically. " +
          "Please select your barangay manually before submitting."
        );
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: forceFresh ? 0 : 60_000 }
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

    if (!coords) {
      const gps = await readExifGps(f);
      if (gps) {
        setCoords({ lat: gps.lat, lng: gps.lng });
        setLocationSource("exif");
        try {
          const res  = await fetch(NOMINATIM_URL(gps.lat, gps.lng));
          const data = await res.json();
          const addr = data.address || {};
          setCity(addr.city || addr.town || addr.municipality || DEFAULT_CITY);
          setBarangay(detectBarangay(gps.lat, gps.lng, addr));
          setStreetName(
            [addr.road || addr.street || addr.pedestrian || "", addr.house_number]
              .filter(Boolean).join(" ").trim() ||
            `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
          );
        } catch {
          setCity(DEFAULT_CITY);
          setBarangay(detectBarangay(gps.lat, gps.lng));
          setStreetName(`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`);
        }
      }
    }

    await runFullAnalysis(f, { source: "upload" });
  }, [coords, runFullAnalysis]);

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
    stopCamera();
  }, [resetAnalysis, stopCamera]);

  // ── Form validation ────────────────────────────────────────────────────────
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
    if (!coords)      { setFormError("GPS coordinates required. Please allow location access, or upload a geotagged photo (taken with location enabled on your phone)."); return; }
    if (!disclaimerAccepted) { setFormError("Please accept the legal disclaimer to proceed."); return; }
    setFormError("");
    setShowSubmitModal(true);
  }, [file, isAnalyzing, analysisComplete, hfStatus, imageType, damageType, barangay, coords, disclaimerAccepted, manualReviewOverride]);

  // ── Submit (UNCHANGED) ────────────────────────────────────────────────────
  const performBackgroundSubmit = useCallback(async (reportPayload, mediaFile, existingReportId = null) => {
    try {
      let reportId = existingReportId;
      if (!reportId) {
        const reportRes = await createReport(reportPayload);
        if (!reportRes.success) throw new Error(reportRes.error || "Report submission failed.");
        reportId = reportRes.data?.id ?? reportRes.data?.report_id;
        if (!reportId) throw new Error("Server did not return a report ID.");
      }

      const uploadRes = await uploadMedia(reportId, mediaFile);
      if (!uploadRes.success) {
        pushOfflineToast({
          type: "warning",
          message: `Report #${reportId} was saved, but the photo/video upload failed.`,
          onRetry: () => performBackgroundSubmit(reportPayload, mediaFile, reportId),
        });
        return;
      }

      invalidateReportsCache?.();
      pushOfflineToast({ type: "success", message: `Report #${reportId} submitted successfully.` });
    } catch (err) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await enqueueOfflineReport(reportPayload, mediaFile);
          pushOfflineToast({
            type: "info",
            message: "Connection lost — report saved and will submit automatically once you're back online.",
          });
          return;
        } catch {
          // fall through to generic error handling below
        }
      }
      pushOfflineToast({
        type: "error",
        message: err.message || "Submission failed.",
        onRetry: () => performBackgroundSubmit(reportPayload, mediaFile, existingReportId),
      });
      if (String(err.message).includes("out_of_bounds")) {
        setFormError("This location is outside the supported service area.");
        setLocationWarning("This location is outside the supported service area.");
      }
    }
  }, [pushOfflineToast]);

  const handleSubmitConfirm = useCallback(() => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setShowSubmitModal(false);
    setFormError("");

    const is_flagged = imageType === "AI-GENERATED";
    const isVideo     = file && isVideoFile(file);
    const reportPayload = {
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
      // Only videos produce filmstrip snapshots today — omit entirely for
      // images so the payload stays small when there's nothing to send.
      detection_snapshots: isVideo && detectionSnapshots.length > 0
        ? detectionSnapshots.map((s) => ({
            frame: s.frame,
            timestamp_seconds: s.timestamp_seconds ?? null,
            label: s.label,
            confidence: s.confidence,
            image_b64: s.image_b64,
          }))
        : null,
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

    setSubmitSuccess(true);

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      enqueueOfflineReport(reportPayload, file)
        .then(() => {
          pushOfflineToast({
            type: "info",
            message: "You're offline — report saved and will submit automatically once you're back online.",
          });
        })
        .catch((err) => {
          pushOfflineToast({ type: "error", message: err.message || "Could not save report for offline submission." });
        })
        .finally(() => { submittingRef.current = false; });
      setTimeout(() => onClose(), 600);
      return;
    }

    performBackgroundSubmit(reportPayload, file).finally(() => {
      submittingRef.current = false;
    });
    setTimeout(() => onClose(), 600);
  }, [
    imageType, coords, barangay, streetName, additionalInfo,
    damageType, severity, aiConfidence, hfConfidence, hfStatus, hfModel,
    requiresReview, reviewReason, isHybrid, secondaryDamage, detectionNote,
    file, onClose, phoneAngle, angleValid, predictionResult,
    disclaimerAccepted, reporterName, userId, performBackgroundSubmit, pushOfflineToast,
  ]);
  // ── Derived values ─────────────────────────────────────────────────────────
  const canSubmit      = !isSubmitting && !isAnalyzing;
  const stageMessage   = {
    idle: "Preparing analysis…",
    authenticity: "Checking authenticity…",
    presence: "Checking for road damage…",
    classification: "Classifying damage and severity…",
    review: "Review AI results before submitting.",
    done: "Analysis complete.",
  }[currentStage] || "Analyzing…";
  const imageTypeBadge = hfStatus === "error" ? "HF-ERROR" : imageType;
  const recProgress    = (recordingTime / MAX_REC_SECS) * 100;
  const showAngleHUD   = cameraActive && phoneAngle !== null;

  const viewfinderOverlayDetections = liveDetection.boxes?.length
    ? liveDetection.boxes.map((b) => ({
        label:      b.class ?? b.label,
        confidence: b.confidence,
        severity:   b.severity ?? liveDetection.severity,
        x_norm: b.x_norm ?? (b.norm_bbox?.[0] ?? 0),
        y_norm: b.y_norm ?? (b.norm_bbox?.[1] ?? 0),
        w_norm: b.w_norm ?? ((b.norm_bbox?.[2] ?? 0) - (b.norm_bbox?.[0] ?? 0)),
        h_norm: b.h_norm ?? ((b.norm_bbox?.[3] ?? 0) - (b.norm_bbox?.[1] ?? 0)),
      }))
    : [];

  const viewfinderMaskDetections = liveDetection.boxes?.length
    ? liveDetection.boxes
    : [];

  const maskDetections = useMemo(() => allDetections, [allDetections]);

const effectiveSize = useMemo(() => {
  if (previewSize.width > 0 && previewSize.height > 0) return previewSize;
  if (naturalSize.width > 0 && naturalSize.height > 0) return naturalSize;
  return null;
}, [previewSize, naturalSize]);

const showMask = analysisComplete &&
  maskDetections.length > 0 &&
  effectiveSize !== null;

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
                {t.onRetry && (
                  <button
                    type="button"
                    className="offline-toast-retry"
                    onClick={() => {
                      setOfflineToasts((prev) => prev.filter((x) => x.id !== t.id));
                      t.onRetry();
                    }}
                  >
                    Retry
                  </button>
                )}
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

          {/* ── CAMERA VIEWFINDER — now a dedicated fullscreen popup ── */}
          {showCamera && (
            <FullscreenCamera
              activeTab={activeTab}
              cameraError={cameraError}
              liveDetectionError={liveDetectionError}
              videoRef={videoRef}
              onVideoPlay={(e) => setViewfinderSize({
                width:  e.target.offsetWidth  || 640,
                height: e.target.offsetHeight || 360,
              })}
              showAngleHUD={showAngleHUD}
              phoneAngle={phoneAngle}
              angleValid={angleValid}
              liveDetection={liveDetection}
              isRecording={isRecording}
              cameraActive={cameraActive}
              viewfinderSize={viewfinderSize}
              viewfinderOverlayDetections={viewfinderOverlayDetections}
              viewfinderMaskDetections={viewfinderMaskDetections}
              recProgress={recProgress}
              capturing={capturing}
              onCapturePhoto={capturePhoto}
              onStopCamera={stopCamera}
              onStartRecording={startRecording}
              onStopRecordingEarly={stopRecordingEarly}
              recordingTime={recordingTime}
              onRetryCamera={startCamera}
              MAX_REC_SECS={MAX_REC_SECS}
            />
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

                  {isAnalyzing && (
                    <>
                      <div className="seg-scan-grid"  aria-hidden="true" />
                      <div className="seg-scan-line"  aria-hidden="true" />
                    </>
                  )}

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
                  {analysisProgress || stageMessage || (activeTab === "video" ? "Analyzing video…" : "Analyzing image…")}
                </span>
              </div>
            ) : (
              <label id="image-type-label">
                {activeTab === "video" ? "MEDIA TYPE (AI CLASSIFIED)" : "IMAGE TYPE (AI CLASSIFIED)"}
              </label>
            )}
            <div className="classification-buttons" role="group" aria-labelledby="image-type-label">
              <span className={`class-btn ${imageTypeBadge === "REAL" ? "active-real" : ""} ${imageTypeBadge === "HF-ERROR" ? "active-hf-error" : ""}`}
                aria-current={imageType === "REAL" ? "true" : undefined}>REAL</span>
              <span className={`class-btn ${imageTypeBadge === "AI-GENERATED" ? "active-ai" : ""}`}
                aria-current={imageType === "AI-GENERATED" ? "true" : undefined}>AI-GENERATED</span>
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
                rawScores={hfRawScores || {}}
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
            {attemptWarning && !isAnalyzing && (
              <p className="retry-exhausted-msg" role="alert">
                <FaExclamationCircle aria-hidden="true" style={{ marginRight: 4 }} />
                {attemptWarning}
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

          {activeTab === "video" && analysisComplete && detectionSnapshots.length > 0 && (
            <DetectionFilmstrip snapshots={detectionSnapshots} />
          )}

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
                <span className={`class-btn ${damageType === "POTHOLE" ? "active-pothole" : ""}`}
                  aria-current={damageType === "POTHOLE" ? "true" : undefined}>POTHOLE</span>
                <span className={`class-btn ${damageType === "CRACK" ? "active-crack" : ""}`}
                  aria-current={damageType === "CRACK" ? "true" : undefined}>CRACK</span>
              </div>
            </div>
            <div className="class-group">
              <label id="severity-label">
                SEVERITY
                {isAnalyzing && <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 5 }} />}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="severity-label">
                <span className={`class-btn ${severity === "NON_CRITICAL" ? "active-non-critical" : ""}`}
                  aria-current={severity === "NON_CRITICAL" ? "true" : undefined}>NON_CRITICAL</span>
                <span className={`class-btn ${severity === "CRITICAL" ? "active-critical" : ""}`}
                  aria-current={severity === "CRITICAL" ? "true" : undefined}>CRITICAL</span>
              </div>
            </div>
          </div>

          <div className="snap-location-block">
            <div className="snap-location-header">
              <label>LOCATION &amp; BARANGAY</label>
              <button className="btn-refresh-loc" onClick={() => fetchLocation(true)}
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
            {locationSource === "exif" && (
              <div className="exif-location-banner" role="status" style={{
                display: "flex", alignItems: "center", gap: "8px",
                marginTop: "6px", padding: "8px 12px",
                background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.35)",
                borderRadius: "8px", color: "#1d4ed8", fontSize: "0.78rem", lineHeight: 1.4,
              }}>
                <FaExclamationCircle style={{ flexShrink: 0, color: "#2563eb" }} aria-hidden="true" />
                <span style={{ flex: 1 }}>Location from photo — please confirm this is where the damage is.</span>
                <button
                  type="button"
                  onClick={() => { setLocationSource(null); fetchLocation(true); }}
                  disabled={locationLoading}
                  style={{
                    flexShrink: 0, background: "none", border: "1px solid #3b82f6",
                    borderRadius: "6px", color: "#1d4ed8", fontSize: "0.75rem",
                    padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  Use live GPS
                </button>
              </div>
            )}
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
              <label htmlFor="reporter-name">Reporter</label>
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
              <select id="barangay-select" value={barangay}
                onChange={(e) => { setBarangay(e.target.value); setLocationWarning(""); }}
                className={!barangay ? "placeholder" : ""}
                disabled={isSubmitting} required>
                <option value="" disabled>Select Barangay</option>
                {MALABON_BARANGAYS?.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              {locationWarning && (
                <div className="location-warning-banner" role="alert" style={{
                  display: "flex", alignItems: "flex-start", gap: "8px",
                  marginTop: "8px", padding: "10px 12px",
                  background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.5)",
                  borderRadius: "8px", color: "#b45309", fontSize: "0.8rem", lineHeight: 1.4,
                }}>
                  <FaExclamationTriangle style={{ flexShrink: 0, marginTop: 2, color: "#d97706" }} aria-hidden="true" />
                  <span>{locationWarning}</span>
                </div>
              )}
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