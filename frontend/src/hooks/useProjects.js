import { useState, useEffect, useRef } from "react";
import {
  getProjects,
  createProject as createApi,
  updateProjectStatus as updateApi,
  deleteProject as deleteApi,
} from "../api/projects";

export function useProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const abortRef = useRef(false);

  const fetch = async () => {
    setLoading(true);
    setError(null);
    abortRef.current = false;

    try {
      const res = await getProjects();

      if (!res?.success) {
        throw new Error(res?.error || "Failed to load projects");
      }

      const data = Array.isArray(res.data) ? res.data : [];

      if (!abortRef.current) {
        setProjects(data);
      }
    } catch (err) {
      if (!abortRef.current) {
        setError(err.message || "Failed to load projects");
        setProjects([]);
      }
    } finally {
      if (!abortRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetch();

    return () => {
      abortRef.current = true;
    };
  }, []);

  const create = async (payload) => {
    try {
      setError(null);

      const res = await createApi(payload);

      if (!res?.success) {
        throw new Error(res?.error || "Create failed");
      }

      await fetch();
      return res.data;
    } catch (err) {
      setError(err.message || "Create failed");
      return null;
    }
  };

  const updateStatus = async (id, status, completion_percentage) => {
    try {
      setError(null);

      const res = await updateApi(id, status, completion_percentage);

      if (!res?.success) {
        throw new Error(res?.error || "Update failed");
      }

      await fetch();
      return res.data;
    } catch (err) {
      setError(err.message || "Update failed");
      return null;
    }
  };

  const remove = async (id) => {
    try {
      setError(null);

      const res = await deleteApi(id);

      if (!res?.success) {
        throw new Error(res?.error || "Delete failed");
      }

      setProjects((prev) => prev.filter((p) => p.id !== id));
      return true;
    } catch (err) {
      setError(err.message || "Delete failed");
      return false;
    }
  };

  return {
    projects,
    loading,
    error,
    create,
    updateStatus,
    remove,
    refetch: fetch,
  };
}