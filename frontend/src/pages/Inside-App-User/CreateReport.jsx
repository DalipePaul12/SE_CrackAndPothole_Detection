import React, {
  useState, useRef, useEffect, useCallback,
} from "react";
import ReactDOM from "react-dom";
import "./CreateReport.css";
import {
  FaCamera, FaVideo, FaMapMarkerAlt, FaRegTrashAlt,
  FaTimes, FaExclamationCircle, FaCheckCircle,
  FaSpinner, FaExclamationTriangle, FaRedo, FaStop,
} from "react-icons/fa";
import { MdOutlineLocationOn } from "react-icons/md";
import { useUser } from "../../hooks/useUser";
import { analyzeMedia } from "../../api/ml";
import { api } from "../../api/client";
import {
  detectBarangay,
  NOMINATIM_URL,
  MALABON_BARANGAYS,
  DEFAULT_CITY,
  DEFAULT_BARANGAY,
} from "../../utils/geolocationUtils";

const DAMAGE_TYPE_BACKEND = { POTHOLE: "pothole", CRACK: "crack" };
const SEVERITY_BACKEND    = { CRITICAL: "critical", "NON-CRITICAL": "low" };
const REALTIME_CONF_THRESHOLD = 0.40;
const MAX_REC_SECS = 10;

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
  if (l === "critical") return "CRITICAL";
  if (["low", "non-critical", "moderate"].includes(l)) return "NON-CRITICAL";
  return null;
}

async function snapFrameBlob(videoEl) {
  const canvas = document.createElement("canvas");
  canvas.width  = videoEl.videoWidth  || 640;
  canvas.height = videoEl.videoHeight || 480;
  canvas.getContext("2d").drawImage(videoEl, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

function distanceFeedback(bbox) {
  if (!bbox || bbox.length < 4) return { ok: false, text: "No object detected" };
  const [x1, y1, x2, y2] = bbox;
  const area = (x2 - x1) * (y2 - y1);
  if (area < 0.02) return { ok: false, text: "Too far — move closer (~10 m)" };
  if (area > 0.40) return { ok: false, text: "Too close — step back (~10 m)" };
  return { ok: true, text: `~${Math.round(10 / Math.sqrt(area))} m — good framing` };
}

function CreateReport({ onClose }) {
  const { profile } = useUser();

  const [activeTab, setActiveTab]   = useState("photo");
  const [showCamera, setShowCamera] = useState(false);

  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError]   = useState(null);
  const [capturing, setCapturing]       = useState(false);

  const [isRecording, setIsRecording]     = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const [liveDetection, setLiveDetection] = useState({
    detected: false, label: null, confidence: 0,
    bbox: null, distance: null, status: "idle",
  });

  const [isAnalyzing, setIsAnalyzing]           = useState(false);
  const [analyzeError, setAnalyzeError]         = useState(null);
  const [hfStatus, setHfStatus]                 = useState(null);
  const [imageType, setImageType]               = useState(null);
  const [damageType, setDamageType]             = useState(null);
  const [severity, setSeverity]                 = useState(null);
  const [aiConfidence, setAiConfidence]         = useState(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);

  const [coords, setCoords]                   = useState(null);
  const [city, setCity]                       = useState(DEFAULT_CITY);
  const [barangay, setBarangay]               = useState("");
  const [streetName, setStreetName]           = useState("");
  const [locationLoading, setLocationLoading] = useState(false);

  const [reporterName, setReporterName]         = useState("");
  const [additionalInfo, setAdditionalInfo]     = useState("");
  const [formError, setFormError]               = useState("");
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [submitSuccess, setSubmitSuccess]       = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal]   = useState(false);

  const fileRef          = useRef();
  const videoRef         = useRef();
  const streamRef        = useRef(null);
  const detectionLoopRef = useRef(null);
  const analysisIdRef    = useRef(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef        = useRef([]);
  const recordTimerRef   = useRef(null);

  const fetchLocation = useCallback(async () => {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: c }) => {
        const lat = c.latitude;
        const lng = c.longitude;
        setCoords({ lat, lng });
        try {
          const res  = await fetch(NOMINATIM_URL(lat, lng));
          const data = await res.json();
          const addr = data.address || {};
          const detectedBarangay = detectBarangay(lat, lng, addr);
          const detectedCity     = addr.city || addr.town || addr.municipality || DEFAULT_CITY;
          const detectedStreet   = addr.road || addr.street || addr.pedestrian || "";
          setCity(detectedCity);
          setBarangay(detectedBarangay);
          setStreetName(
            [detectedStreet, addr.house_number].filter(Boolean).join(" ").trim() ||
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
    if (profile?.full_name) setReporterName(profile.full_name);
    fetchLocation();
  }, [profile, fetchLocation]);

  const stopCamera = useCallback(() => {
    clearInterval(detectionLoopRef.current);
    clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current._discard = true;
      if (mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
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
          const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/ml/analyze`, {
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
          const conf     = pred.confidence ?? 0;
          const firstBox = pred.boxes?.[0];
          const normBox  = firstBox
            ? [firstBox.x, firstBox.y, firstBox.x + firstBox.width, firstBox.y + firstBox.height]
            : null;
          const dist = distanceFeedback(normBox);
          setLiveDetection({
            detected: conf >= REALTIME_CONF_THRESHOLD,
            label: pred.label, confidence: conf,
            bbox: normBox, distance: dist,
            status: conf >= REALTIME_CONF_THRESHOLD
              ? dist.ok ? "detected" : "warning"
              : "scanning",
          });
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
    await runFullAnalysis(captured); // eslint-disable-line
  }, [capturing, stopCamera]); // eslint-disable-line

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;
    chunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : MediaRecorder.isTypeSupported("video/webm")
        ? "video/webm"
        : "video/mp4";

    const mr = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = mr;

    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mr.onstop = async () => {
      if (mr._discard) return;
      clearInterval(recordTimerRef.current);
      setIsRecording(false);

      const blob     = new Blob(chunksRef.current, { type: "video/webm" });
      const captured = new File([blob], "snap_video.webm", { type: "video/webm" });

      setFile(captured);
      setPreview(URL.createObjectURL(blob));

      // Tear down stream inline to avoid circular ref with stopCamera
      clearInterval(detectionLoopRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraActive(false);
      setShowCamera(false);
      setLiveDetection({ detected: false, label: null, confidence: 0, bbox: null, distance: null, status: "idle" });

      await runFullAnalysis(captured); // eslint-disable-line
    };

    mr.start(100);
    setIsRecording(true);
    setRecordingTime(0);

    recordTimerRef.current = setInterval(() => {
      setRecordingTime((t) => {
        const next = t + 1;
        if (next >= MAX_REC_SECS) {
          clearInterval(recordTimerRef.current);
          if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
          }
          return next;
        }
        return next;
      });
    }, 1000);
  }, []); // eslint-disable-line

  const stopRecordingEarly = useCallback(() => {
    clearInterval(recordTimerRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  useEffect(() => () => stopCamera(), []); // eslint-disable-line

  const resetAnalysis = useCallback(() => {
    setImageType(null); setHfStatus(null); setDamageType(null);
    setSeverity(null); setAiConfidence(null); setAnalyzeError(null);
    setIsAnalyzing(false); setAnalysisComplete(false);
  }, []);

  const runFullAnalysis = useCallback(async (f) => {
    const thisId = ++analysisIdRef.current;
    resetAnalysis();
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
      if (ai_validation) {
        const hfStat = ai_validation.status;
        setHfStatus(hfStat);
        if (hfStat === "approved_for_classification" || hfStat === "skipped") setImageType("REAL");
        else if (hfStat === "rejected") setImageType("AI-GENERATED");
        else {
          setImageType(null);
          setAnalyzeError("AI authenticity check errored. Verify HF_API_TOKEN in .env.");
        }
      }
      const hfBlocked = ai_validation?.status === "rejected";
      if (!hfBlocked && prediction) {
        const dt = normalizeDamageType(prediction.label);
        const sv = normalizeSeverity(prediction.severity);
        setDamageType(dt);
        setSeverity(sv);
        setAiConfidence(prediction.confidence ?? null);
        if (prediction.label === "none" || dt === null)
          setAnalyzeError("No damage detected. Please upload a clearer photo of road damage.");
      }
    } catch {
      if (analysisIdRef.current !== thisId) return;
      setAnalyzeError("Analysis error — please try re-uploading the image.");
    } finally {
      if (analysisIdRef.current === thisId) { setIsAnalyzing(false); setAnalysisComplete(true); }
    }
  }, [resetAnalysis]);

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
    resetAnalysis();
    if (fileRef.current) fileRef.current.value = "";
  }, [resetAnalysis]);

  const validateForm = useCallback(() => {
    if (!file)       { setFormError("Evidence required: Please upload or capture a photo/video."); return; }
    if (isAnalyzing) { setFormError("Please wait for AI analysis to complete."); return; }
    if (analysisComplete && imageType !== "AI-GENERATED" && damageType === null) {
      setFormError("No damage detected. Please upload a clear photo/video of road damage."); return;
    }
    if (!barangay) { setFormError("Please select a Barangay."); return; }
    if (!coords)   { setFormError("GPS coordinates required. Please allow location access."); return; }
    setFormError("");
    setShowSubmitModal(true);
  }, [file, isAnalyzing, analysisComplete, imageType, damageType, barangay, coords]);

  const handleSubmitConfirm = useCallback(async () => {
    setShowSubmitModal(false);
    setIsSubmitting(true);
    setFormError("");
    try {
      const is_flagged  = imageType === "AI-GENERATED";
      const reportPayload = {
        latitude: coords.lat, longitude: coords.lng, barangay,
        street_name:     streetName || null,
        description:     additionalInfo?.trim() || null,
        ai_damage_type:  DAMAGE_TYPE_BACKEND[damageType] ?? null,
        ai_severity:     SEVERITY_BACKEND[severity]      ?? null,
        ai_confidence:   aiConfidence ?? 0.0,
        is_flagged_fake: is_flagged,
        fake_confidence: is_flagged ? 0.9 : 0.0,
      };
      const reportRes = await api.post("/reports", reportPayload);
      if (!reportRes.success) throw new Error(reportRes.error || "Failed to create report.");
      const reportId  = reportRes.data?.id ?? reportRes.data?.report_id;
      if (!reportId)  throw new Error("Server did not return a report ID.");
      const formData  = new FormData();
      formData.append("file", file);
      const uploadRes = await api.upload(`/reports/${reportId}/media`, formData);
      if (!uploadRes.success)
        setFormError(`Report #${reportId} saved, but media upload failed: ${uploadRes.error}.`);
      setSubmitSuccess(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setFormError(err.message || "Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }, [imageType, coords, barangay, streetName, additionalInfo, damageType, severity, aiConfidence, file, onClose]);

  const canSubmit      = !isSubmitting && !isAnalyzing;
  const imageTypeBadge = hfStatus === "error" ? "HF-ERROR" : imageType;

  const bboxStyle = liveDetection.bbox ? {
    left:   `${liveDetection.bbox[0] * 100}%`,
    top:    `${liveDetection.bbox[1] * 100}%`,
    width:  `${(liveDetection.bbox[2] - liveDetection.bbox[0]) * 100}%`,
    height: `${(liveDetection.bbox[3] - liveDetection.bbox[1]) * 100}%`,
  } : null;

  const recProgress = (recordingTime / MAX_REC_SECS) * 100;

  return ReactDOM.createPortal(
    <div className="snap-overlay">
      <div className="snap-modal">

        <button className="snap-close-icon"
          onClick={() => !isSubmitting && setShowDiscardModal(true)}
          disabled={isSubmitting || isAnalyzing}
          aria-label="Close report form">
          <FaTimes />
        </button>

        {/* ── LEFT PANEL ── */}
        <div className="snap-left">
          <h2>Visual Evidence</h2>

          <div className="snap-tabs" role="tablist">
            {[
              { id: "photo", label: "Photo", Icon: FaCamera },
              { id: "video", label: "Video", Icon: FaVideo  },
            ].map(({ id, label, Icon }) => (
              <button key={id} role="tab" aria-selected={activeTab === id}
                className={`snap-tab ${activeTab === id ? "active" : ""}`}
                onClick={() => { clearMedia(); setActiveTab(id); stopCamera(); }}
                disabled={isSubmitting}>
                <Icon className="tab-icon" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>

          {/* Camera viewport */}
          {showCamera && (
            <div className="snap-camera-wrapper">
              {cameraError ? (
                <div className="camera-error">
                  <FaExclamationTriangle aria-hidden="true" />
                  <p>{cameraError}</p>
                  <button className="btn-retry" onClick={startCamera}><FaRedo /> Retry</button>
                </div>
              ) : (
                <div className={`camera-viewport${isRecording ? " recording" : ""}`}>
                  <video ref={videoRef} className="camera-video" autoPlay playsInline muted />

                  {["tl", "tr", "bl", "br"].map((pos) => (
                    <span key={pos}
                      className={`guide-corner corner-${pos} ${liveDetection.status === "detected" ? "green" : isRecording ? "rec-red" : "red"}`}
                      aria-hidden="true" />
                  ))}

                  {cameraActive && (
                    <div className={`detection-pill pill-${liveDetection.status}`} role="status" aria-live="polite">
                      <span className="dot-pulse" aria-hidden="true" />
                      {liveDetection.status === "detected"
                        ? `${liveDetection.label?.charAt(0).toUpperCase() + liveDetection.label?.slice(1)} detected — ${Math.round(liveDetection.confidence * 100)}%`
                        : liveDetection.status === "warning"
                        ? liveDetection.distance?.text || "Adjust distance to ~10 m"
                        : "Scanning for road damage…"}
                    </div>
                  )}

                  {liveDetection.detected && bboxStyle && (
                    <div className="bbox-overlay" style={bboxStyle} aria-hidden="true">
                      <span className="bbox-label">
                        {liveDetection.label} — {Math.round(liveDetection.confidence * 100)}%
                      </span>
                    </div>
                  )}

                  {cameraActive && liveDetection.distance && (
                    <div className={`distance-indicator ${liveDetection.distance.ok ? "ok" : "warn"}`} aria-hidden="true">
                      <span className={`dist-dot ${liveDetection.distance.ok ? "" : "red"}`} />
                      {liveDetection.distance.text}
                    </div>
                  )}

                  {cameraActive && !isRecording && (
                    <p className="guidance-text" aria-hidden="true">
                      {activeTab === "video"
                        ? `Up to ${MAX_REC_SECS}s · maintain ~10 m from damage`
                        : "Focus camera · maintain ~10 m distance from damage"}
                    </p>
                  )}

                  {/* Recording progress bar */}
                  {isRecording && (
                    <div className="rec-progress-track" aria-hidden="true">
                      <div
                        className="rec-progress-fill"
                        style={{ width: `${recProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}

              {cameraActive && !cameraError && (
                <div className="camera-controls">
                  {activeTab === "photo" ? (
                    <>
                      <button className="btn-capture" onClick={capturePhoto} disabled={capturing} aria-label="Capture photo">
                        {capturing
                          ? <><FaSpinner className="spin-icon" aria-hidden="true" /> Capturing…</>
                          : <><FaCamera /> Capture Photo</>}
                      </button>
                      <button className="btn-stop-cam" onClick={stopCamera}>Stop Camera</button>
                    </>
                  ) : isRecording ? (
                    <>
                      <div className="recording-indicator" role="status" aria-live="polite">
                        <span className="rec-pulse-dot" aria-hidden="true" />
                        REC {recordingTime}s / {MAX_REC_SECS}s
                      </div>
                      <button className="btn-stop-rec" onClick={stopRecordingEarly} aria-label="Stop recording">
                        <FaStop aria-hidden="true" /> Stop
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn-capture" onClick={startRecording} aria-label="Start video recording">
                        <FaVideo aria-hidden="true" /> Start Recording
                      </button>
                      <button className="btn-stop-cam" onClick={stopCamera}>Stop Camera</button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Upload box */}
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
                  {activeTab === "video"
                    ? <video src={preview} className="preview-img" muted autoPlay loop playsInline controls />
                    : <img src={preview} alt="Uploaded evidence" className="preview-img" />}
                  {!isSubmitting && !isAnalyzing && (
                    <button className="trash-btn" onClick={clearMedia} aria-label="Remove file">
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
                  <p>{activeTab === "video" ? "MP4 file · up to 10s recommended" : "Tap to select a file"}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "photo" && !showCamera && !preview && (
            <button className="btn-use-camera" onClick={openCamera}
              disabled={isSubmitting || isAnalyzing}>
              <FaCamera aria-hidden="true" /> Use Camera
            </button>
          )}

          {activeTab === "video" && !showCamera && !preview && (
            <button className="btn-use-camera" onClick={openCamera}
              disabled={isSubmitting || isAnalyzing}>
              <FaVideo aria-hidden="true" /> Record Video
            </button>
          )}

          <input ref={fileRef} type="file" hidden
            accept={activeTab === "photo" ? "image/jpeg,image/jpg,image/png,image/webp" : "video/mp4,video/webm"}
            onChange={handleFileChange} aria-hidden="true" />

          {/* AI badges */}
          <div className="ai-classification-bottom">
            {isAnalyzing ? (
              <div className="analyzing-row" role="status" aria-live="polite">
                <FaSpinner className="spin-icon" aria-hidden="true" />
                <span className="analyzing-text">
                  {activeTab === "video" ? "Analyzing video…" : "Analyzing image…"}
                </span>
              </div>
            ) : (
              <label id="image-type-label">
                {activeTab === "video" ? "MEDIA TYPE (AI CLASSIFIED)" : "IMAGE TYPE (AI CLASSIFIED)"}
              </label>
            )}
            <div className="classification-buttons" role="group" aria-labelledby="image-type-label">
              <button className={`class-btn ${imageTypeBadge === "REAL" ? "active-real" : ""} ${imageTypeBadge === "HF-ERROR" ? "active-hf-error" : ""}`} disabled aria-pressed={imageType === "REAL"}>REAL</button>
              <button className={`class-btn ${imageTypeBadge === "AI-GENERATED" ? "active-ai" : ""}`} disabled aria-pressed={imageType === "AI-GENERATED"}>AI-GENERATED</button>
            </div>
            {imageType === "AI-GENERATED" && (
              <p className="flagged-note" role="alert">Flagged — held for admin review before publishing.</p>
            )}
            {analyzeError && !isAnalyzing && (
              <p className={damageType === null && analysisComplete && imageType !== "AI-GENERATED" ? "analyze-error" : "analyze-warning"} role="alert">
                <FaExclamationTriangle aria-hidden="true" style={{ marginRight: 4 }} />
                {typeof analyzeError === "function" ? analyzeError(null) : analyzeError}
              </p>
            )}
            {aiConfidence !== null && !isAnalyzing && (
              <div className="confidence-bar-wrapper" aria-label={`ML confidence: ${Math.round(aiConfidence * 100)}%`}>
                <div className="confidence-bar-header">
                  <span>ML Confidence</span>
                  <span className="confidence-pct">{Math.round(aiConfidence * 100)}%</span>
                </div>
                <div className="confidence-bar-track">
                  <div className="confidence-bar-fill" style={{ width: `${aiConfidence * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="snap-right">
          <div className="top-classifications">
            <div className="class-group">
              <label id="damage-type-label">
                DAMAGE TYPE (AI CLASSIFIED)
                {isAnalyzing && <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 6 }} />}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="damage-type-label">
                <button className={`class-btn ${damageType === "POTHOLE" ? "active-pothole" : ""}`} disabled aria-pressed={damageType === "POTHOLE"}>POTHOLE</button>
                <button className={`class-btn ${damageType === "CRACK" ? "active-crack" : ""}`} disabled aria-pressed={damageType === "CRACK"}>CRACK</button>
              </div>
            </div>
            <div className="class-group">
              <label id="severity-label">
                SEVERITY (AI CLASSIFIED)
                {isAnalyzing && <FaSpinner className="spin-icon" aria-hidden="true" style={{ marginLeft: 6 }} />}
              </label>
              <div className="classification-buttons" role="group" aria-labelledby="severity-label">
                <button className={`class-btn ${severity === "NON-CRITICAL" ? "active-non-critical" : ""}`} disabled aria-pressed={severity === "NON-CRITICAL"}>NON-CRITICAL</button>
                <button className={`class-btn ${severity === "CRITICAL" ? "active-critical" : ""}`} disabled aria-pressed={severity === "CRITICAL"}>CRITICAL</button>
              </div>
            </div>
          </div>

          <div className="snap-location-block">
            <div className="snap-location-header">
              <label>LOCATION &amp; BARANGAY</label>
              <button className="btn-refresh-loc" onClick={fetchLocation} disabled={locationLoading} aria-label="Refresh location">
                {locationLoading ? <FaSpinner className="spin-icon" aria-hidden="true" /> : <FaRedo aria-hidden="true" />}
              </button>
            </div>
            <div className="input-with-icons">
              <MdOutlineLocationOn className="input-icon-left" aria-hidden="true" />
              <input id="location-input" type="text" placeholder="Fetching location…"
                value={coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : locationLoading ? "Fetching location…" : ""}
                readOnly aria-label="GPS coordinates (auto-detected)" />
              <div className="input-icon-right" aria-hidden="true"><FaMapMarkerAlt /></div>
            </div>
            <div className="snap-form-row" style={{ marginTop: 8 }}>
              <div className="snap-form-group half">
                <label htmlFor="city-input">CITY</label>
                <input id="city-input" type="text" value={city} onChange={(e) => setCity(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="snap-form-group half">
                <label htmlFor="street-input">STREET / LANDMARK</label>
                <input id="street-input" type="text" value={streetName} onChange={(e) => setStreetName(e.target.value)} placeholder="Auto-detected from GPS" disabled={isSubmitting} />
              </div>
            </div>
          </div>

          <div className="snap-form-row">
            <div className="snap-form-group half">
              <label htmlFor="reporter-name">REPORTER'S NAME</label>
              <input id="reporter-name" type="text" placeholder="Enter your name" value={reporterName} onChange={(e) => setReporterName(e.target.value)} disabled={isSubmitting} />
            </div>
            <div className="snap-form-group half">
              <label htmlFor="barangay-select">BARANGAY <span style={{ color: "red" }} aria-hidden="true">*</span></label>
              <select id="barangay-select" value={barangay} onChange={(e) => setBarangay(e.target.value)}
                className={!barangay ? "placeholder-select" : "black-text"} disabled={isSubmitting} aria-required="true">
                <option value="" disabled hidden>Select Barangay</option>
                {MALABON_BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <div className="snap-form-group">
            <label htmlFor="additional-info">ADDITIONAL INFORMATION</label>
            <textarea id="additional-info" rows="3" maxLength={1000}
              placeholder="Describe the damage (e.g., traffic impact, depth, visibility risk)"
              value={additionalInfo} onChange={(e) => setAdditionalInfo(e.target.value)} disabled={isSubmitting} />
          </div>

          {formError && (
            <div className="error-message" role="alert">
              <FaExclamationCircle aria-hidden="true" style={{ marginRight: 6 }} />{formError}
            </div>
          )}
          {submitSuccess && (
            <div className="success-message" role="status">
              <FaCheckCircle aria-hidden="true" style={{ marginRight: 6 }} />Report submitted successfully!
            </div>
          )}

          <div className="snap-actions">
            <button className="btn-discard" onClick={() => setShowDiscardModal(true)} disabled={isSubmitting || isAnalyzing}>Discard</button>
            <button className="btn-submit" onClick={validateForm} disabled={!canSubmit} aria-busy={isSubmitting}>
              {isSubmitting ? <><FaSpinner className="spin-icon" aria-hidden="true" style={{ marginRight: 6 }} />Submitting…</>
               : isAnalyzing ? <><FaSpinner className="spin-icon" aria-hidden="true" style={{ marginRight: 6 }} />Analyzing…</>
               : "Submit Final Record"}
            </button>
          </div>
        </div>

        {showDiscardModal && (
          <div className="popup-overlay" role="dialog" aria-modal="true" aria-labelledby="discard-title">
            <div className="popup-modal">
              <div className="popup-icon red-icon" aria-hidden="true"><FaExclamationCircle /></div>
              <h3 id="discard-title">Discard Report?</h3>
              <p>Are you sure?<br />All progress on this report will be lost.</p>
              <div className="popup-buttons">
                <button className="btn-popup-cancel" onClick={() => setShowDiscardModal(false)}>Cancel</button>
                <button className="btn-popup-red" onClick={() => { setShowDiscardModal(false); onClose(); }}>Discard</button>
              </div>
            </div>
          </div>
        )}

        {showSubmitModal && (
          <div className="popup-overlay" role="dialog" aria-modal="true" aria-labelledby="submit-title">
            <div className="popup-modal">
              <div className="popup-icon green-icon" aria-hidden="true"><FaCheckCircle /></div>
              <h3 id="submit-title">Confirm Submission</h3>
              <p>
                Ready to send this report?
                {imageType === "AI-GENERATED" && <><br /><strong style={{ color: "#ef4444" }}>This will be flagged for admin review.</strong></>}
                <br />You cannot edit after posting.
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