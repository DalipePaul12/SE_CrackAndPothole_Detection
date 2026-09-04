import { useState, useEffect, useRef } from "react";
import {
  getDashboardSummary,
  getDamageTypeStats,
  getReportStatusStats,
  getMonthlyReports,
  getHotspots,
  getSeverityStats,
} from "../api/analytics";


import { tokenStorage } from "../api/client";

const CACHE_TTL_MS = 90_000; // 90 seconds
const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
  _cache.delete(key);
  return null;
}

function cacheSet(key, value) {
  _cache.set(key, { ts: Date.now(), value });
}

export function invalidateAnalyticsCache() {
  _cache.clear();
}

function unwrap(settled, fallback) {
  if (settled.status !== "fulfilled") return fallback;
  const res = settled.value;
  if (!res?.success) return fallback;
  return res.data ?? fallback;
}

function _label(str) {
  if (!str) return "";
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// role: "admin" | "contractor" | "citizen" (default "citizen")
export function useAnalytics({ role = "citizen" } = {}) {
  const isAdmin = role === "admin" || role === "contractor";

  const [summary,         setSummary]         = useState(null);
  const [damageStats,     setDamageStats]      = useState([]);
  const [statusStats,     setStatusStats]      = useState([]);
  const [monthlyData,     setMonthlyData]      = useState([]);
  const [barangayRanking, setBarangayRanking]  = useState([]);
  const [severityStats,   setSeverityStats]    = useState([]);
  const [loading,         setLoading]          = useState(true);
  const [error,           setError]            = useState(null);

  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;

    const fetchAll = async () => {
      // ✅ Don't fetch if no token — prevents 403 cascade
      const token = tokenStorage.getAccess();
      if (!token) {
        setLoading(false);
        return;
      }

      const cacheKey = `analytics_${role}`;
      const cached   = cacheGet(cacheKey);

      if (cached) {
        setSummary(cached.summary);
        setDamageStats(cached.damageStats);
        setStatusStats(cached.statusStats);
        setMonthlyData(cached.monthlyData);
        setBarangayRanking(cached.barangayRanking);
        setSeverityStats(cached.severityStats);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // ✅ Citizens skip hotspots (admin-only endpoint → 403)
      const requests = isAdmin
        ? [
            getDashboardSummary(),
            getDamageTypeStats(),
            getReportStatusStats(),
            getMonthlyReports(),
            getHotspots(),      // admin only
            getSeverityStats(),
          ]
        : [
            getDashboardSummary(),
            getDamageTypeStats(),
            getReportStatusStats(),
            getMonthlyReports(),
            Promise.resolve({ success: true, data: [] }), // placeholder for hotspots
            getSeverityStats(),
          ];

      const [sumR, dmgR, statR, monthR, bgyR, sevR] =
        await Promise.allSettled(requests);

      if (abortRef.current) return;

      // ── Unpack each result ───────────────────────────────────────────────
      const summaryData = unwrap(sumR, null);
      setSummary(summaryData);

      const dmgRaw = unwrap(dmgR, {});
      const dmgArr = Object.entries(dmgRaw).map(([name, value]) => ({
        name: _label(name),
        value,
      }));
      setDamageStats(dmgArr);

      const statRaw = unwrap(statR, {});
      const statArr = Object.entries(statRaw).map(([status, count]) => ({
        status: _label(status),
        count,
      }));
      setStatusStats(statArr);

      const monthlyRaw = unwrap(monthR, []);
      const monthlyArr = Array.isArray(monthlyRaw)
        ? monthlyRaw.map((m) => ({ period: m.month, Reports: m.count }))
        : [];
      setMonthlyData(monthlyArr);

      // hotspots: only set for admins, citizens get empty array (no 403)
      setBarangayRanking(isAdmin ? unwrap(bgyR, []) : []);

      const sevRaw = unwrap(sevR, {});
      const sevArr = Object.entries(sevRaw).map(([name, value]) => ({
        name: _label(name),
        value,
      }));
      setSeverityStats(sevArr);

      // ── Error reporting: only count real failures (not skipped endpoints) ─
      const relevantResults = isAdmin
        ? [sumR, dmgR, statR, monthR, bgyR, sevR]
        : [sumR, dmgR, statR, monthR, sevR]; // exclude hotspot placeholder

      const failedCount = relevantResults.filter(
        (r) => r.status === "rejected" || !r.value?.success
      ).length;

      if (failedCount === relevantResults.length) {
        setError("Failed to load dashboard analytics. Please refresh.");
      } else if (failedCount > 0) {
        setError(`${failedCount} analytics section(s) could not be loaded.`);
      } else {
        setError(null);
      }

      // Cache with role-scoped key
      cacheSet(`analytics_${role}`, {
        summary:         summaryData,
        damageStats:     dmgArr,
        statusStats:     statArr,
        monthlyData:     monthlyArr,
        barangayRanking: isAdmin ? unwrap(bgyR, []) : [],
        severityStats:   sevArr,
      });

      setLoading(false);
    };

    fetchAll();

    return () => {
      abortRef.current = true;
    };
  }, [role, isAdmin]); // re-fetch if role changes (e.g. after login)

  return {
    summary,
    damageStats,
    statusStats,
    monthlyData,
    barangayRanking,
    severityStats,
    loading,
    error,
  };
}