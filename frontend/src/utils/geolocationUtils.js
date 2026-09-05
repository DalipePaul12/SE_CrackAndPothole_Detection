/**
 * Malabon Barangay Geolocation Utility
 * Uses coordinate bounding boxes to correctly identify barangays in Malabon City.
 * Nominatim often returns incorrect suburb/neighbourhood names for Malabon barangays,
 * so we cross-reference GPS coordinates against known barangay bounding boxes instead.
 */

export const MALABON_BARANGAYS = [
  "Acacia","Baritan","Bayan-bayanan","Catmon","Concepcion","Dampalit",
  "Flores","Hulong Duhat","Ibaba","Longos","Maysilo","Muzon","Niugan",
  "Panghulo","Potrero","San Agustin","Santolan","Tanong","Tinajeros","Tonsuya",
];

export const DEFAULT_CITY     = "Malabon";

/**
 * Approximate bounding boxes for each Malabon barangay.
 * Format: { name, latMin, latMax, lngMin, lngMax }
 * 
 * Coordinates derived from OpenStreetMap barangay boundary data for Malabon City.
 * Each box is slightly generous to avoid gaps at borders — the first match wins,
 * so order matters: more specific/smaller barangays are listed first.
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
 * Falls back to Nominatim suburb fields, then returns an empty value when the
 * coordinates cannot be matched confidently.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} [nominatimAddr] - address object from Nominatim reverse geocode (optional)
 * @returns {string} barangay name
 */
export function detectBarangay(lat, lng, nominatimAddr = null) {
  // 1. Try coordinate bounding box lookup first (most reliable for Malabon)
  for (const b of BARANGAY_BOUNDS) {
    if (lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax) {
      return b.name;
    }
  }

  // 2. If outside all boxes (edge case), try matching Nominatim against known list
  if (nominatimAddr) {
    const candidates = [
      nominatimAddr.suburb,
      nominatimAddr.neighbourhood,
      nominatimAddr.village,
      nominatimAddr.quarter,
      nominatimAddr.city_district,
    ].filter(Boolean);

    for (const candidate of candidates) {
      const normalized = candidate.toLowerCase().trim();
      const match = MALABON_BARANGAYS.find(
        (b) => b.toLowerCase() === normalized ||
               normalized.includes(b.toLowerCase()) ||
               b.toLowerCase().includes(normalized)
      );
      if (match) return match;
    }
  }

  // 3. Do not guess a barangay. The user must select it when coordinates are
  // outside the maintained boundary data.
  return "";
}

export const NOMINATIM_URL = (lat, lng) =>
  `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;