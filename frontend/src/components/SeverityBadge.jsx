import React from "react";
import {
  AlertOctagon,
  ShieldCheck,
  Minus,
  AlertTriangle,
  Flame,
  Zap,
  CircleDot,
  HelpCircle,
} from "lucide-react";
import "./SeverityBadge.css";

/* ── Severity config ────────────────────────────────────────────────────── */
const SEVERITY_CONFIG = {
  low: {
    label:   "Low",
    Icon:    ShieldCheck,
    cssKey:  "low",
    title:   "Low severity — minor surface damage",
  },
  moderate: {
    label:   "Moderate",
    Icon:    AlertTriangle,
    cssKey:  "moderate",
    title:   "Moderate severity — noticeable road damage",
  },
  high: {
    label:   "High",
    Icon:    Flame,
    cssKey:  "high",
    title:   "High severity — significant road damage",
  },
  critical: {
    label:   "Critical",
    Icon:    AlertOctagon,
    cssKey:  "critical",
    title:   "Critical — dangerous road condition",
  },
  non_critical: {
    label:   "Non-Critical",
    Icon:    ShieldCheck,
    cssKey:  "non-critical",
    title:   "Non-Critical — cosmetic damage only",
  },
};

const SEVERITY_FALLBACK = {
  label:   "Unknown",
  Icon:    HelpCircle,
  cssKey:  "unknown",
  title:   "Severity not determined",
};

/* ── Damage type config ──────────────────────────────────────────────────── */
const DAMAGE_CONFIG = {
  pothole: { label: "Pothole", Icon: CircleDot, cssKey: "pothole" },
  crack:   { label: "Crack",   Icon: Zap,       cssKey: "crack"   },
  none:    { label: "None",    Icon: Minus,      cssKey: "none"    },
};

const DAMAGE_FALLBACK = { label: "Unknown", Icon: HelpCircle, cssKey: "unknown" };

function formatConfidence(confidence) {
  if (confidence == null) return null;
  const pct = Math.round(Number(confidence) * 100);
  if (Number.isNaN(pct)) return null;
  return `${pct}%`;
}

/* ── Main component ─────────────────────────────────────────────────────── */
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
  const iconPx  = size === "lg" ? 13 : size === "sm" ? 10 : 11;

  const wrapperClass = [
    "sb-wrapper",
    `sb-size-${size}`,
    inline ? "sb-inline" : "",
    className,
  ].filter(Boolean).join(" ");

  const SevIcon = sevCfg.Icon;
  const DmgIcon = dmgCfg.Icon;

  return (
    <span className={wrapperClass} aria-label={`Severity: ${sevCfg.label}`}>

      {/* ── Severity pill ─────────────────────────────────────────────── */}
      <span
        className={`sb-pill sb-severity sb-severity--${sevCfg.cssKey}`}
        title={sevCfg.title}
        role="img"
        aria-label={sevCfg.title}
      >
        {showIcon && (
          <SevIcon size={iconPx} className="sb-icon" aria-hidden="true" strokeWidth={2.2} />
        )}
        <span className="sb-label">{sevCfg.label}</span>
        {confStr && (
          <span className="sb-conf" aria-label={`Confidence ${confStr}`}>
            {confStr}
          </span>
        )}
      </span>

      {/* ── Damage type chip ──────────────────────────────────────────── */}
      {showDamage && dmgKey && dmgKey !== "none" && (
        <span
          className={`sb-pill sb-damage sb-damage--${dmgCfg.cssKey}`}
          aria-label={`Damage type: ${dmgCfg.label}`}
        >
          <DmgIcon size={iconPx} className="sb-icon" aria-hidden="true" strokeWidth={2.2} />
          <span className="sb-label">{dmgCfg.label}</span>
        </span>
      )}

    </span>
  );
}

/* ── Compound exports ────────────────────────────────────────────────────── */
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
