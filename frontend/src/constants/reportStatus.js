/**
 * Single source of truth for report status values.
 *
 * Values match backend ReportStatus enum exactly (all lowercase).
 * See: backend/app/models/enums.py — ReportStatus
 *
 * NOTE: ASSIGNED is intentionally omitted here; it is managed separately.
 */
export const REPORT_STATUS = {
  PENDING:     "pending",
  VERIFIED:    "verified",
  IN_PROGRESS: "in_progress",
  RESOLVED:    "resolved",
  DECLINED:    "declined",
  REJECTED:    "rejected",
  CANCELLED:   "cancelled",
  COMPLETED:   "completed",
};
