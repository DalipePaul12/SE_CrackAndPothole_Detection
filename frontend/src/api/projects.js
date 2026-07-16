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

/**
 * GET /projects/available-contractors
 * Returns contractors with name, active_project_count, is_available.
 */
export const getAvailableContractors = async () => {
  const res = await api.get("/projects/available-contractors");
  return {
    success: res?.success ?? false,
    data: Array.isArray(res?.data) ? res.data : [],
    error: res?.error ?? null,
  };
};

/**
 * PATCH /projects/{projectId}/assign
 * Assigns a contractor to a project. Body: { contractor_id }
 */
export const assignContractor = async (projectId, contractorId) => {
  const res = await api.patch(`/projects/${projectId}/assign`, { contractor_id: contractorId });
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};

/**
 * GET /projects/{projectId}/completion
 * Returns completion details: notes, materials_used, actual_cost, completed_at, completion_photos[].
 * Accessible by the report owner, assigned contractor, or any admin.
 */
export const getProjectCompletion = async (projectId) => {
  const res = await api.get(`/projects/${projectId}/completion`);
  return {
    success: res?.success ?? false,
    data: res?.data ?? null,
    error: res?.error ?? null,
  };
};