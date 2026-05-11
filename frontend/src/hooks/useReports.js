import { useState, useEffect, useRef, useCallback } from "react";
import { getReports, getMyReports } from "../api/reports";
import { tokenStorage } from "../api/client";


const PAGE_SIZE    = 10;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Module-level cache — shared across all hook instances, cleared on hard reload
const _cache = new Map();

function makeCacheKey(mine, status, barangay, page) {
  return JSON.stringify({ mine, status, barangay, page });
}

function cacheGet(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
  _cache.delete(key); // expired — clean up
  return null;
}

function cacheSet(key, value) {
  _cache.set(key, { ts: Date.now(), value });
}

export function invalidateReportsCache() {
  _cache.clear();
}

export function useReports({ mine = false, status = null, barangay = null } = {}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);

  // Tracks whether the effect is still mounted (prevents setState after unmount)
  const mountedRef = useRef(true);

  const fetchReports = useCallback(async ({ force = false } = {}) => {
    const token = tokenStorage.getAccess();
    if (!token) {
      setLoading(false);
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

      const body    = res.data;
      const items   = Array.isArray(body?.results) ? body.results
                    : Array.isArray(body)           ? body       // fallback if no pagination wrapper
                    : [];
      const count   = typeof body?.total === "number" ? body.total : items.length;

      setReports(items);
      setTotal(count);
      cacheSet(key, { reports: items, total: count });

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
  const controller = new AbortController();
  fetchReports({ signal: controller.signal });
  return () => {
    mountedRef.current = false;
    controller.abort();   
  };
}, [fetchReports]);

  // refetch() forces a fresh API call and busts the cache
  const refetch = useCallback(() => fetchReports({ force: true }), [fetchReports]);

  return { reports, loading, error, page, setPage, total, refetch };
}