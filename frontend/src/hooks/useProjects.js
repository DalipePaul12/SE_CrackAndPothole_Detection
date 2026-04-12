import { useState, useEffect } from "react";
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

  const fetch = async () => {
    setLoading(true);
    try {
      const data = await getProjects();
      setProjects(data);
    } catch (err) {
      setError(err.detail || "Failed to load projects.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const create = async (data) => {
    const result = await createApi(data);
    await fetch();
    return result;
  };

  const updateStatus = async (id, status, completion_percentage) => {
    const result = await updateApi(id, status, completion_percentage);
    await fetch();
    return result;
  };

  const remove = async (id) => {
    await deleteApi(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  return { projects, loading, error, create, updateStatus, remove, refetch: fetch };
}