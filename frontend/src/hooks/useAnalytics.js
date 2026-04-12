import { useState, useEffect } from "react";
import {
  getDashboardSummary,
  getDamageTypeStats,
  getReportStatusStats,
  getMonthlyReports,
  getBarangayRanking,
  getSeverityStats,
} from "../api/analytics";

export function useAnalytics() {
  const [summary, setSummary] = useState(null);
  const [damageStats, setDamageStats] = useState([]);
  const [statusStats, setStatusStats] = useState([]);
  const [monthlyData, setMonthlyData] = useState([]);
  const [barangayRanking, setBarangayRanking] = useState([]);
  const [severityStats, setSeverityStats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [sum, dmg, stat, monthly, bgy, sev] = await Promise.all([
          getDashboardSummary(),
          getDamageTypeStats(),
          getReportStatusStats(),
          getMonthlyReports(),
          getBarangayRanking(),
          getSeverityStats(),
        ]);
        setSummary(sum);
        // Convert objects to recharts-friendly arrays
        setDamageStats(Object.entries(dmg).map(([name, value]) => ({ name, value })));
        setStatusStats(Object.entries(stat).map(([status, count]) => ({ status, count })));
        setMonthlyData(monthly.map((m) => ({ period: m.month, Reports: m.count })));
        setBarangayRanking(bgy);
        setSeverityStats(Object.entries(sev).map(([name, value]) => ({ name, value })));
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  return { summary, damageStats, statusStats, monthlyData, barangayRanking, severityStats, loading };
}