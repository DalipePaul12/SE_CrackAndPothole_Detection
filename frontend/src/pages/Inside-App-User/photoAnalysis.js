import { analyzeMedia } from "../../api/ml";
import { normalizePrediction } from "../../components/SegmentationMask";

export async function analyzeReportPhoto(file, source) {
  const { success, data, error } = await analyzeMedia(file, { source });
  const complete = { analysisComplete: true, currentStage: "review" };
  if (!success) return { ...complete, analyzeError: error || "Analysis failed." };

  const { ai_validation: auth, prediction, stage, status, reason } = data;
  const hfStatus = auth?.status;
  const flagged = auth?.is_ai_generated || hfStatus === "rejected" || status === "flagged_for_review";
  const unavailable = ["error", "failed", "unavailable"].includes(hfStatus);
  const uncertainAuth = ["pending", "processing"].includes(hfStatus);
  const result = {
    ...complete,
    hfStatus,
    hfConfidence: auth?.confidence ?? null,
    hfModel: auth?.model,
    hfRawScores: auth?.raw_scores,
    imageType: flagged ? "AI-GENERATED" : uncertainAuth ? null : "REAL",
    requiresReview: flagged || unavailable,
    reviewReason: flagged ? "AI-generated or manipulated media detected — flagged for admin review"
      : unavailable ? "AI authenticity check unavailable — flagged for manual review" : null,
  };

  if (status === "fail") {
    if (stage === "authenticity") return {
      ...result, imageType: "AI-GENERATED", analyzeError: "This upload appears to be AI-generated or manipulated.",
    };
    return {
      ...result, definitiveNoDamage: stage === "scene" || reason === "no_damage", aiConfidence: data.confidence ?? null,
      analyzeError: stage === "scene"
        ? "This doesn't look like a road or pavement surface. Please retake the photo focusing on the road."
        : reason === "no_damage" ? "No road damage detected. Please try again."
          : "The damage check could not confirm road damage.",
    };
  }

  const detections = data.all_detections?.length ? data.all_detections : prediction?.boxes ?? [];
  return {
    ...result,
    predictionResult: prediction,
    allDetections: detections.map(normalizePrediction).filter(Boolean),
    definitiveNoDamage: !prediction && !detections.length && !unavailable && !uncertainAuth,
    analyzeError: unavailable ? "The authenticity check failed. Retry analysis."
      : uncertainAuth ? "AI check is still processing. Please wait and re-upload."
      : status === "uncertain" ? "The damage classification is uncertain. Please capture a clearer image."
        : ["crack", "pothole"].includes(prediction?.label) ? null
          : "No damage detected. Please upload a clearer photo of road damage.",
  };
}
