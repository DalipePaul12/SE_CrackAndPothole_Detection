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
  }) => {
    if (latitude == null || longitude == null) {
      setError("Location is required");
      return null;
    }

    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await createReport({
        latitude,
        longitude,
        barangay:        barangay    ?? null,
        street_name:     street_name ?? null,
        description:     description ?? null,
        ai_damage_type,
        ai_severity,
        ai_confidence,
        is_flagged_fake,
        fake_confidence,
        is_hybrid,
        secondary_damage,
        detection_note,
        report_type,
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