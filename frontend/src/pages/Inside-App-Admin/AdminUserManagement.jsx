import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuthContext } from "../Contexts/AuthContext.jsx";
import {
  listAllUsers,
  adminChangeUserRole,
  toggleUserSuspension,
  adminDeleteUser,
} from "../../api/users.js";
import {
  Search, X, ChevronFirst, ChevronLeft, ChevronRight, ChevronLast,
  MoreVertical, Shield, Hammer, UserCheck, Ban, RotateCcw, Trash2,
  AlertTriangle, Users, Loader2,
} from "lucide-react";
import "./AdminUserManagement.css";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const ROLE_OPTIONS  = ["All", "citizen", "contractor", "admin", "superadmin"];
const STATUS_OPTIONS = [
  { value: "All",   label: "All statuses" },
  { value: "true",  label: "Active" },
  { value: "false", label: "Suspended" },
];

const ROLE_LABELS = {
  citizen:    "Citizen",
  contractor: "Contractor",
  admin:      "Admin",
  superadmin: "Super Admin",
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-PH", { dateStyle: "medium" }) : "—";

const fmtLastSeen = (iso) => {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000)   return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return fmtDate(iso);
};

// Roles an admin (non-superadmin) is allowed to assign
const ASSIGNABLE_ROLES_ADMIN      = ["citizen", "contractor", "admin"];
const ASSIGNABLE_ROLES_SUPERADMIN = ["citizen", "contractor", "admin", "superadmin"];

// ── Toast ─────────────────────────────────────────────────────────────────────

function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((msg, type = "success") => {
    clearTimeout(timerRef.current);
    setToast({ msg, type });
    timerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  return { toast, showToast };
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function ConfirmModal({ title, body, warning, confirmLabel, danger, onConfirm, onCancel, loading }) {
  return (
    <div className="aum-modal-overlay" onClick={onCancel}>
      <div className="aum-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="aum-modal-title">{title}</h3>
        <p className="aum-modal-body">{body}</p>
        {warning && (
          <div className="aum-modal-warning">
            <AlertTriangle size={14} />
            <span>{warning}</span>
          </div>
        )}
        <div className="aum-modal-actions">
          <button className="aum-btn aum-btn--ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className={`aum-btn ${danger ? "aum-btn--danger" : "aum-btn--primary"}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="aum-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  return (
    <span className={`aum-role-badge aum-role-badge--${role}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ isActive }) {
  return (
    <span className={`aum-status-badge ${isActive ? "aum-status-badge--active" : "aum-status-badge--suspended"}`}>
      {isActive ? "Active" : "Suspended"}
    </span>
  );
}

// ── Action dropdown ───────────────────────────────────────────────────────────

function ActionMenu({ user, isSuperAdmin, onRoleChange, onSuspend, onDelete, selfId }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const isSelf = user.public_id === selfId;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = (fn) => { setOpen(false); fn(); };

  const assignableRoles = isSuperAdmin ? ASSIGNABLE_ROLES_SUPERADMIN : ASSIGNABLE_ROLES_ADMIN;

  return (
    <div className="aum-action-menu" ref={menuRef}>
      <button
        className="aum-action-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        title="Actions"
        disabled={isSelf}
      >
        <MoreVertical size={16} />
      </button>

      {open && (
        <div className="aum-action-dropdown">
          <div className="aum-dropdown-section-label">Assign role</div>

          {assignableRoles
            .filter((r) => r !== user.role)
            .map((r) => {
              const Icon =
                r === "superadmin" ? Shield :
                r === "admin"      ? UserCheck :
                r === "contractor" ? Hammer :
                Users;
              return (
                <button
                  key={r}
                  className="aum-dropdown-item"
                  onClick={() => pick(() => onRoleChange(user, r))}
                >
                  <Icon size={14} />
                  Assign {ROLE_LABELS[r]}
                </button>
              );
            })}

          <div className="aum-dropdown-divider" />
          <div className="aum-dropdown-section-label">Account</div>

          <button
            className={`aum-dropdown-item ${user.is_active ? "aum-dropdown-item--warn" : ""}`}
            onClick={() => pick(() => onSuspend(user))}
          >
            {user.is_active
              ? <><Ban size={14} /> Suspend</>
              : <><RotateCcw size={14} /> Reactivate</>}
          </button>

          {isSuperAdmin && (
            <button
              className="aum-dropdown-item aum-dropdown-item--danger"
              onClick={() => pick(() => onDelete(user))}
            >
              <Trash2 size={14} /> Delete user
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminUserManagement() {
  const { user: self } = useAuthContext();
  const isSuperAdmin = self?.role === "superadmin";

  const { toast, showToast } = useToast();

  // ── List state
  const [users, setUsers]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);

  // ── Filter state
  const [search, setSearch]     = useState("");
  const [roleFilter, setRole]   = useState("All");
  const [statusFilter, setStatus] = useState("All");
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  // ── Pending action state
  const [pendingRoleChange, setPendingRoleChange] = useState(null);   // { user, role }
  const [pendingSuspend, setPendingSuspend]       = useState(null);   // { user }
  const [pendingDelete, setPendingDelete]         = useState(null);   // { user }
  const [actionLoading, setActionLoading]         = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchUsers = useCallback(async (opts = {}) => {
    setLoading(true);
    const params = {
      page:      opts.page      ?? page,
      page_size: PAGE_SIZE,
      search:    opts.search    ?? search,
      role:      opts.role      !== undefined ? opts.role      : (roleFilter   !== "All" ? roleFilter   : undefined),
      is_active: opts.is_active !== undefined ? opts.is_active : (statusFilter !== "All" ? statusFilter : undefined),
    };
    const res = await listAllUsers(params);
    setLoading(false);
    if (res.success) {
      setUsers(res.data.results ?? []);
      setTotal(res.data.total   ?? 0);
    } else {
      showToast(res.error ?? "Failed to load users.", "error");
    }
  }, [page, search, roleFilter, statusFilter]); // eslint-disable-line

  // Initial load + whenever page changes
  useEffect(() => { fetchUsers(); }, [page]); // eslint-disable-line

  // Debounced search
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchUsers({ page: 1, search: val });
    }, 350);
  };

  const applyFilters = () => {
    setPage(1);
    fetchUsers({
      page:      1,
      role:      roleFilter   !== "All" ? roleFilter   : undefined,
      is_active: statusFilter !== "All" ? statusFilter : undefined,
    });
  };

  const resetFilters = () => {
    setSearch(""); setRole("All"); setStatus("All"); setPage(1);
    fetchUsers({ page: 1, search: "", role: undefined, is_active: undefined });
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRoleChange = async () => {
    if (!pendingRoleChange) return;
    setActionLoading(true);
    const { user: target, role } = pendingRoleChange;
    const res = await adminChangeUserRole(target.public_id, role);
    setActionLoading(false);
    if (res.success) {
      showToast(`${target.full_name} is now ${ROLE_LABELS[role]}.`);
      setPendingRoleChange(null);
      fetchUsers();
    } else {
      showToast(res.error ?? "Role change failed.", "error");
    }
  };

  const handleSuspend = async () => {
    if (!pendingSuspend) return;
    setActionLoading(true);
    const { user: target } = pendingSuspend;
    const res = await toggleUserSuspension(target.public_id);
    setActionLoading(false);
    if (res.success) {
      const action = target.is_active ? "suspended" : "reactivated";
      showToast(`${target.full_name} has been ${action}.`);
      setPendingSuspend(null);
      fetchUsers();
    } else {
      showToast(res.error ?? "Action failed.", "error");
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setActionLoading(true);
    const { user: target } = pendingDelete;
    const res = await adminDeleteUser(target.public_id);
    setActionLoading(false);
    if (res.success) {
      showToast(`${target.full_name} has been permanently deleted.`);
      setPendingDelete(null);
      fetchUsers();
    } else {
      showToast(res.error ?? "Delete failed.", "error");
    }
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
            <Users size={22} strokeWidth={2} />
            User Management
          </h1>
          <span className="aum-count">{total.toLocaleString()} user{total !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="aum-filters">
        <div className="aum-search-wrap">
          <Search size={15} className="aum-search-icon" />
          <input
            ref={searchRef}
            className="aum-search-input"
            placeholder="Search name or email…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {search && (
            <button className="aum-search-clear" onClick={() => handleSearch("")}>
              <X size={14} />
            </button>
          )}
        </div>

        <select
          className="aum-select"
          value={roleFilter}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="All">All roles</option>
          {ROLE_OPTIONS.filter((r) => r !== "All").map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>

        <select
          className="aum-select"
          value={statusFilter}
          onChange={(e) => setStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

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
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Last seen</th>
              <th className="th-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="7" className="aum-empty">
                  <Loader2 size={24} className="aum-spin" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan="7" className="aum-empty">
                  <Users size={28} style={{ opacity: 0.3 }} />
                  <span>No users match your filters.</span>
                  <button className="aum-btn aum-btn--ghost aum-btn--sm" onClick={resetFilters}>
                    Clear filters
                  </button>
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.public_id} className={!u.is_active ? "aum-row--suspended" : ""}>
                  <td className="td-name">
                    <span className="aum-name">{u.full_name}</span>
                    {u.public_id === self?.public_id && (
                      <span className="aum-you-badge">you</span>
                    )}
                  </td>
                  <td className="td-email">
                    <span className="aum-email">{u.email}</span>
                  </td>
                  <td>
                    <RoleBadge role={u.role} />
                  </td>
                  <td>
                    <StatusBadge isActive={u.is_active} />
                  </td>
                  <td className="td-date">{fmtDate(u.created_at)}</td>
                  <td className="td-date">{fmtLastSeen(u.last_login_at)}</td>
                  <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      user={u}
                      isSuperAdmin={isSuperAdmin}
                      selfId={self?.public_id}
                      onRoleChange={(target, role) => setPendingRoleChange({ user: target, role })}
                      onSuspend={(target)          => setPendingSuspend({ user: target })}
                      onDelete={(target)           => setPendingDelete({ user: target })}
                    />
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
            if (totalPages <= 5) p = i + 1;
            else if (page <= 3)  p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
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

      {/* ── Confirmation modals ── */}

      {pendingRoleChange && (
        <ConfirmModal
          title={`Assign ${ROLE_LABELS[pendingRoleChange.role]}`}
          body={`Change ${pendingRoleChange.user.full_name}'s role from ${ROLE_LABELS[pendingRoleChange.user.role]} to ${ROLE_LABELS[pendingRoleChange.role]}?`}
          warning={
            (pendingRoleChange.user.role === "admin" || pendingRoleChange.user.role === "contractor")
              ? "This user has existing assignments. Those will not be automatically reassigned — review them manually after changing the role."
              : null
          }
          confirmLabel="Confirm role change"
          danger={pendingRoleChange.role === "superadmin"}
          onConfirm={handleRoleChange}
          onCancel={() => setPendingRoleChange(null)}
          loading={actionLoading}
        />
      )}

      {pendingSuspend && (
        <ConfirmModal
          title={pendingSuspend.user.is_active ? "Suspend user" : "Reactivate user"}
          body={
            pendingSuspend.user.is_active
              ? `Suspend ${pendingSuspend.user.full_name}? Their account will be immediately inaccessible.`
              : `Reactivate ${pendingSuspend.user.full_name}? They will regain access to their account.`
          }
          confirmLabel={pendingSuspend.user.is_active ? "Suspend" : "Reactivate"}
          danger={pendingSuspend.user.is_active}
          onConfirm={handleSuspend}
          onCancel={() => setPendingSuspend(null)}
          loading={actionLoading}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title="Permanently delete user"
          body={`Delete ${pendingDelete.user.full_name} (${pendingDelete.user.email})? This action cannot be undone.`}
          warning="All of this user's data will be removed. Existing report and project assignments will be orphaned — review them before proceeding."
          confirmLabel="Delete permanently"
          danger
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
          loading={actionLoading}
        />
      )}
    </div>
  );
}
