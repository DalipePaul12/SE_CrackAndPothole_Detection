// src/hooks/useReportStats.js
// Fetches aggregate per-status counts for the current user from
// GET /reports/mine/stats. Runs once on mount — independent of pagination.
import { useState, useEffect } from "react";
import { getMyReportStats } from "../api/reports";

export function useReportStats() {
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getMyReportStats()
      .then(({ success, data }) => {
        if (!mounted) return;
        if (success && data) setStats(data);
      })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  return { stats, loading };
}
