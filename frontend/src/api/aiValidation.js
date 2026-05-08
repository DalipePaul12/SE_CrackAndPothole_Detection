import { requestRaw } from "./client";

export async function validateMedia(mediaId) {
  return requestRaw("/ai/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_id: mediaId }),
  });
}