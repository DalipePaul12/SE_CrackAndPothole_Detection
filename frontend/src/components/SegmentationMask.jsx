
import React, { useCallback, useMemo, useState } from "react";

// ─── Severity colour palette ───────────────────────────────────────────────────
const SEVERITY_STYLES = {
  critical: {
    fill:         "rgba(239,68,68,0.28)",
    fillHover:    "rgba(239,68,68,0.45)",
    stroke:       "#ef4444",
    strokeHover:  "#ff6b6b",
    glow:         "rgba(239,68,68,0.55)",
    glowSize:     6,
    labelBg:      "rgba(239,68,68,0.92)",
    boxStroke:    "#ef4444",
    dashArray:    "none",
  },
  "non_critical": {
    fill:         "rgba(249,115,22,0.22)",
    fillHover:    "rgba(249,115,22,0.38)",
    stroke:       "#f97316",
    strokeHover:  "#fb923c",
    glow:         "rgba(249,115,22,0.40)",
    glowSize:     4,
    labelBg:      "rgba(249,115,22,0.92)",
    boxStroke:    "#f97316",
    dashArray:    "6 3",
  },
};

function normalizeSeverity(sev) {
  if (!sev) return "non_critical";
  const s = sev.toLowerCase().replace("_", "-");
  return s === "critical" ? "critical" : "non_critical";
}

// ─── Build SVG polygon "points" string ────────────────────────────────────────
function buildPolygonPoints(detection, scaleX, scaleY, displayW, displayH) {
  if (detection.has_mask !== true) return null;

  // Use backend image dimensions if available (for resized images)
  const segScaleX = detection.image_width ? (displayW / detection.image_width) : scaleX;
  const segScaleY = detection.image_height ? (displayH / detection.image_height) : scaleY;

  // 1. Normalised segment coordinates — PRIMARY source.
  //    Always a flat list of [xn, yn] pairs in both code paths:
  //      • Real seg-model output  → flat [[xn,yn], [xn,yn], …] (many points)
  //      • 4-pt bounding-box fallback → flat [[xn,yn], …] (4 points)
  //    Using this avoids the nesting ambiguity in the absolute `segments` field.
  if (detection.segments_norm && detection.segments_norm.length >= 3) {
    return detection.segments_norm
      .map(([xn, yn]) => `${(xn * displayW).toFixed(2)},${(yn * displayH).toFixed(2)}`)
      .join(" ");
  }

  // 2. Absolute segment coordinates — fallback for validated real masks.
  //    Two shapes arrive from the backend:
  //      • Real seg-model: [[[x,y],[x,y],…]]  — outer array wraps ONE polygon list
  //      • 4-pt fallback:  [[x,y],[x,y],…]    — flat list of 4 points
  //    Unwrap one level of nesting when the first element is itself an array of arrays.
  if (detection.segments) {
    const raw = detection.segments;
    const pts = (Array.isArray(raw[0]) && Array.isArray(raw[0][0])) ? raw[0] : raw;
    if (pts.length >= 3) {
      return pts
        .map(([x, y]) => `${(x * segScaleX).toFixed(2)},${(y * segScaleY).toFixed(2)}`)
        .join(" ");
    }
  }

  // No real mask data available — do not fabricate one from the box.
  // The bounding box still renders separately via showBoundingBox
  // whenever the caller passes showBoundingBox={true}.
  return null;
}

// ─── Resolve bounding box to display coordinates ───────────────────────────────
function getBox(detection, scaleX, scaleY, displayW, displayH) {
  // 1. Absolute pixel coordinates [x1, y1, x2, y2] — present on all YOLO detections.
  //    Scaled by image_width/height (original image dims, set by _run_yolo_all_sync).
  if (detection.box && detection.box.length === 4) {
    const [x1, y1, x2, y2] = detection.box;
    const boxScaleX = detection.image_width  ? (displayW / detection.image_width)  : scaleX;
    const boxScaleY = detection.image_height ? (displayH / detection.image_height) : scaleY;
    return [x1 * boxScaleX, y1 * boxScaleY, x2 * boxScaleX, y2 * boxScaleY];
  }

  // 2. norm_bbox: normalized [x1n, y1n, x2n, y2n] top-left→bottom-right.
  //    Sent by /analyze/realtime (and /analyze) in every all_detections item.
  //    Already 0–1 so multiply directly by display dimensions.
  if (detection.norm_bbox && detection.norm_bbox.length === 4) {
    const [x1n, y1n, x2n, y2n] = detection.norm_bbox;
    return [x1n * displayW, y1n * displayH, x2n * displayW, y2n * displayH];
  }

  // 3. Flat normalized fields x_norm / w_norm (top-left + size convention).
  if (detection.x_norm != null && detection.w_norm != null) {
    return [
      detection.x_norm * displayW,
      detection.y_norm * displayH,
      (detection.x_norm + detection.w_norm) * displayW,
      (detection.y_norm + detection.h_norm) * displayH,
    ];
  }

  // 4. Nested boxes array — try both x_norm and norm_bbox shapes on the first item.
  if (detection.boxes && detection.boxes.length > 0) {
    const b = detection.boxes[0];
    if (b.x_norm !== undefined) {
      return [
        b.x_norm * displayW,
        b.y_norm * displayH,
        (b.x_norm + b.w_norm) * displayW,
        (b.y_norm + b.h_norm) * displayH,
      ];
    }
    if (b.norm_bbox && b.norm_bbox.length === 4) {
      const [x1n, y1n, x2n, y2n] = b.norm_bbox;
      return [x1n * displayW, y1n * displayH, x2n * displayW, y2n * displayH];
    }
  }

  return null;
}

// ─── Smooth polygon via Chaikin's algorithm (1-2 passes) ──────────────────────
function chaikinSmooth(points, passes = 1) {
  if (points.length < 4) return points;
  let pts = points;
  for (let p = 0; p < passes; p++) {
    const smoothed = [];
    for (let i = 0; i < pts.length; i++) {
      const curr = pts[i];
      const next = pts[(i + 1) % pts.length];
      smoothed.push([
        0.75 * curr[0] + 0.25 * next[0],
        0.75 * curr[1] + 0.25 * next[1],
      ]);
      smoothed.push([
        0.25 * curr[0] + 0.75 * next[0],
        0.25 * curr[1] + 0.75 * next[1],
      ]);
    }
    pts = smoothed;
  }
  return pts;
}

// Convert [[x,y],...] to SVG polygon "points" string
function ptsToStr(pts) {
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

// ─── Parse raw polygon points string to [[x,y],...] ───────────────────────────
function parsePointsStr(str) {
  if (!str) return [];
  return str.trim().split(/\s+/).map((pair) => pair.split(",").map(Number));
}

// ─── Single detection overlay ──────────────────────────────────────────────────
function DetectionOverlayItem({
  detection,
  index,
  scaleX,
  scaleY,
  displayW,
  displayH,
  showBoundingBox,
  showLabel,
  smoothPasses,
}) {
  const [hovered, setHovered] = useState(false);

  const sevKey  = normalizeSeverity(detection.severity ?? detection.class_severity);
  const style   = SEVERITY_STYLES[sevKey];
  const label   = (detection.class ?? detection.label ?? "damage").toUpperCase();
  const conf    = detection.confidence != null
    ? `${Math.round(detection.confidence * 100)}%`
    : "";

  const filterId  = `seg-glow-${index}`;
  const clipId    = `seg-clip-${index}`;
  const animDelay = `${index * 80}ms`;

  // Build raw polygon points
  const rawPointsStr = useMemo(
    () => buildPolygonPoints(detection, scaleX, scaleY, displayW, displayH),
    [detection, scaleX, scaleY, displayW, displayH]
  );

  // Smooth the polygon
  const smoothPointsStr = useMemo(() => {
    if (!rawPointsStr) return null;
    const raw = parsePointsStr(rawPointsStr);
    if (raw.length < 3) return rawPointsStr;
    const smoothed = chaikinSmooth(raw, smoothPasses);
    return ptsToStr(smoothed);
  }, [rawPointsStr, smoothPasses]);

  // Bounding box
  const box = useMemo(
    () => getBox(detection, scaleX, scaleY, displayW, displayH),
    [detection, scaleX, scaleY, displayW, displayH]
  );

  if (!smoothPointsStr && !box) return null;

  const fillColor   = hovered ? style.fillHover   : style.fill;
  const strokeColor = hovered ? style.strokeHover : style.stroke;

  // Label position: top-left of bounding box (or first polygon point)
  let labelX = 8, labelY = 24;
  if (box) {
    labelX = box[0] + 4;
    labelY = Math.max(20, box[1] - 6);
  }

  return (
    <g
      className="seg-detection-group"
      style={{ "--anim-delay": animDelay }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={`${label} detected — ${sevKey} severity, confidence ${conf}`}
    >
      <defs>
        {/* Glow filter for mask edge */}
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={style.glowSize}
            result="blur"
          />
          <feFlood floodColor={style.glow} floodOpacity="0.8" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Clip path so inner fill stays inside polygon */}
        {smoothPointsStr && (
          <clipPath id={clipId}>
            <polygon points={smoothPointsStr} />
          </clipPath>
        )}
      </defs>

      {/* ── Polygon mask fill ── */}
      {smoothPointsStr && (
        <polygon
          className="seg-mask-polygon"
          points={smoothPointsStr}
          fill={fillColor}
          filter={`url(#${filterId})`}
          style={{ animationDelay: animDelay }}
        />
      )}

      {/* ── Polygon contour stroke ── */}
      {smoothPointsStr && (
        <polygon
          className="seg-mask-contour"
          points={smoothPointsStr}
          fill="none"
          stroke={strokeColor}
          strokeWidth={hovered ? "2" : "1.5"}
          strokeLinejoin="round"
          style={{ animationDelay: animDelay }}
        />
      )}

      {/* ── Animated marching dashes on contour ── */}
      {smoothPointsStr && (
        <polygon
          className="seg-mask-march"
          points={smoothPointsStr}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1"
          strokeLinejoin="round"
          strokeDasharray="8 6"
          opacity="0.6"
        />
      )}

      {/* ── Bounding box (dashed, subtle) ── */}
      {showBoundingBox && box && (
        <rect
          className="seg-bbox"
          x={box[0]}
          y={box[1]}
          width={box[2] - box[0]}
          height={box[3] - box[1]}
          fill="none"
          stroke={style.boxStroke}
          strokeWidth="1"
          strokeDasharray={style.dashArray}
          rx="3"
          opacity="0.55"
          style={{ animationDelay: animDelay }}
        />
      )}

      {/* ── Label chip ── */}
      {showLabel && (
        <g className="seg-label-group" style={{ animationDelay: animDelay }}>
          {/* Chip background — sized to text */}
          <rect
            x={labelX - 2}
            y={labelY - 13}
            width={conf ? label.length * 6.5 + conf.length * 6 + 24 : label.length * 6.5 + 12}
            height={16}
            rx="4"
            fill={style.labelBg}
          />
          {/* Class name */}
          <text
            x={labelX + 2}
            y={labelY - 2}
            fill="#fff"
            fontSize="9"
            fontWeight="700"
            fontFamily="'IBM Plex Mono', monospace"
            letterSpacing="0.05em"
          >
            {label}
          </text>
          {/* Confidence */}
          {conf && (
            <text
              x={labelX + label.length * 6.5 + 10}
              y={labelY - 2}
              fill="rgba(255,255,255,0.80)"
              fontSize="8.5"
              fontWeight="600"
              fontFamily="'IBM Plex Mono', monospace"
            >
              {conf}
            </text>
          )}
        </g>
      )}
    </g>
  );
}

// ─── Main export ───────────────────────────────────────────────────────────────
/**
 * SegmentationMask
 *
 * Drop-in SVG overlay component. Place absolutely over the image.
 *
 * @param {object[]}  predictions   – array of YOLOv11 detection objects
 * @param {object}    imageSize     – { width, height } of the rendered element
 * @param {object}    naturalSize   – { width, height } of original image pixels
 * @param {boolean}   showBoundingBox – show dashed bounding box alongside mask
 * @param {boolean}   showLabels    – show class + confidence chips
 * @param {number}    smoothPasses  – Chaikin smoothing iterations (0–3, default 1)
 */
export default function SegmentationMask({
  predictions,
  imageSize,
  naturalSize,
  showBoundingBox = true,
  showLabels      = true,
  smoothPasses    = 1,
}) {
  if (
    !predictions ||
    predictions.length === 0 ||
    !imageSize?.width ||
    !imageSize?.height
  ) {
    return null;
  }

  // Scale factors: how much do display coords differ from natural image coords?
  const natW   = naturalSize?.width  || imageSize.width;
  const natH   = naturalSize?.height || imageSize.height;
  const scaleX = imageSize.width  / natW;
  const scaleY = imageSize.height / natH;

  return (
    <svg
      className="seg-mask-svg"
      viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 10,
      }}
      aria-label={`${predictions.length} damage detection${predictions.length !== 1 ? "s" : ""}`}
      role="img"
    >
      {predictions.map((det, i) => (
        <DetectionOverlayItem
          key={i}
          detection={det}
          index={i}
          scaleX={scaleX}
          scaleY={scaleY}
          displayW={imageSize.width}
          displayH={imageSize.height}
          showBoundingBox={showBoundingBox}
          showLabel={showLabels}
          smoothPasses={smoothPasses}
        />
      ))}
    </svg>
  );
}

/**
 * useNaturalSize — hook to read naturalWidth/Height from an img element ref
 * Usage: const natSize = useNaturalSize(imgRef);
 */
export function useNaturalSize(mediaRef) {
  const [size, setSize] = React.useState({ width: 0, height: 0 });

  const update = useCallback(() => {
    const el = mediaRef?.current;
    if (!el) return;
    const w = el.naturalWidth  ?? el.videoWidth  ?? 0;
    const h = el.naturalHeight ?? el.videoHeight ?? 0;
    if (w && h) setSize({ width: w, height: h });
  }, [mediaRef]);

  React.useEffect(() => {
    const el = mediaRef?.current;
    if (!el) return;
    el.addEventListener("load",          update, { passive: true });
    el.addEventListener("loadedmetadata",update, { passive: true });
    update();
    return () => {
      el.removeEventListener("load",          update);
      el.removeEventListener("loadedmetadata",update);
    };
  }, [mediaRef, update]);

  return size;
}

/**
 * normalizePrediction — normalise raw backend response into a standard shape
 * Call this on each item in result.data.all_detections.
 */
// FIXED — preserve all coordinate fields; derive norm_bbox from x/y/w/h if missing
export function normalizePrediction(raw) {
  if (!raw) return null;

  // Derive norm_bbox from flat fields if not directly present
  const norm_bbox = raw.norm_bbox ?? (
    raw.x_norm != null
      ? [raw.x_norm, raw.y_norm, raw.x_norm + raw.w_norm, raw.y_norm + raw.h_norm]
      : null
  );

  return {
    class:         raw.class ?? raw.label ?? "damage",
    label:         raw.label ?? raw.class ?? "damage",
    confidence:    raw.confidence ?? raw.conf ?? null,
    severity:      raw.severity ?? raw.class_severity ?? "non_critical",
    box:           raw.box           ?? null,
    norm_bbox,                                          // ← derived if missing
    segments:      raw.segments      ?? null,
    segments_norm: raw.segments_norm ?? null,
    has_mask:      raw.has_mask === true,
    boxes:         raw.boxes         ?? null,
    image_width:   raw.image_width   ?? null,
    image_height:  raw.image_height  ?? null,
    x_norm:        raw.x_norm        ?? null,           // ← ADD
    y_norm:        raw.y_norm        ?? null,           // ← ADD
    w_norm:        raw.w_norm        ?? null,           // ← ADD
    h_norm:        raw.h_norm        ?? null,           // ← ADD
  };
}