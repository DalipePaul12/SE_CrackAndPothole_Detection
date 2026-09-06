/**
 * Malabon Barangay Geolocation Utility
 * Uses coordinate bounding boxes to correctly identify barangays in Malabon City.
 * Nominatim often returns incorrect suburb/neighbourhood names for Malabon barangays,
 * so we cross-reference GPS coordinates against known barangay bounding boxes instead.
 *
 * FIX: the boxes below are approximate rectangles for irregularly-shaped barangays,
 * so they legitimately OVERLAP at their edges. The previous version returned the
 * first array entry whose box contained the point ("first match wins"), which meant
 * every coordinate that fell inside an overlap zone was silently assigned to
 * whichever barangay happened to be listed first (Panghulo) — regardless of which
 * box's center it was actually closest to. That's why barangay basically never
 * changed no matter where the user actually was.
 *
 * Now: we collect ALL boxes that contain the point, then pick the one whose
 * center is geometrically nearest to the actual GPS coordinate. Order in the
 * array no longer matters.
 */

export const MALABON_BARANGAYS = [
  "Acacia","Baritan","Bayan-bayanan","Catmon","Concepcion","Dampalit",
  "Flores","Hulong Duhat","Ibaba","Longos","Maysilo","Muzon","Niugan",
  "Panghulo","Potrero","San Agustin","Santolan","Tanong","Tinajeros","Tonsuya",
];

export const DEFAULT_CITY = "Malabon";

/**
 * Approximate bounding boxes for each Malabon barangay.
 * Format: { name, latMin, latMax, lngMin, lngMax }
 *
 * Coordinates derived from OpenStreetMap barangay boundary data for Malabon City.
 * Each box is slightly generous to avoid gaps at borders, so adjacent boxes
 * overlap — resolution between overlapping matches is done by nearest-centroid
 * (see detectBarangay), NOT by array order.
 */
const BARANGAY_BOUNDS = [
  { name: "Panghulo",     latMin: 14.6830, latMax: 14.6920, lngMin: 120.9520, lngMax: 120.9610 },
  { name: "Muzon",        latMin: 14.6890, latMax: 14.6970, lngMin: 120.9560, lngMax: 120.9640 },
  { name: "Niugan",       latMin: 14.6820, latMax: 14.6890, lngMin: 120.9560, lngMax: 120.9640 },
  { name: "Acacia",       latMin: 14.6740, latMax: 14.6840, lngMin: 120.9530, lngMax: 120.9620 },
  { name: "Baritan",      latMin: 14.6650, latMax: 14.6760, lngMin: 120.9540, lngMax: 120.9630 },
  { name: "Bayan-bayanan",latMin: 14.6700, latMax: 14.6800, lngMin: 120.9440, lngMax: 120.9540 },
  { name: "Catmon",       latMin: 14.6760, latMax: 14.6850, lngMin: 120.9440, lngMax: 120.9540 },
  { name: "Concepcion",   latMin: 14.6850, latMax: 14.6940, lngMin: 120.9440, lngMax: 120.9530 },
  { name: "Dampalit",     latMin: 14.6580, latMax: 14.6680, lngMin: 120.9500, lngMax: 120.9620 },
  { name: "Flores",       latMin: 14.6620, latMax: 14.6710, lngMin: 120.9430, lngMax: 120.9520 },
  { name: "Hulong Duhat", latMin: 14.6940, latMax: 14.7010, lngMin: 120.9500, lngMax: 120.9600 },
  { name: "Ibaba",        latMin: 14.6540, latMax: 14.6640, lngMin: 120.9460, lngMax: 120.9560 },
  { name: "Longos",       latMin: 14.6940, latMax: 14.7020, lngMin: 120.9560, lngMax: 120.9650 },
  { name: "Maysilo",      latMin: 14.6860, latMax: 14.6960, lngMin: 120.9620, lngMax: 120.9720 },
  { name: "Potrero",      latMin: 14.6760, latMax: 14.6860, lngMin: 120.9620, lngMax: 120.9720 },
  { name: "San Agustin",  latMin: 14.6680, latMax: 14.6780, lngMin: 120.9600, lngMax: 120.9700 },
  { name: "Santolan",     latMin: 14.6920, latMax: 14.7000, lngMin: 120.9640, lngMax: 120.9730 },
  { name: "Tanong",       latMin: 14.6660, latMax: 14.6760, lngMin: 120.9640, lngMax: 120.9730 },
  { name: "Tinajeros",    latMin: 14.6560, latMax: 14.6660, lngMin: 120.9580, lngMax: 120.9680 },
  { name: "Tonsuya",      latMin: 14.6750, latMax: 14.6850, lngMin: 120.9690, lngMax: 120.9800 },
];

/**
 * Detect barangay from GPS coordinates using bounding box lookup.
 * Among every box that contains the point, picks the one whose CENTER is
 * closest to the actual coordinate (fixes the old first-match-wins bug).
 *
 * Returns an OBJECT now (not a bare string), so callers can tell a confident
 * Malabon match apart from a best-effort guess for anywhere else:
 *   { name: "Panghulo", verified: true }   → matched a Malabon box/list, trustworthy
 *   { name: "Kaunlaran", verified: false } → raw Nominatim guess, outside Malabon,
 *                                            not cross-checked against real boundary
 *                                            data — show it but let the user confirm/edit
 *   { name: "", verified: false }          → nothing usable came back at all
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} [nominatimAddr] - address object from Nominatim reverse geocode (optional)
 * @returns {{name: string, verified: boolean}}
 */
export function detectBarangay(lat, lng, nominatimAddr = null) {
  // 1. Coordinate bounding box lookup — collect ALL matches, then rank by
  //    distance from each box's center to the actual point. Closest wins.
  let best = null;
  let bestDist = Infinity;

  for (const b of BARANGAY_BOUNDS) {
    const inBox = lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;
    if (!inBox) continue;

    const centerLat = (b.latMin + b.latMax) / 2;
    const centerLng = (b.lngMin + b.lngMax) / 2;
    const dLat = lat - centerLat;
    const dLng = lng - centerLng;
    const dist = dLat * dLat + dLng * dLng; // squared distance is enough for comparison

    if (dist < bestDist) {
      bestDist = dist;
      best = b.name;
    }
  }

  if (best) return { name: best, verified: true };

  // 2. Outside all Malabon boxes. Try matching Nominatim's fields against the
  //    known Malabon list first (handles edge-of-map points near city limits).
  const candidates = nominatimAddr
    ? [
        nominatimAddr.suburb,
        nominatimAddr.neighbourhood,
        nominatimAddr.village,
        nominatimAddr.quarter,
        nominatimAddr.city_district,
      ].filter(Boolean)
    : [];

  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().trim();
    const match = MALABON_BARANGAYS.find(
      (b) => b.toLowerCase() === normalized ||
             normalized.includes(b.toLowerCase()) ||
             b.toLowerCase().includes(normalized)
    );
    if (match) return { name: match, verified: true };
  }

  // 3. Genuinely outside Malabon (or Malabon list had no match). Instead of
  // giving up, use whatever Nominatim returned as a best-effort guess — it's
  // real OSM address data, just not cross-checked against our own boundary
  // boxes the way Malabon barangays are. Mark it unverified so the UI can
  // ask the user to confirm/edit it rather than trusting it blindly.
  if (candidates.length > 0) {
    return { name: candidates[0], verified: false };
  }

  return { name: "", verified: false };
}

export const NOMINATIM_URL = (lat, lng) =>
  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;