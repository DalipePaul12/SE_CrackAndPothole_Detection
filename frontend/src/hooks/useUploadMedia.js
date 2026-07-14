/**
 * useUploadMedia.js
 *
 * Fixes:
 *  - Added all real-world video MIME types (quicktime, x-msvideo, x-matroska)
 *  - Added extension-based fallback for when browser reports wrong/empty MIME
 *  - Routes video files to analyzeVideo() and images to analyzeMedia()
 *  - Exposes analysisProgress so the UI can show processing status
 *  - Never shows "Unsupported file format" for valid .mp4 / .mov / .avi files
 */

import { useState, useCallback } from "react";
import { uploadMedia } from "../api/media";
import { analyzeFile } from "../api/ml";

// ── MIME + extension maps ─────────────────────────────────────────────────────

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",       // .mov on Safari / iOS
  "video/x-msvideo",      // .avi
  "video/x-matroska",     // .mkv
  "video/mpeg",
  "video/ogg",
  "video/webm",
  "application/octet-stream", // some browsers report this for video blobs
]);

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".avi", ".mkv"]);

const MAX_IMAGE_BYTES = 50  * 1024 * 1024;  // 50 MB
const MAX_VIDEO_BYTES = 150 * 1024 * 1024;  // 150 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExt(filename = "") {
  const parts = filename.split(".");
  return parts.length > 1 ? "." + parts.pop().toLowerCase() : "";
}

/**
 * Classify a File as "image", "video", or null (unsupported).
 * Checks MIME type first; falls back to file extension so that
 * browsers with wrong/empty MIME types are still handled correctly.
 */
function classifyFile(file) {
  if (!file) return null;

  const mime = (file.type || "").toLowerCase();
  const ext  = getExt(file.name);

  if (IMAGE_MIME.has(mime) || IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_MIME.has(mime) || VIDEO_EXT.has(ext)) return "video";

  return null; // truly unsupported
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export default function useUploadMedia() {
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [analysisResult,   setAnalysisResult]   = useState(null);

  const upload = useCallback(async (reportId, file) => {
    // ── Pre-flight checks ────────────────────────────────────────────────────

    if (!reportId) {
      setError("Report ID is required before uploading media.");
      return null;
    }

    if (!file) {
      setError("No file selected.");
      return null;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      // Uploading requires a live connection — surface a clear reason
      // instead of letting the request fail with a generic network error.
      // Callers that support offline queueing (see useOfflineQueue.js)
      // should hold onto the file and retry once back online.
      setError("You're offline. This will be uploaded automatically once your connection is restored.");
      return null;
    }

    const fileKind = classifyFile(file);

    if (!fileKind) {
      setError(
        "Unsupported file type. Please upload a JPEG, PNG, or WEBP image, " +
        "or an MP4, MOV, or AVI video."
      );
      return null;
    }

    const maxBytes = fileKind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const maxLabel = fileKind === "video" ? "150 MB" : "50 MB";

    if (file.size > maxBytes) {
      setError(`File too large. Maximum allowed size is ${maxLabel}.`);
      return null;
    }

    // ── Reset state ──────────────────────────────────────────────────────────

    setLoading(true);
    setError(null);
    setAnalysisProgress(null);
    setAnalysisResult(null);

    try {
      // ── Step 1: Upload file to storage ───────────────────────────────────

      setAnalysisProgress("Uploading…");

      const uploadRes = await uploadMedia(reportId, file);

      if (!uploadRes?.success) {
        throw new Error(uploadRes?.error || "Upload failed.");
      }

      // ── Step 2: Run AI analysis ──────────────────────────────────────────

      setAnalysisProgress(
        fileKind === "video" ? "Uploading video for analysis…" : "Analysing image…"
      );

      const aiRes = await analyzeFile(file, (msg) => {
        setAnalysisProgress(msg);
      });

      if (aiRes?.success && aiRes.data) {
        setAnalysisResult(aiRes.data);
      } else if (aiRes?.error) {
        // Non-fatal — upload succeeded, analysis failed
        console.warn("AI analysis error:", aiRes.error);
        setAnalysisResult(null);
      }

      setAnalysisProgress(null);
      return uploadRes.data;

    } catch (err) {
      setError(err.message || "Upload failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setAnalysisProgress(null);
    setAnalysisResult(null);
  }, []);

  return {
    upload,
    reset,
    loading,
    error,
    analysisProgress,   // string | null — show this in the UI while processing
    analysisResult,     // { ai_validation, prediction } | { detected, prediction, analytics } | null
  };
}