// src/api/contractor.js
import { api } from "./client";

function buildQS(params = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v != null && v !== "")
  );
  const qs = new URLSearchParams(cleaned).toString();
  return qs ? `?${qs}` : "";
}

/**
 * GET /contractor/assigned-projects
 * Optional: { status_filter: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" }
 */
export async function getAssignedProjects({ status_filter } = {}) {
  const qs = buildQS(status_filter ? { status_filter } : {});
  return api.get(`/contractor/assigned-projects${qs}`);
}

/**
 * POST /contractor/projects/:id/accept
 * Status must be SCHEDULED → sets IN_PROGRESS.
 */
export async function acceptProject(projectId) {
  return api.post(`/contractor/projects/${projectId}/accept`, {});
}

/**
 * POST /contractor/projects/:id/decline
 * Status must be SCHEDULED. Requires { reason }.
 */
export async function declineProject(projectId, reason) {
  return api.post(`/contractor/projects/${projectId}/decline`, { reason });
}

/**
 * POST /contractor/projects/:id/complete  (multipart)
 * formData should include: notes, materials (JSON string), actual_cost, photos[].
 */
export async function completeProject(projectId, formData) {
  return api.upload(`/contractor/projects/${projectId}/complete`, formData);
}
