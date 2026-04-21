import { useState } from "react";
import { createReport } from "../api/reports";

export default function useSubmitReport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [report, setReport] = useState(null);

  const submit = async ({ latitude, longitude, barangay, street_name, description }) => {
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
        barangay: barangay ?? null,
        street_name: street_name ?? null,
        description: description ?? null,
      });

      if (!res.success) {
        throw new Error(res.error || "Report submission failed");
      }

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