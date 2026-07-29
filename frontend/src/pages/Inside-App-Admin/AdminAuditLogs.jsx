import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthContext } from "../Contexts/AuthContext.jsx";
import { listAuditLogs } from "../../api/auditLogs.js";
import {
  ChevronFirst, ChevronLeft, ChevronRight, ChevronLast,
  ScrollText, Loader2, X, Eye,
} from "lucide-react";
// Reuse all aum-* styles (badges, table, filters, pagination, modal, buttons)
import "./AdminUserManagement.css";
import "./AdminAuditLogs.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const ROLE_OPTIONS = ["All", "superadmin", "admin", "contractor", "citizen", "system_cli"];

const ROLE_LABELS = {
  citizen:    "Citizen",
  contractor: "Contractor",
  admin:      "Admin",
  superadmin: "Super Admin",
  system_cli: "System CLI",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "MANUAL_SUPERADMIN_ASSIGNMENT" → "Manual Superadmin Assignment" */
const humanize = (str) =>
  str
    ? str
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";

const fmtTimestamp = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

// ── Role badge (reuse aum- classes) ──────────────────────────────────────────

function RoleBadge({ role }) {
  return (
    <span className={`aum-role-badge aum-role-badge--${role ?? "unknown"}`}>
      {ROLE_LABELS[role] ?? role ?? "—"}
    </span>
  );
}

// ── Details modal ─────────────────────────────────────────────────────────────

function DetailsModal({ entry, onClose }) {
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="aum-modal-overlay" onClick={onClose}>
      <div className="aal-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="aal-details-header">
          <h3 className="aum-modal-title">Audit Log Entry #{entry.id}</h3>
          <button className="aal-close-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <dl className="aal-details-grid">
          <dt>Timestamp</dt>
          <dd>{fmtTimestamp(entry.timestamp)}</dd>

          <dt>Action</dt>
          <dd>
            <span className="aal-action-raw">{entry.action}</span>
            {entry.action && (
              <span className="aal-action-human">({humanize(entry.action)})</span>
            )}
          </dd>

          <dt>Performed by role</dt>
          <dd><RoleBadge role={entry.performed_by_role} /></dd>

          <dt>User ID</dt>
          <dd>{entry.user_id ?? <span className="aal-muted">—</span>}</dd>

          <dt>Target resource</dt>
          <dd>{entry.target_resource ?? <span className="aal-muted">—</span>}</dd>

          <dt>Target ID</dt>
          <dd>{entry.target_id ?? <span className="aal-muted">—</span>}</dd>

          <dt>IP address</dt>
          <dd>{entry.ip_address ?? <span className="aal-muted">—</span>}</dd>

          <dt>User agent</dt>
          <dd className="aal-ua">{entry.user_agent ?? <span className="aal-muted">—</span>}</dd>
        </dl>

        {entry.details != null && (
          <div className="aal-details-json-wrap">
            <p className="aal-details-json-label">Details</p>
            <pre className="aal-details-json">
              {JSON.stringify(entry.details, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminAuditLogs() {
  const { user } = useAuthContext();
  const navigate  = useNavigate();
  const isSuperAdmin = user?.role === "superadmin";

  // ── Superadmin guard — blocks direct navigation ───────────────────────────
  useEffect(() => {
    if (user && !isSuperAdmin) navigate("/adminpanel", { replace: true });
  }, [user, isSuperAdmin, navigate]);

  // ── List state ────────────────────────────────────────────────────────────
  const [logs, setLogs]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [roleFilter,     setRoleFilter]     = useState("All");
  const [actionFilter,   setActionFilter]   = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [dateFrom,       setDateFrom]       = useState("");
  const [dateTo,         setDateTo]         = useState("");

  // ── Detail modal ──────────────────────────────────────────────────────────
  const [selectedEntry, setSelectedEntry] = useState(null);

  // ── Toast ─────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, type = "error") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const fetchLogs = useCallback(async (opts = {}) => {
    setLoading(true);
    setError(null);
    const params = {
      page:              opts.page              ?? page,
      page_size:         PAGE_SIZE,
      performed_by_role: (opts.role ?? roleFilter) !== "All"
                           ? (opts.role ?? roleFilter)
                           : undefined,
      action:            opts.action    !== undefined ? opts.action    : (actionFilter   || undefined),
      target_resource:   opts.resource  !== undefined ? opts.resource  : (resourceFilter || undefined),
      date_from:         opts.dateFrom  !== undefined ? opts.dateFrom  : (dateFrom       || undefined),
      date_to:           opts.dateTo    !== undefined ? opts.dateTo    : (dateTo         || undefined),
    };

    const res = await listAuditLogs(params);
    setLoading(false);

    if (res.success) {
      setLogs(res.data.results ?? []);
      setTotal(res.data.total  ?? 0);
    } else {
      setError(res.error ?? "Failed to load audit logs.");
      showToast(res.error ?? "Failed to load audit logs.");
    }
  }, [page, roleFilter, actionFilter, resourceFilter, dateFrom, dateTo, showToast]); // eslint-disable-line

  // Initial load + page changes
  useEffect(() => { fetchLogs(); }, [page]); // eslint-disable-line

  const applyFilters = () => {
    setPage(1);
    fetchLogs({ page: 1 });
  };

  const resetFilters = () => {
    setRoleFilter("All");
    setActionFilter("");
    setResourceFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    fetchLogs({
      page: 1, role: "All", action: "", resource: "", dateFrom: "", dateTo: "",
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="aum-page">

      {/* Toast */}
      {toast && (
        <div className={`aar-toast aar-toast--${toast.type}`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="aum-header">
        <div className="aum-header-left">
          <h1 className="aum-title">
            <ScrollText size={22} strokeWidth={2} />
            Audit Logs
          </h1>
          <span className="aum-count">
            {total.toLocaleString()} entr{total !== 1 ? "ies" : "y"}
          </span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="aum-filters aal-filters">
        {/* Role */}
        <select
          className="aum-select"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="All">All roles</option>
          {ROLE_OPTIONS.filter((r) => r !== "All").map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
          ))}
        </select>

        {/* Action */}
        <input
          className="aum-search-input aal-filter-input"
          placeholder="Filter by action…"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        />

        {/* Target resource */}
        <input
          className="aum-search-input aal-filter-input"
          placeholder="Filter by resource…"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        />

        {/* Date range */}
        <div className="aal-date-range">
          <input
            className="aum-search-input aal-date-input"
            type="date"
            title="From date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <span className="aal-date-sep">–</span>
          <input
            className="aum-search-input aal-date-input"
            type="date"
            title="To date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>

        <button className="aum-btn aum-btn--primary" onClick={applyFilters}>
          Apply
        </button>
        <button className="aum-btn aum-btn--ghost" onClick={resetFilters}>
          Reset
        </button>
      </div>

      {/* Table */}
      <div className="aum-table-wrap">
        <table className="adm-table aum-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User ID</th>
              <th>Role</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Target ID</th>
              <th className="th-actions">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="aum-empty">
                  <Loader2 size={24} className="aum-spin" />
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan="7" className="aum-empty">
                  <ScrollText size={28} style={{ opacity: 0.3 }} />
                  <span>{error}</span>
                  <button className="aum-btn aum-btn--ghost aum-btn--sm" onClick={() => fetchLogs()}>
                    Retry
                  </button>
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan="7" className="aum-empty">
                  <ScrollText size={28} style={{ opacity: 0.3 }} />
                  <span>No audit logs match your filters.</span>
                  <button className="aum-btn aum-btn--ghost aum-btn--sm" onClick={resetFilters}>
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              logs.map((entry) => (
                <tr key={entry.id}>
                  <td className="td-date aal-ts">{fmtTimestamp(entry.timestamp)}</td>
                  <td className="aal-user-id">
                    {entry.user_id ?? <span className="aal-muted">—</span>}
                  </td>
                  <td>
                    <RoleBadge role={entry.performed_by_role} />
                  </td>
                  <td className="aal-action">
                    {humanize(entry.action)}
                  </td>
                  <td className="aal-resource">
                    {entry.target_resource ?? <span className="aal-muted">—</span>}
                  </td>
                  <td className="aal-target-id">
                    {entry.target_id ?? <span className="aal-muted">—</span>}
                  </td>
                  <td className="td-actions">
                    <button
                      className="aal-view-btn"
                      onClick={() => setSelectedEntry(entry)}
                      title="View full details"
                    >
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="adm-pagination aum-pagination">
          <button
            className="adm-page-btn"
            onClick={() => setPage(1)}
            disabled={page === 1}
            title="First page"
          ><ChevronFirst size={16} /></button>

          <button
            className="adm-page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            title="Previous"
          ><ChevronLeft size={16} /></button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            let p;
            if (totalPages <= 5)          p = i + 1;
            else if (page <= 3)           p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else                          p = page - 2 + i;
            return (
              <button
                key={p}
                className={`adm-page-btn ${p === page ? "active" : ""}`}
                onClick={() => setPage(p)}
              >{p}</button>
            );
          })}

          <button
            className="adm-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            title="Next"
          ><ChevronRight size={16} /></button>

          <button
            className="adm-page-btn"
            onClick={() => setPage(totalPages)}
            disabled={page === totalPages}
            title="Last page"
          ><ChevronLast size={16} /></button>

          <span className="aum-page-info">
            Page {page} of {totalPages}
          </span>
        </div>
      )}

      {/* Details modal */}
      {selectedEntry && (
        <DetailsModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
}
