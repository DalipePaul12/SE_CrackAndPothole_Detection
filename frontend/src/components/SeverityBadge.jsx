
import React from "react";
import "./SeverityBadge.css";


const SEVERITY_CONFIG = {
  low: {
    label:   "Low",
    icon:    "◎",
    cssKey:  "low",
    title:   "Low severity — minor surface damage",
  },
  moderate: {
    label:   "Moderate",
    icon:    "◉",
    cssKey:  "moderate",
    title:   "Moderate severity — noticeable road damage",
  },
  high: {
    label:   "High",
    icon:    "●",
    cssKey:  "high",
    title:   "High severity — significant road damage",
  },
  critical: {
    label:   "Critical",
    icon:    "⬟",
    cssKey:  "critical",
    title:   "Critical severity — dangerous road condition",
  },
  "non-critical": {
    label:   "Non-Critical",
    icon:    "◎",
    cssKey:  "non-critical",
    title:   "Non-critical — cosmetic damage only",
  },
};

const SEVERITY_FALLBACK = {
  label:   "Unknown",
  icon:    "○",
  cssKey:  "unknown",
  title:   "Severity not determined",
};

const DAMAGE_CONFIG = {
  pothole: { label: "Pothole", icon: "⬡", cssKey: "pothole" },
  crack:   { label: "Crack",   icon: "⌇", cssKey: "crack"   },
  none:    { label: "None",    icon: "—",  cssKey: "none"    },
};

const DAMAGE_FALLBACK = { label: "Unknown", icon: "?", cssKey: "unknown" };

function formatConfidence(confidence) {
  if (confidence == null) return null;
  const pct = Math.round(Number(confidence) * 100);
  if (Number.isNaN(pct)) return null;
  return `${pct}%`;
}


export default function SeverityBadge({
  severity,
  damageType,
  confidence,
  size       = "md",
  showIcon   = true,
  showDamage = true,
  showConf   = false,
  inline     = false,
  className  = "",
}) {
  const sevKey = (severity ?? "").toLowerCase().trim();
  const dmgKey = (damageType ?? "").toLowerCase().trim();

  const sevCfg = SEVERITY_CONFIG[sevKey]  ?? SEVERITY_FALLBACK;
  const dmgCfg = DAMAGE_CONFIG[dmgKey]    ?? DAMAGE_FALLBACK;

  const confStr = showConf ? formatConfidence(confidence) : null;

  const wrapperClass = [
    "sb-wrapper",
    `sb-size-${size}`,
    inline ? "sb-inline" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={wrapperClass} aria-label={`Severity: ${sevCfg.label}`}>

      {/* ── Severity pill ───────────────────────────────────────────────── */}
      <span
        className={`sb-pill sb-severity sb-severity--${sevCfg.cssKey}`}
        title={sevCfg.title}
        role="img"
        aria-label={sevCfg.title}
      >
        {showIcon && (
          <span className="sb-icon" aria-hidden="true">{sevCfg.icon}</span>
        )}
        <span className="sb-label">{sevCfg.label}</span>
        {confStr && (
          <span className="sb-conf" aria-label={`Confidence ${confStr}`}>
            {confStr}
          </span>
        )}
      </span>

      {/* ── Damage type chip ────────────────────────────────────────────── */}
      {showDamage && dmgKey && dmgKey !== "none" && (
        <span
          className={`sb-pill sb-damage sb-damage--${dmgCfg.cssKey}`}
          aria-label={`Damage type: ${dmgCfg.label}`}
        >
          <span className="sb-icon" aria-hidden="true">{dmgCfg.icon}</span>
          <span className="sb-label">{dmgCfg.label}</span>
        </span>
      )}

    </span>
  );
}


export function SeverityPill({ severity, confidence, size = "sm", showConf = false }) {
  return (
    <SeverityBadge
      severity={severity}
      confidence={confidence}
      size={size}
      showConf={showConf}
      showDamage={false}
      inline
    />
  );
}


export function SeverityInline({ severity, damageType, confidence }) {
  return (
    <SeverityBadge
      severity={severity}
      damageType={damageType}
      confidence={confidence}
      size="sm"
      showConf={false}
      inline
    />
  );
}


export function SeverityDetail({ severity, damageType, confidence }) {
  return (
    <SeverityBadge
      severity={severity}
      damageType={damageType}
      confidence={confidence}
      size="lg"
      showConf
      showIcon
      showDamage
    />
  );
}