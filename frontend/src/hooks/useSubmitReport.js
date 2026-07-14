import { useState } from "react";
import { createReport } from "../api/reports";
import { invalidateReportsCache } from "./useReports";
import { enqueueOfflineReport } from "./useOfflineQueue";

export default function useSubmitReport() {
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [report, setReport]     = useState(null);
  const [queued, setQueued]     = useState(false); // true when saved offline instead of sent

  const submit = async ({
    latitude,
    longitude,
    barangay,
    street_name,
    description,
    ai_damage_type  = null,
    ai_severity     = null,
    ai_confidence   = null,
    is_flagged_fake = false,
    fake_confidence = null,
    is_hybrid       = false,
    secondary_damage = null,
    detection_note  = null,
    report_type     = "image",
    disclaimer_accepted = false,   // ← REQUIRED by schema validator
    media_file      = null,        // ← optional File, only used for offline queueing
  }) => {
    if (latitude == null || longitude == null) {
      setError("Location is required");
      return null;
    }

    setLoading(true);
    setError(null);
    setReport(null);
    setQueued(false);

    // FIX: Normalize severity to lowercase enum values before sending.
    // Backend SeverityLevel enum only accepts: "critical" | "non_critical"
    const normalizedSeverity = ai_severity
      ? String(ai_severity).toLowerCase().trim()
      : null;

    const payload = {
      latitude,
      longitude,
      barangay:        barangay    ?? null,
      street_name:     street_name ?? null,
      description:     description ?? null,
      ai_damage_type:  ai_damage_type
        ? String(ai_damage_type).toLowerCase().trim()
        : null,
      ai_severity:     normalizedSeverity,
      ai_confidence,
      is_flagged_fake,
      fake_confidence,
      is_hybrid,
      secondary_damage: secondary_damage
        ? String(secondary_damage).toLowerCase().trim()
        : null,
      detection_note,
      report_type,
      disclaimer_accepted,   // ← schema requires True, will fail validation if false
    };

    // ── Offline: don't fail silently — queue for automatic retry ───────────
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        await enqueueOfflineReport(payload, media_file);
        setQueued(true);
        return { queued: true };
      } catch (err) {
        setError(err.message || "Could not save report for offline submission");
        return null;
      } finally {
        setLoading(false);
      }
    }

    try {
      const res = await createReport(payload);

      if (!res.success) {
        throw new Error(res.error || "Report submission failed");
      }

      invalidateReportsCache();

      setReport(res.data);
      return res.data;
    } catch (err) {
      // Network dropped mid-request — queue instead of losing the report.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        try {
          await enqueueOfflineReport(payload, media_file);
          setQueued(true);
          return { queued: true };
        } catch {
          // fall through to generic error below
        }
      }
      setError(err.message || "Report submission failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { submit, loading, error, report, queued };
}