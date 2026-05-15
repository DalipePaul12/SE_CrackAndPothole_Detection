
import { useRef, useEffect, useCallback, useState } from "react";
import "./DetectionOverlay.css";  // See CSS below

// ── Drawing constants ──────────────────────────────────────────────────────
const SEVERITY_COLORS = {
  critical: "#ef4444",
  high:     "#f97316", 
  moderate: "#eab308",
  low:      "#22c55e",
};
const DEFAULT_COLOR = "#3b82f6";

const BOX_LINE_WIDTH = 2.5;
const BOX_FILL_ALPHA = 0.07;
const LABEL_FONT = 'bold 12px "DM Mono", Consolas, monospace';
const BADGE_FONT = 'bold 10px "DM Mono", Consolas, monospace';
const PILL_HEIGHT = 22;
const PILL_PADDING = 8;
const CORNER_TICK = 8;

// ── Temporal smoothing tracker (SORT-like stability) ──────────────────────
class BoxTracker {
  constructor(alpha = 0.35) {
    this.alpha = alpha;  // 0=slow, 1=instant
    this.state = new Map();  // label → smoothed box
  }

// FIXED
update(detections) {
  const next = new Map();
  for (const det of detections) {
    const key = det.class ?? det.label;
    const prev = this.state.get(key);   // ← add this line

    if (prev) {
      next.set(key, {
        ...det,
        x_norm: prev.x_norm + this.alpha * (det.x_norm - prev.x_norm),
        y_norm: prev.y_norm + this.alpha * (det.y_norm - prev.y_norm),
        w_norm: prev.w_norm + this.alpha * (det.w_norm - prev.w_norm),
        h_norm: prev.h_norm + this.alpha * (det.h_norm - prev.h_norm),
      });
    } else {
      next.set(key, det);
    }
  }
  this.state = next;
  return Array.from(next.values());
}
  clear() {
    this.state.clear();
  }
}

// ── Canvas drawing engine ──────────────────────────────────────────────────
function drawDetections(ctx, detections, canvasW, canvasH) {
  ctx.clearRect(0, 0, canvasW, canvasH);

  for (const det of detections) {
    const label = det.class ?? det.label ?? "damage";
    const { confidence, severity } = det;
    
    let x_norm, y_norm, w_norm, h_norm;
    
    if (det.x_norm !== undefined && det.w_norm !== undefined) {
      x_norm = det.x_norm;
      y_norm = det.y_norm;
      w_norm = det.w_norm;
      h_norm = det.h_norm;
    } else if (det.norm_bbox && det.norm_bbox.length === 4) {
      [x_norm, y_norm, w_norm, h_norm] = [
        det.norm_bbox[0],
        det.norm_bbox[1],
        det.norm_bbox[2] - det.norm_bbox[0],
        det.norm_bbox[3] - det.norm_bbox[1],
      ];
    } else {
      continue;
    }
    
    const x = x_norm * canvasW;
    const y = y_norm * canvasH;
    const w = w_norm * canvasW;
    const h = h_norm * canvasH;
    // Clamp bounds
    const cx = Math.max(0, Math.min(x, canvasW));
    const cy = Math.max(0, Math.min(y, canvasH));
    const cw = Math.min(w, canvasW - cx);
    const ch = Math.min(h, canvasH - cy);

    if (cw <= 1 || ch <= 1) continue;

    const color = SEVERITY_COLORS[severity] || DEFAULT_COLOR;

    // Semi-transparent fill
    ctx.save();
    ctx.globalAlpha = BOX_FILL_ALPHA;
    ctx.fillStyle = color;
    ctx.fillRect(cx, cy, cw, ch);
    ctx.restore();

    // Border + corner ticks (reticle style)
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = BOX_LINE_WIDTH;
    ctx.lineCap = 'round';

    // Main border (subtle)
    ctx.globalAlpha = 0.4;
    ctx.strokeRect(cx, cy, cw, ch);

    // Corner ticks (sharp)
    ctx.globalAlpha = 1;
    const tick = Math.min(CORNER_TICK, Math.min(cw, ch) / 4);
    const ticks = [
      [cx, cy, tick, 0, 0, tick],           // top-left
      [cx + cw, cy, -tick, 0, 0, tick],     // top-right  
      [cx, cy + ch, tick, 0, 0, -tick],     // bottom-left
      [cx + cw, cy + ch, -tick, 0, 0, -tick], // bottom-right
    ];
    
    for (const [ox, oy, dx1, dy1, dx2, dy2] of ticks) {
      ctx.beginPath();
      ctx.moveTo(ox + dx1, oy + dy1);
      ctx.lineTo(ox, oy);
      ctx.lineTo(ox + dx2, oy + dy2);
      ctx.stroke();
    }
    ctx.restore();

    // Confidence label pill
    const displayLabel = label === "pothole" || label === "POTHOLE" ? "POTHOLE" : 
                        label === "crack" || label === "CRACK" ? "CRACK" : label.toUpperCase();
    const confText = `${Math.round(confidence * 100)}%`;
    const fullText = `${displayLabel} ${confText}`;
    
    ctx.save();
    ctx.font = LABEL_FONT;
    const textMetrics = ctx.measureText(fullText);
    const pillW = textMetrics.width + PILL_PADDING * 2;
    const pillH = PILL_HEIGHT;
    const pillY = cy > pillH + 8 ? cy - 4 : Math.min(cy + 4, canvasH - pillH - 4);
    const pillX = Math.max(4, Math.min(cx, canvasW - pillW - 4));

    // Pill background
    ctx.fillStyle = color;
    roundRect(ctx, pillX, pillY, pillW, pillH, 4, true);
    
    // Text
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(fullText, pillX + PILL_PADDING, pillY + pillH / 2);
    ctx.restore();

    // Severity badge (bottom-right corner)
    if (severity) {
      const badgeText = severity.toUpperCase();
      ctx.save();
      ctx.font = BADGE_FONT;
      const badgeMetrics = ctx.measureText(badgeText);
      const badgeW = badgeMetrics.width + 8;
      const badgeH = 16;
      const badgeX = Math.min(cx + cw - badgeW - 4, canvasW - badgeW - 4);
      const badgeY = Math.max(cy + ch - badgeH - 4, 4);

      ctx.fillStyle = color;
      roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 3, true);
      
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, badgeX + 4, badgeY + badgeH / 2);
      ctx.restore();
    }
  }
}

function roundRect(ctx, x, y, w, h, r, fill = false, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DetectionOverlay({
  detections = [],
  width = 640,
  height = 360,
  mode = "image",  // "image" | "video" | "realtime"
  progress,        // { processed, total }
  stage,
  finalResult,
  frameCount = 0,
  className = "",
}) {
  const canvasRef = useRef(null);
  const trackerRef = useRef(new BoxTracker(mode === "realtime" ? 0.3 : 0.5));
  const clearTimerRef = useRef(null);
  const [stableDetections, setStableDetections] = useState([]);

  // ── Update stable detections (anti-flicker) ────────────────────────────────
  useEffect(() => {
    if (detections.length > 0) {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      const smoothed = trackerRef.current.update(detections);
      setStableDetections(smoothed);
    } else if (mode !== "realtime") {
      // Image/video: clear immediately
      trackerRef.current.clear();
      setStableDetections([]);
    } else {
      // Realtime: delay clear 500ms (prevents flicker on detection gaps)
      clearTimerRef.current ??= setTimeout(() => {
        trackerRef.current.clear();
        setStableDetections([]);
      }, 500);
    }

    return () => clearTimerRef.current && clearTimeout(clearTimerRef.current);
  }, [detections, mode]);

  // ── Canvas render loop ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    if (stableDetections.length === 0) {
      ctx.clearRect(0, 0, rect.width, rect.height);
      return;
    }

    drawDetections(ctx, stableDetections, rect.width, rect.height);
  }, [stableDetections]);

  // ── Derived UI ────────────────────────────────────────────────────────────
  const progressPct = progress 
    ? Math.round((progress.processed / Math.max(progress.total, 1)) * 100)
    : 0;
  
  const isProcessing = mode === "video" && !finalResult;
  const hasDetections = stableDetections.length > 0;
  const isComplete = finalResult != null;

  return (
    <div className={`detection-overlay ${className}`} style={{ width, height, position: "relative" }}>
      {/* Main canvas */}
      <canvas 
        ref={canvasRef}
        className="detection-canvas"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      {/* Status indicators (realtime/video only) */}
      {(mode === "realtime" || mode === "video") && (
        <div className="overlay-status" style={{ position: 'absolute', top: 0, left: 0, zIndex: 10, pointerEvents: 'none' }}>
          <div className={`status-pill status-${mode}`}>
            <span className={`status-dot dot-${mode}`} />
            {isProcessing ? (stage || "PROCESSING") : 
             isComplete ? (finalResult?.detected ? "DETECTED" : "CLEAR") : 
             mode === "realtime" ? "LIVE" : "READY"}
            {mode === "video" && progress && <span>{progressPct}%</span>}
          </div>
          {mode === "realtime" && frameCount > 0 && (
            <div className="frame-counter" style={{ fontSize: "11px", opacity: 0.7, marginTop: 4 }}>
              {frameCount.toLocaleString()} frames
            </div>
          )}
        </div>
      )}

      {/* Progress bar (video only) */}
      {mode === "video" && progress && (
        <div className="progress-bar" style={{ 
          position: "absolute", 
          bottom: 8, 
          left: 8, 
          right: 8, 
          height: 4,
          background: "rgba(0,0,0,0.3)",
          borderRadius: 2,
          overflow: "hidden"
        }}>
          <div style={{
            height: "100%",
            width: `${progressPct}%`,
            background: hasDetections ? "#22c55e" : "#3b82f6",
            transition: "width 0.2s ease"
          }} />
        </div>
      )}

      {/* Detection count badge */}
      {hasDetections && (
        <div className="detection-count" style={{
          position: "absolute",
          top: 8,
          left: 8,
          background: "rgba(0,0,0,0.8)",
          color: "white",
          padding: "4px 8px",
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 600,
          zIndex: 15
        }}>
          {stableDetections.length} {stableDetections.length === 1 ? "detection" : "detections"}
        </div>
      )}

      {/* Final result overlay (video complete, no detections) */}
      {mode === "video" && isComplete && !finalResult?.detected && (
        <div className="no-detection" style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: "rgba(0,0,0,0.9)",
          color: "#22c55e",
          padding: "16px 24px",
          borderRadius: 12,
          textAlign: "center",
          fontWeight: 500,
          zIndex: 20
        }}>
           No road damage detected
        </div>
      )}
    </div>
  );
}