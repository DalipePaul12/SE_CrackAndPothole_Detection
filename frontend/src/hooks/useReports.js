// src/hooks/useReports.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getReports, getMyReports } from "../api/reports";
import { tokenStorage } from "../api/client";

const PAGE_SIZE    = 15;
const CACHE_TTL_MS = 2 * 60 * 1000;

const _cache = new Map();

function makeCacheKey(mine, status, barangay, page) {
  return JSON.stringify({ mine, status, barangay, page });
}

function cacheGet(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
  _cache.delete(key);
  return null;
}

function cacheSet(key, value) {
  _cache.set(key, { ts: Date.now(), value });
}

const normalizeReport = (report) => ({
  ...report,
  status:         report.status?.toUpperCase(),
  ai_severity:    report.ai_severity?.toLowerCase(),
  ai_damage_type: report.ai_damage_type?.toLowerCase(),
});

export function invalidateReportsCache() {
  _cache.clear();
}

export function useReports({ mine = false, status = null, barangay = null } = {}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);

  const mountedRef = useRef(true);

  const fetchReports = useCallback(async ({ force = false } = {}) => {
    const token = tokenStorage.getAccess();
    if (!token) {
      if (mountedRef.current) setLoading(false);
      return;
    }

    const key = makeCacheKey(mine, status, barangay, page);

    if (!force) {
      const cached = cacheGet(key);
      if (cached) {
        if (mountedRef.current) {
          setReports(cached.reports);
          setTotal(cached.total);
          setLoading(false);
          setError(null);
        }
        return;
      }
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      const params = { page, page_size: PAGE_SIZE };
      if (status)   params.status   = status;
      if (barangay) params.barangay = barangay;

      const res = mine
        ? await getMyReports(params)
        : await getReports(params);

      if (!mountedRef.current) return;

      if (!res.success) {
        setError(res.error || "Failed to load reports.");
        return;
      }

      const body  = res.data;
      const items = Array.isArray(body?.results) ? body.results
                  : Array.isArray(body)           ? body
                  : [];
      const count = typeof body?.total === "number" ? body.total : items.length;

      const normalized = items.map(normalizeReport);

      setReports(normalized);
      setTotal(count);
      cacheSet(key, { reports: normalized, total: count });

    } catch (err) {
      if (mountedRef.current) {
        setError(err?.message || "Unexpected error loading reports.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [mine, page, status, barangay]);

  useEffect(() => {
    mountedRef.current = true;
    fetchReports();
    return () => { mountedRef.current = false; };
  }, [fetchReports]);

  const refetch = useCallback(() => fetchReports({ force: true }), [fetchReports]);

  return { reports, loading, error, page, setPage, total, refetch };
}