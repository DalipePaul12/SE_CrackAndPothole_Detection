// frontend/src/hooks/useReports.js

import { useState, useEffect, useCallback } from "react";
import { getReports, getMyReports, submitReport } from "../api/reports";

/**
 * useReports(onlyMine)
 *   onlyMine = true  → GET /reports/mine  (MyProfile, MySubmissions)
 *   onlyMine = false → GET /reports       (AllReports, Dashboard)
 */
export function useReports(onlyMine = false) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = onlyMine ? await getMyReports() : await getReports();
      // Guarantee reports is always an array — never undefined/null
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("[useReports] fetch error:", err);
      setError(err?.detail || "Failed to load reports.");
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [onlyMine]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Used by CreateReport.jsx after a successful submission
  const submit = async (formData) => {
    const result = await submitReport(formData);
    await fetchReports(); // refresh list after submit
    return result;
  };

  return { reports, loading, error, refetch: fetchReports, submit };
}