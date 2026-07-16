/**
 * exifUtils.js — Thin wrapper around exifr for reading GPS from gallery images.
 *
 * Used only in the gallery-upload path of CreateReport.jsx. Camera-captured
 * frames are raw blobs without EXIF, so this is never called for them.
 */

import exifr from "exifr";

/**
 * Attempt to read GPS coordinates from an image File.
 *
 * @param {File} file  - The image file to inspect.
 * @returns {Promise<{lat: number, lng: number} | null>}
 *   Resolves with { lat, lng } if GPS EXIF is present and valid,
 *   or null if not found / parse failed / coordinates are invalid.
 */
export async function readExifGps(file) {
  try {
    const gps = await exifr.gps(file);
    if (
      gps &&
      typeof gps.latitude  === "number" &&
      typeof gps.longitude === "number" &&
      isFinite(gps.latitude) &&
      isFinite(gps.longitude)
    ) {
      return { lat: gps.latitude, lng: gps.longitude };
    }
    return null;
  } catch {
    // Unsupported format, missing EXIF, or parse error — not an error condition.
    return null;
  }
}
