/**
 * CreateReport.jsx — Refactored with YOLOv11 Segmentation Mask Support
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   1. Replaced old SegmentationMask (rect-only) with new polygon-based renderer
 *   2. Photo previews and overlays share the same image bounds
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
  useState, useRef, useEffect, useCallback, useMemo, useId,
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
import { analyzeRealtimeFrame, analyzeVideo } from "../../api/ml";
import { EvidencePhotoPreview, EvidencePhotoViewer } from "./EvidencePhoto";
import { analyzeReportPhoto } from "./photoAnalysis";
import { checkNearbyDuplicates, reconcileReport, reconcileMedia } from "../../api/reports";
import { useOfflineQueue, enqueueOfflineReport } from "../../hooks/useOfflineQueue";
import ReportDialog from "../../components/ReportDialog";
import { useLocation, useNavigate } from "react-router-dom";
import { invalidateReportsCache } from "../../hooks/useReports";
import PhotoCaptureGuide from "../../components/PhotoCaptureGuide";
import DetectionOverlay from "../../components/DetectionOverlay";

// ─── NEW: Import the refactored segmentation overlay ──────────────────────────
import SegmentationMask from "../../components/SegmentationMask";
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

function CreateReport({ onClose, reviewQueued = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    console.log("[CreateReport] MOUNTED");
    return () => console.log("[CreateReport] UNMOUNTED");
  }, []);
  const { profile } = useUser();

  const reporterName = useMemo(() => {
    return profile?.full_name || profile?.name || profile?.display_name
      || profile?.username || profile?.email || "Reporter";
  }, [profile]);

  const userId = useMemo(() => {
    if (profile?.public_id || profile?.id) return profile.public_id ?? profile.id;
    try {
      const cached = JSON.parse(localStorage.getItem("user"));
      return cached?.public_id ?? cached?.id ?? null;
    } catch {
      return null;
    }
  }, [profile]);

  const [showGuide,    setShowGuide]    = useState(!reviewQueued);
  const [activeTab,    setActiveTab]    = useState("photo");
  const [showCamera,   setShowCamera]   = useState(false);
  const [videoFile, setFile] = useState(null);
  const [videoPreview, setPreview] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const photoIndex = photos.findIndex(({ id }) => id === selectedPhotoId);
  const selectedPhoto = photos[photoIndex];
  const isPhoto = activeTab === "photo";
  const file = isPhoto ? selectedPhoto?.file : videoFile;
  const preview = isPhoto ? selectedPhoto?.preview : videoPreview;

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
  const [viewfinderSize, setViewfinderSize] = useState({ width: 0, height: 0 });
  const [detectionSnapshots, setDetectionSnapshots] = useState([]);

  const [videoIsAnalyzing,      setIsAnalyzing]      = useState(false);
  const [videoAnalysisProgress, setAnalysisProgress] = useState(null);
  const [videoAnalyzeError,     setAnalyzeError]     = useState(null);
  const [videoCurrentStage,     setCurrentStage]     = useState("idle");
  const [videoRetryCount,       setRetryCount]       = useState(0);
  const [videoHfStatus,         setHfStatus]         = useState(null);
  const [videoHfConfidence,     setHfConfidence]     = useState(null);
  const [videoHfModel,          setHfModel]          = useState(null);
  const [videoHfRawScores,      setHfRawScores]      = useState(null);
  const [videoImageType,        setImageType]        = useState(null);
  const [videoDamageType,       setDamageType]       = useState(null);
  const [videoSeverity,         setSeverity]         = useState(null);
  const [videoAiConfidence,     setAiConfidence]     = useState(null);
  const [videoAnalysisComplete, setAnalysisComplete] = useState(false);
  const [videoPredictionResult, setPredictionResult] = useState(null);

  const [videoDefinitiveNoDamage, setDefinitiveNoDamage] = useState(false);
  const [videoRequiresReview, setRequiresReview] = useState(false);
  const [videoReviewReason,   setReviewReason]   = useState(null);
  const [videoManualReviewOverride, setManualReviewOverride] = useState(false);
  const [isHybrid,        setIsHybrid]        = useState(false);
  const [secondaryDamage, setSecondaryDamage] = useState(null);
  const [detectionNote,   setDetectionNote]   = useState(null);

  const photoAnalysis = selectedPhoto?.analysis ?? {};
  const isAnalyzing = isPhoto ? !!selectedPhoto?.pending : videoIsAnalyzing;
  const analysisProgress = isPhoto ? null : videoAnalysisProgress;
  const analyzeError = isPhoto ? photoAnalysis.analyzeError : videoAnalyzeError;
  const currentStage = isPhoto ? photoAnalysis.currentStage ?? "authenticity" : videoCurrentStage;
  const retryCount = isPhoto ? selectedPhoto?.retries ?? 0 : videoRetryCount;
  const hfStatus = isPhoto ? photoAnalysis.hfStatus : videoHfStatus;
  const hfConfidence = isPhoto ? photoAnalysis.hfConfidence ?? null : videoHfConfidence;
  const hfRawScores = isPhoto ? photoAnalysis.hfRawScores : videoHfRawScores;
  const imageType = isPhoto ? photoAnalysis.imageType ?? null : videoImageType;
  const predictionResult = isPhoto ? photoAnalysis.predictionResult : videoPredictionResult;
  const damageType = isPhoto ? normalizeDamageType(predictionResult?.label) : videoDamageType;
  const severity = isPhoto ? normalizeSeverity(predictionResult?.severity) : videoSeverity;
  const aiConfidence = isPhoto ? predictionResult?.confidence ?? photoAnalysis.aiConfidence ?? null : videoAiConfidence;
  const analysisComplete = isPhoto ? !!photoAnalysis.analysisComplete : videoAnalysisComplete;
  const definitiveNoDamage = isPhoto ? photoAnalysis.definitiveNoDamage : videoDefinitiveNoDamage;
  const reviewReason = isPhoto ? photoAnalysis.reviewReason : videoReviewReason;
  const manualReviewOverride = isPhoto ? photoAnalysis.manualReviewOverride : videoManualReviewOverride;
  const maskDetections = photoAnalysis.allDetections ?? [];
  const qualifyingPhotos = photos.filter(({ pending, analysis }) => !pending && !analysis.definitiveNoDamage
    && !["error", "failed", "unavailable", "pending", "processing"].includes(analysis.hfStatus)
    && analysis.allDetections?.some((detection) => normalizeDamageType(detection.class)));
  const requiresReview = isPhoto ? qualifyingPhotos.some(({ analysis }) => analysis.requiresReview) : videoRequiresReview;
  const noPhotoDamage = isPhoto && analysisComplete && (definitiveNoDamage || (!analyzeError && !maskDetections.length));

  const [coords,          setCoords]          = useState(null);
  const [locationSource,  setLocationSource]  = useState(null); // 'exif' | null
  const [city,            setCity]            = useState(DEFAULT_CITY);
 const [barangay,         setBarangay]        = useState("");
const [barangayVerified, setBarangayVerified] = useState(true);
  const [streetName,      setStreetName]      = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationWarning, setLocationWarning] = useState("");

  const [additionalInfo,    setAdditionalInfo]    = useState("");
  const [disclaimerAccepted,setDisclaimerAccepted]= useState(false);
  const [formError,         setFormError]         = useState("");
  const [isSubmitting,      setIsSubmitting]      = useState(false);
  const [submitSuccess,     setSubmitSuccess]     = useState(false);
  const [pendingUploads, setPendingUploads] = useState(null);
  const [showDiscardModal,  setShowDiscardModal]  = useState(false);
  const [showSubmitModal,   setShowSubmitModal]   = useState(false);
  const [duplicateReview, setDuplicateReview] = useState(null);
  const [differentDefect, setDifferentDefect] = useState(false);
  const duplicateMatchesId = useId();
  const duplicateMatches = duplicateReview?.result?.matches ?? [];
  const visibleMatches = duplicateReview?.expanded ? duplicateMatches : duplicateMatches.slice(0, 2);
  const reviewSubmissionId = duplicateReview?.draft.payload.capture_metadata?.submission_id;
  const viewingMatch = Boolean(reviewSubmissionId && location.state?.duplicateReview === reviewSubmissionId);
  const eligibleDamageTypes = [...new Set((isPhoto
    ? qualifyingPhotos.flatMap(({ analysis }) => analysis.allDetections.map(({ class: label }) => label))
    : [damageType, secondaryDamage, ...detectionSnapshots.map(({ label }) => label)]
  ).flatMap((label) => (label ?? "").split("+").map((part) => normalizeDamageType(part.trim())))
    .filter(Boolean))].sort();
  const duplicateKey = JSON.stringify([coords?.lat, coords?.lng, eligibleDamageTypes]);
  const duplicateKeyRef = useRef(duplicateKey);
  duplicateKeyRef.current = duplicateKey;

  useEffect(() => {
    setDuplicateReview((review) => review && !review.draft.queueId && review.draft.key !== duplicateKey ? null : review);
    setDifferentDefect(false);
  }, [duplicateKey]);

  // ── Offline queue toasts ─────────────────────────────────────────────────
  const [offlineToasts, setOfflineToasts] = useState([]);
  const pushOfflineToast = useCallback((toast) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setOfflineToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setOfflineToasts((prev) => prev.filter((t) => t.id !== id));
    }, toast.onRetry ? 15000 : 6000);
  }, []);

  const { isOnline, confirmationItems, resumeQueuedReport } = useOfflineQueue({
    userId,
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
  const photoUrls = useRef(new Map());
  const photoAnalysisQueue = useRef(Promise.resolve());
  const nextPhotoId = useRef(0);
  const retakePhotoId = useRef(null);
  const angleRef         = useRef(null);
  const submittingRef    = useRef(false);
  const liveHistoryRef   = useRef([]);
  const liveConfirmedRef = useRef(null);
  const liveMissesRef    = useRef(0);

  useEffect(() => {
    const urls = photoUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const queuePhotoAnalysis = useCallback((photo) => {
    photoAnalysisQueue.current = photoAnalysisQueue.current.then(async () => {
      if (!photoUrls.current.has(photo.id)) return;
      let analysis;
      try {
        analysis = await analyzeReportPhoto(photo.file, photo.source);
      } catch {
        analysis = { analysisComplete: true, currentStage: "review", analyzeError: "Analysis error — please try re-uploading." };
      }
      if (!photoUrls.current.has(photo.id)) return;
      setPhotos((current) => current.map((entry) => entry.id === photo.id
        ? { ...entry, pending: false, analysis } : entry));
    });
  }, []);

  const addPhotos = useCallback((files, source, replaceId = null) => {
    const added = files.map((file) => {
      const id = ++nextPhotoId.current;
      const preview = URL.createObjectURL(file);
      photoUrls.current.set(id, preview);
      return { id, file, preview, source, pending: true, retries: 0, analysis: {} };
    });
    if (!added.length) return;
    if (replaceId !== null) {
      URL.revokeObjectURL(photoUrls.current.get(replaceId));
      photoUrls.current.delete(replaceId);
    }
    setPhotos((current) => replaceId === null
      ? [...current, ...added]
      : current.map((photo) => photo.id === replaceId ? added[0] : photo));
    setSelectedPhotoId((current) => replaceId !== null || current === null ? added[0].id : current);
    setFormError("");
    added.forEach(queuePhotoAnalysis);
  }, [queuePhotoAnalysis]);

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
    setDetectionSnapshots([]);
    setIsHybrid(false);
    setSecondaryDamage(null);
    setDetectionNote(null);
    setRequiresReview(false);
    setReviewReason(null);
    setDefinitiveNoDamage(false);
  }, []);

  const runFullAnalysis = useCallback(async (f, { source = "upload" } = {}) => {
    const thisId = ++analysisIdRef.current;
    resetAnalysis();
    setIsAnalyzing(true);
    setCurrentStage("authenticity");
    setAnalysisProgress("Analyzing video…");

    try {
      let result;

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

        if (!dt) {
          setDefinitiveNoDamage(true);
          setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
        }
      } else {
        setDamageType(null);
        setDefinitiveNoDamage(true);
        setAnalyzeError("No damage detected in video. Try a clearer or longer clip.");
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
    if (selectedPhoto && isPhoto) {
      setPhotos((current) => current.map((photo) => photo.id === selectedPhoto.id
        ? { ...photo, pending: true, retries: photo.retries + 1, analysis: {} } : photo));
      queuePhotoAnalysis(selectedPhoto);
      return;
    }
    setRetryCount((c) => c + 1);
    runFullAnalysis(file);
  }, [file, isAnalyzing, isPhoto, selectedPhoto, queuePhotoAnalysis, runFullAnalysis]);

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
      // requests or queued-up fetches. A new camera session supersedes the previous loop.
      detectionLoopRef.current = stream;
      (async () => {
        let consecFails = 0;
        while (detectionLoopRef.current === stream) {
          if (!videoRef.current || videoRef.current.readyState < 2) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          try {
            const blob  = await snapRealtimeFrameBlob(videoRef.current);
            const result = await analyzeRealtimeFrame(blob);
            if (detectionLoopRef.current !== stream) break;
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
    try {
      const blob = await snapFrameBlob(videoRef.current);
      if (!blob) {
        setCameraError("Could not capture this photo. Please try again.");
        return;
      }
      const captured = new File([blob], "snap_capture.jpg", { type: "image/jpeg" });
      addPhotos([captured], "capture", retakePhotoId.current);
      retakePhotoId.current = null;
      stopCamera();
    } finally {
      setCapturing(false);
    }
  }, [capturing, stopCamera, addPhotos]);

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
        const detected = detectBarangay(lat, lng, addr);
        setBarangay(detected.name);
        setBarangayVerified(detected.verified);
        setStreetName(
          [addr.road || addr.street || addr.pedestrian || "", addr.house_number]
            .filter(Boolean).join(" ").trim() ||
          `${lat.toFixed(5)}, ${lng.toFixed(5)}`
        );
      } catch {
        setCity(DEFAULT_CITY);
        const detected = detectBarangay(lat, lng);
        setBarangay(detected.name);
        setBarangayVerified(detected.verified);
        setStreetName(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
        setLocationLoading(false);
      },
      () => {
        setCity(DEFAULT_CITY);
        setBarangay("");
        setBarangayVerified(true);
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
    const chosen = Array.from(e.target.files);
    e.target.value = "";
    if (!chosen.length) return;
    const files = chosen.filter((file) => isPhoto ? !isVideoFile(file) : isVideoFile(file));
    if (files.length !== chosen.length) setFormError(isPhoto ? "Choose photos on the Photo tab." : "Choose a video on the Video tab.");
    const f = files[0];
    if (!f) return;
    if (isPhoto) addPhotos(files, "upload");
    else {
      setRetryCount(0);
      setManualReviewOverride(false);
      setFile(f);
      setPreview(URL.createObjectURL(f));
      setFormError("");
      runFullAnalysis(f, { source: "upload" });
    }

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
          const detected = detectBarangay(gps.lat, gps.lng, addr);
          setBarangay(detected.name);
          setBarangayVerified(detected.verified);
          setStreetName(
            [addr.road || addr.street || addr.pedestrian || "", addr.house_number]
              .filter(Boolean).join(" ").trim() ||
            `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
          );
        } catch {
          setCity(DEFAULT_CITY);
          const detected = detectBarangay(gps.lat, gps.lng);
          setBarangay(detected.name);
          setBarangayVerified(detected.verified);
          setStreetName(`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`);
        }
      }
    }

  }, [coords, isPhoto, addPhotos, runFullAnalysis]);

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

  // ── Retake — discards current media/analysis and jumps straight back
  // into the camera, instead of returning to the empty upload placeholder.
  const removeSelectedPhoto = () => {
    if (!selectedPhoto) return;
    URL.revokeObjectURL(selectedPhoto.preview);
    photoUrls.current.delete(selectedPhoto.id);
    setPhotos(photos.filter(({ id }) => id !== selectedPhoto.id));
    setSelectedPhotoId(photos[photoIndex + 1]?.id ?? photos[photoIndex - 1]?.id ?? null);
    if (photos.length === 1) setDisclaimerAccepted(false);
    setFormError("");
  };

  const handleRetake = (e) => {
    e.stopPropagation();
    if (isPhoto) retakePhotoId.current = selectedPhoto.id;
    else clearMedia(e);
    openCamera();
  };

  const openAdditionalPhoto = () => {
    retakePhotoId.current = null;
    openCamera();
  };

  const requestManualReview = () => {
    const reason = reviewReason || "AI analysis unavailable after repeated retries — submitted for manual review";
    if (isPhoto) {
      setPhotos((current) => current.map((photo) => photo.id === selectedPhotoId ? {
        ...photo,
        analysis: { ...photo.analysis, manualReviewOverride: true, requiresReview: true, reviewReason: reason },
      } : photo));
    } else {
      setManualReviewOverride(true);
      setRequiresReview(true);
      setReviewReason(reason);
    }
    setFormError("");
  };

  // ── Form validation ────────────────────────────────────────────────────────
  const validateForm = () => {
    if (!file)        { setFormError("Evidence required: Please upload or capture a photo/video."); return; }
    if ((!isPhoto && isAnalyzing) || (isPhoto && photos.some(({ pending }) => pending))) {
      setFormError("Please wait for AI analysis to complete."); return;
    }
    if (isPhoto) {
      if (!qualifyingPhotos.length) { setFormError("Add a photo with a crack or pothole detection."); return; }
    } else if (!manualReviewOverride) {
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
  };

  const submitEvidence = async ({ payload, files, reportId: existingReportId, key }) => {
    let reportId = existingReportId;
    let remaining = files;
    if (!navigator.onLine && !payload.user_id) {
      throw new Error("Could not identify your account offline. Reconnect to submit this draft.");
    }
    try {
      if (navigator.onLine) {
        if (!reportId) {
          const result = await reconcileReport(payload);
          if (!result.success) {
            const error = new Error(result.error || "Report submission failed.");
            error.status = result.status;
            if (result.detail?.code === "nearby_duplicate_confirmation_required") error.duplicate = result.detail;
            throw error;
          }
          reportId = result.data?.id ?? result.data?.report_id;
          if (!reportId) throw new Error("Server did not return a report ID.");
        }
        while (remaining.length) {
          const result = await reconcileMedia(reportId, remaining[0].file, remaining[0].uploadId);
          if (!result.success) throw new Error(result.error || "Evidence upload failed.");
          remaining = remaining.slice(1);
        }
      } else {
        await enqueueOfflineReport(payload, remaining, reportId);
      }
    } catch (err) {
      if (err.duplicate) throw err;
      if (reportId || !(err.status >= 400 && err.status < 500 && err.status !== 408)) {
        setPendingUploads({ payload, files: remaining, reportId, key });
      }
      if (!navigator.onLine) {
        if (!payload.user_id) throw err;
        await enqueueOfflineReport(payload, remaining, reportId);
      } else {
        throw new Error(reportId ? `Report #${reportId} was saved. ${err.message}` : err.message);
      }
    }
    invalidateReportsCache();
  };

  const buildSubmissionDraft = () => {
    const analyses = qualifyingPhotos.map(({ analysis }) => analysis);
    const ranked = analyses.filter(({ predictionResult }) => normalizeDamageType(predictionResult?.label))
      .sort((a, b) => b.predictionResult.confidence - a.predictionResult.confidence
        || a.predictionResult.label.localeCompare(b.predictionResult.label));
    const primary = ranked[0] ?? analyses[0];
    const authenticity = analyses.find(({ imageType }) => imageType === "AI-GENERATED") ?? primary;
    const reportSeverity = ranked.some(({ predictionResult }) => normalizeSeverity(predictionResult.severity) === "CRITICAL")
      ? "CRITICAL" : normalizeSeverity(primary?.predictionResult?.severity);
    const primaryLabel = normalizeDamageType(primary?.predictionResult?.label);
    const photoType = eligibleDamageTypes.includes(primaryLabel) ? primaryLabel : eligibleDamageTypes[0];
    const reportPayloadType = DAMAGE_TYPE_BACKEND[isPhoto ? photoType : damageType] ?? null;
    const reportPayload = {
      user_id: userId, reporter_name: reporterName,
      latitude: coords.lat, longitude: coords.lng,
      barangay, street_name: streetName || null,
      city: city?.trim() || null,
      description: additionalInfo?.trim() || null,
      ai_damage_type: reportPayloadType,
      ai_severity: SEVERITY_BACKEND[isPhoto ? reportSeverity : severity] ?? null,
      ai_confidence: (isPhoto ? primary?.predictionResult?.confidence : aiConfidence) ?? 0,
      is_flagged_fake: (isPhoto ? authenticity?.imageType : imageType) === "AI-GENERATED",
      fake_confidence: (isPhoto ? authenticity?.hfConfidence : hfConfidence) ?? 0,
      report_type: isPhoto ? "image" : "video",
      is_hybrid: isPhoto ? eligibleDamageTypes.length > 1 : isHybrid,
      secondary_damage: isPhoto
        ? DAMAGE_TYPE_BACKEND[eligibleDamageTypes.find((type) => DAMAGE_TYPE_BACKEND[type] !== reportPayloadType)] ?? null
        : DAMAGE_TYPE_BACKEND[normalizeDamageType(secondaryDamage)] ?? null,
      detection_note: detectionNote ?? null,
      detection_snapshots: !isPhoto && detectionSnapshots.length ? detectionSnapshots.map((s) => ({
        frame: s.frame, timestamp_seconds: s.timestamp_seconds ?? null,
        label: s.label, confidence: s.confidence, image_b64: s.image_b64,
      })) : null,
      ai_validation_status: (isPhoto ? authenticity?.hfStatus : hfStatus) ?? null,
      ai_validation_confidence: (isPhoto ? authenticity?.hfConfidence : hfConfidence) ?? null,
      ai_validation_model: (isPhoto ? authenticity?.hfModel : videoHfModel) ?? null,
      requires_admin_review: requiresReview,
      review_reason: (isPhoto ? analyses.find(({ requiresReview }) => requiresReview)?.reviewReason : reviewReason) ?? null,
      disclaimer_accepted: disclaimerAccepted,
      capture_metadata: {
        submission_id: crypto.randomUUID(),
        angle_degrees: phoneAngle !== null ? Math.round(phoneAngle) : null,
        angle_valid: angleValid,
        estimated_distance_text: (isPhoto ? primary?.predictionResult : predictionResult)?.distance?.text ?? null,
        distance_method: "bbox_area_estimation",
      },
    };

    const files = (isPhoto ? qualifyingPhotos.map(({ file }) => file) : [file])
      .map((file) => ({ file, uploadId: crypto.randomUUID() }));
    return { payload: reportPayload, files, key: duplicateKey };
  };

  const openDuplicateReview = (draft, result, error = "") => {
    setDifferentDefect(false);
    setDuplicateReview({ draft, result, error, expanded: false });
  };

  const runSubmission = async (draft, lookup = false) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setShowSubmitModal(false);
    setFormError("");
    try {
      if (lookup && (navigator.onLine || draft.queueId)) {
        const result = await checkNearbyDuplicates(draft.payload);
        if (!draft.queueId && draft.key !== duplicateKeyRef.current) return;
        if (!result.success || !Array.isArray(result.data?.matches)) {
          openDuplicateReview(draft, null, true);
          return;
        }
        if (result.data.matches.length) {
          openDuplicateReview(draft, result.data);
          return;
        }
      }
      if (draft.queueId) {
        const remaining = await resumeQueuedReport(draft.queueId, draft.payload);
        if (remaining?.needsConfirmation) {
          openDuplicateReview(draft, remaining.needsConfirmation);
          return;
        }
        setDuplicateReview(null);
        invalidateReportsCache();
        return;
      }
      await submitEvidence(draft);
      setDuplicateReview(null);
      setPendingUploads(null);
      setSubmitSuccess(true);
      setTimeout(onClose, 600);
    } catch (err) {
      if (err.duplicate) {
        setPendingUploads(null);
        if (draft.key === duplicateKeyRef.current) openDuplicateReview(draft, err.duplicate);
      } else {
        setDuplicateReview(null);
        setFormError(err.message || "Submission failed.");
      }
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  const handleSubmitConfirm = () => runSubmission(pendingUploads ?? buildSubmissionDraft(), !pendingUploads);

  const reviewQueuedDraft = (item) => runSubmission({
    queueId: item.queueId, payload: item.payload, files: item.files,
  }, true);

  const confirmDuplicateReview = () => {
    const { draft, result } = duplicateReview;
    if (!differentDefect || (!draft.queueId && draft.key !== duplicateKeyRef.current)) return;
    runSubmission({
      ...draft,
      payload: {
        ...draft.payload,
        duplicate_confirmed: true,
        duplicate_match_ids: result.matches.map(({ id }) => id),
        duplicate_confirmation_token: result.confirmation_token,
      },
    });
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  // Blocks submission when analysis finished and found no damage (includes
  // the new "no_road_pavement" scene-gate rejection, since that also leaves
  const noDamageBlocked = !isPhoto && analysisComplete && !manualReviewOverride && damageType === null;
  const canSubmit = !isSubmitting && !isAnalyzing && !noDamageBlocked && !photos.some(({ pending }) => pending) && (!isPhoto || qualifyingPhotos.length > 0);
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

  const switchTab = (id) => {
    if (id === activeTab) return;
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrls.current.clear();
    setPhotos([]);
    setSelectedPhotoId(null);
    retakePhotoId.current = null;
    clearMedia();
    setActiveTab(id);
  };

  if (showGuide) {
    return <PhotoCaptureGuide onContinue={() => setShowGuide(false)} onClose={onClose} />;
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return ReactDOM.createPortal(
    <div className="snap-overlay" style={viewingMatch ? { display: "none" } : undefined}>
      {viewerOpen && selectedPhoto && <EvidencePhotoViewer photo={selectedPhoto} onClose={() => setViewerOpen(false)} />}
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

        {confirmationItems.length > 0 && (
          <section className="nearby-queue" aria-label="Queued reports needing confirmation">
            <strong>Queued reports · Needs confirmation</strong>
            {confirmationItems.map((item) => (
              <div className="nearby-queue-item" key={item.queueId}>
                <span>{item.payload.street_name || item.payload.barangay || "Saved report"}</span>
                <button type="button" className="btn-modal-secondary"
                  disabled={isSubmitting || !isOnline} onClick={() => reviewQueuedDraft(item)}>
                  Review draft
                </button>
              </div>
            ))}
          </section>
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
              { id: "photo", label: "Photo", icon: <FaCamera className="tab-icon" aria-hidden="true" /> },
              { id: "video", label: "Video", icon: <FaVideo className="tab-icon" aria-hidden="true" /> },
            ].map(({ id, label, icon }) => (
              <button key={id} role="tab" aria-selected={activeTab === id}
                className={`snap-tab ${activeTab === id ? "active" : ""}`}
                onClick={() => switchTab(id)} disabled={isSubmitting}>
                {icon} {label}
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
              onStopCamera={() => { retakePhotoId.current = null; stopCamera(); }}
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
              role={preview ? undefined : "button"} aria-label={preview ? undefined : "Upload evidence file"}
              tabIndex={preview ? undefined : 0}
              onKeyDown={(e) => {
                if (!preview && !isSubmitting && !isAnalyzing && ["Enter", " "].includes(e.key)) {
                  e.preventDefault();
                  fileRef.current.click();
                }
              }}
            >
              {preview ? (
                <>
                  <div className="preview-container">
                    {isPhoto ? (
                      <EvidencePhotoPreview key={selectedPhotoId} photo={selectedPhoto}
                        onExpand={() => setViewerOpen(true)} />
                    ) : (
                      <video src={preview} className="preview-img" muted autoPlay loop playsInline controls />
                    )}

                    {isAnalyzing && (
                      <>
                        <div className="seg-scan-grid"  aria-hidden="true" />
                        <div className="seg-scan-line"  aria-hidden="true" />
                      </>
                    )}

                    {isPhoto && analysisComplete && (
                      <>
                        <div className="preview-det-count" role="status">
                          {maskDetections.length} {maskDetections.length === 1 ? "detection" : "detections"}
                        </div>
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

                    {isAnalyzing && (
                      <div className="preview-analyzing-overlay" aria-live="polite">
                        <FaSpinner className="spin-icon" aria-hidden="true" />
                        <span>{analysisProgress || "Analyzing…"}</span>
                      </div>
                    )}
                  </div>

                  {/* Sibling of .preview-container, direct child of the
                      FIXED-SIZE .snap-upload-box — position is anchored to
                      the frame itself, completely independent of the
                      photo/video's own dimensions or aspect ratio. */}
                  {!isSubmitting && !isAnalyzing && (
                    <div className="cr-preview-toolbar">
                      <button className="cr-retake-btn" onClick={handleRetake} aria-label="Retake photo or video">
                        <FaRedo aria-hidden="true" />
                      </button>
                      <button className="cr-trash-btn" onClick={isPhoto ? removeSelectedPhoto : clearMedia} aria-label={isPhoto ? "Remove selected photo" : "Remove file"}>
                        <FaRegTrashAlt aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="upload-placeholder">
                  <div className="icon-circle" aria-hidden="true">
                    {activeTab === "photo" ? <FaCamera /> : <FaVideo />}
                  </div>
                  <h3>{activeTab === "photo" ? "Upload Photo" : "Upload Video"}</h3>
                  <p>
                    {activeTab === "video"
                      ? "MP4, MOV, or AVI · up to 10s recommended"
                      : "Tap to select photos"}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Open camera buttons */}
          {!showCamera && isPhoto && photos.length > 1 && (
            <div className="evidence-carousel" role="group" aria-label="Evidence photos">
              <div className="evidence-carousel-nav">
                <button type="button" aria-label="Previous photo" disabled={photoIndex <= 0}
                  onClick={() => setSelectedPhotoId(photos[photoIndex - 1].id)}>‹</button>
                <span role="status">Photo {photoIndex + 1} of {photos.length}</span>
                <button type="button" aria-label="Next photo" disabled={photoIndex >= photos.length - 1}
                  onClick={() => setSelectedPhotoId(photos[photoIndex + 1].id)}>›</button>
              </div>
              <div className="evidence-thumbnails">
                {photos.map((photo, index) => (
                  <button type="button" key={photo.id} aria-pressed={photo.id === selectedPhotoId}
                    aria-label={`Show photo ${index + 1}: ${photo.file.name}`}
                    onClick={() => setSelectedPhotoId(photo.id)}>
                    <img src={photo.preview} alt="" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {!showCamera && isPhoto && (
            <div className="evidence-add-actions">
              <button type="button" className="btn-use-camera" onClick={openAdditionalPhoto}
                disabled={isSubmitting}>
                <FaCamera aria-hidden="true" /> {photos.length ? "Take another photo" : "Use Camera"}
              </button>
              {!!photos.length && (
                <button type="button" className="btn-use-camera" disabled={isSubmitting}
                  onClick={() => fileRef.current.click()}>Add photos</button>
              )}
            </div>
          )}
          {!showCamera && !preview && activeTab === "video" && (
            <button className="btn-use-camera" onClick={openCamera}
              disabled={isSubmitting || isAnalyzing}>
              <FaVideo aria-hidden="true" /> Record Video
            </button>
          )}

          <input ref={fileRef} type="file" hidden multiple={isPhoto}
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
            {imageType === "AI-GENERATED" && damageType !== null && (
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
            {noPhotoDamage && <p className="flagged-note" role="status">No damage detected · Won’t be included</p>}
            {analyzeError && !isAnalyzing && !noPhotoDamage && (
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
                ) : file && retryCount >= MAX_ANALYSIS_RETRIES && definitiveNoDamage ? (
                  <div className="retry-exhausted-block">
                    <p className="retry-exhausted-msg" role="alert">
                      <FaExclamationCircle aria-hidden="true" style={{ marginRight: 4 }} />
                      No road damage was found after {MAX_ANALYSIS_RETRIES} attempts. This photo
                      cannot be submitted — please retake it showing clear road or pavement damage.
                    </p>
                  </div>
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
                        onClick={requestManualReview}
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

          {activeTab === "video" && analysisComplete && detectionSnapshots.length > 0 && (
            <DetectionFilmstrip snapshots={detectionSnapshots} />
          )}

          {isPhoto && photos.length > 0 && (
            <p className="evidence-submit-count" role="status">
              {qualifyingPhotos.length} of {photos.length} {photos.length === 1 ? "photo" : "photos"} will be submitted
            </p>
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
              <label htmlFor="barangay-field">
                BARANGAY <span style={{ color: "red" }} aria-hidden="true">*</span>
              </label>

              {city && city.trim().toLowerCase() === "malabon" ? (
                <select id="barangay-field" value={barangay}
                  onChange={(e) => { setBarangay(e.target.value); setBarangayVerified(true); setLocationWarning(""); }}
                  className={!barangay ? "placeholder" : ""}
                  disabled={isSubmitting} required>
                  <option value="" disabled>Select Barangay</option>
                  {MALABON_BARANGAYS?.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              ) : (
                <input
                  id="barangay-field"
                  type="text"
                  value={barangay}
                  placeholder="Enter barangay"
                  onChange={(e) => { setBarangay(e.target.value); setBarangayVerified(true); setLocationWarning(""); }}
                  disabled={isSubmitting}
                  required
                />
              )}

              {!barangayVerified && barangay && (
                <div className="location-warning-banner" role="status" style={{
                  display: "flex", alignItems: "flex-start", gap: "8px",
                  marginTop: "8px", padding: "10px 12px",
                  background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.35)",
                  borderRadius: "8px", color: "#1d4ed8", fontSize: "0.8rem", lineHeight: 1.4,
                }}>
                  <FaExclamationCircle style={{ flexShrink: 0, marginTop: 2, color: "#2563eb" }} aria-hidden="true" />
                  <span>
                    This is outside Malabon's maintained barangay list — we auto-filled our best
                    guess from GPS, but please double-check or correct it.
                  </span>
                </div>
              )}

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
            <button className="btn-submit" onClick={pendingUploads ? handleSubmitConfirm : validateForm}
              disabled={(pendingUploads ? isSubmitting : !canSubmit) || submitSuccess} aria-busy={isSubmitting}
              title={noDamageBlocked ? "Submission disabled — no road damage detected" : undefined}>
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

        {duplicateReview && !viewingMatch && (
          <ReportDialog label={duplicateReview.error ? "Couldn’t check for nearby reports" : "Possible duplicate reports nearby"}
            onClose={() => { if (!submittingRef.current) setDuplicateReview(null); }}>
            <div className="modal-backdrop nearby-duplicate-backdrop">
              <div className="modal-box nearby-duplicate-dialog">
                <header>
                  <h3>{duplicateReview.error ? "Couldn’t check for nearby reports" : "Possible duplicate reports nearby"}</h3>
                  {duplicateReview.error ? (
                    <p role="alert">Your draft is still here. Try again to check for nearby reports.</p>
                  ) : (
                    <p>We found nearby reports that may show the same damage. Review them before submitting. If this is a different defect, you can continue.</p>
                  )}
                </header>
                {duplicateMatches.length > 0 && (
                  <div className="nearby-duplicate-list-header">
                    <span>{duplicateMatches.length === 1 ? "1 match" : `${duplicateMatches.length} matches`}</span>
                    {duplicateMatches.length > 2 && (
                      <button type="button" className="btn-modal-secondary"
                        aria-controls={duplicateMatchesId} aria-expanded={duplicateReview.expanded}
                        onClick={() => setDuplicateReview((review) => ({ ...review, expanded: !review.expanded }))}>
                        {duplicateReview.expanded ? "Show fewer" : `Show ${duplicateMatches.length - 2} more reports`}
                      </button>
                    )}
                  </div>
                )}
                {(duplicateReview.draft.queueId || visibleMatches.length > 0) && (
                  <div className="nearby-duplicate-results">
                    {duplicateReview.draft.queueId && (
                      <div className="nearby-queued-draft">
                        <strong>Queued draft</strong>
                        <div>{[duplicateReview.draft.payload.street_name, duplicateReview.draft.payload.barangay].filter(Boolean).join(", ")}</div>
                        <div>{duplicateReview.draft.payload.description}</div>
                        <div className="nearby-queued-evidence">
                          {(duplicateReview.draft.files ?? []).map((file) => (
                            file.type?.startsWith("image/") && file.dataUrl
                              ? <img key={file.uploadId} src={file.dataUrl} alt={file.name} />
                              : <span key={file.uploadId}>{file.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {!duplicateReview.error && (
                      <ul id={duplicateMatchesId} className="nearby-duplicate-matches">
                        {visibleMatches.map((match) => (
                          <li key={match.id}>
                            <div className="nearby-duplicate-report">
                              <strong>Report #{match.id}</strong>
                              <span>
                                {match.damage_types.join(" / ")} · {match.status.replaceAll("_", " ")}
                                {match.distance_meters != null && ` · ${match.distance_meters} m`}
                              </span>
                              {match.street_name && <span>{match.street_name}</span>}
                            </div>
                            <button type="button" className="btn-modal-secondary"
                              aria-label={`View report #${match.id}`}
                              onClick={() => navigate(`/dashboard/reports?nearby_report=${match.id}`, {
                                state: { duplicateReview: reviewSubmissionId },
                              })}>
                              View report
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <footer className="nearby-duplicate-footer">
                  {!duplicateReview.error && (
                    <label className="nearby-duplicate-check">
                      <input type="checkbox" checked={differentDefect} disabled={isSubmitting}
                        onChange={(event) => setDifferentDefect(event.target.checked)} />
                      This is a different defect
                    </label>
                  )}
                  <div className="modal-actions">
                    <button type="button" className="btn-modal-secondary" disabled={isSubmitting}
                      onClick={() => setDuplicateReview(null)}>Back</button>
                    {duplicateReview.error ? (
                      <button type="button" className="btn-modal-primary" disabled={isSubmitting || !isOnline}
                        onClick={() => runSubmission(duplicateReview.draft, true)}>Retry</button>
                    ) : (
                      <button type="button" className="btn-modal-primary" disabled={!differentDefect || isSubmitting}
                        onClick={confirmDuplicateReview}>Continue submitting</button>
                    )}
                  </div>
                </footer>
              </div>
            </div>
          </ReportDialog>
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
