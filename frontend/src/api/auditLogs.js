import { api } from "./client";

// ── Internal helpers (mirroring users.js pattern) ─────────────────────────────

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null && v !== "" && v !== "All"
    )
  );
}

function buildQS(params = {}) {
  const cleaned = cleanParams(params);
  const qs = new URLSearchParams(cleaned).toString();
  return qs ? `?${qs}` : "";
}

function unwrap(res) {
  return {
    success: res?.success ?? false,
    data:    res?.data ?? null,
    error:   res?.error ?? null,
  };
}

/**
 * List audit logs (superadmin only).
 * @param {{
 *   user_id?, action?, target_resource?, performed_by_role?,
 *   date_from?, date_to?, page?, page_size?
 * }} params
 */
export const listAuditLogs = async (params = {}) => {
  return unwrap(await api.get(`/audit-logs${buildQS(params)}`));
};
