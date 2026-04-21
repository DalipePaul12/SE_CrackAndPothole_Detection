import { useState } from "react";
import { createReport } from "../api/reports";
import { uploadMedia } from "../api/media";
import { validateMedia } from "../api/aiValidation";
import { classifyMedia, classifyMediaRaw } from "../api/ml";

// ─── Polling helper ────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Polls fn() with exponential back-off until it resolves with a non-202 result
 * or until maxAttempts is exhausted.
 *
 * fn must return { success, data, error, status } where `status` is the HTTP
 * status code.  On 202 we retry; on anything else we return the result.
 */
async function pollWithBackoff(fn, { maxAttempts = 20, baseDelayMs = 1000, maxDelayMs = 30_000 } = {}) {
  let attempt = 0;

  while (attempt < maxAttempts) {
    const result = await fn();

    // 422 = ML worker crashed — stop immediately
    if (result.status === 422) {
      return result;
    }

    // 202 = still processing — retry after back-off
    if (result.status === 202 || result.retryable === true) {
      attempt++;
      if (attempt >= maxAttempts) break;

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await sleep(delay);
      continue;
    }

    // Any other response (200, 400, 404, 500 …) — return immediately
    return result;
  }

  return {
    success: false,
    data: null,
    error: "ML classification timed out — please try again",
    status: 408,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function usePipeline() {
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [step, setStep]             = useState(null);
  const [validation, setValidation] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [report, setReport]         = useState(null);

  /**
   * runPipeline — Full pipeline: create report → upload → AI validate → ML classify.
   *
   * @param {File}   file        - The media file to analyse
   * @param {Object} reportData  - { latitude, longitude, barangay, street_name, description }
   * @returns {{ report, media, validation, prediction } | null}
   */
  const runPipeline = async (file, reportData) => {
    setLoading(true);
    setError(null);
    setStep(null);
    setValidation(null);
    setPrediction(null);
    setReport(null);

    try {
      // ── Step 1: Create report skeleton ──────────────────────────────────
      setStep("creating_report");
      const reportRes = await createReport({
        latitude:     reportData.latitude,
        longitude:    reportData.longitude,
        barangay:     reportData.barangay    ?? null,
        street_name:  reportData.street_name ?? null,
        description:  reportData.description ?? null,
      });

      if (!reportRes.success || !reportRes.data?.id) {
        throw new Error(reportRes.error || "Report creation failed");
      }

      const reportId = reportRes.data.id;

      // ── Step 2: Upload media (AI validation runs synchronously on backend) ─
      setStep("uploading");
      const uploadRes = await uploadMedia(reportId, file);

      if (!uploadRes.success || !uploadRes.data?.id) {
        throw new Error(uploadRes.error || "Upload failed");
      }

      const mediaId          = uploadRes.data.id;
      const inlineValidation = uploadRes.data?.ai_validation ?? null;

      // ── Step 3: AI Validation result ────────────────────────────────────
      // The backend returns ai_validation inline on the upload response.
      // If it's missing (older API version), fetch it explicitly.
      let validationResult = inlineValidation;

      if (validationResult) {
        setValidation(validationResult);
      } else {
        setStep("validating");
        const valRes = await validateMedia(mediaId);
        if (!valRes.success) {
          // 202 means validation still running — treat as "approved" and proceed;
          // the ML step will also gate on ai_generated flag server-side.
          if (valRes.status !== 202) {
            throw new Error(valRes.error || "AI validation failed");
          }
        } else {
          validationResult = valRes.data;
          setValidation(validationResult);
        }
      }

      // Hard-stop if AI-generated media is detected
      if (validationResult?.is_ai_generated) {
        const aiError = new Error("Media rejected: AI-generated content detected");
        aiError.isAiRejection = true;
        throw aiError;
      }

      // ── Step 4: ML Classification (with polling) ─────────────────────────
      setStep("classifying");

      const mlResult = await pollWithBackoff(
        () => classifyMediaRaw(mediaId),
        { maxAttempts: 20, baseDelayMs: 1500, maxDelayMs: 30_000 }
      );

      if (!mlResult.success) {
        if (mlResult.status === 422) {
          throw new Error("ML classification failed — the model could not process this image");
        }
        throw new Error(mlResult.error || "ML classification failed");
      }

      setPrediction(mlResult.data);
      setReport(reportRes.data);
      setStep("done");

      return {
        report:     reportRes.data,
        media:      uploadRes.data,
        validation: validationResult,
        prediction: mlResult.data,
      };

    } catch (err) {
      setError(err.message || "An unexpected error occurred");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return {
    runPipeline,
    loading,
    error,
    step,
    validation,
    prediction,
    report,
  };
}