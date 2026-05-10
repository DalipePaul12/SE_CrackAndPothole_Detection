import { useState, useEffect, useRef, useCallback } from "react";
import { getReports, getMyReports } from "../api/reports";

const PAGE_SIZE = 15;

// ── Module-level cache (survives re-renders, clears on hard reload) ──
const _cache = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

function cacheKey(mine, status, barangay, page) {
  return JSON.stringify({ mine, status, barangay, page });
}

function cacheGet(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
  return null;
}

function cacheSet(key, value) {
  _cache.set(key, { ts: Date.now(), value });
}

export function invalidateReportsCache() {
  _cache.clear();
}

// ── Hook ─────────────────────────────────────────────────────────────
export function useReports({ mine = false, status = null, barangay = null } = {}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);

  const abortRef = useRef(false);

  const fetchReports = useCallback(async ({ force = false } = {}) => {
    abortRef.current = false;

    const key = cacheKey(mine, status, barangay, page);

    // ── Cache hit — return instantly, no API call ──
    if (!force) {
      const cached = cacheGet(key);
      if (cached) {
        setReports(cached.reports);
        setTotal(cached.total);
        setLoading(false);
        setError(null);
        return;
      }
    }

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
        const reports = Array.isArray(body?.results) ? body.results : [];
        const total   = typeof body?.total === "number" ? body.total : 0;

        setReports(reports);
        setTotal(total);

        // ── Store in cache ──
        cacheSet(key, { reports, total });
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

  useEffect(() => {
    fetchReports();
    return () => { abortRef.current = true; };
  }, [fetchReports]);

  // refetch() → force bypass cache (e.g. after creating/updating a report)
  const refetch = useCallback(() => fetchReports({ force: true }), [fetchReports]);

  return { reports, loading, error, page, setPage, total, refetch };
}