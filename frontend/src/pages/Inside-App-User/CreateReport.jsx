import React, { useState, useRef, useEffect, useCallback } from "react";
import "./CreateReport.css";
import {
  FaCamera,
  FaVideo,
  FaMapMarkerAlt,
  FaRegTrashAlt,
  FaTimes,
  FaExclamationCircle,
  FaCheckCircle,
  FaSpinner,
  FaExclamationTriangle,
} from "react-icons/fa";
import { MdOutlineLocationOn } from "react-icons/md";
import ReactDOM from "react-dom";

import { useUser } from "../../hooks/useUser";
import { analyzeMedia } from "../../api/ml";
import { api } from "../../api/client";

const MALABON_BARANGAYS = [
  "Acacia", "Baritan", "Bayan-bayanan", "Catmon", "Concepcion", "Dampalit",
  "Flores", "Hulong Duhat", "Ibaba", "Longos", "Maysilo", "Muzon", "Niugan",
  "Panghulo", "Potrero", "San Agustin", "Santolan", "Tanong", "Tinajeros", "Tonsuya",
];

// ── Normalizers (UI label → internal key) ──────────────────────────────────────

function normalizeDamageType(label) {
  if (!label) return null;
  switch (label.toLowerCase()) {
    case "pothole": return "POTHOLE";
    case "crack":   return "CRACK";
    default:        return null;
  }
}

function normalizeSeverity(sev) {
  if (!sev) return null;
  switch (sev.toLowerCase()) {
    case "critical":     return "CRITICAL";
    case "low":
    case "non-critical":
    case "moderate":     return "NON-CRITICAL";
    default:             return null;
  }
}

// ── Backend value maps ─────────────────────────────────────────────────────────
// FIXES:
//   [FIX-CR1] Damage type values are lowercase strings to match the backend
//             DamageType enum ("pothole" / "crack"), not uppercase.
//   [FIX-CR2] Severity values match the backend SeverityLevel enum:
//             "critical" / "low"  — not "NON-CRITICAL" (which the backend rejects
//             with a 422 Unprocessable Entity, silently failing the POST /reports).
//   [FIX-CR3] "status" field REMOVED from the POST /reports body.
//             The backend always sets status=PENDING on creation; sending
//             status="pending" or status="flagged" (plain strings) caused a 422
//             because the backend expects a ReportStatus enum value — and the
//             is_flagged_fake flag already handles the flagged case.

const DAMAGE_TYPE_BACKEND = {
  POTHOLE: "pothole",   // [FIX-CR1]
  CRACK:   "crack",
};

const SEVERITY_BACKEND = {
  CRITICAL:       "critical",  // [FIX-CR2]
  "NON-CRITICAL": "low",
};

// ─────────────────────────────────────────────────────────────────────────────

function CreateReport({ onClose }) {
  const { profile } = useUser();

  const [activeTab, setActiveTab] = useState("photo");
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);

  const [isAnalyzing, setIsAnalyzing]         = useState(false);
  const [analyzeError, setAnalyzeError]       = useState(null);
  const [hfStatus, setHfStatus]               = useState(null);
  const [imageType, setImageType]             = useState(null);
  const [damageType, setDamageType]           = useState(null);
  const [severity, setSeverity]               = useState(null);
  const [aiConfidence, setAiConfidence]       = useState(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const [location, setLocation]           = useState("Fetching location…");
  const [latitude, setLatitude]           = useState(null);
  const [longitude, setLongitude]         = useState(null);
  const [reporterName, setReporterName]   = useState("");
  const [barangay, setBarangay]           = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [formError, setFormError]               = useState("");
  const [submitSuccess, setSubmitSuccess]       = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal]   = useState(false);

  const fileRef       = useRef();
  const analysisIdRef = useRef(0);

  // ── On mount: pre-fill name + GPS ─────────────────────────────────────────
  useEffect(() => {
    if (profile?.full_name) setReporterName(profile.full_name);

    if (!navigator.geolocation) {
      setLocation("");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocation(
          `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`
        );
      },
      () => setLocation(""),
      { timeout: 8000, maximumAge: 60_000 }
    );
  }, [profile]);

  // ── Reset all analysis state when a new file is selected ──────────────────
  const resetAnalysis = useCallback(() => {
    setImageType(null);
    setHfStatus(null);
    setDamageType(null);
    setSeverity(null);
    setAiConfidence(null);
    setAnalyzeError(null);
    setIsAnalyzing(false);
    setAnalysisComplete(false);
  }, []);

  // ── File select → run ML analysis ─────────────────────────────────────────
  const handleFileChange = useCallback(async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    setFile(f);
    setPreview(URL.createObjectURL(f));
    setFormError("");
    resetAnalysis();

    const thisId = ++analysisIdRef.current;
    setIsAnalyzing(true);

    try {
      const result = await analyzeMedia(f);
      if (analysisIdRef.current !== thisId) return;

      if (!result.success) {
        setAnalyzeError(result.error || "Analysis failed.");
        setAnalysisComplete(true);
        return;
      }

      const { ai_validation, prediction } = result.data ?? {};

      // ── Fake-image detection result ──────────────────────────────────────
      if (ai_validation) {
        const hfStat = ai_validation.status;
        setHfStatus(hfStat);

        if (hfStat === "approved_for_classification") {
          setImageType("REAL");
        } else if (hfStat === "rejected") {
          setImageType("AI-GENERATED");
        } else if (hfStat === "error") {
          setImageType(null);
          setAnalyzeError(
            "AI authenticity check encountered an error. " +
            "Damage detection still ran — verify HF_API_TOKEN in .env."
          );
        }
        // "skipped" → treat as real, no message needed
        if (hfStat === "skipped") setImageType("REAL");
      }

      // ── YOLO damage classification ───────────────────────────────────────
      const hfBlocked = ai_validation?.status === "rejected";
      if (!hfBlocked && prediction) {
        const dt = normalizeDamageType(prediction.label);
        const sv = normalizeSeverity(prediction.severity);
        setDamageType(dt);
        setSeverity(sv);
        setAiConfidence(prediction.confidence ?? null);

        if (prediction.label === "none" || dt === null) {
          setAnalyzeError(
            (prev) =>
              (prev ? prev + " " : "") +
              "No pothole or crack detected. Please upload a clear photo of road damage."
          );
        }
      }
    } catch {
      if (analysisIdRef.current !== thisId) return;
      setAnalyzeError("Analysis error — please try re-uploading the image.");
    } finally {
      if (analysisIdRef.current === thisId) {
        setIsAnalyzing(false);
        setAnalysisComplete(true);
      }
    }
  }, [resetAnalysis]);

  // ── Clear uploaded file ────────────────────────────────────────────────────
  const clearMedia = useCallback((e) => {
    e.stopPropagation();
    analysisIdRef.current++;
    setFile(null);
    setPreview(null);
    resetAnalysis();
    if (fileRef.current) fileRef.current.value = "";
  }, [resetAnalysis]);

  // ── Validate before showing confirm modal ─────────────────────────────────
  const validateForm = useCallback(() => {
    if (!file) {
      setFormError("Evidence required: Please upload a photo or video.");
      return;
    }
    if (isAnalyzing) {
      setFormError("Please wait for AI analysis to complete.");
      return;
    }
    if (analysisComplete && imageType !== "AI-GENERATED" && damageType === null) {
      setFormError(
        "No pothole or crack was detected. " +
        "Please upload a clear photo of road damage."
      );
      return;
    }
    if (!barangay) {
      setFormError("Location error: Please select a Barangay.");
      return;
    }
    if (latitude == null || longitude == null) {
      setFormError("Location error: GPS coordinates are required. Please allow location access.");
      return;
    }
    setFormError("");
    setShowSubmitModal(true);
  }, [file, isAnalyzing, analysisComplete, imageType, damageType, barangay, latitude, longitude]);

  // ── Submit after confirm ───────────────────────────────────────────────────
  const handleSubmitConfirm = useCallback(async () => {
    setShowSubmitModal(false);
    setIsSubmitting(true);
    setFormError("");

    try {
      const is_flagged = imageType === "AI-GENERATED";

      /**
       * [FIX-CR1][FIX-CR2][FIX-CR3]
       * Body now matches ReportCreate schema exactly:
       *   - damage_type / severity → NOT sent (backend derives from ai_* fields)
       *   - ai_damage_type / ai_severity → lowercase enum strings ("pothole", "critical")
       *   - ai_confidence → float 0-1
       *   - is_flagged_fake / fake_confidence → boolean + float
       *   - status → NOT sent (backend always sets PENDING on creation)
       *
       * Previously the body sent:
       *   { damage_type: "POTHOLE", severity: "NON-CRITICAL", status: "pending" }
       * All three caused 422 Unprocessable Entity from FastAPI's Pydantic validation,
       * which is why the network error appeared on Submit.
       */
      const reportPayload = {
        latitude,
        longitude,
        barangay,
        street_name:      location?.trim() || null,
        description:      additionalInfo?.trim() || null,
        // AI classification results (sent from frontend after /ml/analyze)
        ai_damage_type:   DAMAGE_TYPE_BACKEND[damageType]  ?? null,
        ai_severity:      SEVERITY_BACKEND[severity]       ?? null,
        ai_confidence:    aiConfidence ?? 0.0,
        // Fake-image detection results
        is_flagged_fake:  is_flagged,
        fake_confidence:  is_flagged ? 0.9 : 0.0,
      };

      const reportRes = await api.post("/reports", reportPayload);

      if (!reportRes.success) {
        throw new Error(reportRes.error || "Failed to create report. Please try again.");
      }

      // Backend returns { id: ... } or { report_id: ... } depending on version
      const reportId = reportRes.data?.id ?? reportRes.data?.report_id;
      if (!reportId) {
        throw new Error("Server did not return a report ID. Please contact support.");
      }

      // ── Step 2: attach media file ──────────────────────────────────────────
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await api.upload(`/reports/${reportId}/media`, formData);

      if (!uploadRes.success) {
        // Report was created — partial success. Let the user know.
        setFormError(
          `Report #${reportId} was saved, but the photo upload failed: ${uploadRes.error}. ` +
          "Your report is recorded. You can re-upload the photo from your report history."
        );
        setSubmitSuccess(true);
        return;
      }

      setSubmitSuccess(true);
      setTimeout(() => onClose(), 2000);

    } catch (err) {
      setFormError(err.message || "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    imageType, latitude, longitude, barangay, location,
    additionalInfo, damageType, severity, aiConfidence, file, onClose,
  ]);

  const canSubmit      = !isSubmitting && !isAnalyzing;
  const imageTypeBadge = hfStatus === "error" ? "HF-ERROR" : imageType;

  // ── Render ─────────────────────────────────────────────────────────────────
  return ReactDOM.createPortal(
    <div className="snap-overlay">
      <div className="snap-modal">

        <button
          className="snap-close-icon"
          onClick={() => !isSubmitting && setShowDiscardModal(true)}
          disabled={isSubmitting || isAnalyzing}
          aria-label="Close report form"
        >
          <FaTimes />
        </button>

        {/* ── Left panel: upload + AI image type ──────────────────────────── */}
        <div className="snap-left">
          <h2>Visual Evidence</h2>

          <div className="snap-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === "photo"}
              className={`snap-tab ${activeTab === "photo" ? "active" : ""}`}
              onClick={() => setActiveTab("photo")}
              disabled={isSubmitting}
            >
              <FaCamera className="tab-icon" aria-hidden="true" /> Photo
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "video"}
              className={`snap-tab ${activeTab === "video" ? "active" : ""}`}
              onClick={() => setActiveTab("video")}
              disabled={isSubmitting}
            >
              <FaVideo className="tab-icon" aria-hidden="true" /> Video
            </button>
          </div>

          <div
            className={`snap-upload-box ${isAnalyzing ? "analyzing" : ""}`}
            onClick={() => !preview && !isSubmitting && !isAnalyzing && fileRef.current.click()}
            role="button"
            aria-label="Upload evidence file"
            tabIndex={preview ? -1 : 0}
            onKeyDown={(e) => e.key === "Enter" && !preview && fileRef.current.click()}
          >
            {preview ? (
              <div className="preview-container">
                {activeTab === "video" ? (
                  <video src={preview} className="preview-img" muted autoPlay loop playsInline />
                ) : (
                  <img src={preview} alt="Uploaded evidence" className="preview-img" />
                )}
                {!isSubmitting && !isAnalyzing && (
                  <button
                    className="trash-btn"
                    onClick={clearMedia}
                    aria-label="Remove uploaded file"
                  >
                    <FaRegTrashAlt aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <div className="upload-placeholder">
                <div className="icon-circle" aria-hidden="true">
                  {activeTab === "photo" ? <FaCamera /> : <FaVideo />}
                </div>
                <h3>{activeTab === "photo" ? "Upload Photo" : "Upload Video"}</h3>
                <p>Required for AI Classification</p>
              </div>
            )}
          </div>

          <input
            ref={fileRef}
            type="file"
            hidden
            accept={
              activeTab === "photo"
                ? "image/jpeg,image/jpg,image/png,image/webp"
                : "video/mp4"
            }
            onChange={handleFileChange}
            aria-hidden="true"
          />

          <div className="ai-classification-bottom">
            {isAnalyzing ? (
              <div className="analyzing-row" role="status" aria-live="polite">
                <FaSpinner className="spin-icon" aria-hidden="true" />
                <span className="analyzing-text">Analyzing image…</span>
              </div>
            ) : (
              <label id="image-type-label">IMAGE TYPE (AI CLASSIFIED)</label>
            )}

            <div className="classification-buttons" role="group" aria-labelledby="image-type-label">
              <button
                className={`class-btn ${imageTypeBadge === "REAL" ? "active-real" : ""} ${imageTypeBadge === "HF-ERROR" ? "active-hf-error" : ""}`}
                disabled
                aria-pressed={imageType === "REAL"}
              >
                REAL
              </button>
              <button
                className={`class-btn ${imageTypeBadge === "AI-GENERATED" ? "active-ai" : ""}`}
                disabled
                aria-pressed={imageType === "AI-GENERATED"}
              >
                AI-GENERATED
              </button>
            </div>

            {imageType === "AI-GENERATED" && (
              <p className="flagged-note" role="alert">
                Flagged — held for admin review before publishing.
              </p>
            )}

            {analyzeError && !isAnalyzing && (
              <p
                className={
                  damageType === null && analysisComplete && imageType !== "AI-GENERATED"
                    ? "analyze-error"
                    : "analyze-warning"
                }
                role="alert"
              >
                <FaExclamationTriangle aria-hidden="true" style={{ marginRight: 4 }} />
                {typeof analyzeError === "function" ? analyzeError(null) : analyzeError}
              </p>
            )}
          </div>
        </div>

        {/* ── Right panel: classification + form ──────────────────────────── */}
        <div className="snap-right">
          <div className="top-classifications">

            <div className="class-group">
              <label id="damage-type-label">
                DAMAGE TYPE (AI CLASSIFIED)
                {isAnalyzing && (
                  <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 6 }} />
                )}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="damage-type-label">
                <button
                  className={`class-btn ${damageType === "POTHOLE" ? "active-pothole" : ""}`}
                  disabled
                  aria-pressed={damageType === "POTHOLE"}
                >
                  POTHOLE
                </button>
                <button
                  className={`class-btn ${damageType === "CRACK" ? "active-crack" : ""}`}
                  disabled
                  aria-pressed={damageType === "CRACK"}
                >
                  CRACK
                </button>
              </div>
            </div>

            <div className="class-group">
              <label id="severity-label">
                SEVERITY (AI CLASSIFIED)
                {isAnalyzing && (
                  <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 6 }} />
                )}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="severity-label">
                <button
                  className={`class-btn ${severity === "NON-CRITICAL" ? "active-non-critical" : ""}`}
                  disabled
                  aria-pressed={severity === "NON-CRITICAL"}
                >
                  NON-CRITICAL
                </button>
                <button
                  className={`class-btn ${severity === "CRITICAL" ? "active-critical" : ""}`}
                  disabled
                  aria-pressed={severity === "CRITICAL"}
                >
                  CRITICAL
                </button>
              </div>
            </div>
          </div>

          <div className="snap-form-group">
            <label htmlFor="location-input">LOCATION &amp; BARANGAY</label>
            <div className="input-with-icons">
              <MdOutlineLocationOn className="input-icon-left" aria-hidden="true" />
              <input
                id="location-input"
                type="text"
                placeholder="Street name, landmark or coordinates…"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isSubmitting}
              />
              <div className="input-icon-right" aria-hidden="true">
                <FaMapMarkerAlt />
              </div>
            </div>
          </div>

          <div className="snap-form-row">
            <div className="snap-form-group half">
              <label htmlFor="reporter-name">REPORTER'S NAME</label>
              <input
                id="reporter-name"
                type="text"
                placeholder="Enter your name"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="snap-form-group half">
              <label htmlFor="barangay-select">
                BARANGAY <span style={{ color: "red" }} aria-hidden="true">*</span>
              </label>
              <select
                id="barangay-select"
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                className={!barangay ? "placeholder-select" : "black-text"}
                disabled={isSubmitting}
                aria-required="true"
              >
                <option value="" disabled hidden>Select Barangay</option>
                {MALABON_BARANGAYS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="snap-form-group">
            <label htmlFor="additional-info">ADDITIONAL INFORMATION</label>
            <textarea
              id="additional-info"
              placeholder="Tell us more about the damage (e.g., traffic impact, depth)"
              rows="3"
              value={additionalInfo}
              onChange={(e) => setAdditionalInfo(e.target.value)}
              disabled={isSubmitting}
              maxLength={1000}
            />
          </div>

          {formError && (
            <div className="error-message" role="alert">
              <FaExclamationCircle aria-hidden="true" style={{ marginRight: 6 }} />
              {formError}
            </div>
          )}

          {submitSuccess && (
            <div className="success-message" role="status">
              <FaCheckCircle aria-hidden="true" style={{ marginRight: 6 }} />
              Report submitted successfully!
            </div>
          )}

          <div className="snap-actions">
            <button
              className="btn-discard"
              onClick={() => setShowDiscardModal(true)}
              disabled={isSubmitting || isAnalyzing}
            >
              Discard
            </button>
            <button
              className="btn-submit"
              onClick={validateForm}
              disabled={!canSubmit}
              aria-busy={isSubmitting}
            >
              {isSubmitting ? (
                <><FaSpinner className="spin-icon" aria-hidden="true" style={{ marginRight: 6 }} />Submitting…</>
              ) : isAnalyzing ? (
                <><FaSpinner className="spin-icon" aria-hidden="true" style={{ marginRight: 6 }} />Analyzing…</>
              ) : (
                "Submit Final Record"
              )}
            </button>
          </div>
        </div>

        {/* ── Discard confirm modal ──────────────────────────────────────── */}
        {showDiscardModal && (
          <div className="popup-overlay" role="dialog" aria-modal="true" aria-labelledby="discard-title">
            <div className="popup-modal">
              <div className="popup-icon red-icon" aria-hidden="true"><FaExclamationCircle /></div>
              <h3 id="discard-title">Discard Report?</h3>
              <p>Are you sure?<br />All progress on this report will be lost.</p>
              <div className="popup-buttons">
                <button className="btn-popup-cancel" onClick={() => setShowDiscardModal(false)}>Cancel</button>
                <button className="btn-popup-red" onClick={() => { setShowDiscardModal(false); onClose(); }}>
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Submit confirm modal ───────────────────────────────────────── */}
        {showSubmitModal && (
          <div className="popup-overlay" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <div className="popup-modal">
              <div className="popup-icon green-icon" aria-hidden="true"><FaCheckCircle /></div>
              <h3 id="submit-title">Confirm Submission</h3>
              <p>
                Ready to send this report?
                {imageType === "AI-GENERATED" && (
                  <><br /><strong style={{ color: "#ef4444" }}>This will be flagged for admin review.</strong></>
                )}
                <br />You will not be able to edit after posting.
              </p>
              <div className="popup-buttons">
                <button className="btn-popup-cancel" onClick={() => setShowSubmitModal(false)}>Cancel</button>
                <button className="btn-popup-green" onClick={handleSubmitConfirm}>Yes, Submit</button>
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