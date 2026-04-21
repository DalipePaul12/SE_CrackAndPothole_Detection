import { useState, useEffect, useRef, useCallback } from "react";
import { getReports, getMyReports } from "../api/reports";

const PAGE_SIZE = 15;

export function useReports({ mine = false, status = null, barangay = null } = {}) {
  // Hooks must always be declared in the same order — never conditionally
  const [reports, setReports] = useState([]);   // hook 1
  const [loading, setLoading] = useState(true); // hook 2
  const [error,   setError]   = useState(null); // hook 3
  const [page,    setPage]    = useState(1);    // hook 4
  const [total,   setTotal]   = useState(0);    // hook 5

  // hook 6 — must come after all useState calls, never move this up
  const abortRef = useRef(false);

  // hook 7
  const fetchReports = useCallback(async () => {
    abortRef.current = false;
    setLoading(true);
    setError(null);

    try {
      const params = { page, page_size: PAGE_SIZE };
      if (status)   params.status   = status;
      if (barangay) params.barangay = barangay;

      const res = mine
        ? await getMyReports(params)
        : await getReports(params);

      if (abortRef.current) return;

      if (!res.success) {
        setError(res.error || "Failed to load reports.");
        setReports([]);
        setTotal(0);
      } else {
        const body = res.data;
        setReports(Array.isArray(body?.results) ? body.results : []);
        setTotal(typeof body?.total === "number" ? body.total : 0);
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err?.message || "Unexpected error loading reports.");
        setReports([]);
        setTotal(0);
      }
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, [mine, page, status, barangay]);

  // hook 8
  useEffect(() => {
    fetchReports();
    return () => {
      abortRef.current = true;
    };
  }, [fetchReports]);

  return { reports, loading, error, page, setPage, total, refetch: fetchReports };
}