
export function normalizeStatus(status) {
  return typeof status === "string" ? status.trim().toUpperCase() : status;
}
