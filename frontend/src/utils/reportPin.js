function parseCoordinate(value, limit) {
  if (typeof value !== "number" && (
    typeof value !== "string" || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  )) return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function getReportPin({ latitude, longitude }) {
  const lat = parseCoordinate(latitude, 90);
  const lng = parseCoordinate(longitude, 180);
  return lat === null || lng === null ? null : [lat, lng];
}
