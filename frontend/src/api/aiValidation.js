/**
 * aiValidation.js — AI-generated media detection API layer
 *
 * FIX: validateMedia() now returns a normalized { success, data, error, status }
 *      shape. The original returned the raw api.post() result which on a 202
 *      response looked like { success: false, data: null, error: "Still processing" }
 *      — usePipeline couldn't distinguish this from a real error.
 */
import { requestRaw } from "./client";

/**
 * validateMedia — Retrieve the stored AI-fake-detection result for a media ID.
 * Returns { success, data, error, status }.
 * 202 means validation is still in progress (caller should wait/retry).
 */
export async function validateMedia(mediaId) {
  return requestRaw("/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
}