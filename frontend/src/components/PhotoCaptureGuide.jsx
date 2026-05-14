import React, {
  useState, useRef, useEffect, useCallback, useMemo,
} from "react";
import ReactDOM from "react-dom";
import { FaCamera, FaTimes, FaCheckCircle, FaBolt } from "react-icons/fa";
import { MdSelectAll } from "react-icons/md";
import "./PhotoCaptureGuide.css";

const CHECKLIST = [
  {
    id: "lighting",
    label: "Good lighting",
    detail: "Use daylight or a well-lit area — avoid harsh shadows over the damage",
    color: "amber",
  },
  {
    id: "distance",
    label: "Proper distance (~1.5 m)",
    detail: "Stand ~1.5 meters back so damage fills the reference circle",
    color: "blue",
  },
  {
    id: "angle",
    label: "Correct angle (45°–75°)",
    detail: "Tilt phone down 45°–75° so camera points at the road surface",
    color: "teal",
  },
  {
    id: "framing",
    label: "Full damage visible",
    detail: "Capture the entire damaged section with some surrounding road",
    color: "purple",
  },
  {
    id: "steady",
    label: "Steady, sharp image",
    detail: "Hold your device still — blurry photos reduce AI accuracy",
    color: "coral",
  },
  {
    id: "gps",
    label: "GPS location enabled",
    detail: "Allow location access so your report is pinned correctly on the map",
    color: "green",
  },
];

const TOTAL = CHECKLIST.length;

function ConfettiBurst() {
  const particles = useMemo(() => {
    return Array.from({ length: 18 }, (_, i) => ({
      id: i,
      angle: (i / 18) * 360,
      color: ["#52b788", "#f97316", "#3b82f6", "#a855f7", "#f43f5e", "#eab308"][i % 6],
      size: 4 + Math.random() * 4,
      distance: 48 + Math.random() * 32,
      delay: Math.random() * 0.2,
    }));
  }, []);

  return (
    <div className="pcg-confetti" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="pcg-confetti-dot"
          style={{
            background: p.color,
            width: p.size,
            height: p.size,
            "--angle": `${p.angle}deg`,
            "--dist": `${p.distance}px`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function ProgressRing({ value, max, size = 56, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = value / max;
  const dash = circ * pct;

  return (
    <svg
      className="pcg-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="var(--pcg-ring-track)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={value === max ? "var(--pcg-accent-done)" : "var(--pcg-accent)"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.45s cubic-bezier(0.4,0,0.2,1), stroke 0.3s ease" }}
      />
      <text
        x="50%" y="52%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="pcg-ring-text"
        style={{ fontSize: size * 0.22, fontWeight: 700 }}
      >
        {value}/{max}
      </text>
    </svg>
  );
}

function PhotoCaptureGuide({ onContinue, onClose }) {
  const dialogRef  = useRef(null);
  const firstFocus = useRef(null);
  const [checked, setChecked] = useState({});
  const [justSelected, setJustSelected] = useState(null);
  const [allJustSelected, setAllJustSelected] = useState(false);
  const [completing, setCompleting] = useState(false);

  const count    = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);
  const allDone  = count === TOTAL;
  const progress = (count / TOTAL) * 100;

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    el.focus();

    const focusable = () =>
      el.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

    const trap = (e) => {
      if (e.key !== "Tab") return;
      const els = [...focusable()];
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };

    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (allDone) {
      const t = setTimeout(() => setCompleting(true), 420);
      return () => clearTimeout(t);
    }
    setCompleting(false);
  }, [allDone]);

  const toggle = useCallback((id) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
    setJustSelected(id);
    setTimeout(() => setJustSelected(null), 520);
  }, []);

  const selectAll = useCallback(() => {
    const all = {};
    CHECKLIST.forEach((item) => { all[item.id] = true; });
    setChecked(all);
    setAllJustSelected(true);
    setTimeout(() => setAllJustSelected(false), 700);
  }, []);

  const handleProceed = useCallback(() => {
    if (allDone && completing) onContinue?.();
  }, [allDone, completing, onContinue]);

  return ReactDOM.createPortal(
    <div
      className="pcg-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pcg-title"
    >
      <div className="pcg-modal" ref={dialogRef} tabIndex={-1}>

        <button
          className="pcg-close"
          onClick={onClose}
          aria-label="Close guide"
          ref={firstFocus}
        >
          <FaTimes />
        </button>

        <div className="pcg-header">
          <div className={`pcg-icon-wrap${allDone ? " done" : ""}`} aria-hidden="true">
            {allDone && <ConfettiBurst />}
            <div className="pcg-icon-ring" />
            <FaCamera className="pcg-camera-icon" />
          </div>

          {!allDone ? (
            <>
              <h2 id="pcg-title" className="pcg-title">Before You Report</h2>
              <p className="pcg-subtitle">
                Confirm each item so our AI system processes your evidence accurately.
              </p>
            </>
          ) : (
            <div className="pcg-success-text" aria-live="polite">
              <h2 id="pcg-title" className="pcg-title pcg-title--done">
                You're all set!
              </h2>
              <p className="pcg-subtitle pcg-subtitle--done">
                Everything looks good you can submit report now!
              </p>
            </div>
          )}
        </div>

        <div className="pcg-progress-section" aria-label={`${count} of ${TOTAL} items checked`}>
          <div className="pcg-progress-meta">
            <div className="pcg-progress-left">
              <ProgressRing value={count} max={TOTAL} />
              <div className="pcg-progress-labels">
                <span className="pcg-progress-label">Readiness Check</span>
                <span className={`pcg-progress-sub${allDone ? " done" : ""}`}>
                  {allDone
                    ? "All checks passed ✓"
                    : `${TOTAL - count} remaining`}
                </span>
              </div>
            </div>

            {!allDone && (
              <button
                className={`pcg-select-all${allJustSelected ? " burst" : ""}`}
                onClick={selectAll}
                aria-label="Select all checklist items"
                title="Check all at once"
              >
                <MdSelectAll aria-hidden="true" />
                <span>Select All</span>
              </button>
            )}
          </div>

          <div
            className="pcg-bar-track"
            role="progressbar"
            aria-valuenow={count}
            aria-valuemin={0}
            aria-valuemax={TOTAL}
          >
            <div
              className={`pcg-bar-fill${allDone ? " complete" : ""}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ul className="pcg-list" role="list">
          {CHECKLIST.map((item, idx) => {
            const isChecked  = !!checked[item.id];
            const isJustTapped = justSelected === item.id;

            return (
              <li
                key={item.id}
                className={[
                  "pcg-item",
                  isChecked        ? "is-checked"  : "",
                  isJustTapped     ? "just-tapped" : "",
                  allJustSelected  ? "all-burst"   : "",
                ].join(" ")}
                style={{ "--idx": idx, "--item-color": `var(--pcg-${item.color})` }}
                onClick={() => toggle(item.id)}
                role="checkbox"
                aria-checked={isChecked}
                tabIndex={0}
                onKeyDown={(e) => (e.key === " " || e.key === "Enter") && toggle(item.id)}
              >
                <span className={`pcg-cb${isChecked ? " checked" : ""}`} aria-hidden="true">
                  {isChecked && <FaCheckCircle className="pcg-cb-icon" />}
                </span>

                <span className="pcg-emoji" aria-hidden="true">{item.emoji}</span>

                <span className="pcg-item-text">
                  <span className="pcg-item-label">{item.label}</span>
                  <span className="pcg-item-detail">{item.detail}</span>
                </span>

                <span className="pcg-ripple" aria-hidden="true" />
              </li>
            );
          })}
        </ul>

        {!allDone && (
          <p className="pcg-hint" aria-live="polite">
            ✦ Check all {TOTAL} items — or tap <strong>Select All</strong> to continue
          </p>
        )}

        <div className="pcg-actions">
          <button
            className={[
              "pcg-btn-primary",
              allDone && completing ? "ready"  : "",
              allDone && !completing ? "completing" : "",
              !allDone ? "locked" : "",
            ].join(" ")}
            onClick={handleProceed}
            disabled={!allDone || !completing}
            aria-disabled={!allDone || !completing}
          >
            {allDone ? (
              <>
                <FaBolt aria-hidden="true" className="pcg-btn-icon" />
                Proceed to Report
              </>
            ) : (
              <>
                <span className="pcg-lock-icon" aria-hidden="true"></span>
                Complete checklist to proceed
              </>
            )}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

export default PhotoCaptureGuide;