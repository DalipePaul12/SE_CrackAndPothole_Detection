// src/hooks/useMapReports.js
import { useState, useEffect, useRef } from "react";
import { getReports } from "../api/reports";

const BASE_URL = import.meta.env.VITE_API_URL || "";

// Module-level cache — never expires, only clears on hard reload
let _mapCache = null;
let _mapFetching = false;
const _listeners = new Set();

export function invalidateMapCache() {
  _mapCache = null;
}

export function useMapReports() {
  const [reports, setReports] = useState(_mapCache ?? []);
  const [loading, setLoading] = useState(_mapCache === null);
  const [error,   setError]   = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // ✅ Already have data — use it instantly, no loading, no flash
    if (_mapCache !== null) {
      setReports(_mapCache);
      setLoading(false);
      return;
    }

    // ✅ Another instance is already fetching — wait for it
    if (_mapFetching) {
      const notify = (data) => {
        if (mountedRef.current) {
          setReports(data);
          setLoading(false);
        }
      };
      _listeners.add(notify);
      return () => {
        _listeners.delete(notify);
        mountedRef.current = false;
      };
    }

    // ✅ First fetch
    _mapFetching = true;
    setLoading(true);

    getReports({ page: 1, page_size: 500 })
      .then((res) => {
        const data = res?.success
          ? (Array.isArray(res.data?.results) ? res.data.results : [])
          : [];

        _mapCache = data;
        _mapFetching = false;

        if (mountedRef.current) {
          setReports(data);
          setLoading(false);
          if (!res?.success) setError(res?.error || "Failed to load reports.");
        }

        // Notify any other waiting instances
        _listeners.forEach((fn) => fn(data));
        _listeners.clear();
      })
      .catch((err) => {
        _mapFetching = false;
        if (mountedRef.current) {
          setError(err?.message || "Failed to load reports.");
          setLoading(false);
        }
        _listeners.clear();
      });

    return () => { mountedRef.current = false; };
  }, []); // ✅ Empty deps — never re-runs, never clears data

  const refetch = () => {
    invalidateMapCache();
    setLoading(true);
    setError(null);
    getReports({ page: 1, page_size: 500 }).then((res) => {
      const data = res?.success
        ? (Array.isArray(res.data?.results) ? res.data.results : [])
        : [];
      _mapCache = data;
      setReports(data);
      setLoading(false);
    });
  };

  return { reports, loading, error, refetch };
}