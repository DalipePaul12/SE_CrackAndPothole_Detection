// src/utils/mediaUrl.js
//
// Resolves a media_attachment.file_url (or report.image_url) into a
// browser-loadable URL. Older records store a relative local path like
// "/uploads/xxx.jpg" (needs BASE_URL prefixed). Newer records store a full
// Supabase Storage URL (already absolute — must NOT be prefixed).
const BASE_URL = import.meta.env.VITE_API_URL || "";

export function resolveMediaUrl(url) {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `${BASE_URL}${url}`;
}