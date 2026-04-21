import { api } from "./client";

export const getProjects = async () => {
  const res = await api.get("/projects/");

  return {
    success: res?.success ?? false,
    data: Array.isArray(res?.data) ? res.data : [],
    error: res?.error ?? null,
  };
};

export const getProjectById = async (projectId) => {
  const res = await api.get(`/projects/${projectId}`);

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const createProject = async (payload) => {
  const res = await api.post("/projects/", payload);

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const updateProject = async (projectId, payload) => {
  const res = await api.put(`/projects/${projectId}`, payload);

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const updateProjectStatus = async (
  projectId,
  status,
  completion_percentage
) => {
  const res = await api.put(`/projects/${projectId}`, {
    status,
    completion_percentage,
  });

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

export const deleteProject = async (projectId) => {
  const res = await api.delete(`/projects/${projectId}`);

  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};