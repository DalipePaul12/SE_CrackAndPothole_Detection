// src/hooks/useContractorProjects.js
import { useState, useEffect, useRef, useCallback } from "react";
import { getAssignedProjects, acceptProject, declineProject, completeProject } from "../api/contractor";
import { tokenStorage } from "../api/client";

/**
 * Fetches contractor-assigned projects and exposes accept / decline / complete mutations.
 *
 * @param {Object}  options
 * @param {string=} options.statusFilter  Optional status_filter sent to the API.
 */
export function useContractorProjects({ statusFilter } = {}) {
  const [projects,      setProjects]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError,   setActionError]   = useState(null);

  const mountedRef = useRef(true);
  const genRef     = useRef(0);

  const fetchProjects = useCallback(async () => {
    const token = tokenStorage.getAccess();
    if (!token) {
      if (mountedRef.current) setLoading(false);
      return;
    }

    const gen = ++genRef.current;
    if (mountedRef.current) { setLoading(true); setError(null); }

    try {
      const params = statusFilter ? { status_filter: statusFilter } : {};
      const res = await getAssignedProjects(params);

      if (!mountedRef.current || gen !== genRef.current) return;

      if (!res.success) {
        setError(res.error || "Failed to load projects.");
        return;
      }

      const body  = res.data;
      const items = Array.isArray(body?.results) ? body.results
                  : Array.isArray(body)           ? body
                  : [];

      setProjects(items);
    } catch (err) {
      if (mountedRef.current && gen === genRef.current)
        setError(err?.message || "Unexpected error loading projects.");
    } finally {
      if (mountedRef.current && gen === genRef.current) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    mountedRef.current = true;
    fetchProjects();
    return () => { mountedRef.current = false; };
  }, [fetchProjects]);

  const refetch = useCallback(() => fetchProjects(), [fetchProjects]);

  // ── accept ─────────────────────────────────────────────────────────────────
  const accept = useCallback(async (projectId) => {
    setActionLoading(true);
    setActionError(null);
    const res = await acceptProject(projectId);
    setActionLoading(false);
    if (!res.success) {
      setActionError(res.error || "Failed to accept project.");
      return false;
    }
    await fetchProjects();
    return true;
  }, [fetchProjects]);

  // ── decline ────────────────────────────────────────────────────────────────
  const decline = useCallback(async (projectId, reason) => {
    setActionLoading(true);
    setActionError(null);
    const res = await declineProject(projectId, reason);
    setActionLoading(false);
    if (!res.success) {
      setActionError(res.error || "Failed to decline project.");
      return false;
    }
    await fetchProjects();
    return true;
  }, [fetchProjects]);

  // ── complete ───────────────────────────────────────────────────────────────
  const complete = useCallback(async (projectId, formData) => {
    setActionLoading(true);
    setActionError(null);
    const res = await completeProject(projectId, formData);
    setActionLoading(false);
    if (!res.success) {
      setActionError(res.error || "Failed to complete project.");
      return { success: false, error: res.error || "Failed to complete project." };
    }
    await fetchProjects();
    return { success: true };
  }, [fetchProjects]);

  const clearActionError = useCallback(() => setActionError(null), []);

  return {
    projects,
    loading,
    error,
    refetch,
    accept,
    decline,
    complete,
    actionLoading,
    actionError,
    clearActionError,
  };
}
