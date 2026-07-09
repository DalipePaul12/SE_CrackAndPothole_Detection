// src/hooks/useReports.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getReports, getMyReports } from "../api/reports";
import { tokenStorage } from "../api/client";

const PAGE_SIZE    = 15;
const CACHE_TTL_MS = 2 * 60 * 1000;

const _cache = new Map();

function makeCacheKey(mine, status, barangay, damage_type, severity, page) {
  return JSON.stringify({ mine, status, barangay, damage_type, severity, page });
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

export function useReports({
  mine        = false,
  status      = null,
  barangay    = null,
  damage_type = null,
  severity    = null,
} = {}) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [page,    setPage]    = useState(1);
  const [total,   setTotal]   = useState(0);

  const mountedRef    = useRef(true);
  // Incremented each time a fetch is initiated; lets us discard stale responses.
  const generationRef = useRef(0);

  // Reset to page 1 whenever any filter param changes (but not on page changes).
  const prevFilters = useRef({ status, barangay, damage_type, severity, mine });
  useEffect(() => {
    const prev = prevFilters.current;
    if (
      prev.status      !== status      ||
      prev.barangay    !== barangay    ||
      prev.damage_type !== damage_type ||
      prev.severity    !== severity    ||
      prev.mine        !== mine
    ) {
      prevFilters.current = { status, barangay, damage_type, severity, mine };
      setPage(1);
      // Bump generation immediately so any in-flight request for the old
      // filters is silently discarded when it eventually resolves.
      generationRef.current += 1;
    }
  }, [status, barangay, damage_type, severity, mine]);

  const fetchReports = useCallback(async ({ force = false } = {}) => {
    const token = tokenStorage.getAccess();
    if (!token) {
      if (mountedRef.current) setLoading(false);
      return;
    }

    // Tag this request so we can detect if a newer one has superseded it.
    const gen = ++generationRef.current;

    const key = makeCacheKey(mine, status, barangay, damage_type, severity, page);

    if (!force) {
      const cached = cacheGet(key);
      if (cached) {
        if (mountedRef.current && gen === generationRef.current) {
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
      if (status)      params.status      = status;
      if (barangay)    params.barangay    = barangay;
      if (damage_type) params.damage_type = damage_type;
      if (severity)    params.severity    = severity;

      const res = mine
        ? await getMyReports(params)
        : await getReports(params);

      // Discard if unmounted or a newer request has already started.
      if (!mountedRef.current || gen !== generationRef.current) return;

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
      if (mountedRef.current && gen === generationRef.current) {
        setError(err?.message || "Unexpected error loading reports.");
      }
    } finally {
      if (mountedRef.current && gen === generationRef.current) setLoading(false);
    }
  }, [mine, page, status, barangay, damage_type, severity]);

  useEffect(() => {
    mountedRef.current = true;
    fetchReports();
    return () => { mountedRef.current = false; };
  }, [fetchReports]);

  const refetch = useCallback(() => fetchReports({ force: true }), [fetchReports]);

  return { reports, loading, error, page, setPage, total, pageSize: PAGE_SIZE, refetch };
}