import { useState, useEffect, useRef } from "react";
import {
  getDashboardSummary,
  getDamageTypeStats,
  getReportStatusStats,
  getMonthlyReports,
  getHotspots,          // FIX: was getBarangayRanking → export removed from analytics.js
  getSeverityStats,
} from "../api/analytics";

const CACHE_TTL_MS = 90_000;
const _cache = new Map();

function cacheGet(key) {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value;
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

export function useAnalytics() {
  const [summary, setSummary]                 = useState(null);
  const [damageStats, setDamageStats]         = useState([]);
  const [statusStats, setStatusStats]         = useState([]);
  const [monthlyData, setMonthlyData]         = useState([]);
  const [barangayRanking, setBarangayRanking] = useState([]);
  const [severityStats, setSeverityStats]     = useState([]);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState(null);

  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;

    const fetchAll = async () => {
      const cached = cacheGet("analytics_all");
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

      const [sumR, dmgR, statR, monthR, bgyR, sevR] =
        await Promise.allSettled([
          getDashboardSummary(),
          getDamageTypeStats(),
          getReportStatusStats(),
          getMonthlyReports(),
          getHotspots(),        // FIX: was getBarangayRanking()
          getSeverityStats(),
        ]);

      if (abortRef.current) return;

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

      setBarangayRanking(unwrap(bgyR, []));

      const sevRaw = unwrap(sevR, {});
      setSeverityStats(
        Object.entries(sevRaw).map(([name, value]) => ({ name: _label(name), value }))
      );

      const failedCount = [sumR, dmgR, statR, monthR, bgyR, sevR].filter(
        (r) => r.status === "rejected" || !r.value?.success
      ).length;

      if (failedCount === 6) {
        setError("Failed to load dashboard analytics. Please refresh.");
      } else if (failedCount > 0) {
        setError(`${failedCount} analytics section(s) could not be loaded.`);
      }

      cacheSet("analytics_all", {
        summary: summaryData,
        damageStats: dmgArr,
        statusStats: statArr,
        monthlyData: monthlyArr,
        barangayRanking: unwrap(bgyR, []),
        severityStats: Object.entries(unwrap(sevR, {})).map(([name, value]) => ({
          name: _label(name),
          value,
        })),
      });

      setLoading(false);
    };

    fetchAll();

    return () => {
      abortRef.current = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

function _label(str) {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}