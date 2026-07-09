import { useState } from 'react';
import { generateReportSummary } from '../api/reports.js';

export function useReportSummary(reportId) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    const { success, data, error: apiError } = await generateReportSummary(reportId);
    if (success) {
      setSummary(data.ai_summary ?? null);
    } else {
      setError(apiError);
    }
    setLoading(false);
    return success;
  };

  return { summary, loading, error, fetchSummary };
}