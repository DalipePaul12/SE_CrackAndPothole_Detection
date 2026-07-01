import { useState } from "react";
import { createReport } from "../api/reports";
import { invalidateReportsCache } from "./useReports";

export default function useSubmitReport() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [report, setReport]   = useState(null);

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
  }) => {
    if (latitude == null || longitude == null) {
      setError("Location is required");
      return null;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      // FIX: Normalize severity to lowercase enum values before sending.
      // Backend SeverityLevel enum only accepts: "critical" | "non_critical"
      const normalizedSeverity = ai_severity
        ? String(ai_severity).toLowerCase().trim()
        : null;

      const res = await createReport({
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
      });

      if (!res.success) {
        throw new Error(res.error || "Report submission failed");
      }

      invalidateReportsCache();

      setReport(res.data);
      return res.data;
    } catch (err) {
      setError(err.message || "Report submission failed");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { submit, loading, error, report };
}