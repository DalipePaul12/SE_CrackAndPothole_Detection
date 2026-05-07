import React, { useState, useCallback } from "react";
import { FaCamera } from "react-icons/fa";
import PhotoCaptureGuide from "./PhotoCaptureGuide";
import "./FloatingReportButton.css";

const SESSION_KEY = "snap2fix_guide_shown";
const STORAGE_KEY = "snap2fix_guide_dismissed";

function FloatingReportButton({ onProceed }) {
  const [showGuide, setShowGuide] = useState(false);

  const handleClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation(); // prevent any parent click handlers from firing

    const dismissed = localStorage.getItem(STORAGE_KEY) === "true";
    const shownThisSession = sessionStorage.getItem(SESSION_KEY) === "true";

    if (dismissed || shownThisSession) {
      onProceed?.();
    } else {
      setShowGuide(true);
    }
  }, [onProceed]);

  const handleContinue = useCallback(() => {
    sessionStorage.setItem(SESSION_KEY, "true");
    setShowGuide(false);
    onProceed?.();
  }, [onProceed]);

  const handleDismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "true");
    sessionStorage.setItem(SESSION_KEY, "true");
    setShowGuide(false);
    onProceed?.();
  }, [onProceed]);

  const handleClose = useCallback(() => {
    setShowGuide(false);
  }, []);

  return (
    <>
      <div className="fab-container" role="complementary" aria-label="Quick report">
        <div className="fab-tooltip">Report Road Damage</div>
        <button
          className="fab-btn"
          onClick={handleClick}
          aria-label="Report Road Damage"
          title="Report Road Damage"
          type="button"
        >
          <FaCamera className="fab-icon" />
        </button>
      </div>

      {showGuide && (
        <PhotoCaptureGuide
          onContinue={handleContinue}
          onDismiss={handleDismiss}
          onClose={handleClose}
        />
      )}
    </>
  );
}

export default FloatingReportButton;